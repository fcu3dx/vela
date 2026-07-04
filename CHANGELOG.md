# Vela 更新日志

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