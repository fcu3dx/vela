/**
 * review-workflow — 多视角审稿工作流
 *
 * v0.2.2 新增：从结构/角色/文字/设定四个维度对抗式审查，
 * 支持选择审稿维度 + 选择审稿专家 Agent。
 */

import type { WorkflowDefinition } from '../../stores/workflow-store'
import { useLLMStore } from '../../stores/llm-store'
import { useProjectStore } from '../../stores/project-store'
import { agentRegistry } from '../agent/agent-registry'
import type { AgentRole } from '../../shared/agent-types'
import { stripThinkingTags } from './workflow-utils'

// ==========================================
// 1. 类型定义
// ==========================================

export type ReviewDimension = 'structure' | 'character' | 'writing' | 'setting'

export const REVIEW_DIMENSIONS: Array<{ key: ReviewDimension; label: string; emoji: string; desc: string }> = [
  { key: 'structure',  label: '结构', emoji: '📊', desc: '核心卖点、冲突推进、情绪曲线、钩子期待、高潮构建' },
  { key: 'character',  label: '角色', emoji: '👤', desc: '行为一致、动机合理、对话个性、关系匹配' },
  { key: 'writing',    label: '文字', emoji: '✏️', desc: '自然度、AI味、标点节奏、段落节奏、字数表达' },
  { key: 'setting',    label: '设定', emoji: '🌍', desc: '规则遵守、时间线一致、角色状态正确' },
]

export const REVIEW_AGENTS: Array<{ role: AgentRole | ''; label: string; desc: string }> = [
  { role: '',                label: '默认（评论者）', desc: '标准审稿视角，全面维度检查' },
  { role: 'critic',         label: '评论者',        desc: '深度批评，聚焦逻辑漏洞与结构缺陷' },
  { role: 'reader-sim',     label: '读者模拟器',     desc: '读者视角，关注体验与情绪感受' },
  { role: 'character-sim',  label: '角色模拟器',     desc: '角色视角，验证行为一致性' },
]

export interface ReviewWorkflowParams {
  /** 待审稿章节标题 */
  chapterTitle?: string
  /** 审稿维度（默认全选） */
  dimensions?: ReviewDimension[]
  /** 审稿专家 Agent */
  agentRole?: AgentRole
  /** 审稿内容（如果传值则跳过读取） */
  content?: string
  /** 回调：审稿结果 */
  onComplete?: (result: string) => void
}

// ==========================================
// 2. 审稿工作流生成器
// ==========================================

export function createReviewWorkflow(params: ReviewWorkflowParams = {}): WorkflowDefinition {
  const dims = params.dimensions ?? ['structure', 'character', 'writing', 'setting']
  const dimLabels = dims.map(d => REVIEW_DIMENSIONS.find(dd => dd.key === d)?.label ?? d)

  return {
    type: 'multi-review',
    title: '📋 多视角审稿',
    steps: [
      {
        name: '审稿执行',
        description: `维度: ${dimLabels.join('、')}`,
        executor: async (_step, context, callbacks) => {
          callbacks.log('🔍 准备审稿内容...')

          // 获取审稿内容
          let content = params.content
          if (!content && params.chapterTitle) {
            // 从项目文件中读取
            const project = useProjectStore.getState().currentProject
            if (project) {
              const result = await useLLMStore.getState().callLLM(
                `读取项目 ${project.name} 的 "${params.chapterTitle}" 的原始文本内容`,
                { systemPrompt: '你是一个助手，直接返回读取到的内容。' }
              )
              content = result
            }
          }
          if (!content) {
            content = '(未提供审稿内容，将基于对话上下文审查)'
          }

          // 构建审稿 prompt
          const dimInstruction = dims.map((d, i) => {
            const dim = REVIEW_DIMENSIONS.find(dd => dd.key === d)
            return `${i + 1}. **${dim?.emoji} ${dim?.label}维度**: ${dim?.desc}`
          }).join('\n')

          const reviewPrompt = `# 多视角审稿

## 核心信念
审查是找问题，不是验证正确性。

## 审查维度
${dimInstruction}

## 严重程度
- S1 🔴 严重：明确冲突、事实错误
- S2 🟠 显著：行为矛盾、关键信息不一致
- S3 🟡 注意：细节偏差、边界模糊
- S4 ⚪ 信息：建议补充

## 输出格式
每项 finding 格式：
[严重度] [维度] 位置：{段落/位置} | 问题描述 | 修改建议

## 待审稿内容
${content}

请按上述格式输出审稿结果。`

          // 获取专家 system prompt
          let systemPrompt = `你是 Vela 的审稿专家「评论者」。你的职责是进行对抗式审查，发现潜在问题，而不是验证正确性。`
          if (params.agentRole) {
            const profile = agentRegistry.get(params.agentRole)
            if (profile) {
              systemPrompt = profile.systemPrompt
              callbacks.log(`🎯 使用专家 Agent: ${profile.displayName} (${params.agentRole})`)
            }
          }

          callbacks.log(`📋 审查维度: ${dimLabels.join('、')}`)
          callbacks.log('⏳ 正在进行多视角审稿...')

          context.data.agentRole = params.agentRole

          const result = await useLLMStore.getState().callLLM(reviewPrompt, {
            systemPrompt,
          })

          const cleanResult = stripThinkingTags(result)
          context.data.reviewResult = cleanResult
          callbacks.log('✅ 审稿完成')

          params.onComplete?.(cleanResult)
        },
      },
    ],
    onComplete: { mode: 'silent', message: '📋 多视角审稿已完成，请前往审稿面板查看结果。' },
  }
}