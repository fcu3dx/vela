/**
 * AgentSelector -- Agent 角色选择下拉组件
 *
 * 挂在 AI 面板顶部 AgentHeader 中, 允许用户切换当前的 Agent 角色。
 * 模式: compact(仅显示 emoji+名称的下拉按钮)
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useAgentStore } from '../../../stores/agent-store'
import { agentRegistry } from '../../../services/agent/agent-registry'
import { useOutsideClick } from '../../../hooks/useOutsideClick'

export default function AgentSelector() {
  const activeAgentId = useAgentStore(s => s.activeAgentId)
  const setActiveAgent = useAgentStore(s => s.setActiveAgent)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useOutsideClick(ref, () => setOpen(false), open)

  // 确保 registry 已初始化
  useEffect(() => {
    if (agentRegistry.size === 0) agentRegistry.init()
  }, [])

  const activeAgent = agentRegistry.get(activeAgentId)
  const allAgents = agentRegistry.listAll()

  return (
    <div className="relative" ref={ref}>
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors"
        style={{
          backgroundColor: open ? 'var(--color-hover)' : 'transparent',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      >
        <span>{activeAgent?.emoji ?? '🤖'}</span>
        <span className="max-w-[60px] truncate font-medium">
          {activeAgent?.displayName ?? '通用助手'}
        </span>
        <ChevronDown
          size={10}
          style={{
            color: 'var(--color-text-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {/* 下拉菜单 */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 py-1 rounded-lg shadow-lg"
          style={{
            width: 220,
            maxHeight: 320,
            overflowY: 'auto',
            backgroundColor: 'var(--color-sidebar)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div
            className="text-[0.65rem] px-3 py-1 font-medium"
            style={{ color: 'var(--color-text-muted)' }}
          >
            选择 Agent 角色
          </div>
          <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '2px 0' }} />

          {allAgents.map(agent => {
            const isActive = agent.role === activeAgentId
            const tierColor =
              agent.modelTier === 'strong' ? '#ef4444'
              : agent.modelTier === 'medium' ? '#f59e0b'
              : agent.modelTier === 'light' ? '#22c55e'
              : 'var(--color-text-muted)'

            return (
              <button
                key={agent.role}
                onClick={() => {
                  setActiveAgent(agent.role)
                  setOpen(false)
                }}
                className="w-full flex items-start gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                style={{
                  backgroundColor: isActive ? 'var(--color-active)' : 'transparent',
                  color: 'var(--color-text)',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'var(--color-hover)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <span className="flex-shrink-0 mt-0.5">{agent.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{agent.displayName}</span>
                  </div>
                  <div
                    className="text-[0.65rem] leading-tight mt-0.5 line-clamp-2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {agent.description}
                  </div>
                </div>
                {/* 模型档位指示 */}
                <span
                  className="flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1"
                  style={{ backgroundColor: tierColor }}
                  title={`推荐模型档位: ${agent.modelTier}`}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}