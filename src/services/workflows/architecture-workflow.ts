import type { WorkflowDefinition, WorkflowContext, StepCallbacks } from '../../stores/workflow-store'
import { useLLMStore } from '../../stores/llm-store'
import { useProjectStore } from '../../stores/project-store'
import { getPromptTemplate } from '../prompt-templates'
import { ipc } from '../ipc-client'
import type { NovelConfig } from '../../shared/ipc-channels'
import type { CharacterData } from '../../../electron/repositories/character-repository'

import { runPostProcessPipeline, type PostProcessStep, stripThinkingTags } from './workflow-utils'

// ==========================================
// 1. 类型定义
// ==========================================

export interface PartialArchData {
  premise_result?: string
  character_dynamics_result?: string
  character_state_result?: string
  world_building_result?: string
  synopsis_result?: string
}

export interface ArchitectureWorkflowParams {
  selectedSteps?: Array<'premise' | 'characters' | 'worldbuilding' | 'synopsis'>
  /** 每步的补充指导（如 { premise: "多强调金手指的限制" }） */
  stepGuidance?: Record<string, string>
  /** v0.2.0.x: 指定生成专家 Agent */
  agentRole?: import('../../shared/agent-types').AgentRole
}

export interface ConfigGenerationWorkflowParams {
  idea: string
  totalChapters: number
  wordsPerChapter: number
  onGenerated: (config: Partial<NovelConfig>) => void
  /** v0.2.1: 指定生成专家 Agent */
  agentRole?: import('../../shared/agent-types').AgentRole
  /** v0.2.2: 用户已选的结构和视角，AI 必须尊重 */
  plotStructure?: string
  narrativePOV?: string
}

// ==========================================
// 2. 工作流定义
// ==========================================

export function createArchitectureWorkflow(params: ArchitectureWorkflowParams = {}): WorkflowDefinition {
  const sel = params.selectedSteps ?? ['premise', 'characters', 'worldbuilding', 'synopsis']
  const stepDesc = (key: string, defaultDesc: string) => sel.includes(key as never) ? defaultDesc : `（跳过，保留已有内容）`
  // 闭包捕获逐步指导，executor 中注入到 context.data
  const guidance = params.stepGuidance || {}
  // v0.2.0.x: 指定 Agent 专家
  const agentRole = params.agentRole

  const allSteps = [
    {
      name: '故事前提',
      key: 'premise',
      description: stepDesc('premise', '提炼故事前提与核心卖点'),
      continueOnError: false,  // 前提是根基，失败必须停止
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        context.data.agentRole = agentRole
        const { GenerateCoreSeedCommand } = await import('./commands/architecture.command')
        return new GenerateCoreSeedCommand().execute({ step, context, callbacks })
      },
    },
    {
      name: '角色图谱',
      key: 'characters',
      description: stepDesc('characters', '构建核心角色关系网与角色弧光'),
      continueOnError: true,   // v0.2.1: 角色生成失败不阻断世界观和情节大纲
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        context.data.agentRole = agentRole
        const { GenerateCharactersCommand } = await import('./commands/architecture.command')
        return new GenerateCharactersCommand().execute({ step, context, callbacks })
      },
    },
    {
      name: '世界观',
      key: 'worldbuilding',
      description: stepDesc('worldbuilding', '构建自带冲突引擎的世界观矩阵'),
      continueOnError: true,   // v0.2.1: 世界观失败不阻断情节大纲
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        context.data.agentRole = agentRole
        const { GenerateWorldBuildingCommand } = await import('./commands/architecture.command')
        return new GenerateWorldBuildingCommand().execute({ step, context, callbacks })
      },
    },
    {
      name: '情节大纲',
      key: 'synopsis',
      description: stepDesc('synopsis', '整合所有碎片，按选定结构模式生成情节大纲'),
      continueOnError: false,  // 情节大纲需要前置数据，但如果前面步骤continueOnError通过，它仍会尝试
      executor: async (step: unknown, context: WorkflowContext, callbacks: StepCallbacks) => {
        context.data.stepGuidance = guidance
        context.data.agentRole = agentRole
        const { GeneratePlotArchitectureCommand } = await import('./commands/architecture.command')
        return new GeneratePlotArchitectureCommand(sel).execute({ step, context, callbacks })
      },
    },
  ]

  const finalSteps = allSteps.filter(s => sel.includes(s.key as never))

  return {
    type: 'architecture_generation',
    title: '🏗️ 生成故事架构',
    steps: finalSteps,
    onComplete: { mode: 'silent', message: '🏗️ 故事架构已生成完成！前往侧边栏「故事架构」查看' },
  }
}

export function createConfigGenerationWorkflow(params: ConfigGenerationWorkflowParams): WorkflowDefinition {
  return {
    type: 'config_generation',
    title: '🪄 AI 填充配置',
    steps: [
      {
        name: '智能分析并填充配置',
        description: `根据创作脑洞生成小说配置（全书规划约 ${params.totalChapters} 章）`,
        executor: async (step, context, callbacks) => {
          // v0.2.1: 注入 AgentRole
          context.data.agentRole = params.agentRole
          const { GenerateConfigCommand } = await import('./commands/architecture.command')
          const cmd = new GenerateConfigCommand(
            params.idea,
            params.totalChapters,
            params.wordsPerChapter,
            params.onGenerated,
            params.plotStructure,
            params.narrativePOV
          )
          return cmd.execute({ step, context, callbacks })
        },
      },
    ],
    onComplete: { mode: 'silent', message: '✅ 小说配置已自动生成完毕，请查阅确认。' },
  }
}

// ==========================================
// 3. 工具与指导文本
// ==========================================

export function getPlotStructureGuide(structure: string, totalChapters: number): string {
  const ch20 = Math.round(totalChapters * 0.2)
  const ch25 = Math.round(totalChapters * 0.25)
  const ch50 = Math.round(totalChapters * 0.5)
  const ch75 = Math.round(totalChapters * 0.75)

  switch (structure) {
    case 'heros_journey':
      return `【英雄之旅·十二阶段】（严格按以下阶段组织大纲）\n建议章节分配：全书共 ${totalChapters} 章...` // 为了简洁截断，后台已由架构掌控
    case 'save_the_cat':
      return `【节拍表·十五拍】（严格按以下节拍组织大纲）\n建议章节分配：全书共 ${totalChapters} 章...`
    case 'kishotenketsu':
      return `【起承转合·四段式】（严格按以下四段组织大纲）
建议章节分配：全书共 ${totalChapters} 章
起（约第1章~第${ch25}章，占总篇幅约25%）：介绍世界、角色和日常，建立读者认同
承（约第${ch25 + 1}章~第${ch50}章，占总篇幅约25%）：延续与深化，展现角色关系和冲突苗头
转（约第${ch50 + 1}章~第${ch75}章，占总篇幅约25%）：核心转折，出人意料的变化打破既有格局
合（约第${ch75 + 1}章~第${totalChapters}章，占总篇幅约25%）：收束所有线索，揭示主题，给出结局`
    case 'multi_thread':
      return `【多线叙事】（按多条故事线并行推进的方式组织大纲）
建议章节分配：全书共 ${totalChapters} 章
需要明确以下要素：
1. 主线数量：设定2-4条独立又交织的故事线，每条有独立主角或视角
2. 交汇节点：每条线在第${ch25}章、第${ch50}章、第${ch75}章左右安排交汇碰撞
3. 节奏编排：各线交替出现的节奏，避免某条线长期消失
4. 最终合流：在第${ch75}章前后所有线索开始汇聚，走向统一高潮`
    case 'freeform':
      return `【自由结构】（不限定特定叙事框架，根据故事内容自然编排）
全书共 ${totalChapters} 章。
请根据故事类型和内容特点自行设计最合适的叙事节奏。
核心原则：
1. 保证每10-20章有一个小高潮或悬念释放点
2. 全书应有清晰的开篇建置（前10-15%）和收尾段落（后10-15%）
3. 中段避免节奏单一，适时安排转折点
4. 允许插叙、倒叙、片段式叙事等灵活手法`
    case 'three_act':
    default:
      return `【三幕结构】（严格按以下结构组织大纲）
建议章节分配：全书共 ${totalChapters} 章
第一幕：建置（约第1章~第${ch20}章，占总篇幅约20%）
第二幕：对抗与发展（约第${ch20 + 1}章~第${ch75}章，占总篇幅约55%）
第三幕：高潮与结局（约第${ch75 + 1}章~第${totalChapters}章，占总篇幅约25%）`
  }
}

export function getNarrativePOVLabel(pov: string): string {
  const labels: Record<string, string> = {
    first_person: '第一人称',
    third_limited: '第三人称有限视角',
    third_omniscient: '第三人称全知视角',
    multi_pov: '多视角轮换',
  }
  return labels[pov] || pov
}

// ==========================================
// 4. 角色卡后处理逻辑
// ==========================================

export const ARCH_CHARACTER_SCOPE = 'arch_characters'

export function createCharacterExtractSteps(_projectPath: string, characterDynamicsContent: string, genre: string): PostProcessStep[] {
  return [
    {
      key: 'extract_character_cards',
      label: '📇 提取初始角色卡',
      critical: true,
      executor: async (cb) => {
        const { ArchitecturePromptBuilder } = await import('../prompts/prompt-builder')
        const template = getPromptTemplate('extract_initial_characters')
        if (!template) throw new Error('未找到 extract_initial_characters')
        const extractPrompt = new ArchitecturePromptBuilder(template).withCharacterDynamics(characterDynamicsContent).withGenre(genre).build()
        const systemRole = template.systemRole || '你是一位专业的小说数据结构化专家。'

        const llmStore = useLLMStore.getState()
        cb.appendText('🔍 正在调用 AI 提取角色卡片...\n')

        let fullContent = ''
        await new Promise<void>((resolve, reject) => {
          llmStore.generateStream(
            [
              { role: 'system', content: systemRole },
              { role: 'user', content: extractPrompt }
            ],
            {
              onChunk: (chunk) => { fullContent += chunk; cb.appendText(chunk) },
              onDone: () => resolve(),
              onError: (err) => reject(new Error(err))
            },
            undefined,
            { responseFormat: { type: 'json_object' } }
          )
        })

        const cleanedCards = stripThinkingTags(fullContent)

        // 辅助函数：从候选文本中提取角色数组
        function extractCharactersFromCandidate(candidate: string): Array<Record<string, unknown>> | null {
          try {
            const parsedData = JSON.parse(candidate)
            if (Array.isArray(parsedData)) return parsedData as Array<Record<string, unknown>>
            if (parsedData && typeof parsedData === 'object' && Array.isArray((parsedData as Record<string, unknown>).characters)) {
              return (parsedData as Record<string, unknown>).characters as Array<Record<string, unknown>>
            }
            return null
          } catch {
            return null
          }
        }

        // 增强 JSON 解析容错：支持多种大模型输出格式（多候选 + 兜底修复）
        let parsedCards: Array<Record<string, unknown>> = []
        const parseFailReasons: string[] = []

        try {
          // 候选1：原始文本去 markdown 块
          const c1 = cleanedCards.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
          const r1 = extractCharactersFromCandidate(c1)
          if (r1 && r1.length > 0) { parsedCards = r1 }
          else parseFailReasons.push('候选1（直接parse去markdown文本）：解析失败或角色为空')

          // 候选2：尝试提取 JSON 数组 [...]
          if (parsedCards.length === 0) {
            const arrMatch = cleanedCards.match(/\[\s*\{[\s\S]*\}\s*\]/)
            if (arrMatch) {
              const r2 = extractCharactersFromCandidate(arrMatch[0])
              if (r2 && r2.length > 0) { parsedCards = r2 }
              else parseFailReasons.push('候选2（正则提取JSON数组）：解析失败或角色为空')
            } else {
              parseFailReasons.push('候选2（正则提取JSON数组）：未匹配到数组模式')
            }
          }

          // 候选3：尝试提取 JSON 对象 { "characters": [...] }
          if (parsedCards.length === 0) {
            const objMatch = cleanedCards.match(/\{\s*"characters"\s*:[\s\S]*\}/)
            if (objMatch) {
              const r3 = extractCharactersFromCandidate(objMatch[0])
              if (r3 && r3.length > 0) { parsedCards = r3 }
              else parseFailReasons.push('候选3（正则提取characters对象）：解析失败或角色为空')
            } else {
              parseFailReasons.push('候选3（正则提取characters对象）：未匹配到对象模式')
            }
          }

          // 候选4：从原始 fullContent（未经 stripThinkingTags）重新提取
          if (parsedCards.length === 0) {
            const rawArrMatch = fullContent.match(/\[\s*\{[\s\S]*\}\s*\]/)
            if (rawArrMatch) {
              const r4 = extractCharactersFromCandidate(rawArrMatch[0])
              if (r4 && r4.length > 0) { parsedCards = r4 }
              else parseFailReasons.push('候选4（原始fullContent提取JSON数组）：解析失败或角色为空')
            }
            if (parsedCards.length === 0) {
              const rawObjMatch = fullContent.match(/\{\s*"characters"\s*:[\s\S]*\}/)
              if (rawObjMatch) {
                const r4b = extractCharactersFromCandidate(rawObjMatch[0])
                if (r4b && r4b.length > 0) { parsedCards = r4b }
                else parseFailReasons.push('候选4（原始fullContent提取characters对象）：解析失败或角色为空')
              } else {
                parseFailReasons.push('候选4（原始fullContent）：未匹配到任何JSON模式')
              }
            }
          }

          // 候选5（兜底修复）：对正则匹配到的截断片段尝试补全缺失的 ] 或 }
          if (parsedCards.length === 0) {
            // 先用非贪婪匹配获取第一个完整的 {...} 对象，再尝试组装
            const allObjMatches = cleanedCards.match(/\{[^{}]*\{[^{}]*\}[^{}]*\}|\{[^{}]*\}/g)
            if (allObjMatches && allObjMatches.length > 0) {
              // 尝试将匹配到的对象组装成数组
              const assembled = '[' + allObjMatches.join(',') + ']'
              const r5 = extractCharactersFromCandidate(assembled)
              if (r5 && r5.length > 0) { parsedCards = r5 }
              else parseFailReasons.push('候选5（非贪婪组装JSON对象）：解析失败')
            } else {
              // 最后尝试：贪婪匹配并补全截断
              const arrMatch = cleanedCards.match(/\[\s*\{[\s\S]*\}\s*\]/)
              if (arrMatch) {
                let fragment = arrMatch[0]
                if (!fragment.trimEnd().endsWith(']')) fragment += ']'
                const r5b = extractCharactersFromCandidate(fragment)
                if (r5b && r5b.length > 0) { parsedCards = r5b }
                else parseFailReasons.push('候选5（补全截断JSON）：解析失败')
              } else {
                parseFailReasons.push('候选5（兜底修复）：未匹配到任何JSON片段')
              }
            }
          }

          if (parsedCards.length === 0) {
            const failSummary = parseFailReasons.join('；')
            cb.log(`  JSON解析详情: ${failSummary}`)
            throw new Error('AI 返回的角色数据格式不正确，未提取到有效角色')
          }
        } catch (parseErr) {
          // 如果 JSON 解析本身失败，记录详细信息并抛出
          const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
          const tail = cleanedCards.length > 300 ? cleanedCards.slice(-300) : cleanedCards
          cb.log(`  原始返回尾部（最后300字符）:\n${tail}`)
          throw new Error(`角色卡 JSON 解析失败: ${errMsg}`)
        }

        // 构建角色卡数据列表
        const validRoles = ['protagonist', 'antagonist', 'supporting', 'minor']
        const characterDataList: Array<Record<string, unknown>> = []
        for (const card of parsedCards) {
          if (!card.name) continue
          const role = validRoles.includes(card.role as string) ? card.role : 'supporting'
          characterDataList.push({ ...card, role, name: card.name })
        }

        // 批量写入数据库
        const saveResult = await ipc.invoke('db:character-save-all', characterDataList as unknown as CharacterData[])
        if (!saveResult.success) {
          throw new Error(`角色卡保存失败：${saveResult.error || '未知错误'}`)
        }
        cb.log(`✅ 角色卡提取完毕（共 ${characterDataList.length} 个角色）`)
      },
    },
  ]
}

export async function runArchCharacterExtract(projectPath: string, characterDynamicsContent: string, genre: string): Promise<void> {
  const steps = createCharacterExtractSteps(projectPath, characterDynamicsContent, genre)
  const { useWorkflowStore } = await import('../../stores/workflow-store')
  const runId = await useWorkflowStore.getState().startWorkflow({
    type: 'post_process',
    title: '📋 后处理：角色卡提取',
    steps: [
      {
        name: '提取角色卡片',
        description: '从角色图谱中提取并生成角色卡片数据',
        executor: async (_step, _ctx, callbacks) => {
          const { globalEventBus } = await import('../../shared/event-bus')
          const archStatus = await runPostProcessPipeline(projectPath, ARCH_CHARACTER_SCOPE, '架构-角色图谱', steps, callbacks)
          if (archStatus.allCriticalPassed) {
            // 角色卡提取成功 → 通过 EventBus 通知 ProjectService 刷新
            globalEventBus.emit('ARCH_POSTPROCESS_UPDATED', {})
          } else {
            globalEventBus.emit('CHARACTER_EXTRACT_FAILED', { error: archStatus.steps.extract_character_cards?.error })
            globalEventBus.emit('ARCH_POSTPROCESS_UPDATED', {})
          }
        },
      },
    ],
  })

  // 检查后处理工作流是否失败
  const finalRun = useWorkflowStore.getState().history.find(r => r.id === runId)
  if (finalRun && finalRun.status === 'failed') {
    const failedStep = finalRun.steps.find(s => s.status === 'failed')
    throw new Error(failedStep?.error || '角色卡提取失败')
  }
}

export async function repairArchCharacterCards(projectPath: string): Promise<void> {
  const core = await ipc.invoke('db:project-core-get')
  if (!core?.charactersArch || core.charactersArch.length < 50) throw new Error('无法提取角色卡')

  const project = useProjectStore.getState().currentProject
  if (!project) throw new Error('未打开项目')

  const steps = createCharacterExtractSteps(projectPath, core.charactersArch, project.novelConfig.genre)
  const { useWorkflowStore } = await import('../../stores/workflow-store')
  await useWorkflowStore.getState().startWorkflow({
    type: 'post_process',
    title: '🔧 修复：角色卡提取',
    steps: [
      {
        name: '重试角色卡提取',
        description: '重试失败的角色卡提取步骤',
        executor: async (_step, _ctx, callbacks) => {
          const { globalEventBus } = await import('../../shared/event-bus')
          const archStatus = await runPostProcessPipeline(projectPath, ARCH_CHARACTER_SCOPE, '架构-角色图谱', steps, callbacks, { onlyFailed: true })
          if (archStatus.allCriticalPassed) {
            globalEventBus.emit('ARCH_POSTPROCESS_UPDATED', {})
          } else {
            globalEventBus.emit('ARCH_POSTPROCESS_UPDATED', {})
          }
        },
      },
    ],
  })
}

