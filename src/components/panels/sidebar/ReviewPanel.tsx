/**
 * ReviewPanel — 审稿侧边栏面板
 *
 * v0.2.2 重写：交互式审稿工作流 UI，
 * 支持选择审稿维度和审稿专家 Agent，结果实时展示。
 */

import { useState } from 'react'
import { Play, CheckCircle2, Loader2 } from 'lucide-react'
import { useEditorStore } from '../../../stores/editor-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { createReviewWorkflow, REVIEW_DIMENSIONS, REVIEW_AGENTS, type ReviewDimension } from '../../../services/workflows/review-workflow'
import type { AgentRole } from '../../../shared/agent-types'

export default function ReviewPanel() {
  const tabs = useEditorStore(s => s.tabs)
  const activeTabId = useEditorStore(s => s.activeTabId)
  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0] ?? null
  const startWorkflow = useWorkflowStore(s => s.startWorkflow)
  const activeRuns = useWorkflowStore(s => s.activeRuns)
  const isRunning = activeRuns.length > 0

  const [selectedDims, setSelectedDims] = useState<Set<ReviewDimension>>(new Set(['structure', 'character', 'writing', 'setting']))
  const [selectedAgent, setSelectedAgent] = useState<AgentRole | ''>('')
  const [reviewResult, setReviewResult] = useState<string | null>(null)

  const toggleDim = (dim: ReviewDimension) => {
    setSelectedDims(prev => {
      const next = new Set(prev)
      if (next.has(dim)) next.delete(dim)
      else next.add(dim)
      return next
    })
  }

  const handleStartReview = async () => {
    if (!activeTab) return
    setReviewResult(null)

    try {
      const workflow = createReviewWorkflow({
        dimensions: Array.from(selectedDims),
        agentRole: selectedAgent || undefined,
        content: activeTab.content || '',
        onComplete: (result) => setReviewResult(result),
      })

      await startWorkflow(workflow)
    } catch (e) {
      console.error('启动审稿失败:', e)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ color: 'var(--color-text-secondary)' }}>
      <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
        <div className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>AI 审稿</div>
        <div className="text-[0.6rem]" style={{ color: 'var(--color-text-muted)' }}>
          对当前打开的草稿进行多维度审稿
        </div>
      </div>

      {activeTab && (
        <div className="px-3 py-1.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="text-[0.6rem]" style={{ color: 'var(--color-text-muted)' }}>
            审稿文件：{activeTab.name}
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="text-[0.6rem] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>审稿维度</div>
        <div className="flex flex-wrap gap-1">
          {REVIEW_DIMENSIONS.map(d => (
            <button
              key={d.key}
              onClick={() => toggleDim(d.key)}
              disabled={isRunning}
              className="px-2 py-0.5 rounded text-[0.65rem] transition-colors border"
              style={{
                backgroundColor: selectedDims.has(d.key) ? 'var(--color-accent)' : 'transparent',
                color: selectedDims.has(d.key) ? '#fff' : 'var(--color-text-secondary)',
                borderColor: selectedDims.has(d.key) ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="text-[0.6rem] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>审稿专家</div>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value as AgentRole | '')}
          disabled={isRunning}
          className="w-full text-[0.65rem] px-2 py-1 rounded border"
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            borderColor: 'var(--color-border)',
          }}
        >
          <option value="">默认（自动选择）</option>
          {REVIEW_AGENTS.map(a => (
            <option key={a.role} value={a.role}>{a.label}</option>
          ))}
        </select>
      </div>

      <div className="px-3 py-2">
        <button
          onClick={handleStartReview}
          disabled={isRunning || !activeTab || selectedDims.size === 0}
          className="w-full py-1.5 rounded text-[0.7rem] font-medium transition-all flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: isRunning ? 'var(--color-border)' : 'var(--color-accent)',
            color: isRunning ? 'var(--color-text-muted)' : '#fff',
            cursor: isRunning || !activeTab ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? (
            <><Loader2 size={12} className="animate-spin" /> 审稿中...</>
          ) : (
            <><Play size={12} /> 开始审稿</>
          )}
        </button>
      </div>

      {reviewResult && (
        <div className="flex-1 overflow-auto px-3 py-2 mx-2 mb-2 rounded-md" style={{ backgroundColor: 'var(--color-hover)' }}>
          <div className="text-[0.6rem] font-medium mb-1" style={{ color: 'var(--color-accent)' }}>
            <CheckCircle2 size={10} className="inline mr-1" />
            审稿结果
          </div>
          <div className="text-[0.6rem] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--color-text-secondary)' }}>
            {reviewResult}
          </div>
        </div>
      )}
    </div>
  )
}