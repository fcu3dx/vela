/**
 * ReviewPanel — 审稿侧边栏面板
 *
 * v0.2.2 重写：交互式审稿工作流 UI，
 * 支持选择审稿维度和审稿专家 Agent，结果实时展示。
 */

import { useState } from 'react'
import { Play, CheckCircle2, Loader2, ChevronsUpDown, AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { useEditorStore } from '../../../stores/editor-store'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { createReviewWorkflow, REVIEW_DIMENSIONS, REVIEW_AGENTS, type ReviewDimension } from '../../../services/workflows/review-workflow'
import type { AgentRole } from '../../../shared/agent-types'

export default function ReviewPanel() {
  const activeTab = useEditorStore(s => {
    const tabs = s.tabs
    return tabs.find(t => t.active) ?? tabs[0] ?? null
  })
  const startWorkflow = useWorkflowStore(s => s.startWorkflow)
  const activeRun = useWorkflowStore(s => s.activeRun)
  const activeRunLogs = useWorkflowStore(s => s.activeRunLogs)
  const activeStepIndex = useWorkflowStore(s => s.activeStepIndex)

  // 审稿配置
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

  const isRunning = activeRun !== null

  const handleRunReview = () => {
    if (selectedDims.size === 0) return
    setReviewResult(null)

    const workflow = createReviewWorkflow({
      dimensions: [...selectedDims] as ReviewDimension[],
      agentRole: selectedAgent || undefined,
      content: activeTab?.content ? `[当前编辑文件: ${activeTab.name}]\n\n${activeTab.content}` : undefined,
      onComplete: (result) => {
        setReviewResult(result)
      },
    })

    startWorkflow(workflow)
  }

  // 提取严重度分类
  let s1Count = 0; let s2Count = 0; let s3Count = 0; let s4Count = 0
  if (reviewResult) {
    s1Count = (reviewResult.match(/S1/g) || []).length
    s2Count = (reviewResult.match(/S2/g) || []).length
    s3Count = (reviewResult.match(/S3/g) || []).length
    s4Count = (reviewResult.match(/S4/g) || []).length
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部标题 */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
            多视角审稿
          </h3>
          {activeTab && (
            <span className="text-[0.6rem] px-1.5 py-0.5 rounded"
              style={{ color: 'var(--color-text-muted)', backgroundColor: 'var(--color-hover)' }}>
              {activeTab.name}
            </span>
          )}
        </div>
        <p className="text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>
          从结构/角色/文字/设定四维度对抗式审查
        </p>
      </div>

      {/* 配置区 */}
      <div className="px-3 space-y-2">
        {/* 审稿维度 */}
        <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <p className="text-[0.65rem] font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            审稿维度
          </p>
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_DIMENSIONS.map(dim => {
              const selected = selectedDims.has(dim.key)
              return (
                <button
                  key={dim.key}
                  onClick={() => toggleDim(dim.key)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[0.65rem] transition-colors"
                  style={{
                    backgroundColor: selected ? 'var(--color-accent)' : 'var(--color-hover)',
                    color: selected ? '#fff' : 'var(--color-text)',
                    opacity: selected ? 1 : 0.7,
                  }}
                  title={dim.desc}
                >
                  <span>{dim.emoji}</span>
                  <span>{dim.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Agent 专家选择 */}
        <div className="rounded-lg p-2.5" style={{ backgroundColor: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <ChevronsUpDown size={11} style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-[0.65rem] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              选择审稿专家
            </p>
          </div>
          <select
            value={selectedAgent}
            onChange={e => setSelectedAgent(e.target.value as AgentRole | '')}
            className="w-full px-2 py-1.5 rounded text-[0.65rem] outline-none"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          >
            {REVIEW_AGENTS.map(a => (
              <option key={a.role} value={a.role}>
                {a.label} — {a.desc}
              </option>
            ))}
          </select>
        </div>

        {/* 运行按钮 */}
        <button
          onClick={handleRunReview}
          disabled={isRunning || selectedDims.size === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: isRunning ? 'var(--color-hover)' : 'var(--color-accent)',
            color: isRunning ? 'var(--color-text-muted)' : '#fff',
            opacity: selectedDims.size === 0 ? 0.5 : 1,
          }}
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              审稿中...
            </>
          ) : (
            <>
              <Play size={14} />
              开始审稿
            </>
          )}
        </button>
      </div>

      {/* 工作流状态 */}
      {isRunning && activeRunLogs.length > 0 && (
        <div className="mx-3 mt-2 p-2 rounded-md" style={{ backgroundColor: 'var(--color-hover)' }}>
          <div className="text-[0.6rem] space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {activeRunLogs.slice(-3).map((log, i) => (
              <div key={i} className="truncate">{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* 结果展示 */}
      {reviewResult && (
        <div className="flex-1 overflow-y-auto px-3 mt-2 space-y-2">
          {/* 统计摘要 */}
          <div className="flex gap-1.5">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-medium" style={{ backgroundColor: '#fef2f2', color: '#991b1b' }}>
              <AlertCircle size={10} />S1 {s1Count}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-medium" style={{ backgroundColor: '#fff7ed', color: '#9a3412' }}>
              <AlertTriangle size={10} />S2 {s2Count}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-medium" style={{ backgroundColor: '#fefce8', color: '#854d0e' }}>
              <Info size={10} />S3 {s3Count}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-medium" style={{ backgroundColor: '#f5f5f4', color: '#44403c' }}>
              <CheckCircle2 size={10} />S4 {s4Count}
            </span>
          </div>

          {/* 审稿原文 */}
          <div className="p-2 rounded-md text-[0.65rem] whitespace-pre-wrap"
            style={{ backgroundColor: 'var(--color-hover)', color: 'var(--color-text)', lineHeight: 1.6 }}
          >
            {reviewResult}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!reviewResult && !isRunning && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>
              选择审稿维度和专家，点击「开始审稿」
              <br />将自动分析当前打开的编辑器文件
            </p>
          </div>
        </div>
      )}
    </div>
  )
}