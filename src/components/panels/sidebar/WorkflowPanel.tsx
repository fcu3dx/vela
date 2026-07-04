/**
 * WorkflowPanel — 工作流侧边栏面板
 *
 * 展示可用的工作流（大纲搭建、正文写作、审稿流程等），
 * 支持一键启动工作流。v0.2.0 新增，后续迭代充实。
 */

export default function WorkflowPanel() {
  const workflows = [
    { name: '大纲搭建', desc: '选题 → 核心设定 → 卷级大纲 → 细纲' },
    { name: '正文写作', desc: '加载细纲 → 日更续写 → 更新追踪' },
    { name: '审稿流程', desc: '评论者审阅 → 去AI味 → 一致性检查' },
    { name: '角色开发', desc: '角色设计 → 对话模拟 → 读者验证' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          工作流
        </h3>
        <p className="text-xs mt-1 mb-3" style={{ color: 'var(--color-text-muted)' }}>
          切换 Agent 角色以启动对应工作流
        </p>
        {workflows.map((wf, i) => (
          <div
            key={i}
            className="mb-2 p-2 rounded-md"
            style={{ backgroundColor: 'var(--color-hover)' }}
          >
            <div className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
              {wf.name}
            </div>
            <div className="text-[0.65rem] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {wf.desc}
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1" />
    </div>
  )
}