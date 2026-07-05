# Vela 更新日志

## v0.2.2 (2026-07-05)

### 新增 — A: Skill 面板交互化

- **点击即激活** (`src/components/panels/sidebar/SkillsPanel.tsx`)
  - 点击 Skill 直接注入 AI 面板并发送 `/skill-name` 命令（取代旧版仅复制到剪贴板）
  - 激活反馈：「✓ 已激活」绿色提示

### 新增 — B: 多视角审稿工作流

- **审稿工作流定义** (`src/services/workflows/review-workflow.ts`)
  - 四维对抗式审查：结构/角色/文字/设定
  - 支持选择审稿专家 Agent：默认（评论者）/ 评论者 / 读者模拟器 / 角色模拟器
  - 自动读取当前编辑器打开的文件内容
- **ReviewPanel 重写** (`src/components/panels/sidebar/ReviewPanel.tsx`)
  - 维度勾选按钮（默认全选）
  - 专家 Agent 下拉选择
  - 运行按钮 + 工作流状态日志
  - 结果展示：S1-S4 严重度统计 + 审稿原文

### 新增 — C: 对标与拆文工作流

- **拆文工作流定义** (`src/services/workflows/benchmark-workflow.ts`)
  - 三种模式：长篇拆文 / 市场扫榜 / 导入分析
  - 使用 novel-analyze / market-scan / novel-import Skill 提示词
  - 支持专家 Agent：故事架构师 / 评论者 / 脑暴者
- **WorkflowPanel 扩展** (`src/components/panels/sidebar/WorkflowPanel.tsx`)
  - 新增「对标拆文」入口按钮
  - 审稿按钮直连审稿工作流

### 新增 — D: 工作流面板交互化

- **WorkflowPanel 重写** (`src/components/panels/sidebar/WorkflowPanel.tsx`)
  - 4 个工作流卡片：大纲搭建 / 正文写作 / 多视角审稿 / 角色开发
  - 新增「对标拆文」卡片
  - 点击即启动，直接触发对应工作流

---

## v0.2.1 (2026-07-05)

### 新增 — 架构生成可选 Agent 专家

- **架构对话框 Agent 选择器** (`src/components/dialogs/ArchitectureConfirmDialog.tsx`)
  - 下拉菜单选择 5 种生成专家：默认（故事架构师）、故事架构师、大纲师、脑暴者、通用助手
  - 每种专家显示名称 + 一句话描述（如「大纲师 — 擅长结构化推演，严密的情节节奏编排」）
- **工作流 Agent 注入** (`src/services/workflows/architecture-workflow.ts`)
  - `ArchitectureWorkflowParams` 新增 `agentRole?: AgentRole`
  - 所有 4 个步骤（故事前提、角色图谱、世界观、情节大纲）executor 注入 `context.data.agentRole`
- **BaseCommand 动态 System Prompt** (`src/services/workflows/commands/base-command.ts`)
  - `callLLMWithBuilder` 检测 `context.data.agentRole`，存在则从 `agentRegistry` 获取对应 Agent 的 `systemPrompt`
  - 覆盖模板默认的 system role，实现真正专家驱动生成
  - 工作流日志输出 `🎯 使用专家 Agent: 🧠 故事架构师`

### 修复 — 架构工作流加固

- **步骤独立执行** (`src/stores/workflow-store.ts`)
  - `WorkflowDefinition.steps` 新增 `continueOnError?: boolean`
  - 角色图谱、世界观步骤标记 `continueOnError: true`，单步失败不阻断后续步骤
- **依赖检查非致命** (`src/services/workflows/commands/architecture.command.ts`)
  - `GeneratePlotArchitectureCommand` 依赖检查从 `throw` 改为 `callbacks.log('⚠️ 警告')`
  - 缺失前置数据时尝试降级生成（如仅基于前提生成情节大纲）
- **空值重试阈值提升** (`src/services/workflows/commands/base-command.ts`)
  - LLM 返回内容过短阈值：10 字 → 50 字
  - 重试时追加「直接输出正文，不要 thinking 标签」提示
- **提示词字数要求** (`src/services/prompt-templates.ts`)
  - 角色图谱：每个角色≥150 字，图谱总计≥800 字
  - 世界观：每个维度≥200 字，总计≥600 字
  - 情节大纲：每个结构节点≥100 字，总计≥1000 字

### 修复 — 数据持久化

- **NovelConfig 接口扩展** (`src/shared/ipc-channels.ts`)
  - 新增 `synopsis`、`worldbuilding`、`charactersArch`、`premise` 4 个 AI 生成字段
  - 解决字段名不匹配导致保存后重开数据丢失问题
- **Project Controller 双向映射** (`src/controllers/project-controller.ts`)
  - `project:open`：DB `synopsis` → `novelConfig.synopsis` 同时兼容 `coreOutline`
  - `project:save`：显式传递 AI 生成字段到 DB，防止隐式覆盖
- **project:update-config 同步**：AI 生成内容通过此通道写入时也完整传递

### 技术债清理

- `ipc-channels.ts` / `project-controller.ts` 字段映射统一为 camelCase（TS 风格）
- 工作流 guard 失败提示 UI 统一黄色警告样式（`bg-yellow-500/10`）

---

## v0.2.0 (2026-07-04)

### 重大新增 — 多 Agent 协作体系

- **Agent 注册中心** (`src/services/agent/agent-registry.ts`)：13 个专业 Agent
  - 故事架构师、角色设计师、叙事写手、一致性检查器、故事探索者
  - 评论者、编辑、读者模拟器、角色模拟器、脑暴者、大纲师、风格创建器、编年史家
- **Agent 调度器** (`src/services/agent/agent-orchestrator.ts`)：意图路由 + Agent 上下文构建
- **Agent 类型定义** (`src/shared/agent-types.ts`)：AgentRole 枚举 + 中文别名路由表
- **UI Agent 选择器** (`src/components/panels/agent/AgentSelector.tsx`)：AI 面板顶部下拉菜单

### 重大新增 — Skills 生态扩展

- **Skill Registry 扩展**：内置 Skill 从 5 个扩展到 28 个
  - P0 核心 11 个：大纲搭建、长篇写作、长篇拆文、去 AI 味、多视角审稿、角色对话模拟、读者模拟、风格创建、写作模式、写作原则、故事记忆
  - P1 进阶 7 个：市场扫榜、小说导入、封面生成、LLM 语言纪律、短篇写作、短篇拆文、研究辅助
  - 保留原有 5 个：章节审阅、脑暴创意、角色分析、连续性检查、写作教练
  - 项目初始化 + 写作工具箱路由（2 个基础 Skill）= 共 28 个

### 增强

- **Agent Store** (`src/stores/agent-store.ts`)：新增 activeAgentId 状态 + setActiveAgent 操作
- **上下文构建器增强** (`src/services/agent/context-builder.ts`)：当选择专业 Agent 时注入对应系统提示词 + 推荐 Skill
- **AgentHeader UI 升级**：移除静态 "AGENT" 标题，替换为 AgentSelector 下拉组件
- **版本号**：0.1.0 → 0.2.0

### 向后兼容

- 所有 v0.1.0 API 和数据结构保持不变
- 默认 Agent 为「通用助手」（行为与 v0.1.0 完全一致）
- 现有项目文件格式不变
- 新的 Agent 和 Skill 均为增量添加，不影响现有功能