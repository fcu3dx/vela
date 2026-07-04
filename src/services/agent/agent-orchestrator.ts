/**
 * Agent 调度器
 *
 * 负责: 
 * 1. 意图路由: 根据用户输入匹配 Agent + Skill
 * 2. Agent 激活: 切换当前会话的 Agent 角色
 * 3. 子 Agent 调度: 在独立上下文中运行子 Agent
 * 4. 结果合并: 多 Agent 输出汇总
 *
 * 与 agent-engine.ts 的关系: 
 * - agent-engine.ts 负责单 Agent 的 ReAct 循环（不变）
 * - agent-orchestrator.ts 负责多 Agent 的调度（新增层）
 */

import { agentRegistry } from './agent-registry'
import { skillRegistry, type LoadedSkill } from './skill-registry'
import { lookupAgentByAlias, type AgentRole, type AgentRouteResult } from '../../shared/agent-types'
import type { AgentProfile } from '../../shared/agent-types'

// ===== 意图路由 =====

/**
 * 根据用户输入路由到最合适的 Agent + Skill
 *
 * 路由优先级: 
 * 1. 显式 Skill 调用（以 / 开头）-> Skill 关联的 Agent
 * 2. 自然语言 Agent 触发词 -> 匹配的 Agent
 * 3. 自然语言 Skill 触发（whenToUse 匹配）-> Skill 关联的 Agent
 * 4. 默认 fallback -> general Agent
 */
export function routeIntent(input: string): AgentRouteResult {
  const trimmed = input.trim()

  // 优先级 1: 检查 / 命令（Skill 显式调用）
  if (trimmed.startsWith('/')) {
    const cmdName = trimmed.slice(1).split(' ')[0]
    const skill = skillRegistry.get(cmdName)
    if (skill) {
      // Skill 中的内容可能指向特定 Agent
      const agent = inferAgentFromSkill(skill) ?? agentRegistry.get('general')!
      return {
        agent,
        skill: skill.metadata.name,
        confidence: 0.95,
        reason: `Skill 显式调用: /${cmdName}`,
      }
    }
  }

  // 优先级 2: 自然语言 Agent 触发词
  const aliasRole = lookupAgentByAlias(trimmed)
  if (aliasRole) {
    const agent = agentRegistry.get(aliasRole)
    if (agent) {
      // 同时检查是否有匹配的 Skill
      const matchedSkill = matchSkillByIntent(trimmed)
      return {
        agent,
        skill: matchedSkill?.metadata.name,
        confidence: 0.8,
        reason: `触发词匹配到 Agent: ${agent.displayName}`,
      }
    }
  }

  // 优先级 3: Skill whenToUse 匹配
  const matchedSkill = matchSkillByIntent(trimmed)
  if (matchedSkill) {
    const agent = inferAgentFromSkill(matchedSkill) ?? agentRegistry.get('general')!
    return {
      agent,
      skill: matchedSkill.metadata.name,
      confidence: 0.7,
      reason: `意图匹配到 Skill: ${matchedSkill.metadata.displayName ?? matchedSkill.metadata.name}`,
    }
  }

  // 优先级 4: 默认 fallback
  return {
    agent: agentRegistry.get('general')!,
    confidence: 0.5,
    reason: '未匹配到特定 Agent/Skill，使用通用助手',
  }
}

/**
 * 从 Skill 内容推断推荐 Agent
 */
function inferAgentFromSkill(skill: LoadedSkill): AgentProfile | null {
  const content = skill.content.toLowerCase()

  const keywordMap: Array<{ keywords: string[]; role: AgentRole }> = [
    { keywords: ['大纲', '提纲', '结构', '卷', '细纲', '框架'], role: 'story-architect' },
    { keywords: ['写', '正文', '续写', '日更', '写稿', '章节'], role: 'narrative-writer' },
    { keywords: ['角色', '人物', '性格', '人设'], role: 'character-designer' },
    { keywords: ['审查', '检查', '审稿', '矛盾', '一致'], role: 'consistency-checker' },
    { keywords: ['去ai', '去 ai', 'ai味', 'deslop'], role: 'narrative-writer' },
    { keywords: ['读者', '阅读体验', '模拟'], role: 'reader-sim' },
    { keywords: ['对话', '角色扮演'], role: 'character-sim' },
    { keywords: ['脑暴', '创意', '头脑风暴'], role: 'brainstormer' },
    { keywords: ['风格', '文风', 'style'], role: 'style-creator' },
  ]

  for (const { keywords, role } of keywordMap) {
    for (const kw of keywords) {
      if (content.includes(kw)) {
        return agentRegistry.get(role) ?? null
      }
    }
  }

  return null
}

/**
 * 根据用户意图匹配 Skill（通过 Skill 的 whenToUse 字段）
 */
function matchSkillByIntent(input: string): LoadedSkill | null {
  const lower = input.toLowerCase()
  let bestMatch: LoadedSkill | null = null
  let bestScore = 0

  for (const skill of skillRegistry.listAll()) {
    if (!skill.metadata.whenToUse) continue
    const whenToUse = skill.metadata.whenToUse.toLowerCase()

    // 简单关键词匹配打分
    const keywords = whenToUse.split(/[,，、\s]+/).filter(Boolean)
    let score = 0
    for (const kw of keywords) {
      if (lower.includes(kw)) score++
    }
    // 名称匹配加分
    if (lower.includes(skill.metadata.name.toLowerCase())) score += 3
    if (skill.metadata.displayName && lower.includes(skill.metadata.displayName)) score += 3

    if (score > bestScore) {
      bestScore = score
      bestMatch = skill
    }
  }

  // 阈值: 至少匹配 1 个关键词
  return bestScore >= 1 ? bestMatch : null
}

// ===== Agent 上下文构建 =====

/**
 * 为指定 Agent 构建增强的系统提示词
 *
 * 结构: 
 * - Agent 角色系统提示词（核心）
 * - 推荐 Skill 列表（Agent 知道自己可以调用哪些 Skill）
 * - 工具系统提示词（由 context-builder.ts 追加）
 */
export function buildAgentSystemPrompt(agent: AgentProfile): string {
  const sections: string[] = []

  // 1. Agent 核心角色
  sections.push(agent.systemPrompt)

  // 2. 推荐 Skill 列表
  if (agent.recommendedSkills.length > 0) {
    const skillRefs: string[] = []
    for (const skillName of agent.recommendedSkills) {
      const skill = skillRegistry.get(skillName)
      if (skill) {
        skillRefs.push(`- \`/${skillName}\` — ${skill.metadata.description}`)
      }
    }
    if (skillRefs.length > 0) {
      sections.push(`\n## 推荐使用的技能\n你可以通过 / 命令调用以下专业技能来获取更详细的工作指导: \n${skillRefs.join('\n')}`)
    }
  }

  // 3. 工具约束（如果有白名单）
  if (agent.toolWhitelist.length > 0) {
    sections.push(`\n## 可用工具限制\n你只能使用以下工具: ${agent.toolWhitelist.join(', ')}`)
  }

  return sections.join('\n')
}