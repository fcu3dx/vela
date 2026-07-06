/**
 * Skill 注册中心
 *
 * 管理所有可用的 Skill(基于 SKILL.md 的模块化知识包)。
 * 支持: 
 * - 内置 Skill(随 Vela 发布的预设 Skill)
 * - 用户 Skill(用户放在 ~/.vela/skills/ 下的自定义 Skill)
 * - 项目 Skill(放在项目的 .vela/skills/ 下的项目级 Skill)
 *
 * Skill 格式兼容 Cursor 的 SKILL.md 生态。
 */

import { ipc } from '../ipc-client'
import { useProjectStore } from '../../stores/project-store'
import { toolRegistry, type AgentTool } from './tool-registry'

// ===== 类型定义 =====

/** Skill 来源 */
export type SkillSource = 'builtin' | 'user' | 'project'

/** Skill 元数据(从 SKILL.md frontmatter 解析) */
export interface SkillMetadata {
  /** Skill 唯一名称 */
  name: string
  /** 显示名称 */
  displayName?: string
  /** 功能描述 */
  description: string
  /** 使用场景(用于 Agent 自动匹配) */
  whenToUse?: string
  /** 版本 */
  version?: string
  /** 允许的工具列表(白名单) */
  allowedTools?: string[]
  /** 参数提示 */
  argumentHint?: string
  /** 是否可由模型自动调用 */
  userInvocable?: boolean
}

/** 加载后的 Skill */
export interface LoadedSkill {
  /** 元数据 */
  metadata: SkillMetadata
  /** Skill 内容(Markdown 提示词) */
  content: string
  /** 来源 */
  source: SkillSource
  /** 文件所在目录 */
  baseDir: string
  /** SKILL.md 文件路径 */
  filePath: string
}

// ===== Skill 输出落地映射 =====

/**
 * Skill 输出落地映射 -- v0.2.1
 *
 * 每个 Skill 生成的内容自动保存到项目文件系统的对应目录，
 * 不再停留在 AI 对话面板中需手动复制。
 */
const SKILL_OUTPUT_MAP: Record<string, { dir: string; file: string }> = {
  // 架构相关 -> 02_architecture/
  'novel-outline':      { dir: '02_architecture', file: '大纲.md' },
  'story-memory':       { dir: '02_architecture', file: '故事记忆.md' },
  'brainstorm':         { dir: '02_architecture', file: '脑暴创意.md' },
  // 角色相关 -> 03_characters/
  'character-analysis': { dir: '03_characters', file: '角色分析.md' },
  'character-sim':      { dir: '03_characters', file: '角色对话记录.md' },
  // 草稿/正文 -> 04_drafts/
  'novel-draft':        { dir: '04_drafts', file: '正文续写.md' },
  'short-write':        { dir: '04_drafts', file: '短篇正文.md' },
  // 审稿 -> 审稿/（输出带修稿触发标记）
  'review-chapter':     { dir: '审稿', file: '章节审稿报告.md' },
  'multi-review':       { dir: '审稿', file: '多视角审稿报告.md' },
  'continuity-check':   { dir: '审稿', file: '一致性检查报告.md' },
  // 拆文/扫榜 -> 拆文库/
  'novel-analyze':      { dir: '拆文库', file: '拆文分析.md' },
  'short-analyze':      { dir: '拆文库', file: '短篇拆文.md' },
  'market-scan':        { dir: '拆文库', file: '市场扫榜.md' },
  // 风格/写作 -> 追踪/
  'style-creator':      { dir: '追踪', file: '风格参考.md' },
  'writing-modes':      { dir: '追踪', file: '写作模式配置.md' },
  'writing-principles': { dir: '追踪', file: '写作原则.md' },
  'llm-discipline':     { dir: '追踪', file: 'LLM语言纪律.md' },
  // 工具类 -> 02_architecture/
  'novel-import':       { dir: '02_architecture', file: '导入数据.md' },
  'cover-gen':          { dir: '02_architecture', file: '封面方案.md' },
  'research-assist':    { dir: '02_architecture', file: '研究笔记.md' },
  // 教练/读者 -> 追踪/
  'writing-coach':      { dir: '追踪', file: '写作教练建议.md' },
  'reader-sim':         { dir: '追踪', file: '读者反馈模拟.md' },
  // 去AI味 -> 不自动落地 (需要用户确认覆盖原稿)
  'deai-filter':        { dir: '', file: '' },
}

/**
 * 根据 Skill 名称将生成内容落地到项目文件系统
 * 返回保存路径或 null
 */
async function saveSkillOutput(skillName: string, content: string): Promise<string | null> {
  const mapping = SKILL_OUTPUT_MAP[skillName]
  if (!mapping || !mapping.dir) return null

  try {
    const { useProjectStore } = await import('../../stores/project-store')
    const project = useProjectStore.getState().currentProject
    if (!project) return null

    const { ipc } = await import('../ipc-client')

    // 确保目录存在
    const dirPath = `${project.path}/${mapping.dir}`
    const dirExists = await ipc.invoke('fs:check-exists', dirPath)
    if (!dirExists) {
      await ipc.invoke('fs:mkdir', dirPath)
    }

    // 审稿类 Skill 外加修稿闭环提示
    const reviewSkills = ['review-chapter', 'multi-review', 'continuity-check']
    const contentToSave = reviewSkills.includes(skillName)
      ? content + '\n\n---\n## 修稿操作\n\n发现以上问题后，可通过以下方式触发修稿:\n- 在 AI 面板中输入 `/deai-filter` 对目标章节进行去 AI 味处理\n- 输入 `/novel-draft` 并指定章节号进行局部重写\n- 切换到 "叙事写手" Agent 后提供具体修改指令\n'
      : content

    // 写入文件（追加模式，保留历史）
    const filePath = `${dirPath}/${mapping.file}`
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const header = `\n---\n## ${timestamp}\n\n`
    const fileExists = await ipc.invoke('fs:check-exists', filePath)

    if (fileExists) {
      const existing = await ipc.invoke('fs:read-file', filePath)
      const newContent = (existing.success ? existing.content : '') + header + contentToSave
      await ipc.invoke('fs:write-file', filePath, newContent)
    } else {
      await ipc.invoke('fs:write-file', filePath, contentToSave)
    }

    return `${mapping.dir}/${mapping.file}`
  } catch {
    return null
  }
}

// ===== Skill Registry =====

class SkillRegistryImpl {
  private skills: Map<string, LoadedSkill> = new Map()

  /** 注册一个 Skill */
  register(skill: LoadedSkill): void {
    this.skills.set(skill.metadata.name, skill)
  }

  /** 查找 Skill */
  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name)
  }

  /** 列出所有 Skill */
  listAll(): LoadedSkill[] {
    return Array.from(this.skills.values())
  }

  /** 按来源列出 */
  listBySource(source: SkillSource): LoadedSkill[] {
    return this.listAll().filter(s => s.source === source)
  }

  /** Skill 数量 */
  get size(): number {
    return this.skills.size
  }

  /** 清空 */
  clear(): void {
    this.skills.clear()
  }

  /**
   * 从目录加载 Skills
   *
   * 扫描指定目录下的 skill-name/SKILL.md 格式
   */
  async loadFromDirectory(dir: string, source: SkillSource): Promise<number> {
    let count = 0
    try {
      const entries = await ipc.invoke('fs:list-dir', dir)
      for (const entry of entries) {
        if (!entry.isDir) continue

        const skillFile = `${entry.path}/SKILL.md`
        try {
          const exists = await ipc.invoke('fs:check-exists', skillFile)
          if (!exists) continue

          const result = await ipc.invoke('fs:read-file', skillFile)
          if (!result.success) continue

          const skill = parseSkillMd(result.content, entry.name, source, entry.path, skillFile)
          if (skill) {
            this.register(skill)
            count++
          }
        } catch {
          // 单个 Skill 加载失败不影响整体
        }
      }
    } catch {
      // 目录不存在等情况, 静默处理
    }
    return count
  }

  /**
   * 加载所有 Skill(内置 + 用户 + 项目)
   */
  async loadAll(): Promise<void> {
    this.clear()

    // 注册内置 Skill
    registerBuiltinSkills(this)

    // 加载用户 Skill(~/.vela/skills/)
    try {
      const velaHome = await ipc.invoke('config:get-vela-home')
      const userSkillsDir = `${velaHome}/skills`
      const userCount = await this.loadFromDirectory(userSkillsDir, 'user')
      if (userCount > 0) {
        console.log(`[Skills] 加载了 ${userCount} 个用户 Skill`)
      }
    } catch {
      // 静默处理
    }

    // 加载项目 Skill(项目/.vela/skills/)
    const project = useProjectStore.getState().currentProject
    if (project) {
      const projectSkillsDir = `${project.path}/.vela/skills`
      const projectCount = await this.loadFromDirectory(projectSkillsDir, 'project')
      if (projectCount > 0) {
        console.log(`[Skills] 加载了 ${projectCount} 个项目 Skill`)
      }
    }

    // 将所有 Skill 注册为 Agent Tool
    this.registerToToolRegistry()

    console.log(`[Skills] 共加载 ${this.size} 个 Skill`)
  }

  /**
   * 将 Skill 注册为 Agent Tool
   */
  private registerToToolRegistry(): void {
    // 先清理旧的 Skill Tool
    toolRegistry.unregisterBySource('skill')

    for (const skill of this.listAll()) {
      const agentTool: AgentTool = {
        name: `skill__${skill.metadata.name}`,
        description: skill.metadata.description + (skill.metadata.whenToUse ? ` -- ${skill.metadata.whenToUse}` : ''),
        source: 'skill',
        inputSchema: {
          type: 'object',
          properties: {
            args: {
              type: 'string',
              description: skill.metadata.argumentHint ?? '可选的参数',
            },
          },
        },
        requiresConfirmation: false,
        isReadOnly: true,
        userFacingName: skill.metadata.displayName ?? skill.metadata.name,
        execute: async (toolArgs) => {
          const userArgs = (toolArgs.args as string) ?? ''
          // 变量替换
          let content = skill.content
          if (userArgs) {
            content = content.replace(/\$\{args\}/g, userArgs)
            content = content.replace(/\$1/g, userArgs)
          }
          content = content.replace(/\$\{SKILL_DIR\}/g, skill.baseDir)

          // v0.2.1: Skill 输出落地 -- 根据 Skill 类型自动写入项目文件
          const saveResult = await saveSkillOutput(skill.metadata.name, content)

          const footer = saveResult
            ? `\n\n> 📁 已自动保存至: ${saveResult}`
            : ''

          return {
            success: true,
            content: `[Skill: ${skill.metadata.displayName ?? skill.metadata.name}]\n\n${content}${footer}`,
          }
        },
      }
      toolRegistry.register(agentTool)
    }
  }
}

/** 全局 Skill 注册中心 */
export const skillRegistry = new SkillRegistryImpl()

// ===== SKILL.md 解析 =====

/**
 * 解析 SKILL.md 文件内容
 *
 * 格式: 
 * ```
 * ---
 * name: skill-name
 * description: 功能描述
 * when_to_use: 什么时候使用
 * allowed-tools: [read_file, search_knowledge]
 * ---
 *
 * # Skill 提示词内容
 * ...
 * ```
 */
function parseSkillMd(
  raw: string,
  fallbackName: string,
  source: SkillSource,
  baseDir: string,
  filePath: string,
): LoadedSkill | null {
  // 解析 frontmatter
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
  const frontmatter: Record<string, unknown> = {}
  let content = raw

  if (fmMatch) {
    const fmText = fmMatch[1]
    content = raw.slice(fmMatch[0].length)

    // 简单的 YAML 解析(支持 key: value 和 key: [items])
    for (const line of fmText.split('\n')) {
      const kvMatch = line.match(/^\s*([^:]+):\s*(.*)$/)
      if (!kvMatch) continue
      const key = kvMatch[1].trim()
      let val: unknown = kvMatch[2].trim()

      // 解析数组 [a, b, c]
      if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      }
      // 解析布尔值
      if (val === 'true') val = true
      if (val === 'false') val = false

      frontmatter[key] = val
    }
  }

  const metadata: SkillMetadata = {
    name: (frontmatter['name'] as string) || fallbackName,
    displayName: frontmatter['display_name'] as string,
    description: (frontmatter['description'] as string) || `Skill: ${fallbackName}`,
    whenToUse: frontmatter['when_to_use'] as string,
    version: frontmatter['version'] as string,
    allowedTools: frontmatter['allowed-tools'] as string[],
    argumentHint: frontmatter['argument-hint'] as string,
    userInvocable: frontmatter['user-invocable'] !== false,
  }

  return {
    metadata,
    content: content.trim(),
    source,
    baseDir,
    filePath,
  }
}

// ===== 内置 Skills =====

function registerBuiltinSkills(registry: SkillRegistryImpl): void {

  // Skill 1: 章节审阅
  registry.register({
    metadata: {
      name: 'review-chapter',
      displayName: '章节审阅',
      description: '对指定章节进行全面的质量审阅, 包括剧情逻辑、角色一致性、节奏感、伏笔呼应等多个维度。',
      whenToUse: '用户要求审阅、检查、评估某个章节时',
    },
    content: [
      '# 章节审阅',
      '',
      '请对目标章节进行专业的小说审阅。依次检查以下维度: ',
      '',
      '## 1. 剧情逻辑',
      '- 情节是否连贯, 有无逻辑矛盾',
      '- 因果关系是否成立',
      '',
      '## 2. 角色一致性',
      '- 角色行为是否符合既定性格',
      '- 对话风格是否一致',
      '',
      '## 3. 节奏感',
      '- 张弛是否有度',
      '- 是否有不必要的拖沓或过于仓促的转折',
      '',
      '## 4. 伏笔与呼应',
      '- 已有伏笔是否得到了回应',
      '- 新埋的伏笔是否自然',
      '',
      '## 5. 文笔与风格',
      '- 描写是否生动',
      '- 是否符合整体文风设定',
      '',
      '请先使用 read_drafts 工具读取目标章节, 再使用 read_architecture 读取故事架构进行对比评估。',
      '输出格式: 每个维度评分(1-5星)+ 详细说明 + 修改建议。',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 2: 脑暴创意
  registry.register({
    metadata: {
      name: 'brainstorm',
      displayName: '脑暴创意',
      description: '针对指定话题进行创意脑暴, 生成多个创意方向和灵感。',
      whenToUse: '用户要求头脑风暴、找灵感、想创意时',
    },
    content: [
      '# 创意脑暴',
      '',
      '请围绕用户给出的话题进行专业的创意脑暴。',
      '',
      '## 输出格式',
      '为每个创意方向提供: ',
      '1. **创意概念**(一句话)',
      '2. **详细展开**(100-200 字)',
      '3. **可行性评估**(高/中/低)',
      '4. **与已有剧情的融合度**',
      '',
      '请先使用 read_architecture 和 read_project_state 了解项目背景, 确保创意与现有设定不矛盾。',
      '至少提供 5 个不同方向的创意。',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 3: 角色分析
  registry.register({
    metadata: {
      name: 'character-analysis',
      displayName: '角色分析',
      description: '深入分析指定角色的性格、动机、角色弧、人物关系等。',
      whenToUse: '用户想深入了解或调整角色设定时',
    },
    content: [
      '# 角色深度分析',
      '',
      '请对目标角色进行全方位的深度分析。',
      '',
      '## 分析维度',
      '1. **核心性格特质** -- MBTI、大五人格倾向',
      '2. **深层动机** -- 驱动角色行动的核心诉求',
      '3. **角色弧预测** -- 基于当前设定推演角色成长轨迹',
      '4. **关系网络** -- 与其他角色的关系图谱',
      '5. **冲突点** -- 角色面临的核心矛盾和困境',
      '6. **独特标识** -- 口头禅、习惯动作、标志性特征',
      '',
      '请先使用 read_characters 读取角色卡, 以及 read_architecture 了解故事结构。',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 4: 连续性检查
  registry.register({
    metadata: {
      name: 'continuity-check',
      displayName: '连续性检查',
      description: '检查小说中的设定一致性和连续性问题, 发现矛盾和遗漏。',
      whenToUse: '用户想检查设定有没有矛盾、是否有不一致的地方时',
    },
    content: [
      '# 连续性与一致性检查',
      '',
      '请对项目进行全面的连续性检查。',
      '',
      '## 检查项',
      '1. **时间线一致性** -- 事件发生顺序是否合理',
      '2. **地理一致性** -- 地点描述是否前后一致',
      '3. **角色状态** -- 角色的伤病、装备、能力等是否正确追踪',
      '4. **设定遵守** -- 是否与世界观设定产生矛盾',
      '5. **伏笔追踪** -- 哪些伏笔已回收, 哪些待回收',
      '',
      '请使用 list_chapters 了解进度, 使用 read_architecture 获取设定, 逐章检查关键节点。',
      '输出为表格形式, 标注问题严重程度(🔴严重 / 🟡注意 / 🟢正常)。',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 5: 写作教练
  registry.register({
    metadata: {
      name: 'writing-coach',
      displayName: '写作教练',
      description: '提供专业的写作技巧指导和文笔改善建议。',
      whenToUse: '用户想提高写作水平、求教写作技巧时',
    },
    content: [
      '# 写作教练',
      '',
      '作为专业的写作教练, 为用户提供针对性的指导。',
      '',
      '## 指导范围',
      '- 叙述技巧(视角运用、时间线处理)',
      '- 描写技法(环境渲染、人物刻画)',
      '- 对话写作(个性化对话、潜台词运用)',
      '- 节奏控制(场景切换、留白技巧)',
      '- 悬念设置(钩子、反转、暗线)',
      '',
      '请先使用 read_project_state 了解项目的写作风格设定, ',
      '再根据用户的具体问题提供定制化建议, 并附上示例对比。',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 6: 大纲搭建
  registry.register({
    metadata: {
      name: 'novel-outline',
      displayName: '大纲搭建',
      description: '从选题确认到核心设定到大纲搭建的完整流程, 包括卷级大纲和章节细纲。',
      whenToUse: '用户想搭建新书大纲、确认选题方向、设计故事结构时',
    },
    content: [
      '# 长篇大纲搭建',
      '',
      '## 流程',
      '',
      '### Phase 1: 确认选题方向',
      '先问用户: 你想让读者什么感觉? 有没有喜欢的书想对标? 你的优势是什么?',
      '',
      '题材匹配:',
      '- 脑洞好 -> 系统文、诸天流、无限流',
      '- 文笔好 -> 仙侠、历史、文艺向都市',
      '- 节奏感好 -> 都市爽文、重生文、游戏文',
      '- 生活经验丰富 -> 行业文、都市日常、种田文',
      '',
      '### Phase 2: 核心设定',
      '帮用户确立: 书名/题材/目标平台/预计字数/一句话梗概/主角设定/世界观骨架/核心冲突',
      '创建: 设定/关系.md + 设定/题材定位.md',
      '',
      '### Phase 3: 大纲搭建',
      '- 卷级大纲: 每卷含功能/核心事件/起始状态->结束状态',
      '- 细纲: 每章一个文件, 五段式(起因->发展->转折->高潮->结尾)',
      '- 多线情节: 主线/辅线/事件线/感情线/逻辑线',
      '- 每章必须有字数目标、目标情绪、章节定位、章首钩子',
      '',
      '## 大纲五检',
      '(1) 本卷交付什么情绪?',
      '(2) 本卷核心冲突?',
      '(3) 节奏起承转合?',
      '(4) 伏笔埋/收?',
      '(5) 章节定位分布?',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 7: 长篇写作
  registry.register({
    metadata: {
      name: 'novel-draft',
      displayName: '长篇写作',
      description: '按细纲生成章节正文, 保持文风一致, 支持日更续写和上下文追踪。',
      whenToUse: '用户要写正文、续写、日更、生成章节时',
    },
    content: [
      '# 长篇正文写作',
      '',
      '## 写作规则',
      '1. 每章开始前加载: 追踪/上下文.md + 角色状态 + 当前细纲',
      '2. 对话 60%+ 不用"说/道/问"标签, 用动作替代',
      '3. 情绪用动作展示("手在抖"), 不直接告诉("很紧张")',
      '4. 拒绝 AI 高频词: 命运的齿轮、心猛地一沉、眼神复杂',
      '5. 段落长度自然不齐(1-3句为主, 偶尔单句一行)',
      '6. 章尾用动作/对话收, 不总结/升华',
      '',
      '## 字数控制',
      '严格遵循细纲中设定的字数目标。',
      '',
      '## 日更续写',
      '- 加载追踪/上下文.md 恢复写作状态',
      '- 加载当前角色状态快照',
      '- 加载待回收伏笔列表',
      '- 读细纲->写正文->更新追踪文件',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 8: 长篇拆文
  registry.register({
    metadata: {
      name: 'novel-analyze',
      displayName: '长篇拆文',
      description: '拆解长篇小说的黄金三章、爽点密度、节奏模式、情绪模块和可借鉴套路。',
      whenToUse: '用户想分析、拆解某本小说学习写作套路时',
    },
    content: [
      '# 长篇拆文分析',
      '',
      '## 分析维度',
      '1. **五维评分**: 开篇钩子/爽点密度/节奏控制/角色塑造/设定自洽',
      '2. **黄金三章**: 逐章深度拆解',
      '3. **节奏分析**: 关键信息推进/情绪触发点/爆发节律',
      '4. **情绪模块**: 读者需求/情绪引擎/可复用写作模块',
      '5. **文风分析**: 句长/标点/对话潜台词/情绪节奏',
      '',
      '## 输出产物',
      '存入 拆文库/{书名}/: ',
      '- 拆文报告.md(五维评分+可借鉴套路)',
      '- 章节/(每章摘要+情节点+角色提及)',
      '- 角色/(每个核心角色完整档案)',
      '- 剧情/(故事线/节奏/情绪模块)',
      '- 设定/(世界观/力量体系/势力)',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 9: 去 AI 味
  registry.register({
    metadata: {
      name: 'deai-filter',
      displayName: '去 AI 味',
      description: '检测并清除 AI 写作痕迹, 让文字回归自然、口语化、非模板化。',
      whenToUse: '用户觉得文字有 AI 味、"这篇太 AI 了"、想去除 AI 写作痕迹时',
    },
    content: [
      '# 去 AI 味',
      '',
      '## 核心哲学',
      'AI 味不是语法错误----是过度圆滑、工整、解释充分。',
      '改最少字让"味"变过来。只改"怎么说"不改"说什么"。',
      '',
      '## 7 Gate 检测',
      '',
      '- **Gate A - 禁用词**: "命运的齿轮""心猛地一沉""眼神复杂"',
      '- **Gate B - 句式套路**: 连续3+排比、"不是...而是..."模板',
      '- **Gate C - 心理告知**: "他感到紧张""她意识到事情不对"',
      '- **Gate D - 节奏均匀**: 段段4-6句、长度整齐',
      '- **Gate E - 对话腔调**: 每句都有"说道/问道"标签',
      '- **Gate F - 结尾升华**: 章末总结/升华/感慨',
      '- **Gate G - 解释腔**: "她不知道的是...""之所以...是因为"',
      '',
      '## 三遍修复法',
      '- Pass 1 去泛化: 替换禁用词、抽象情绪、工整对仗、解释腔',
      '- Pass 2 去书面化: 句式套路深化、书面腔词替换',
      '- Pass 3 回自然感: 长短节奏、对话差异化、补具体感官细节',
      '',
      '## 自然替换参考',
      '- "深吸一口气"->"胸口起伏了一下"',
      '- "眼中闪过一丝..."->"垂下眼"/"眯起眼"',
      '- "嘴角勾起一抹..."->"笑了一下"/"乐了"',
      '- "仿佛..."->"像..."/直接白描',
      '- "缓缓开口"->"说"/用动作引出对话',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 10: 多视角审稿
  registry.register({
    metadata: {
      name: 'multi-review',
      displayName: '多视角审稿',
      description: '从结构/角色/文字/设定四个维度进行对抗式审查, 输出分级问题报告。',
      whenToUse: '用户想审稿、审查、找问题时',
    },
    content: [
      '# 多视角审稿',
      '',
      '## 核心信念',
      '审查是找问题, 不是验证正确性。',
      '',
      '## 审查维度',
      '1. **结构维度**: 核心卖点、冲突推进、情绪曲线、钩子期待、高潮构建',
      '2. **角色维度**: 行为一致、动机合理、对话个性、关系匹配',
      '3. **文字维度**: 自然度、AI 味、标点节奏、段落节奏、具体字数表达校验',
      '4. **设定维度**: 规则遵守、时间线一致、角色状态正确',
      '',
      '## 严重程度',
      '- S1 🔴 严重: 明确冲突、事实错误',
      '- S2 🟠 显著: 行为矛盾、关键信息不一致',
      '- S3 🟡 注意: 细节偏差、边界模糊',
      '- S4 ⚪ 信息: 建议补充',
      '',
      '## 输出格式',
      '每项 finding: 位置/类型/原文引用/问题描述/修改建议',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 11: 角色对话模拟
  registry.register({
    metadata: {
      name: 'character-sim',
      displayName: '角色对话模拟',
      description: '以角色身份对话, 帮助发现角色声音、测试角色关系和验证行为动机。',
      whenToUse: '用户想和角色对话、测试角色性格、发现角色声音时',
    },
    content: [
      '# 角色对话模拟',
      '',
      '## 工作方式',
      '1. 先用 read_characters 加载角色档案',
      '2. 进入角色: 完全以角色口吻、性格、知识边界说话',
      '3. 角色只知道角色该知道的事',
      '4. 可在对话中自然暴露隐藏特质和深层动机',
      '',
      '## 使用场景',
      '- 发现角色的语言风格(口头禅/句式/节奏)',
      '- 测试角色间的关系张力',
      '- 验证角色的行为逻辑是否自洽',
      '- 探索角色在特定情境下的反应',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 12: 读者模拟
  registry.register({
    metadata: {
      name: 'reader-sim',
      displayName: '读者模拟',
      description: '从指定读者画像视角模拟首次阅读体验, 逐段标注感受和弃书风险。',
      whenToUse: '用户想了解读者阅读体验、测试章节吸引力时',
    },
    content: [
      '# 读者视角模拟',
      '',
      '## 读者画像',
      '- 番茄读者: 追求快节奏、强冲突、爽点密集、低门槛',
      '- 起点读者: 追求设定自洽、升级路径、长线期待',
      '- 路人读者: 随机点进来, 耐心有限',
      '',
      '## 输出格式',
      '逐段标注阅读感受(兴奋😆/无聊😴/困惑🤔/满足😌/紧张😰/失望😞)',
      '标注弃书风险点(第几段开始想退出、原因是什么)',
      '整体情绪曲线(横轴=段落/纵轴=情绪强度)',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 13: 风格创建
  registry.register({
    metadata: {
      name: 'style-creator',
      displayName: '风格创建',
      description: '从散文样本分析文风特征, 创建可复用的风格参考文件供写作时匹配。',
      whenToUse: '用户想分析现有文风、创建风格文件、让 AI 匹配自己的写作风格时',
    },
    content: [
      '# 风格创建',
      '',
      '## 分析维度',
      '1. 句长分布(短句<10字/中句10-30字/长句>30字的占比)',
      '2. 标点习惯(句号/逗号/破折号/省略号密度和使用模式)',
      '3. 词汇偏好(高频词 TOP20/独特比喻库/语气词频率)',
      '4. 对话风格(标签使用率/动作替代率/对话平均长度)',
      '5. 节奏模式(段落平均长度/场景切换频率/动静交替模式)',
      '',
      '## 输出',
      '生成 设定/文风.md 风格参考文件, 供后续写作时注入 Agent 上下文',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 14: 写作模式
  registry.register({
    metadata: {
      name: 'writing-modes',
      displayName: '写作模式',
      description: '在不同写作模式间切换: 新稿起草、修订改稿、桥接过渡、替代版本、润色打磨。',
      whenToUse: '用户需要特定写作模式(新稿/修订/桥接/替代/润色)时',
    },
    content: [
      '# 写作模式',
      '',
      '## 五种模式',
      '1. **新稿 (Fresh Draft)**: 从零开始写新内容, 基于细纲和设定',
      '2. **修订 (Revision)**: 基于审稿意见修改已有内容, 保持其他部分不变',
      '3. **桥接 (Bridge)**: 在两段已有内容之间写过渡段落',
      '4. **替代 (Alternate Take)**: 写同一场景的不同版本(不同视角/风格)',
      '5. **润色 (Line Polish)**: 微调词句, 不改结构和内容',
      '',
      '## 使用方式',
      '调用时指定模式和目标范围(章节号/段落区间/场景名)',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 15: 写作原则
  registry.register({
    metadata: {
      name: 'writing-principles',
      displayName: '写作原则',
      description: '核心写作方法论: 读者奖励通道、AI 失败模式、品味纪律。',
      whenToUse: '用户想了解写作方法论、提升写作质量时',
    },
    content: [
      '# 写作原则',
      '',
      '## 读者奖励通道',
      '1. 悬念通道: 制造"接下来会怎样"的期待',
      '2. 爽感通道: 满足读者对"强势/逆袭/反转"的渴望',
      '3. 情感通道: 制造"共鸣/心疼/感动"的体验',
      '4. 新奇通道: 提供"没见过/没想到"的设定和情节',
      '',
      '## AI 写作失败模式',
      '1. 解释过多: 生怕读者不懂, 面面俱到',
      '2. 节奏均匀: 每章像短篇, 缺乏张弛',
      '3. 文风漂移: 偏离设定文风, 趋于通用 AI 腔',
      '4. 任务对象化: 角色为剧情服务而非剧情为角色服务',
      '',
      '## 品味纪律',
      '- 不是所有读者都值得讨好',
      '- 删掉比添加更难但更重要',
      '- 这个场景删了故事还成立吗？-> 删',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 16: 故事记忆
  registry.register({
    metadata: {
      name: 'story-memory',
      displayName: '故事记忆',
      description: '从完成章节提取事实变化、更新角色状态、时间线、伏笔和知识库。',
      whenToUse: '用户完成章节后需要更新追踪文件、维护知识库时',
    },
    content: [
      '# 故事记忆维护',
      '',
      '## 提取规则',
      '每完成一章后提取以下变化: ',
      '1. **角色状态变化**: 伤病/装备/能力/位置/关系的改变',
      '2. **新登场角色**: 姓名/身份/与已知角色的关系',
      '3. **新揭示设定**: 世界规则/地点/势力/历史',
      '4. **新埋伏笔**: 内容/预计回收章节',
      '5. **已回收伏笔**: 标记为已回收',
      '6. **时间线进展**: 故事内日期/关键事件',
      '',
      '## 更新目标',
      '- 追踪/角色状态.md',
      '- 追踪/伏笔.md',
      '- 追踪/时间线.md',
      '- 追踪/上下文.md',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 17: 市场扫榜
  registry.register({
    metadata: {
      name: 'market-scan',
      displayName: '市场扫榜',
      description: '分析起点/番茄/晋江/知乎盐言等平台的热门趋势和选题方向。',
      whenToUse: '用户想了解市场趋势、选题方向、平台风口时',
    },
    content: [
      '# 市场扫榜',
      '',
      '## 分析维度',
      '1. 平台热门榜单(TOP100 题材分布/趋势变化)',
      '2. 新兴题材风口(近期上升最快的题材/类型融合趋势)',
      '3. 选题可行性评估(用户优势x市场需求x差异化空间)',
      '4. 对标书建议(同题材成功案例)',
      '',
      '## 输出',
      '选题决策报告: 排序推荐选题+能爆的原因+差异化建议+风险提示',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 18: 小说导入
  registry.register({
    metadata: {
      name: 'novel-import',
      displayName: '小说导入',
      description: '将已有小说反向解析为标准项目结构, 包括角色提取、大纲反推、伏笔识别。',
      whenToUse: '用户想把已有小说导入 Vela 继续写作时',
    },
    content: [
      '# 小说导入',
      '',
      '## 流程',
      '1. 读取原文所有章节',
      '2. 逐章提取: 事件/角色/设定/伏笔/时间线',
      '3. 反推大纲结构(卷级+细纲)',
      '4. 提取角色卡(所有登场角色)',
      '5. 识别伏笔(已埋/已回收/待回收)',
      '6. 重建世界观设定',
      '',
      '## 输出',
      '标准 Vela 项目结构: 设定/大纲/正文/追踪',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 19: 封面生成
  registry.register({
    metadata: {
      name: 'cover-gen',
      displayName: '封面生成',
      description: '根据小说题材和风格分析生成 AI 封面图。',
      whenToUse: '用户需要生成小说封面时',
    },
    content: [
      '# AI 封面生成',
      '',
      '## 流程',
      '1. 读取项目设定(题材/风格/世界观)',
      '2. 生成封面设计方案(布局/色调/元素/字体风格)',
      '3. 确认方案后调用 LLM 图片生成',
      '',
      '## 输出',
      '生成封面图 + 备用方案',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 20: LLM 语言纪律
  registry.register({
    metadata: {
      name: 'llm-discipline',
      displayName: 'LLM 语言纪律',
      description: '检测 LLM 高频默认词和句式, 提供替换建议。',
      whenToUse: '用户想检查 AI 默认词/套话、让文字更个性化时',
    },
    content: [
      '# LLM 语言纪律',
      '',
      '## 检测范围',
      '1. LLM 高频默认词(50+): 命运的齿轮、心猛地一沉、眼神复杂...',
      '2. LLM 默认句式(15+): "不是...而是...""既...又...""不可否认..."',
      '3. 总结体(章末): "这一切都说明...""他终于明白..."',
      '4. 信息倾倒体: 角色直接解释世界观/规则/关系变化',
      '',
      '## 输出',
      '逐项标记位置 + 替换建议 + 替换后效果预览',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 21: 短篇写作
  registry.register({
    metadata: {
      name: 'short-write',
      displayName: '短篇写作',
      description: '短篇小说写作, 包括情绪设计、反转构思和精修出稿。',
      whenToUse: '用户想写短篇小说(知乎盐言/番茄短篇)时',
    },
    content: [
      '# 短篇写作',
      '',
      '## 特点',
      '- 篇幅 8000-30000 字',
      '- 强情绪直给、反转密度高、节奏紧凑',
      '- 常见题材: 追妻火葬场/复仇打脸/总裁豪门/宅斗宫斗',
      '',
      '## 流程',
      '1. 确认故事核(核心反转/情绪卖点)',
      '2. 8 节结构设计 + 情绪曲线',
      '3. 正文输出(保持节奏密度)',
      '4. 去 AI 味精修',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 22: 短篇拆文
  registry.register({
    metadata: {
      name: 'short-analyze',
      displayName: '短篇拆文',
      description: '拆解短篇小说的故事核、反转设计、情感线和写作手法。',
      whenToUse: '用户想分析短篇小说学习套路时',
    },
    content: [
      '# 短篇拆文',
      '',
      '## 分析维度',
      '1. 故事核提取(核心反转/情感锚点)',
      '2. 情节节点分析(54 节点原文引用+情绪标记 -9~+9)',
      '3. 写作手法(POV/对话/信息差/物件钩子等 11 项)',
      '4. 五维评分+爆点6维+认知反转+共鸣9层',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 23: 研究辅助
  registry.register({
    metadata: {
      name: 'research-assist',
      displayName: '研究辅助',
      description: '多源研究资料搜集、交叉验证和结构化研究笔记生成。',
      whenToUse: '用户需要查资料、做研究、验证设定时',
    },
    content: [
      '# 研究辅助',
      '',
      '## 流程',
      '1. 明确研究问题',
      '2. 多源资料搜集',
      '3. 交叉验证(标注来源可信度)',
      '4. 结构化笔记输出',
      '5. 标注引用源',
      '',
      '## 适用场景',
      '- 历史小说年代考证',
      '- 专业领域设定验证',
      '- 地域文化细节核实',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 24: 项目初始化
  registry.register({
    metadata: {
      name: 'project-init',
      displayName: '项目初始化',
      description: '创建完整的小说项目目录结构和基础配置，包含对标/拆文库/追踪等目录体系。',
      whenToUse: '新建项目时，需要创建对标库、拆文库、追踪目录和参考资料目录',
    },
    content: [
      '# 项目初始化',
      '',
      '## 项目目录结构',
      '',
      '项目根目录下创建以下结构：',
      '',
      '- `设定/` — 世界观、角色、势力设定',
      '- `大纲/` — 卷纲、细纲',
      '- `正文/` — 章节正文',
      '- `对标/` — 对标书结构化分析',
      '  - `{书名}/` — 每本对标书的角色/剧情/设定/文风/拆文报告',
      '- `拆文库/` — 所有拆文输出',
      '  - `{书名}/` — 结构化拆解产物',
      '- `追踪/` — 写作连续性管理',
      '  - `上下文.md` — 写作上下文（compact恢复用）',
      '  - `伏笔.md` — 伏笔埋设/回收状态表',
      '  - `时间线.md` — 故事内时间线',
      '  - `角色状态.md` — 角色当前状态快照',
      '- `参考资料/` — 研究资料',
      '',
      '## 执行流程',
      '1. 确认项目根目录路径',
      '2. 创建上述所有目录',
      '3. 初始化 追踪/ 下的空白文件（含模板）',
      '4. 确认目录结构完整性',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 25: 写作工具箱
  registry.register({
    metadata: {
      name: 'writing-toolbox',
      displayName: '写作工具箱',
      description: '智能意图路由与 Skill 自动分发——根据用户输入的创作需求，自动匹配并分发到最合适的 Skill。',
      whenToUse: '用户不确定该用哪个 Skill，或想一次性完成多个创作任务时',
    },
    content: [
      '# 写作工具箱',
      '',
      '你是一个智能路由助手，将用户的自然语言需求映射到最合适的 Skill：',
      '',
      '## 路由规则',
      '',
      '### 一、需求类型识别',
      '| 用户说 | 路由到 |',
      '|--------|--------|',
      '| "我要写新章节" / "续写第X章" | `novel-draft` |',
      '| "帮我搭大纲" / "梳理结构" | `novel-outline` |',
      '| "审一下刚写的" / "帮我审核" | `multi-review` |',
      '| "去 AI 味" / "太 AI 了" | `deai-filter` |',
      '| "帮我拆一本书" / "分析XX书" | `novel-analyze` |',
      '| "找找灵感" / "脑暴" | `brainstorm` |',
      '| "写个短篇" / "写个故事" | `short-write` |',
      '| "查资料" / "研究" | `research-assist` |',
      '| "对一下连续性" / "检查bug" | `continuity-check` |',
      '| "分析角色" / "角色深度" | `character-analysis` |',
      '| "想要建议" / "怎么写更好" | `writing-coach` |',
      '| "扫榜" / "市场趋势" | `market-scan` |',
      '',
      '### 二、多任务路由',
      '用户同时提到多个需求时，按优先级排序并逐一执行：',
      '1. 审稿（multi-review）> 去 AI 味（deai-filter）> 重写',
      '2. 拆文（novel-analyze）> 对标（market-scan）> 大纲',
      '3. 脑暴（brainstorm）> 角色分析 > 大纲',
      '',
      '### 三、输出格式',
      '明确告诉用户：',
      '- 你识别到的需求是什么',
      '- 推荐使用哪个 Skill（/skill-name）',
      '- 为什么这个 Skill 最合适',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // v0.2.3: Skill 26-28 — PRD 缺口补齐

  // Skill 26: 品牌声音分析
  registry.register({
    metadata: {
      name: 'brand-voice',
      displayName: '品牌声音分析',
      description: '分析多项目/多作者的文本样本，提取品牌声音特征（风格指纹），生成品牌声音指南并强制执行。适用于长篇小说连载中保持一致的作者声音。',
      whenToUse: '用户要求分析品牌声音、提取风格特征、统一作者口吻时',
    },
    content: [
      '# 品牌声音分析',
      '',
      '你是一位专业的品牌声音分析师。请根据用户提供的文本样本，提取并构建完整的品牌声音指南。',
      '',
      '## 分析维度',
      '',
      '### 1. 语气语调',
      '- 是正式、口语化、幽默、严肃、温暖、冷静？',
      '- 混合比例如何（如 70% 幽默 + 30% 温馨）',
      '',
      '### 2. 句式特征',
      '- 偏好长句还是短句？',
      '- 喜用排比、反问、设问还是陈述？',
      '- 段落节奏 (快/慢/张弛有度)',
      '',
      '### 3. 词汇指纹',
      '- 高频词汇 Top 20',
      '- 禁用词 (作者明确不用的词)',
      '- 偏好词汇 (作者特别喜欢的替代词)',
      '- 成语/谚语使用频率',
      '',
      '### 4. 情感基线',
      '- 情感倾向 (积极/消极/中性 比例)',
      '- 情感表达的显隐程度 (直白 vs 含蓄)',
      '- 幽默风格的细分类型 (冷幽默/自嘲/讽刺/无厘头)',
      '',
      '### 5. 叙事习惯',
      '- 喜欢内聚焦还是外聚焦',
      '- 偏好动作描写还是心理描写',
      '- 对话密度与标签风格 (他说/道/问/直接引语比率)',
      '',
      '## 输出格式',
      '生成一份结构化的「品牌声音指南」，格式如下：',
      '',
      '```',
      '# [作品/作者名] 品牌声音指南',
      '',
      '## 声音DNA',
      '[一句话概括核心声音特征]',
      '',
      '## 语气图谱',
      '[情感倾向 + 语气分布]',
      '',
      '## 句式指纹',
      '[句长偏好 + 节奏特征 + 修辞习惯]',
      '',
      '## 词汇指南',
      '### 高频词 (自动使用)',
      '### 禁用词 (绝对避免)',
      '### 替换词 (推荐替代)',
      '',
      '## 叙事基线',
      '[视点/密度/对话/描写 统计]',
      '',
      '## 强制执行规则',
      '[3-5 条硬规则, AI 写作时必须遵循]',
      '```',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 27: 标题生成
  registry.register({
    metadata: {
      name: 'headline-gen',
      displayName: '标题生成器',
      description: '为小说章节/卷/全书生成多个标题变体 (A/B 测试)，附带情感评分、吸睛指数和点击率预测，帮助作者做出最优选择。',
      whenToUse: '用户需要想标题、起章节名字、做A/B标题测试时',
    },
    content: [
      '# 标题生成器',
      '',
      '你是一位专业的标题优化师。为小说章节/卷/全书生成高质量标题变体。',
      '',
      '## 生成流程',
      '',
      '### 步骤 1: 内容理解',
      '快速扫描用户提供的章节内容/摘要，提取核心关键词和情感基调。',
      '',
      '### 步骤 2: 批量生成',
      '按以下 4 种策略各生成 3 个标题 (共 12 个):',
      '',
      '**策略一: 悬念钩子型**',
      '- 在标题中暗示事件发展但故意留白',
      '- 例子: `第 7 章: 这份文件，只有死人看过`',
      '',
      '**策略二: 情绪炸裂型**',
      '- 用情绪词直接刺激读者',
      '- 例子: `第 12 章: 我不想再失去任何一个`',
      '',
      '**策略三: 反转暗示型**',
      '- 提及某个关键元素，用反差构造张力',
      '- 例子: `第 24 章: 最后的温柔，是最狠的背叛`',
      '',
      '**策略四: 极简关键词型**',
      '- 2-4 字，高度凝练',
      '- 例子: `第 3 章: 尸检报告`',
      '',
      '### 步骤 3: 评分与推荐',
      '| 标题 | 策略 | 情感评分 | 吸睛指数 | 适合平台 |',
      '|------|------|---------|---------|----------|',
      '| ... | ... | ★★★☆☆ | ★★★★☆ | 番茄小说 |',
      '',
      '### 情感评分标准',
      '基于以下维度评分 (1-5 ★):',
      '- **悬念强度**: 能否让读者产生 \"一定要看\" 的执念',
      '- **情感共鸣**: 能否经角色处镜直击读者内心',
      '- **差异化**: 与同类小说标题的区分度',
      '- **平台适配**: 番茄小说偏好情绪标题，公众号偏好信息量标题',
      '',
      '### 步骤 4: 最终推荐',
      '从 12 个标题中选出 TOP 3，给出推荐理由和适用场景 (首章/高潮章/日常章)',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })

  // Skill 28: 文档导出
  registry.register({
    metadata: {
      name: 'doc-export',
      displayName: '文档导出',
      description: '将小说草稿、完稿章节按指定格式输出 (纯文本/结构化章节/完整手稿)，提供导出预览后确权生成文件。',
      whenToUse: '用户要求导出文档、生成 TXT/DOCX/PDF、整理完本时',
    },
    content: [
      '# 文档导出',
      '',
      '你是一位文档导出助手。帮助作者将小说从 IDE 导出为标准文档格式。',
      '',
      '## 导出流程',
      '',
      '### 步骤 1: 导出范围确认',
      '- 单章导出: 指定章号 N → `正文/第N章.txt`',
      '- 卷导出: 第 X 卷 (章 M → 章 N) 合并',
      '- 全本导出: 从第 1 章到最新章全部合并',
      '- 预览模式: 显示前 500 字预览 (不生成文件)',
      '',
      '### 步骤 2: 格式选择',
      '',
      '| 格式 | 适用场景 | 说明 |',
      '|------|---------|------|',
      '| TXT (纯文本) | 上传平台网/备份 | 去除 Markdown 标记，段落间保留空行 |',
      '| TXT (番茄版) | 番茄小说投稿 | 第 N 章标准格式 + 全文本段落优化 |',
      '| TXT (公众号版) | 微信公众号 | Emoji 段落标识 + 互动结尾 |',
      '| HTML (在线阅读) | 自建发布平台 | 章节导航 + 响应式排版 |',
      '',
      '### 步骤 3: 生成命令提示',
      '当前 Vela IDE 已内置定稿三版本输出功能：',
      '',
      '> **方式一: 使用 AI 定稿功能**',
      '> - 打开任意章节，点击工具栏「定稿」按钮',
      '> - 系统自动生成:',
      '>   - `第N章 标题.txt` (标准版)',
      '>   - `第N章 标题【番茄小说版】.txt`',
      '>   - `第N章 标题_公众号版/上篇.txt / 中篇.txt / 下篇.txt`',
      '',
      '> **方式二: 手动批量导出**',
      '> - 打开 Terminal → 运行:`cat 正文/第*.章.txt > 全本导出.txt`',
      '> - 加序: `awk \"{print}\" 正文/第*.章.txt > 全本.txt`',
      '',
      '### 步骤 4: 提交建议',
      '根据用户目标，推荐最适合的导出方式：',
      '- 番茄投稿 → 用定稿番茄版 → 直接上传',
      '- 公众号 → 用定稿公众号版 → 复制到公众号编辑器 → 微调排版',
      '- 备份存档 → TXT 纯文本 → 放在 GitHub / 云盘 → 持续同步',
    ].join('\n'),
    source: 'builtin',
    baseDir: '',
    filePath: '',
  })
}
