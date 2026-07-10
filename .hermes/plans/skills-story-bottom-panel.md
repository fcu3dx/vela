# Vela Skills 按 Story 布局 + 底部面板 3 标签实现

> **For Hermes:** Execute this plan task-by-task using terminal/patch/write_file tools.
> **验证**: 每步完成后 npx oxlint --quiet, 全部通过再 push。

**Goal:** 1) Skills 面板按写作流程环节分类展示（story 顺序），只在相关环节显示必要 skills；2) 底部面板「模型调用」「追踪」「对标」3 个标签实现实际数据内容。

**Architecture:** Skills 面板重分类为 7 个故事环节（构思→大纲→写稿→审稿→修稿→定稿→分析），取代当前 P0/P1/经典/基础 4 分类。每个环节仅显示与该步骤相关的 skills。底部面板的 ModelsView 实现实时数据加载（已有 stats-service 但需修复时序），TrackingView 需要读取追踪文件内容并展示，BenchmarkView 需要读取对标目录并展示实际拆文结果。

**Tech Stack:** React/TS/oxc/Zustand — 纯前端无新增依赖。

---

## Task 1: Skills 面板按 Story 环节重分类

**Objective:** 将 SkillsPanel 的 CATEGORIES 从 P0/P1/经典/基础 改为 7 个写作环节

**Files:**
- Modify: `src/components/panels/sidebar/SkillsPanel.tsx`

**实现**: CATEGORIES 数组改为按写作流程排序：

```typescript
const CATEGORIES: SkillCategory[] = [
  { key: 'ideation',   label: '💡 构思',    emoji: '💡' },
  { key: 'outline',    label: '📋 大纲',    emoji: '📋' },
  { key: 'draft',      label: '✍️ 写稿',    emoji: '✍️' },
  { key: 'review',     label: '🔍 审稿',    emoji: '🔍' },
  { key: 'refine',     label: '🔧 修稿',    emoji: '🔧' },
  { key: 'finalize',   label: '✅ 定稿',    emoji: '✅' },
  { key: 'analyze',    label: '📊 分析',    emoji: '📊' },
]
```

`classifySkill()` 也按写作环节映射 28 个 skill：

- **构思 (ideation)**: brainstorm, story-memory, writing-principles, writing-modes, project-init, research-assist
- **大纲 (outline)**: novel-outline, character-analysis, llm-discipline, character-sim
- **写稿 (draft)**: novel-draft, short-write, style-creator, reader-sim, writing-toolbox
- **审稿 (review)**: review-chapter, multi-review, continuity-check, short-analyze
- **修稿 (refine)**: deai-filter, writing-coach, novel-import
- **定稿 (finalize)**: cover-gen, novel-analyze
- **分析 (analyze)**: market-scan, novel-import, research-assist

部分 skills 可跨环节展示（如 deai-filter 用作修稿工具）。

**验证**: oxlint 0 errors，Skills 面板按环节展示。

---

## Task 2: 底部面板「模型调用」标签 — 实现实时 LLM 调用统计

**Objective:** ModelsView 从当前的空壳（仅 loadLLMData 但时序错）改为实时统计面板

**Files:**
- Modify: `src/components/panels/BottomPanel.tsx`

**当前问题**: `useEffect(() => { loadData() }, [])` 只在 mount 时加载一次。但 LLM 调用是持续发生的。需要改为：
1. 定时刷新（每 10s 自动更新）
2. 手动刷新按钮
3. 显示最近 20 次调用的时间线

**实现**: 
```typescript
function ModelsView() {
  // 改为 auto-refresh 模式
  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [])
  // ... 保留现有 stats + table 展示
  // 加一个手动刷新按钮在顶部
}
```

**验证**: 运行一次 LLM 调用后切换到「模型调用」标签能看到实时统计。

---

## Task 3: 底部面板「追踪」标签 — 改为动态读取追踪文件内容

**Objective:** ContentTrackingView 从当前静态说明页改为动态读取「追踪/」目录下 4 个文件的实际内容

**Files:**
- Modify: `src/components/panels/BottomPanel.tsx`

**当前问题**: 仅有 4 个静态卡片 + 说明文字，无实际文件内容。

**实现**: 
1. 动态列出 `追踪/` 目录下所有 .md 文件
2. 每个文件可点击展开查看内容摘要（前 5 行）
3. 加刷新按钮

```typescript
function ContentTrackingView() {
  const [files, setFiles] = useState<TrackingFile[]>([])
  const project = useProjectStore(s => s.currentProject)
  
  useEffect(() => {
    if (!project) return
    ipc.invoke('fs:list-files', `${project.path}/追踪`).then(list => {
      setFiles(list.filter(f => f.endsWith('.md')))
    })
  }, [project?.path])
  
  // 每个文件一行，点击展开前 200 字
}
```

需要确认 `fs:list-files` 是否存在，若不存在则用 `fs:readdir`。

**验证**: 打开项目后切换「追踪」标签能看到实际文件列表和内容预览。

---

## Task 4: 底部面板「对标」标签 — 改为动态读取对标/拆文库内容

**Objective:** BenchmarkView 从当前静态说明页改为动态读取「对标/」和「拆文库/」目录的实际内容

**Files:**
- Modify: `src/components/panels/BottomPanel.tsx`

**实现**: 
1. 读取 `对标/` 目录的子目录列表（每本对标书一个子目录）
2. 读取 `拆文库/` 目录的子目录列表
3. 对每个子目录显示其中有内容的文件数和摘要
4. 空目录显示提示

**验证**: 有对标数据的项目切换「对标」标签能看到实际文件结构。

---

## Task 5: oxlint + tsc 验证 + push

**验证命令**:
```bash
npx oxlint --quiet src/components/panels/sidebar/SkillsPanel.tsx src/components/panels/BottomPanel.tsx
node node_modules/typescript/bin/tsc --noEmit
```

**Push**: `git push origin dev`