# Vela iOS (iPad) 移植可行性评估

## 版本信息

| 项 | 值 |
|----|-----|
| 评估日期 | 2026-07-13 |
| 源码版本 | v0.3.0 (dev branch) |
| 源码规模 | 201 文件 / ~40,500 行 (80 .ts + 89 .tsx + 32 electron/*.ts) |
| 目标平台 | iPad (第 6 代), iPadOS 17+ |
| 目标技术栈 | Swift 5.10+ / SwiftUI / SQLite.swift (GRDB) |

## 1. 总体结论

**技术上可行，但工作量极大。** 需要将整个 Electron + React + TypeScript 项目逐模块手工重写为 Swift/SwiftUI，预计 **1 人全职约 7 个月**（约 6.9 人月）。

核心挑战不是代码量（40k TS → ~30k Swift），而是以下**三个不可直接移植的关键组件**需重新设计。

## 2. 模块移植矩阵

### 2.1 可直接移植或等价替换（低难度）

| 模块 | 原技术 | iOS 替代方案 | 代码等价度 |
|------|--------|-------------|:--:|
| **LLM Provider** | OpenAI/Gemini REST API | URLSession + Codable | ~95% |
| **28 Skill 提示词** | TypeScript 模板字符串 | .json 资源文件, 逻辑不变 | ~100% |
| **Prompt Builder** | 模板变量替换 | Swift String 插值 | ~90% |
| **文件系统 CRUD** | Node.js fs | FileManager + Sandbox | ~85% |
| **项目文件结构** | fs.mkdirSync 体系 | FileManager.createDirectory | ~90% |

### 2.2 需重写但逻辑可保留（中难度）

| 模块 | 原技术 | iOS 替代方案 | 代码等价度 |
|------|--------|-------------|:--:|
| **SQLite 数据层** | better-sqlite3 (同步) | SQLite.swift / GRDB (async, 7 Repository) | ~70% |
| **状态管理 (8 stores)** | Zustand | `@Observable` class + `@Environment` | ~60% |
| **13 Agent 引擎** | ReAct 循环 + ToolRegistry | Swift Actor + Tool protocol | ~65% |
| **工作流引擎** | WorkflowStore + executor | Swift async/await pipeline | ~60% |
| **门禁系统** | gate-system.ts | Swift protocol Gate | ~70% |
| **IPC/EventBus** | Electron ipcMain/ipcRenderer | Swift Combine Publisher | ~50% |
| **Agent 工具系统** | 10 个 Tool class | Swift Tool protocol 重写 | ~50% |
| **MCP 协议集成** | stdio/HTTP MCP client | URLSession MCP (仅 HTTP; iOS 不可 spawn) | ~60% |
| **后处理 Pipeline** | PostProcessRepository + pipeline | Swift async sequence | ~50% |

### 2.3 不可直接移植（极高难度/需替换）

| 模块 | 原技术 | 问题 | iOS 替代方案 |
|------|--------|------|-------------|
| **LanceDB 向量存储** | @lancedb/lancedb (Node 原生) | 无 iOS 版; Rust 内核不可交叉编译 | 方案 A: Apple NaturalLanguage + CreateML 生成文本嵌入存 SQLite BLOB<br>方案 B: 砍掉向量检索, 仅保留 SQLite FTS 全文搜索 |
| **CodeMirror 6 编辑器** | @codemirror/* 多个包 | Web 编辑器框架, 无 SwiftUI 等价物 | 原生 TextEditor + 自建 Markdown 语法高亮 + 工具栏 |
| **Electron 桌面框架** | 窗口管理/菜单/托盘 | iOS 无桌面概念 | SwiftUI NavigationSplitView (iPad 三栏布局) |
| **diff-match-patch** | JS 库 | Swift 生态无等价物 | 自写 Myer's diff 算法或集成 swift-diff 等第三方库 |

## 3. 功能裁剪清单

必须降级或移除的功能：

| 功能 | 原因 | 降级方案 |
|------|------|---------|
| 向量语义检索 (LanceDB) | 无 iOS 移植 | 改为 SQLite FTS5 全文搜索，精度下降但可用 |
| CodeMirror Markdown 实时预览 | 无 SwiftUI 等价物 | 原生 TextEditor + 分屏 Markdown 渲染视图 |
| MCP stdio 子进程 | iOS Sandbox 禁止 spawn | 仅支持 HTTP MCP 服务器 |
| Electron 自动更新 | 桌面专属 | App Store 分发 |
| 原生文件对话框 | 桌面专属 | iOS documentPicker / FileManager |

## 4. 工作量估计

| 阶段 | 任务 | 预估人月 |
|------|------|:--:|
| 1. Swift 架构设计 | 分层架构 + 数据模型 + SwiftUI 导航设计 | 0.5 |
| 2. SQLite 数据层 | 7 个 Repository → GRDB 迁移 + 数据库 schema 复刻 | 0.5 |
| 3. LLM Provider 层 | OpenAI/Gemini HTTP 调用 + Stream + 重试/fallback | 0.3 |
| 4. 工作流引擎 | Workflow/PostProcess/Command/Gate 系统重写 | 1.0 |
| 5. Agent 引擎 | ReAct 循环 + 13 Agent + 10 Tool + ToolRegistry | 1.5 |
| 6. UI 组件层 | 89 React 组件 → SwiftUI 手工重写 | 2.0 |
| 7. Markdown 编辑器 | 编辑区 + Diff 合并视图 + 工具栏 | 0.5 |
| 8. Skill 系统 | 28 Skill 提示词迁移 + SkillsPanel | 0.3 |
| 9. 文件系统 | Sandbox 文件管理 + iCloud Drive 同步 | 0.3 |
| **合计** | | **~6.9 人月** |

### 人员配置建议

| 配置 | 周期 | 风险 |
|------|------|------|
| 1 人全职 | ~7 个月 | 单一故障点 |
| 2 人 (1 SwiftUI + 1 引擎/数据层) | ~3.5 个月 | 并行效率高 |
| 1 人兼职 (20h/周) | ~14 个月 | 不建议，上下文丢失 |

## 5. 技术风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|:--:|------|---------|
| 向量检索性能不足 | 高 | 知识库搜索精度大幅下降 | 先用 FTS5 MVP，后续调研 CoreML 文本嵌入 |
| CodeMirror 体验无法复刻 | 高 | 编辑器功能缩水，用户抱怨 | MVP 用 TextEditor，迭代加语法高亮 |
| ReAct Agent 循环 Swift 实现 bug 多 | 中 | Agent 行为异常，自循环 | 充分单元测试 + 移植 v0.3.0 已有的 guard 逻辑 |
| iPad (第6代) 性能瓶颈 | 中 | A10 Fusion 芯片运行 LLM 流式处理可能卡顿 | 流式处理优化 + 后台队列 |
| App Store 审核 | 低 | AI 生成内容政策 | 遵守内容安全规则（已有番茄规则经验） |

## 6. 建议实施路线

### Phase 1: MVP (2 人月)

- SQLite 数据层 (项目/蓝图/草稿/角色 4 核心表)
- LLM Provider (OpenAI 流式)
- 基础 UI 框架 (NavigationSplitView + 项目列表 + 章节编辑)
- 手动写稿+保存+定稿 (不含 Agent/Workflow)

→ 可在 iPad 上打开项目、编辑章节、调用 AI 写稿

### Phase 2: 写作流水线 (2 人月)

- 工作流引擎 (写稿→修稿→审稿→定稿)
- 门禁系统
- 后处理 Pipeline
- Diff/Merge 视图
- 28 Skill 迁移

→ 完整章节创作流程可用

### Phase 3: Agent + 知识库 (2 人月)

- Agent 引擎 (ReAct + 13 Agent + 工具)
- 知识库 (SQLite FTS5 全文搜索)
- MCP HTTP 集成
- 去 AI 味引擎

→ 功能对齐 v0.3.0 桌面版

### Phase 4: 打磨 (1 人月)

- UI 细节优化
- iPad 适配 (分屏/Stage Manager/Apple Pencil)
- App Store 提交

→ 可发布版本

## 7. Swift 技术选型建议

| 层次 | 推荐方案 |
|------|---------|
| 最低 SDK | iPadOS 17 (第6代 iPad 最高支持) |
| 架构 | MVVM + Coordinator |
| UI | SwiftUI (NavigationSplitView 三栏) |
| 数据库 | GRDB (sqlite.swift 的 Swift 原生封装, 支持 FTS5) |
| 网络 | URLSession + async/await |
| 状态管理 | `@Observable` (iOS 17+) |
| 依赖注入 | Swift `@Environment` |
| 文本嵌入 (如需) | NaturalLanguage NLContextualEmbedding |
| Markdown 渲染 | SwiftUI Text + AttributedString |
| 测试 | XCTest + Swift Testing |