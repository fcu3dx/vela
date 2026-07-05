/**
 * BenchmarkPanel — 对标侧边栏面板
 *
 * v0.2.2 新增：对标书结构化分析面板，
 * 拆分长篇拆文 / 市场扫榜 / 导入分析三种操作模式。
 */

import { useState } from 'react'
import { Play, Search, BookOpen, Download, Loader2, ChevronsUpDown } from 'lucide-react'
import { useWorkflowStore } from '../../../stores/workflow-store'
import { createBenchmarkWorkflow, BENCHMARK_MODES, BENCHMARK_AGENTS, type BenchmarkMode } from '../../../services/workflows/benchmark-workflow'
import type { AgentRole } from '../../../shared/agent-types'

export default function BenchmarkPanel() {
  const startWorkflow = useWorkflowStore(s => s.startWorkflow)
  const activeRun = useWorkflowStore(s => s.activeRun)
  const isRunning = activeRun !== null

  const [selectedMode, setSelectedMode] = useState<BenchmarkMode>('analyze')
  const [bookTitle, setBookTitle] = useState('')
  const [selectedAgent, setSelectedAgent] = useState<AgentRole | ''>('')

  const handleRun = () => {
    startWorkflow(createBenchmarkWorkflow({
      mode: selectedMode,
      bookTitle: bookTitle || undefined,
      agentRole: selectedAgent || undefined,
    }))
  }

  const modeIcons: Record<BenchmarkMode, React.ComponentType<{size?: number}>> = {
    analyze: Search,
    scan: BookOpen,
    import: Download,
  }
  const ModeIcon = modeIcons[selectedMode]

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          对标与拆文
        </h3>
        <p className="text-[0.65rem] mt-1 mb-3" style={{ color: 'var(--color-text-muted)' }}>
          结构化分析对标书，迁移节奏与套路
        </p>

        {/* 模式选择 */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {BENCHMARK_MODES.map(m => {
            const active = selectedMode === m.key
            return (
              <button
                key={m.key}
                onClick={() => { setSelectedMode(m.key); setBookTitle('') }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[0.65rem] transition-colors"
                style={{
                  backgroundColor: active ? 'var(--color-accent)' : 'var(--color-hover)',
                  color: active ? '#fff' : 'var(--color-text)',
                }}
                title={m.desc}
              >
                <span>{m.emoji}</span>
                <span>{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* 书名输入 */}
        <div className="rounded-lg p-2.5 mb-2" style={{ backgroundColor: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <p className="text-[0.6rem] font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
            {selectedMode === 'analyze' ? '拆文书名' : selectedMode === 'scan' ? '题材/方向' : '小说路径/名称'}
          </p>
          <input
            value={bookTitle}
            onChange={e => setBookTitle(e.target.value)}
            placeholder={selectedMode === 'analyze' ? '输入要拆解的小说名称...' : selectedMode === 'scan' ? '输入想分析的题材方向...' : '输入已有小说路径或名称...'}
            className="w-full px-2 py-1.5 rounded text-[0.65rem] outline-none"
            style={{
              backgroundColor: 'var(--color-input-bg)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        {/* Agent 选择 */}
        <div className="rounded-lg p-2.5 mb-2" style={{ backgroundColor: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-1.5 mb-1">
            <ChevronsUpDown size={11} style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-[0.65rem] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              选择专家
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
            {BENCHMARK_AGENTS.map(a => (
              <option key={a.role} value={a.role}>{a.label} — {a.desc}</option>
            ))}
          </select>
        </div>

        {/* 运行按钮 */}
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{
            backgroundColor: isRunning ? 'var(--color-hover)' : 'var(--color-accent)',
            color: isRunning ? 'var(--color-text-muted)' : '#fff',
          }}
        >
          {isRunning ? <><Loader2 size={14} className="animate-spin" />分析中...</> : <><ModeIcon size={14} />开始{selectedMode === 'analyze' ? '拆文' : selectedMode === 'scan' ? '扫榜' : '导入'}</>}
        </button>
      </div>
    </div>
  )
}