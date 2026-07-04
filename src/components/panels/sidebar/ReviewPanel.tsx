/**
 * ReviewPanel — 审稿侧边栏面板
 *
 * 展示审稿结果：问题列表、严重度分级、修改建议。
 * v0.2.0 新增，后续迭代充实内容。
 */

export default function ReviewPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <h3 className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
          审稿
        </h3>
        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          审稿结果将在此展示。在 AI 面板中使用评论者 Agent 或调用 /multi-review Skill
          提交审稿，结果将按严重度分类显示。
        </p>
      </div>
      <div
        className="mx-3 p-2 rounded-md"
        style={{ backgroundColor: 'var(--color-hover)' }}
      >
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text)' }}>
          严重度分级
        </div>
        <div className="flex flex-col gap-1 text-[0.65rem]" style={{ color: 'var(--color-text-muted)' }}>
          <span>S1 🔴 严重：事实冲突、逻辑矛盾</span>
          <span>S2 🟠 显著：行为不一致、信息缺失</span>
          <span>S3 🟡 注意：细节偏差</span>
          <span>S4 ⚪ 信息：补充建议</span>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  )
}