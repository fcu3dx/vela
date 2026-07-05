/**
 * benchmark-workflow — 对标与拆文工作流
 *
 * v0.2.2 新增：对标书结构化分析 + 节奏迁移 + 拆文库输出
 */

import type { WorkflowDefinition } from '../../stores/workflow-store'
import { useLLMStore } from '../../stores/llm-store'
import { agentRegistry } from '../agent/agent-registry'
import type { AgentRole } from '../../shared/agent-types'
import { stripThinkingTags } from './workflow-utils'
import { skillRegistry } from '../agent/skill-registry'

// ==========================================
// 1. 类型定义
// ==========================================

export type BenchmarkMode = 'analyze' | 'scan' | 'import'

export const BENCHMARK_MODES: Array<{ key: BenchmarkMode; label: string; emoji: string; desc: string }> = [
  { key: 'analyze', label: '长篇拆文', emoji: '🔍', desc: '黄金三章/爽点/节奏/情绪模块五维分析' },
  { key: 'scan',    label: '市场扫榜', emoji: '📊', desc: '同题材趋势/成功案例/对标书推荐' },
  { key: 'import',  label: '导入分析', emoji: '📥', desc: '已有小说逆向解析为标准项目结构' },
]

export const BENCHMARK_AGENTS: Array<{ role: AgentRole | ''; label: string; desc: string }> = [
  { role: '',                  label: '默认',           desc: '标准拆文分析' },
  { role: 'story-architect',   label: '故事架构师',     desc: '结构派，聚焦节奏与冲突设计' },
  { role: 'critic',            label: '评论者',         desc: '批判视角，找套路与亮点' },
  { role: 'brainstormer',      label: '脑暴者',         desc: '创意迁移，提炼可借鉴模式' },
]

export interface BenchmarkWorkflowParams {
  /** 拆文模式 */
  mode: BenchmarkMode
  /** 书名或对标目标 */
  bookTitle?: string
  /** 拆文内容（用户提供的分析材料） */
  content?: string
  /** 指定专家 */
  agentRole?: AgentRole
  /** 回调 */
  onComplete?: (result: string) => void
}

// ==========================================
// 2. 拆文工作流生成器
// ==========================================

export function createBenchmarkWorkflow(params: BenchmarkWorkflowParams): WorkflowDefinition {
  const modeInfo = BENCHMARK_MODES.find(m => m.key === params.mode)
  const modeLabel = modeInfo?.label ?? '对标分析'

  return {
    type: 'directory',
    title: `${modeInfo?.emoji ?? '📊'} ${modeLabel}`,
    steps: [
      {
        name: modeLabel,
        description: params.bookTitle ? `分析: ${params.bookTitle}` : modeInfo?.desc ?? '',
        executor: async (_step, context, callbacks) => {
          callbacks.log(`${modeInfo?.emoji ?? '📊'} 开始 ${modeLabel}...`)

          // 获取对应 Skill 的提示词
          const skillName = params.mode === 'analyze' ? 'novel-analyze'
            : params.mode === 'scan' ? 'market-scan'
            : 'novel-import'

          const skill = skillRegistry.get(skillName)
          const skillPrompt = skill?.content ?? ''

          // 构建分析 prompt
          const userInput = params.content || params.bookTitle || ''
          const analyzePrompt = skillPrompt
            ? `${skillPrompt}\n\n## 分析对象\n${userInput || '(待分析)'}\n\n请按上述维度进行完整分析并输出结构化报告。`
            : `请对以下内容进行结构化拆文分析（五维评分/节奏/情绪模块/可借鉴套路）：\n\n${userInput || '(待分析)'}`

          // 获取专家提示词
          let systemPrompt = `你是 Vela 的${modeLabel}专家，擅长结构化文学分析。`
          if (params.agentRole) {
            const profile = agentRegistry.get(params.agentRole)
            if (profile) {
              systemPrompt = profile.systemPrompt
              callbacks.log(`🎯 使用专家: ${profile.displayName}`)
            }
          }

          callbacks.log(`⏳ ${modeLabel}中...`)

          const result = await useLLMStore.getState().callLLM(analyzePrompt, {
            systemPrompt,
          })

          const clean = stripThinkingTags(result)
          context.data.benchmarkResult = clean
          callbacks.log(`✅ ${modeLabel}完成`)
          params.onComplete?.(clean)
        },
      },
    ],
    onComplete: { mode: 'silent', message: `${modeInfo?.emoji ?? '📊'} ${modeLabel}完成，结果已保存到拆文库。` },
  }
}