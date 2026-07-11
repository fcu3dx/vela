import type { WorkflowDefinition } from '../../stores/workflow-store'
import { useProjectStore } from '../../stores/project-store'
import { ipc } from '../ipc-client'
import type { BlueprintData } from '../../../electron/repositories/blueprint-repository'
import { stripThinkingTags } from './workflow-utils'

// ==========================================
// 1. 结构与类型导出 (保留对外的向后兼容)
// ==========================================

export type ChapterBlueprint = BlueprintData

const EMPTY_BLUEPRINT: ChapterBlueprint = {
  chapterNumber: 0,
  title: '',
  role: '发展',
  purpose: '',
  keyEvents: '',
  characters: [],
  suspenseHook: '',
  userGuidance: '',
  notes: '',
  notesUpdatedAt: '',
}

export interface DirectoryWorkflowParams {
  mode: 'full' | 'append'
  startChapter?: number
  count?: number
  /** 节奏/风格指导（可选） */
  pacingGuidance?: string
}

// ==========================================
// 2. 蓝图文件访问与工具函数
// ==========================================

export function parseTextBlueprints(content: string, startNum: number, endNum: number): ChapterBlueprint[] {
  let result: ChapterBlueprint[] = []

  try {
    const cleanContent = stripThinkingTags(content)
    let jsonStr = cleanContent.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/g, '').trim()
    const startIndex = jsonStr.indexOf('{')
    const endIndex = jsonStr.lastIndexOf('}')

    if (startIndex !== -1 && endIndex !== -1) {
      let arrayStr = jsonStr.substring(startIndex, endIndex + 1)

      // v0.2.7 FIX: AI 可能在 JSON 字符串值内嵌入未转义的 ASCII 双引号
      // 如 "keyEvents": "...得到了"金手指"..."，导致 JSON.parse 失败。
      // 将中文语境下的裸双引号（两侧是汉字或中文标点）替换为「」。
      // 覆盖：汉字、CJK 扩展、中文标点、全角字符
      const cjkAndPunct = '\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\uff00-\uffef'
      arrayStr = arrayStr.replace(
        new RegExp(`([${cjkAndPunct}])\\x22([^\\x22]{1,50})\\x22([${cjkAndPunct}])`, 'g'),
        '$1「$2」$3'
      )

      let parsed = JSON.parse(arrayStr)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.blueprints) {
        parsed = parsed.blueprints
      }
      if (Array.isArray(parsed)) {
        result = parsed
          .filter((p: Record<string, unknown>) => {
            const n = Number(p.chapterNumber || p.chapter_number)
            return n >= startNum && n <= endNum
          })
          .map((p: Record<string, unknown>) => ({
            ...EMPTY_BLUEPRINT,
            chapterNumber: Number(p.chapterNumber || p.chapter_number || 0),
            title: String(p.title || `第${p.chapterNumber}章`),
            role: String(p.role || '发展'),
            purpose: String(p.purpose || ''),
            keyEvents: String(p.keyEvents || p.key_events || ''),
            characters: Array.isArray(p.characters) ? p.characters : [],
            suspenseHook: String(p.suspenseHook || p.suspense_hook || ''),
            userGuidance: '',
          }))
      }
    }
  } catch {
    console.error('Failed to parse blueprint JSON', content)
  }

  const distinctMap = new Map<number, ChapterBlueprint>()
  for (const item of result) {
    if (!distinctMap.has(item.chapterNumber)) distinctMap.set(item.chapterNumber, item)
  }

  return Array.from(distinctMap.values()).sort((a, b) => a.chapterNumber - b.chapterNumber)
}

export async function loadDirectoryBlueprints(): Promise<ChapterBlueprint[]> {
  try {
    const blueprints = await ipc.invoke('db:blueprint-get-all')
    return blueprints.sort((a, b) => a.chapterNumber - b.chapterNumber)
  } catch {
    return []
  }
}

export async function saveChapterBlueprint(blueprint: ChapterBlueprint): Promise<void> {
  await ipc.invoke('db:blueprint-upsert', blueprint)
}

export async function saveAllBlueprints(blueprints: ChapterBlueprint[]): Promise<void> {
  await ipc.invoke('db:blueprint-upsert-many', blueprints)
}

export async function getBlueprintCount(): Promise<number> {
  try {
    const blueprints = await ipc.invoke('db:blueprint-get-all')
    return blueprints.length
  } catch {
    return 0
  }
}

// ==========================================
// 3. 工作流定义映射工厂 (Command 调度层)
// ==========================================

export function createDirectoryWorkflow(params: DirectoryWorkflowParams = { mode: 'full' }): WorkflowDefinition {
  return {
    type: 'directory',
    title: params.mode === 'append' ? `📋 续写章节蓝图${params.startChapter ? `（从第 ${params.startChapter} 章）` : ''}` : '📋 生成章节蓝图（全量）',
    steps: [
      {
        name: '读取架构',
        description: `从 SQLite 加载项目架构信息`,
        executor: async (_step, context, callbacks) => {
          const project = useProjectStore.getState().currentProject
          if (!project) throw new Error('未打开项目')

          callbacks.log('读取项目架构信息...')
          const core = await ipc.invoke('db:project-core-get')
          if (!core) throw new Error('项目核心数据未初始化')

          const parts: string[] = []
          if (core.premise && core.premise.length > 50) parts.push(core.premise)
          if (core.charactersArch && core.charactersArch.length > 50) parts.push(core.charactersArch)
          if (core.worldbuilding && core.worldbuilding.length > 50) parts.push(core.worldbuilding)
          if (core.synopsis && core.synopsis.length > 50) parts.push(core.synopsis)

          if (parts.length === 0) throw new Error('项目主要架构均未生成')

          context.data.architecture = parts.join('\n\n---\n\n')
          // 注入节奏指导到 context，供 Command 读取
          if (params.pacingGuidance) context.data.pacingGuidance = params.pacingGuidance
          // v0.2.7: full 模式也加载已有蓝图，供断点续跑检测
          const existing = await loadDirectoryBlueprints()
          context.data.existingBlueprints = existing
          if (params.mode === 'append') {
            callbacks.log(`已加载 ${existing.length} 章已有蓝图`)
          }
          return `架构加载完成（${parts.length} 段）`
        },
      },
      {
        name: '生成蓝图',
        description: '基于架构文件生成全书章节蓝图',
        resumable: true,
        agentRole: 'blueprint-agent',
        gates: [
          { name: 'format', type: 'format', severity: 'blocker' },
          {
            name: 'duplicate',
            type: 'duplicate',
            severity: 'warning',
            validator: async (_output, ctx) => {
              const blueprints = (ctx.data.blueprints || []) as Array<{ chapterNumber: number }>
              const existing = (ctx.data.existingBlueprints || []) as Array<{ chapterNumber: number }>
              const existingNums = new Set(existing.map(b => b.chapterNumber))
              const issues: Array<{ severity: 'blocker' | 'warning'; message: string }> = []
              for (const bp of blueprints) {
                if (existingNums.has(bp.chapterNumber)) {
                  issues.push({ severity: 'warning', message: `第 ${bp.chapterNumber} 章已存在，续跑模式应跳过` })
                }
              }
              return { gateName: 'duplicate', gateType: 'duplicate', passed: issues.length === 0, issues }
            },
          },
        ],
        executor: async (_step, context, callbacks) => {
          const { GenerateDirectoryCommand } = await import('./commands/directory.command')
          const cmd = new GenerateDirectoryCommand(params)
          const blueprints = await cmd.execute({ step: _step, context, callbacks })
          // 保存到 context 供后续 gate 使用
          context.data.blueprints = blueprints
          // 返回可读摘要字符串（step.result 必须是 string，否则 AIOutputPanel 渲染会崩溃）
          return `已生成 ${blueprints.length} 章蓝图`
        },
      },
      {
        name: '保存蓝图',
        description: `将章节蓝图批量写入 SQLite 数据库`,
        executor: async (_step, _context, callbacks) => {
          const project = useProjectStore.getState().currentProject
          if (!project) throw new Error('未打开项目')

          callbacks.log('验证蓝图入库...')
          
          // v0.2.7 FIX: 直接从 DB 读取已保存的蓝图（批次保存在 Step 2 已完成）
          // 避免依赖 context.data 可能出现的时序问题导致前 12 章丢失
          const merged = await loadDirectoryBlueprints()
          
          callbacks.log(`已验证 ${merged.length} 章蓝图入库完成`)
          useProjectStore.getState().refreshFileTree()
          return '已保存蓝图'
        },
      },
    ],
    onComplete: {
      mode: 'silent',
      message: params.mode === 'append' ? '✅ 续写蓝图生成完成' : '✅ 全书章节蓝图已生成完成！',
    },
  }
}
