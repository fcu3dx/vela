import type { WorkflowContext, StepCallbacks } from '../../../stores/workflow-store'
import { useLLMStore } from '../../../stores/llm-store'
import { globalEventBus, EventPayloadMap } from '../../../shared/event-bus'
import type { BasePromptBuilder } from '../../prompts/prompt-builder'

export interface CommandExecuteParams {
  step: unknown
  context: WorkflowContext
  callbacks: StepCallbacks
}

/**
 * 工作流执行环节的抽象基类 (Command Pattern)
 * 将原本混乱的 workflow 闭包拆分为可独立测试、状态解耦的命令单元。
 */
export abstract class BaseWorkflowCommand<TResult = string> {
  
  /** 抽象执行入口 */
  abstract execute(params: CommandExecuteParams): Promise<TResult>

  /** 获取 LLM 大模型连接代理（支持取消 + v0.2.1 空值重试增强） */
  protected async callLLM(
    prompt: string, 
    systemPrompt: string, 
    callbacks: StepCallbacks,
    options?: { responseFormat?: { type: string }; thinking?: boolean },
    context?: WorkflowContext
  ): Promise<string> {
    const llmStore = useLLMStore.getState()
    if (!llmStore.defaultModelId) throw new Error('未配置默认 AI 模型')

    callbacks.setProgress(10)

    return new Promise((resolve, reject) => {
      let fullContent = ''
      let streamRequestId = ''

      // 取消监听：轮询 context.cancelled，主动中断 LLM 流
      let cancelCheckTimer: ReturnType<typeof setInterval> | null = null
      if (context) {
        cancelCheckTimer = setInterval(() => {
          if (context.cancelled && streamRequestId) {
            clearInterval(cancelCheckTimer!)
            cancelCheckTimer = null
            llmStore.cancelGeneration(streamRequestId).catch(() => {})
            reject(new Error('工作流已取消'))
          }
        }, 200)
      }

      const cleanup = () => {
        if (cancelCheckTimer) {
          clearInterval(cancelCheckTimer)
          cancelCheckTimer = null
        }
      }

      llmStore.generateStream(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        {
          onChunk: (chunk) => {
            // 取消后不再追加输出
            if (context?.cancelled) return
            fullContent += chunk
            callbacks.appendText(chunk)
          },
          onDone: (text) => {
            cleanup()
            if (context?.cancelled) {
              reject(new Error('工作流已取消'))
              return
            }
            callbacks.setProgress(90)
            const raw = text || fullContent
            const cleaned = this.stripThinkingTags(raw)
            // v0.2.2: 空值/短内容保护增强 — 情节大纲等重度生成需200字，轻量50字
            // thinking 模型可能输出大量思考+超短正文
            const minLen = (options?.responseFormat?.type === 'json_object') ? 20 : 200
            if (!cleaned || cleaned.trim().length < minLen) {
              // 给 3 次自动重试：追加 "直接输出" 指令，抑制 thinking
              const RETRY_LIMIT = 3
              const doRetry = (attempt: number): void => {
                if (attempt > RETRY_LIMIT) {
                  callbacks.log(`❌ 重试${RETRY_LIMIT}次后仍不足${minLen}字`)
                  reject(new Error(`AI 连续${RETRY_LIMIT+1}次返回内容过短（不足${minLen}字），请检查模型配置或缩短上下文`))
                  return
                }
                callbacks.log(`⚠️ AI 返回内容过短(不足${minLen}字)，正在自动重试 (第${attempt+1}次)...`)
                const retryMessages = [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: prompt },
                  { role: 'user', content: `(请直接输出正文，不要使用 reasoning/thinking 模式，不需要解释过程。请输出完整的、详细的内容，至少 ${minLen} 字。这是强制要求，请确保字数达标。)` }
                ]
                const retryOptions = { ...options, thinking: false }
                llmStore.generateStream(
                  retryMessages,
                  {
                    onChunk: (chunk) => { fullContent += chunk; callbacks.appendText(chunk) },
                    onDone: (retryText) => {
                      const retryRaw = retryText || fullContent
                      const retryCleaned = this.stripThinkingTags(retryRaw)
                      if (!retryCleaned || retryCleaned.trim().length < minLen) {
                        doRetry(attempt + 1)
                      } else {
                        callbacks.log(`✅ 重试成功 (第${attempt+1}次)`)
                        resolve(retryCleaned)
                      }
                    },
                    onError: (err) => {
                      callbacks.log(`⚠️ 第${attempt+1}次重试失败: ${err}`)
                      doRetry(attempt + 1)
                    },
                  },
                  undefined,
                  retryOptions
                )
              }
              doRetry(1)
              return
            }
            resolve(cleaned)
          },
          onError: (err) => {
            cleanup()
            reject(new Error(err || '流式生成失败'))
          }
        },
        undefined,
        options
      ).then(reqId => {
        streamRequestId = reqId
        // 如果在 generateStream 返回前已经取消
        if (context?.cancelled) {
          llmStore.cancelGeneration(reqId).catch(() => {})
          cleanup()
          reject(new Error('工作流已取消'))
        }
      }).catch(err => {
        cleanup()
        reject(err)
      })
    })
  }

  /**
   * 使用 Builder 的 systemRole + prompt 一键调用 LLM
   * 角色定位由模板自带，command 不再需要硬编码 system message
   */
  protected async callLLMWithBuilder(
    builder: BasePromptBuilder,
    callbacks: StepCallbacks,
    options?: { responseFormat?: { type: string }; thinking?: boolean },
    context?: WorkflowContext
  ): Promise<string> {
    // v0.2.2: 默认打开 thinking 模式（DeepSeek 等模型依赖 reasoning 生成高质量内容）
    // 关闭 thinking 会导致输出崩溃/乱码
    const agentRole = context?.data?.agentRole as string | undefined
    let systemPrompt = builder.getSystemRole()
    const effectiveOptions = { thinking: true, ...(options ?? {}) }
    if (agentRole) {
      const { agentRegistry } = await import('../../agent/agent-registry')
      const profile = agentRegistry.get(agentRole as any)
      if (profile) {
        callbacks.log(`🎯 使用专家 Agent: ${profile.emoji} ${profile.displayName}`)
        systemPrompt = profile.systemPrompt
      }
    }
    return this.callLLM(builder.build(), systemPrompt, callbacks, effectiveOptions, context)
  }

  /**
   * 去除 DeepSeek 等模型的  thinking 标签，保证落盘纯净
   */
  protected stripThinkingTags(text: string): string {
    return text.replace(/ thinking[\s\S]*?(?:<\/think>|$)/gi, '').trim()
  }

  /**
   * 全局容错 JSON 解析器
   * 自动剥离 Markdown ```json 代码块并处理尾随逗号等常见大模型幻觉
   */
  protected parseJSON<T>(text: string): T {
    try {
      // 1. 剥离 Markdown 块
      let cleanText = text.replace(/```json?\n?/gi, '').replace(/```\n?/gi, '').trim()
      // 2. 如果存在前序引导语，截取第一把括号到最后一把括号
      const firstBrace = cleanText.indexOf('{')
      const firstBracket = cleanText.indexOf('[')
      const lastBrace = cleanText.lastIndexOf('}')
      const lastBracket = cleanText.lastIndexOf(']')

      if (firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1)
      } else if (firstBracket !== -1 && lastBracket !== -1) {
        cleanText = cleanText.substring(firstBracket, lastBracket + 1)
      }
      
      return JSON.parse(cleanText) as T
    } catch {
      throw new Error(`AI 返回的数据格式乱码，无法解析为有效层级结构。尝试解析内容末端: ${text.slice(-100)}`)
    }
  }

  /**
   * 解耦的事件驱动：通知 UI 层去更新资产树，而无需去 import Zustand Store
   */
  protected notifyRefresh(resources: EventPayloadMap['REFRESH_RESOURCE']['resources']) {
    globalEventBus.emit('REFRESH_RESOURCE', { resources })
  }
}