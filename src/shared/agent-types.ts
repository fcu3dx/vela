/**
 * Agent 类型定义
 *
 * 定义 Vela 多 Agent 协作体系中的核心类型: 
 * - AgentProfile: 每个专业 Agent 的元数据和配置
 * - AgentRole: 13 个专业化写作角色
 */

// ===== Agent 角色枚举 =====

/** Agent 角色标识 */
export type AgentRole =
  | 'general'             // 通用助手(默认, 兼容原有行为)
  | 'story-architect'     // 故事架构师
  | 'character-designer'  // 角色设计师
  | 'narrative-writer'    // 叙事写手
  | 'consistency-checker' // 一致性检查器
  | 'story-explorer'      // 故事探索者
  | 'critic'              // 评论者(深度对抗式批评)
  | 'editor'              // 编辑(整体书编辑视角)
  | 'reader-sim'          // 读者模拟器
  | 'character-sim'       // 角色模拟器
  | 'brainstormer'        // 脑暴者(创意选项生成)
  | 'outliner'            // 大纲师
  | 'style-creator'       // 风格创建器
  | 'chronicler'          // 编年史家(事实提取)

// ===== Agent 模型档位 =====

/** Agent 推荐的模型档位 */
export type AgentModelTier = 'strong' | 'medium' | 'light' | 'any'

// ===== Agent Profile =====

/** Agent 配置文件 */
export interface AgentProfile {
  /** Agent 角色标识 */
  role: AgentRole
  /** 显示名称(中文) */
  displayName: string
  /** 一句话描述 */
  description: string
  /** 角色 emoji */
  emoji: string
  /** 推荐模型档位 */
  modelTier: AgentModelTier
  /** 允许调用的工具名称白名单(空 = 全部可用) */
  toolWhitelist: string[]
  /** 系统提示词内容(Markdown) */
  systemPrompt: string
  /** 触发关键词(用于自动路由) */
  triggerKeywords: string[]
  /** 关联的推荐 Skill */
  recommendedSkills: string[]
}

// ===== Agent 路由结果 =====

/** 意图路由结果 */
export interface AgentRouteResult {
  /** 匹配到的 Agent(可能为 general) */
  agent: AgentProfile
  /** 匹配到的 Skill(可选) */
  skill?: string
  /** 匹配置信度 0-1 */
  confidence: number
  /** 匹配原因 */
  reason: string
}

// ===== Agent 调度上下文 =====

/** 传递给子 Agent 的上下文 */
export interface AgentSpawnContext {
  /** 项目路径 */
  projectPath?: string
  /** 项目名称 */
  projectName?: string
  /** 当前章节号 */
  currentChapter?: number
  /** 用户原始输入 */
  userInput: string
  /** 附加上下文文件路径 */
  contextFiles?: string[]
}

// ===== Agent 角色中文别名路由表 =====

/** 中文触发词 -> Agent 角色映射(用于自然语言路由) */
export const AGENT_ALIAS_MAP: Record<string, AgentRole> = {
  // 架构相关
  '架构师': 'story-architect',
  '搭架构': 'story-architect',
  '设计故事': 'story-architect',
  '写大纲': 'story-architect',
  '大纲': 'outliner',
  '细纲': 'outliner',
  '搭大纲': 'outliner',

  // 角色相关
  '角色设计师': 'character-designer',
  '设计角色': 'character-designer',
  '人物设定': 'character-designer',
  '角色卡': 'character-designer',

  // 写作相关
  '叙事写手': 'narrative-writer',
  '写正文': 'narrative-writer',
  '续写': 'narrative-writer',
  '日更': 'narrative-writer',
  '写稿': 'narrative-writer',
  '生成章节': 'narrative-writer',

  // 审查相关
  '一致性检查': 'consistency-checker',
  '检查矛盾': 'consistency-checker',
  '审稿': 'editor',
  '审查': 'critic',
  '批判': 'critic',
  '找问题': 'critic',

  // 探索相关
  '查角色': 'story-explorer',
  '查设定': 'story-explorer',
  '查伏笔': 'story-explorer',
  '角色状态': 'story-explorer',

  // 模拟相关
  '读者视角': 'reader-sim',
  '模拟读者': 'reader-sim',
  '角色对话': 'character-sim',
  '和角色聊': 'character-sim',

  // 创意相关
  '脑暴': 'brainstormer',
  '头脑风暴': 'brainstormer',
  '想创意': 'brainstormer',

  // 风格相关
  '风格创建': 'style-creator',
  '分析文风': 'style-creator',
  '风格分析': 'style-creator',

  // 记录相关
  '更新知识库': 'chronicler',
  '提取事实': 'chronicler',
}

/**
 * 根据中文触发词查找 Agent 角色
 */
export function lookupAgentByAlias(text: string): AgentRole | null {
  for (const [alias, role] of Object.entries(AGENT_ALIAS_MAP)) {
    if (text.includes(alias)) return role
  }
  return null
}