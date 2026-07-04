/**
 * deai-filter Tool — 去 AI 味引擎
 *
 * 内置 Tool，基于 7 Gate 检测 + 三遍修复法对文本进行去 AI 味处理。
 * 设计理念: 最小改动 — 只改"怎么说"，不改"说什么"。
 */

import { buildAgentTool } from '../tool-registry'
import { ipc } from '../../ipc-client'
import { useProjectStore } from '../../../stores/project-store'
import { useEditorStore } from '../../../stores/editor-store'

// ===== 7 Gate 检测 =====

/** Gate 检测结果 */
interface GateHit {
  gate: string
  type: string
  match: string
  start: number
  end: number
  suggestion: string
}

/** Gate 规则 */
interface GateRule {
  gate: string
  type: string
  /** 正则模式或关键词列表 */
  patterns: RegExp[]
  /** 替换建议模板 */
  suggestion: (match: string) => string
}

const GATES: GateRule[] = [
  // Gate A: 禁用高频 AI 词
  {
    gate: 'A',
    type: '禁用词',
    patterns: [
      /命运的齿轮/,
      /心猛地一沉/,
      /眼神复杂/,
      /深刻变化/,
      /踏上新的旅程/,
      /仿佛/,
      /缓缓开口/,
      /嘴角勾起一抹/,
      /眼中闪过一丝/,
      /深吸一口气/,
      /内心深处/,
      /不言而喻/,
      /从此以后/,
      /命运的安排/,
    ],
    suggestion: () => '[用具体动作/白描替代]',
  },

  // Gate B: 句式套路 — 连续排比、"不是...而是..."
  {
    gate: 'B',
    type: '句式套路',
    patterns: [
      /不是[^，。,\n]{2,30}而是[^，。,\n]{2,30}/,
    ],
    suggestion: () => '[拆成两句，一句说事实一句说反转]',
  },

  // Gate C: 心理告知 — "他感到..." "她意识到..."
  {
    gate: 'C',
    type: '心理告知',
    patterns: [
      /(他|她|它)感到[\u4e00-\u9fff]{2,12}/,
      /(他|她|它)意识到[^，。,\n]{2,20}/,
      /(他|她|它)觉得[\u4e00-\u9fff]{2,12}/,
    ],
    suggestion: () => '[用外部动作/生理反应替代]',
  },

  // Gate D: 节奏均匀 — 每段长度太整齐
  {
    gate: 'D',
    type: '节奏均匀',
    patterns: [
      // 由外部逻辑检测（段落拆分后检查长度方差）
    ],
    suggestion: () => '[打破段长规律，混入短句和长段]',
  },

  // Gate E: 对话腔调 — 每句都有"说道/问道"
  {
    gate: 'E',
    type: '对话腔调',
    patterns: [
      /[，。]\s*[\u4e00-\u9fff]{1,6}(说道|问道|答道|回答道|说道:)/g,
    ],
    suggestion: () => '[用动作替代对话标签，或用无标签直接对话]',
  },

  // Gate F: 结尾升华 — 章末总结感慨
  {
    gate: 'F',
    type: '结尾升华',
    patterns: [
      /这[一那][天次刻]?[，,]?(他|她|它)[^。]{4,20}(明白了|懂得了|终于|才知道)/,
      /也许[，,]?这才是[^。]{2,15}/,
    ],
    suggestion: () => '[用动作/对话收尾，不总结]',
  },

  // Gate G: 解释腔 — "她不知道的是..." "之所以...是因为"
  {
    gate: 'G',
    type: '解释腔',
    patterns: [
      /(他|她|它)不知道的是[^。]{4,30}/,
      /之所以[^，。,\n]{4,30}是因为[^，。,\n]{4,20}/,
    ],
    suggestion: () => '[删掉解释，让读者自己推导]',
  },
]

// ===== Gate 扫描 =====

function scanGates(text: string): GateHit[] {
  const hits: GateHit[] = []

  for (const rule of GATES) {
    for (const pattern of rule.patterns) {
      // 用 global+sticky 不行，用 while+exec
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        hits.push({
          gate: rule.gate,
          type: rule.type,
          match: m[0],
          start: m.index,
          end: m.index + m[0].length,
          suggestion: rule.suggestion(m[0]),
        })
      }
    }
  }

  // Gate D: 段落长度检测
  detectGateD(text, hits)

  // 按位置排序
  hits.sort((a, b) => a.start - b.start)
  return hits
}

function detectGateD(text: string, hits: GateHit[]): void {
  const paragraphs = text.split(/\n\n+/)
  const lengths = paragraphs.map(p => p.replace(/\n/g, '').length)
  if (lengths.length < 4) return

  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((sum, len) => sum + (len - avg) ** 2, 0) / lengths.length

  // 方差极小 → 过于均匀
  const cv = Math.sqrt(variance) / avg
  if (cv < 0.15 && avg > 30) {
    hits.push({
      gate: 'D',
      type: '节奏均匀',
      match: `整体段落长度过于均匀 (方差系数 ${cv.toFixed(2)})`,
      start: 0,
      end: text.length,
      suggestion: '打破段长规律: 插入1句短段和5+句长段，制造节奏起伏',
    })
  }
}

// ===== 三遍修复 =====

interface RepairResult {
  original: string
  repaired: string
  passes: {
    pass1: { hitsRemoved: number; changes: string[] }
    pass2: { changes: string[] }
    pass3: { changes: string[] }
  }
  report: string
}

function repairText(text: string): RepairResult {
  const pass1Changes: string[] = []
  const pass2Changes: string[] = []
  const pass3Changes: string[] = []
  let working = text

  // Pass 1: 去泛化 — 替换禁用词、心理告知、解释腔
  const p1Patterns: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /命运的齿轮/g, replacement: '[已替换]' },
    { pattern: /心猛地一沉/g, replacement: '[已替换]' },
    { pattern: /眼神复杂/g, replacement: '[已替换]' },
    { pattern: /深深吸了一口气/g, replacement: '胸口起伏了一下' },
    { pattern: /嘴角勾起一抹/g, replacement: '笑了一下' },
    { pattern: /眼中闪过一丝/g, replacement: '垂下眼' },
    { pattern: /仿佛/g, replacement: '像' },
  ]

  for (const { pattern, replacement } of p1Patterns) {
    const before = working
    working = working.replace(pattern, replacement)
    if (working !== before) {
      pass1Changes.push(`替换 "${pattern.source}" → "${replacement}"`)
    }
  }

  // Pass 2: 去书面化 — 句式套路、书面腔
  const p2Patterns: Array<{ pattern: RegExp; replacement: string }> = [
    { pattern: /缓缓开口/g, replacement: '说' },
    { pattern: /内心深处/g, replacement: '心里' },
    { pattern: /不言而喻/g, replacement: '明显' },
    { pattern: /从此以后/g, replacement: '' },
  ]

  for (const { pattern, replacement } of p2Patterns) {
    const before = working
    working = working.replace(pattern, replacement)
    if (working !== before) {
      pass2Changes.push(`替换 "${pattern.source}" → "${replacement}"`)
    }
  }

  // Pass 3: 回自然感 — 对话标签清理
  const p3Before = working
  working = working.replace(/([，。])\s*([\u4e00-\u9fff]{1,6})(说道|问道|答道)([:,])/g, '$1')
  working = working.replace(/[，。]\s*[\u4e00-\u9fff]{1,6}(说|问|答):/g, '。')
  if (working !== p3Before) {
    pass3Changes.push('精简对话标签')
  }

  const hitsAfter = scanGates(working)
  const hitsRemoved = scanGates(text).length - hitsAfter.length

  // 生成报告
  const lines: string[] = []
  lines.push('# 去 AI 味报告')
  lines.push('')
  lines.push(`## Pass 1 去泛化: ${pass1Changes.length} 处修改`)
  for (const c of pass1Changes) {
    lines.push(`- ${c}`)
  }
  lines.push('')
  lines.push(`## Pass 2 去书面化: ${pass2Changes.length} 处修改`)
  for (const c of pass2Changes) {
    lines.push(`- ${c}`)
  }
  lines.push('')
  lines.push(`## Pass 3 回自然感: ${pass3Changes.length} 处修改`)
  for (const c of pass3Changes) {
    lines.push(`- ${c}`)
  }
  lines.push('')
  lines.push(`## 结果: ${hitsRemoved} 处 AI 痕迹已处理`)
  if (hitsAfter.length > 0) {
    lines.push('## 残留痕迹 (建议人工处理)')
    for (const h of hitsAfter) {
      lines.push(`- [Gate ${h.gate}] ${h.match} → ${h.suggestion}`)
    }
  }

  return {
    original: text,
    repaired: working,
    passes: {
      pass1: { hitsRemoved, changes: pass1Changes },
      pass2: { changes: pass2Changes },
      pass3: { changes: pass3Changes },
    },
    report: lines.join('\n'),
  }
}

// ===== Tool 注册 =====

export const deaiFilterTool = buildAgentTool({
  name: 'deai_filter',
  description:
    '对指定文本进行去 AI 味处理。基于 7 Gate 检测（禁用词/句式套路/心理告知/节奏均匀/对话腔调/结尾升华/解释腔）加三遍修复法，返回去味后的文本和修改报告。',
  source: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: '需要去 AI 味的文本内容。如果不提供，将使用编辑器当前选中的文本。',
      },
      file_path: {
        type: 'string',
        description: '可选。要去 AI 味的文件路径（相对于项目根目录），与 text 二选一。',
      },
    },
  },
  requiresConfirmation: true,
  isReadOnly: false,
  userFacingName: '去 AI 味',
  execute: async (args) => {
    let inputText = (args.text as string) || ''

    // 如果没有直接传文本，尝试从编辑器获取
    if (!inputText) {
      const editorStore = useEditorStore.getState()
      const selection = editorStore.selectedText
      if (selection && selection.trim()) {
        inputText = selection
      }
    }

    // 如果指定了文件路径，读取文件
    if (!inputText && args.file_path) {
      const project = useProjectStore.getState().currentProject
      if (!project) {
        return { success: false, content: '', error: '没有打开的项目' }
      }
      const filePath = (args.file_path as string).trim()
      const result = await ipc.invoke('fs:read-file', `${project.path}/${filePath}`)
      if (!result.success) {
        return { success: false, content: '', error: result.error ?? '文件读取失败' }
      }
      inputText = result.content
    }

    if (!inputText || !inputText.trim()) {
      return {
        success: false,
        content: '',
        error: '未提供文本。请在编辑器中选中文本后调用，或指定 text/file_path 参数。',
      }
    }

    // 先扫描 Gate
    const hits = scanGates(inputText)
    if (hits.length === 0) {
      return {
        success: true,
        content: '# 去 AI 味检测结果\n\n未检测到 AI 写作痕迹。文本已通过 7 Gate 检测。',
      }
    }

    // 三遍修复
    const result = repairText(inputText)

    return {
      success: true,
      content: result.report + '\n\n## 修复后文本\n\n' + result.repaired,
    }
  },
})