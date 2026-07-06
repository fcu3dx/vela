# Vela v0.2.3 技术需求文档 (TRD)

## 版本信息

| 项 | 值 |
|----|-----|
| 版本号 | v0.2.3 |
| 父版本 | v0.2.2 |
| 文档更新日期 | 2026-07-06 |
| 分支 | dev |

## 1. PRD v0.2.0 完成度矩阵

### 1.1 Agent 体系 (13/13 ✅)

PRD 要求 13 个 Agent，**100% 已注册** (`agent-registry.ts:13`):

```
story-architect      ✅  故事架构师      强推理 tier
character-designer   ✅  角色设计师      中等 tier
narrative-writer     ✅  叙事写手        中等 tier
consistency-checker  ✅  一致性检查器    轻量 tier
story-explorer       ✅  故事探索者      轻量 tier
critic               ✅  审稿编辑        强推理 tier
editor               ✅  编辑            中等 tier
reader-sim           ✅  读者模拟器      中等 tier
character-sim        ✅  角色模拟器      中等 tier
brainstormer         ✅  脑暴者          任意 tier
outliner             ✅  大纲师          中等 tier
style-creator        ✅  风格创建师      中等 tier
chronicler           ✅  编年史官        轻量 tier
```

**PRD 2.1.3 Agent 选择器**: ✅ 已实现 — AgentConversation.tsx 下拉 + ChapterCreationDialog + DraftEditor 全局选择

### 1.2 全流程 Agent 选择器 (v0.2.3 新增)

**PRD 未涵盖的需求** (用户追加 v0.2.3): 所有工作流环节均可选择专业 Agent

| 环节 | 状态 | 实现 |
|------|------|------|
| 写稿 (generate-draft) | ✅ | ChapterCreationDialog 下拉 + 传递 context → callLLMWithBuilder |
| 审稿 (review-chapter) | ✅ | DraftEditor 下拉 + ReviewReport 继承 |
| 审稿后修稿 (refine-from-review) | ✅ | DraftEditor 下拉 + ReviewReport → workflow |
| 自定义修稿 (refine-draft) | ✅ | DraftEditor 下拉传递 |
| 定稿 (finalize-chapter) | ✅ | DraftEditor 下拉传递 |

### 1.3 Skills 生态 (25/28)
| PRD Skill | 状态 | 说明 |
|-----------|------|------|
| project-init | ✅ | 项目初始化 + 目录创建 |
| writing-toolbox | ✅ | 意图路由 + Skill 分发 |
| style-creator | ✅ | 风格分析/创建 |
| novel-outline | ✅ | 选题→大纲搭建 |
| novel-draft | ✅ | 正文生成 + 日更续写 |
| novel-analyze | ✅ | 长篇拆文 |
| short-write | ✅ | 短篇写作 |
| short-analyze | ✅ | 短篇拆文 |
| deai-filter | ✅ | 去 AI 味 7 Gate 检测 |
| multi-review | ✅ | 多视角对抗审稿 |
| character-sim | ✅ | 角色对话模拟 |
| market-scan | ✅ | 市场扫榜 |
| novel-import | ✅ | 逆向解析已有小说 |
| cover-gen | ✅ | AI 封面生成 |
| story-memory | ✅ | 事实提取+追踪 |
| writing-modes | ✅ | 写作模式切换 |
| writing-principles | ✅ | 写作原则 |
| llm-discipline | ✅ | LLM 默认词检测 |
| review-chapter | ✅ | 章节审阅（保留） |
| brainstorm | ✅ | 创意脑暴（保留） |
| character-analysis | ✅ | 角色深度分析（保留） |
| continuity-check | ✅ | 连续性检查（保留+增强） |
| writing-coach | ✅ | 写作教练（保留） |
| research-assist | ✅ | 多源研究+引用 |
| brand-voice | ❌ P2 | 品牌声音分析 |
| headline-gen | ❌ P3 | 标题 A/B 变体 |
| doc-export | ❌ P3 | 文档导出 DOCX/PPTX/PDF |

### 1.4 项目文件结构 (✅)

PRD 要求 7 个目录 — **100% 已实现** (`project-controller.ts` project:create handler):

```
设定/、大纲/、正文/、对标/、拆文库/、追踪/、参考资料/
```

### 1.5 去 AI 味引擎 (✅)

7 Gate 检测 + 三遍修复流程 + `deai-filter` skill 已注册

### 1.6 审稿多维度 (✅)

`review-workflow.ts` 四维审查 (structure/character/writing/setting) + `ReviewPanel.s tsx` 结果展示

### 1.7 番茄小说平台审核避规 (v0.2.3 新增)

**全流程注入** — 写稿/审稿/修稿/审稿修稿 全部 4 个环节嵌入番茄规则：

| 环节 | 注入方式 | 命令 |
|------|---------|------|
| 写稿 | tomatoGuard → mergedGuidance → {{global_guidance}} | generate-draft.command.ts |
| 审稿 | tomatoRules → reviewFocus → {{review_focus}} | review-chapter.command.ts |
| 修稿 | tomatoGuard 追加到 globalGuidance | refine-draft.command.ts |
| 审稿后修稿 | tomatoGuard 追加到 globalGuidance | refine-from-review.command.ts |

### 1.8 定稿输出 (v0.2.3 新增)

**三版本同时输出** (`finalize-chapter.command.ts`):

| 版本 | 文件名 | 内容 |
|------|--------|------|
| 标准版 | `第N章 标题.txt` | 完整章节 |
| 番茄小说版 | `第N章 标题【番茄小说版】.txt` | 去Markdown/段落优化/字数完整 |
| 公众号版 | `第N章 标题_公众号版/上篇.txt` / `中篇.txt` / `下篇.txt` | Emoji引导 + "未完待续"/"点个在看"互动尾 |

## 2. 技术架构增强 (v0.2.1-v0.2.3)

### 2.1 输出质量防线 (base-command.ts)

| 功能 | PRD 未涵盖 | 状态 |
|------|-----------|------|
| 空值/短内容 3 次重试 | ❌ | ✅ |
| minLen 参数化 (各命令独立阈值) | ❌ | ✅ |
| 中文正文跑题检测 (3 重过滤) | ❌ | ✅ |
| Thinking 分环节控制 | ❌ | ✅ |

**质量护栏表**:

| 护栏 | 条件 | 行为 |
|------|------|------|
| 长度不足 | `cleaned.length < minLen` | 自动 3 次重试 |
| 跑题: 非中文 | 中文占比 < 30% + 总字 > 60 | 自动 3 次重试, 日志标注 |
| 跑题: 代码块 | ` ``` 代码块` 占 50%+ | 自动 3 次重试 |
| 跑题: JSON | JSON 行占 40%+ + 总字 < 600 | 自动 3 次重试 |

### 2.2 Thinking 分环节原则 (v0.2.3)

| 环节 | thinking | 原因 |
|------|----------|------|
| 架构生成/写稿 | true | 需要 deep reasoning 构建结构 |
| 审稿 (JSON) | true | 多维度扫描需推理 |
| 修稿 | false | 精确修改任务, 开启会污染正文 |
| 定稿 | false | 整理输出, 不需推理 |

### 2.3 持久化黑洞修复 (v0.2.2)

| 问题 | 修复 |
|------|------|
| writeArchToDb 不更新 Zustand | 写入 DB 时同步 `updateNovelConfig` |
| project:save 未携带 AI 生成字段 | handler 传递 premise/synopsis/worldbuilding/charactersArch |
| 角色卡保存失败不告警 | `db:character-save-all` 返回值检测 + 错误抛出 |

### 2.4 AI 填充覆盖保护 (v0.2.2)

三层防护链: Prompt 告知 → 参数注入 → onGenerated 回调

## 3. UI 布局完成度 vs PRD

| PRD UI 项 | 状态 | 说明 |
|-----------|------|------|
| 活动栏图标 (8 个) | ✅ | 文件/搜索/设置/架构/工作流/审阅/对标/角色 |
| AI 面板 Agent 选择器 | ✅ | AgentConversation 下拉 |
| 输入框 Skill 快捷调用 `/` | ⚠️ | 部分支持 |
| 底部面板「追踪」tab | ❌ P1 | 当前仅 任务/日志/模型 |
| 底部面板「对标」tab | ❌ P1 | 未实现 |
| Skill 详情面板 | ❌ P2 | 未实现 |
| 右键菜单「去 AI 味」 | ❌ P1 | 编辑器 context menu 未集成 |
| Diff 视图 (原文 vs 去AI后) | ✅ | Monaco DiffViewer 已有 |

## 4. 非功能需求达标

| PRD 条目 | 状态 |
|----------|------|
| v0.1.0 项目向前兼容 | ✅ |
| 离线可用 (Skill/Agent 本地存储) | ✅ |
| 用户可见文本全中文 | ✅ P0 ⚠️ 工作流日志仍部分英文 |
| 不破坏 SQLite schema | ✅ |

## 5. 剩余缺口 (P1/P2/P3)

| # | 缺口 | 优先级 | 估算 |
|---|------|--------|------|
| 5 | brand-voice skill (品牌声音分析) | P2 | 1-2h |
| 6 | headline-gen skill (标题 A/B 变体) | P3 | 1h |
| 7 | doc-export skill (文档导出) | P3 | 2-3h |
| 8 | 底部面板追踪/对标 tabs | P1 | 3-4h |
| 9 | 右键菜单「去 AI 味」 | P1 | 2h |
| 10 | 工作流日志全面中文化 | P2 | 1h |

## 6. v0.2.3 热修复链 (已完成)

| Commit | 问题 | 根因 | 修复 |
|--------|------|------|------|
| `4a74005` | Electron 白屏 | `agentRegistry.getAll()` 方法不存在 | `getAll()` → `listAll()` + init() |
| `b61bc35` | 审稿 context 崩溃 | `execute({callbacks})` 未解构 | 解构 `context` |
| `7265157` | 审稿修稿 context 崩溃 | 同款 bug | 同款修复 |
| `3b7eeab` | 思考过程污染正文 (137处) | thinking:true + prompt弱 | thinking:false + prompt加强 |
| `d61c9f7` | 审稿修复 4 次重试失败 | prompt "改得越少越好" | +"必须输出完整全文" |
| `ae893fa` | 审稿修复仍过短 | 阈值 200 字 vs 小改动 | minLen:50 参数化 |
| `c40b207` | 输出 Elasticsearch JSON | 跑题检测缺失 | 3 重中文正文检测 |

## 更新记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-07-06 | v1.0 | 初始创建, 基于 PRD v0.2.0 完成度分析 + v0.2.3 新增功能记录 |