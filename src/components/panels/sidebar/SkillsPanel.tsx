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
import { useAgentStore } from '../../../stores/agent-store'

/** Skill 分类 */
interface SkillCategory {
  key: string
  label: string
  emoji: string
}

const CATEGORIES: SkillCategory[] = [
  { key: 'architecture', label: '🏗️ 架构/大纲', emoji: '🏗️' },
  { key: 'writing',      label: '✍️ 写稿',      emoji: '✍️' },
  { key: 'refinement',   label: '🔧 修稿',      emoji: '🔧' },
  { key: 'review',       label: '🔍 审稿',      emoji: '🔍' },
  { key: 'benchmark',    label: '📊 拆文/扫榜', emoji: '📊' },
  { key: 'character',    label: '👤 角色',      emoji: '👤' },
  { key: 'utility',      label: '🛠️ 工具',      emoji: '🛠️' },
]

/** 将 Skill 名映射到分类 */
/** 按功能分类（v0.3.0 重构：功能分类替代优先级分类） */
function classifySkill(skill: LoadedSkill): string {
  const name = skill.metadata.name
  // 🏗️ 架构/大纲
  const architecture = [
    'novel-outline', 'brainstorm', 'story-memory', 'novel-import',
  ]
  // ✍️ 写稿
  const writing = [
    'novel-draft', 'short-write', 'writing-modes', 'writing-principles',
    'writing-coach', 'llm-discipline',
  ]
  // 🔧 修稿
  const refinement = [
    'deai-filter', 'style-creator',
  ]
  // 🔍 审稿
  const review = [
    'review-chapter', 'multi-review', 'continuity-check', 'reader-sim',
  ]
  // 📊 拆文/扫榜
  const benchmark = [
    'novel-analyze', 'short-analyze', 'market-scan',
  ]
  // 👤 角色
  const character = [
    'character-analysis', 'character-sim',
  ]
  // 🛠️ 工具
  const _utility = [
    'cover-gen', 'research-assist', 'project-init', 'writing-toolbox',
  ]

  if (architecture.includes(name)) return 'architecture'
  if (writing.includes(name)) return 'writing'
  if (refinement.includes(name)) return 'refinement'
  if (review.includes(name)) return 'review'
  if (benchmark.includes(name)) return 'benchmark'
  if (character.includes(name)) return 'character'
  if (_utility.includes(name)) return 'utility'
  return 'utility'
}

export default function SkillsPanel() {
  const [skills, setSkills] = useState<LoadedSkill[]>([])
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['architecture', 'writing', 'refinement', 'review'])
  )
  const [activatedSkill, setActivatedSkill] = useState<string | null>(null)

  // v0.2.2: 点击 Skill 注入 AI 面板并发送
  const activateSkill = (skillName: string) => {
    const cmd = `/${skillName} `
    useAgentStore.getState().sendMessage(cmd)
    setActivatedSkill(skillName)
    setTimeout(() => setActivatedSkill(null), 1500)
  }

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
                      onClick={() => activateSkill(skill.metadata.name)}
                      className="w-full text-left px-2 py-1 mb-0.5 rounded-md transition-colors cursor-pointer"
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
                        {activatedSkill === skill.metadata.name && (
                          <span className="text-[0.6rem] ml-1" style={{ color: '#22c55e' }}>
                            ✓ 已激活
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