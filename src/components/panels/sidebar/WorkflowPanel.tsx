/**
 * WorkflowPanel — 工作流侧边栏面板
 *
 * v0.2.2 重写：展示可启动的工作流，一键触发。
 */

import { Play, GitBranch, FileEdit, Eye, Users, Search } from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { createReviewWorkflow } from '../../../services/workflows/review-workflow'
import { createBenchmarkWorkflow } from '../../../services/workflows/benchmark-workflow'

interface WorkflowItem {
  name: string
  desc: string
  icon: typeof Play
  color: string
  action: () => void
}

export default function WorkflowPanel() {
  const startWorkflow = useWorkflowStore(s => s.startWorkflow)
  const activeRuns = useWorkflowStore(s => s.activeRuns)
  const isRunning = activeRuns.length > 0

  const workflows: WorkflowItem[] = [
    {
      name: '大纲搭建',
      desc: '选题 → 核心设定 → 卷级大纲 → 细纲',
      icon: GitBranch,
      color: '#3b82f6',
      action: () => {},
    },
    {
      name: '正文写作',
      desc: '加载细纲 → 日更续写 → 更新追踪',
      icon: FileEdit,
      color: '#22c55e',
      action: () => {},
    },
    {
      name: '多视角审稿',
      desc: '结构/角色/文字/设定四维对抗式审查',
      icon: Eye,
      color: '#f59e0b',
      action: () => {
        startWorkflow(createReviewWorkflow({ dimensions: ['structure', 'character', 'writing', 'setting'] }))
      },
    },
    {
      name: '对标拆文',
      desc: '长篇拆文/市场扫榜/导入分析',
      icon: Search,
      color: '#06b6d4',
      action: () => {
        startWorkflow(createBenchmarkWorkflow({ mode: 'analyze' }))
      },
    },
    {
      name: '角色开发',
      desc: '角色设计 → 对话模拟 → 读者验证',
      icon: Users,
      color: '#a855f7',
      action: () => {},
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          工作流
        </h3>
        <p className="text-[0.65rem] mt-1 mb-3" style={{ color: 'var(--color-text-muted)' }}>
          一键启动完整写作流程
        </p>
        <div className="space-y-1.5">
          {workflows.map((wf, i) => {
            const Icon = wf.icon
            return (
              <button
                key={i}
                onClick={wf.action}
                disabled={isRunning}
                className="w-full text-left p-2 rounded-lg transition-all hover:scale-[1.01] active:scale-[0.98] flex items-start gap-2"
                style={{
                  backgroundColor: isRunning ? 'var(--color-hover)' : 'var(--color-panel)',
                  border: '1px solid var(--color-border)',
                  opacity: isRunning ? 0.5 : 1,
                  cursor: isRunning ? 'not-allowed' : 'pointer',
                }}
              >
                <div
                  className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: `${wf.color}20` }}
                >
                  <Icon size={14} style={{ color: wf.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                      {wf.name}
                    </span>
                    {wf.name === '多视角审稿' && !isRunning && (
                      <Play size={10} style={{ color: wf.color }} />
                    )}
                  </div>
                  <div className="text-[0.6rem] mt-0.5 line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                    {wf.desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      {isRunning && (
        <div
          className="text-[0.6rem] px-3 py-1.5"
          style={{ color: 'var(--color-accent)', borderTop: '1px solid var(--color-border)' }}
        >
          ⏳ 工作流执行中...
        </div>
      )}
      <div className="flex-1" />
    </div>
  )
}