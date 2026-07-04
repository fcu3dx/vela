/**
 * SkillsPanel — 技能树侧边栏面板
 *
 * 按分类展示 28 个内置 Skill，每个 Skill 显式名称、描述、
 * 触发命令（/skill-name），支持点击复制命令到剪贴板或
 * 通过 AgentStore 写入 AI 面板输入框。
 * v0.2.0 新增。
 */

import { useEffect, useState } from 'react'
import { skillRegistry, type LoadedSkill } from '../../../services/agent/skill-registry'

/** Skill 分类 */
interface SkillCategory {
  key: string
  label: string
  emoji: string
}

const CATEGORIES: SkillCategory[] = [
  { key: 'core',     label: 'P0 核心',    emoji: '⭐' },
  { key: 'advanced', label: 'P1 进阶',    emoji: '🔧' },
  { key: 'classic',  label: '经典工具',   emoji: '📦' },
  { key: 'utility',  label: '基础工具',   emoji: '🛠️' },
]

/** 将 Skill 名映射到分类 */
function classifySkill(skill: LoadedSkill): string {
  const name = skill.metadata.name
  // P0 核心 11
  const core = [
    'novel-outline', 'novel-draft', 'novel-analyze', 'deai-filter',
    'multi-review', 'character-sim', 'reader-sim', 'style-creator',
    'writing-modes', 'writing-principles', 'story-memory',
  ]
  // P1 进阶 7
  const advanced = [
    'market-scan', 'novel-import', 'cover-gen', 'llm-discipline',
    'short-write', 'short-analyze', 'research-assist',
  ]
  // 经典 5
  const classic = [
    'review-chapter', 'brainstorm', 'character-analysis',
    'continuity-check', 'writing-coach',
  ]

  if (core.includes(name)) return 'core'
  if (advanced.includes(name)) return 'advanced'
  if (classic.includes(name)) return 'classic'
  return 'utility'
}

export default function SkillsPanel() {
  const [skills, setSkills] = useState<LoadedSkill[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['core', 'advanced'])
  )
  const [copiedName, setCopiedName] = useState<string | null>(null)

  useEffect(() => {
    // 确保 Skill Registry 已加载
    if (skillRegistry.size === 0) {
      skillRegistry.loadAll().then(() => {
        setSkills(skillRegistry.listAll())
      })
    } else {
      setSkills(skillRegistry.listAll())
    }
  }, [])

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const grouped = new Map<string, LoadedSkill[]>()
  for (const skill of skills) {
    const cat = classifySkill(skill)
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(skill)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2">
        <div className="text-xs font-medium mb-2" style={{ color: 'var(--color-text)' }}>
          {skills.length} 个可用技能
        </div>
        <p className="text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>
          点击技能可复制命令到 AI 面板
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        {CATEGORIES.map(cat => {
          const catSkills = grouped.get(cat.key) || []
          if (catSkills.length === 0) return null
          const expanded = expandedCategories.has(cat.key)

          return (
            <div key={cat.key} className="mb-1">
              <button
                onClick={() => toggleCategory(cat.key)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors"
                style={{
                  color: 'var(--color-text)',
                  backgroundColor: expanded ? 'var(--color-hover)' : 'transparent',
                }}
              >
                <span>{expanded ? '▾' : '▸'}</span>
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                <span
                  className="ml-auto text-[0.65rem]"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {catSkills.length}
                </span>
              </button>

              {expanded && (
                <div className="ml-2 mr-1">
                  {catSkills.map(skill => (
                    <button
                      key={skill.metadata.name}
                      onClick={() => {
                        const cmd = `/${skill.metadata.name} `
                        navigator.clipboard.writeText(cmd).catch(() => {})
                        setCopiedName(skill.metadata.name)
                        setTimeout(() => setCopiedName(null), 1500)
                      }}
                      className="w-full text-left px-2 py-1 mb-0.5 rounded-md transition-colors"
                      style={{ backgroundColor: 'transparent' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'var(--color-hover)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                        {skill.metadata.displayName ?? skill.metadata.name}
                        {copiedName === skill.metadata.name && (
                          <span className="text-[0.6rem] ml-1" style={{ color: '#22c55e' }}>
                            ✓ 已复制
                          </span>
                        )}
                        </span>
                        <span
                          className="text-[0.6rem] font-mono"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          /{skill.metadata.name}
                        </span>
                      </div>
                      {skill.metadata.description && (
                        <div
                          className="text-[0.6rem] mt-0.5 line-clamp-2"
                          style={{ color: 'var(--color-text-muted)' }}
                        >
                          {skill.metadata.description}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div
        className="text-[0.6rem] px-2 py-1"
        style={{ color: 'var(--color-text-muted)', borderTop: '1px solid var(--color-border)' }}
      >
        共 {skills.length} 个内置技能 · v0.2.0
      </div>
    </div>
  )
}