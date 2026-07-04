/**
 * ArchitecturePanel — 故事架构侧边栏面板
 *
 * 展示当前项目的架构全貌：前提、世界观、角色图谱、大纲。
 * v0.2.0 新增，后续迭代充实内容。
 */

export default function ArchitecturePanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          故事架构
        </h3>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          项目的故事架构总览将在此展示，包括故事前提、世界观、角色图谱和卷级大纲。
        </p>
      </div>
      <div className="flex-1" />
    </div>
  )
}