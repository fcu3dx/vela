# 技术决策记录（ADR）

## ADR-001：集成策略 — 方法论吸收 vs 代码移植

**日期**：2026-07-04  
**状态**：已决定  
**决策者**：项目经理（Hermes Agent）

### 背景

oh-story-claudecode 是 Claude Code / Codex CLI 等命令行 Agent 生态下的 Skill 包，依赖以下 CLI 特性：
- `.claude/agents/` 文件夹下的 Agent 注册机制
- `.claude/hooks/` 下的 shell hook 触发
- `SKILL.md` 格式的 YAML frontmatter + Markdown 内容
- Multi-agent spawn/subagent 机制

而 Vela 是独立的 Electron 桌面应用，不具备上述 CLI 基础设施。

### 决策

**采用「方法论吸收 + 架构适配」策略，不进行代码移植。**

具体做法：
1. **吸收 oh-story-claudecode 的 Skill 内容**（写作方法论、prompt 模板、分析框架）→ 转化为 vela 的 Skill Registry 中的 Skill
2. **吸收 Agent 分工模型**（架构师/角色设计师/叙事写手/一致性检查器/故事探索者）→ 在 vela Agent 引擎上实现多 Agent 协作
3. **吸收项目文件结构规范**（设定/大纲/正文/追踪/对标/拆文库）→ 更新 vela 的项目模板
4. **不移植 hooks/CLI 适配层** — vela 有自己的 Electron IPC 通信层

### 理由

- Vela 已有完整的 Agent 引擎（agent-engine.ts）、Skill Registry（skill-registry.ts）和 Tool Registry（tool-registry.ts）
- 这些基础设施与 oh-story-claudecode 的 SKILL.md 机制原理相通，适配成本低
- 直接移植 CLI hook 脚本会引入不必要的复杂度，且与 Electron 架构冲突
- 方法论是平台无关的，prompt 模板可以直接复用

### 影响

- vela 的 Skill 将大幅扩展（从 5 个内置到 12+）
- vela 的 Agent 引擎需要增强多 Agent 协作（从单 Agent ReAct 到多 Agent 调度）
- 项目文件系统需要增量升级（新增目录而不破坏现有结构）

---

## ADR-002：多 Agent 协作方案

**日期**：2026-07-04  
**状态**：已决定  
**决策者**：项目经理（Hermes Agent）

### 背景

oh-story-claudecode 用 7 个专业 Agent 分工协作。vela v0.1.0 只有一个 Agent 引擎（agent-engine.ts），通过 ReAct 循环 + Tool 调用工作。

### 决策

**在现有 Agent 引擎基础上，增加「Agent 调度器」层，支持多 Agent 协作。**

架构：
```
Agent 调度器 (agent-orchestrator.ts)
  ├── Agent 注册（与 Skill 类似，每个 Agent 是一个系统提示词 + 工具白名单）
  ├── Agent 调用（spawn agent 子任务，独立 ReAct 循环）
  └── Agent 结果合并（多 Agent 输出汇总到主会话）
```

Agent 模型映射：
| oh-story Agent | Vela Agent | 实现方式 |
|----------------|-----------|---------|
| story-architect | 架构师 Agent | 系统提示词 + 架构专用 Tool 白名单 |
| character-designer | 角色设计师 Agent | 系统提示词 + 角色读写 Tool 白名单 |
| narrative-writer | 叙事写手 Agent | 系统提示词 + 正文生成 Tool |
| consistency-checker | 一致性检查器 Agent | 系统提示词 + 全项目读取 Tool |
| story-explorer | 故事探索者 Agent | 系统提示词 + 只读查询 Tool |
| story-researcher | 资料研究员 Agent | 系统提示词 + 知识库搜索 Tool |
| chapter-extractor | 章节提取器 Agent | 并入一致性检查器 / 故事探索者 |

### 理由

- 不需要重写 Agent 引擎，现有 ReAct 循环可直接复用
- 每个 Agent 本质上就是一个专用 system prompt + 受限工具集
- Vela 已有 IPC 通信和 Tool Registry，基础设施完备

### 影响

- 新增 `agent-orchestrator.ts` 模块
- 新增 `agent-registry.ts` 模块（与 skill-registry.ts 平行）
- 每个 Agent 需要独立的系统提示词模板

---

## ADR-003：项目文件系统升级方案

**日期**：2026-07-04  
**状态**：已决定  
**决策者**：项目经理（Hermes Agent）

### 背景

oh-story-claudecode 使用 Markdown 文件系统管理小说项目：
```
项目/
├── 设定/      # 世界观/角色/势力/关系/题材定位
├── 大纲/      # 全书大纲/卷纲/细纲（每章一个文件）
├── 正文/      # 章节正文（每章一个 Markdown 文件）
├── 对标/      # 对标书结构化子目录
├── 追踪/      # 伏笔/时间线/角色状态/上下文
├── 参考资料/  # 研究资料
└── 拆文库/    # 拆文输出
```

Vela v0.1.0 使用 SQLite 数据库 + `vela://` 协议路径管理。

### 决策

**采用「数据库 + 文件系统」混合方案。**

具体做法：
1. **核心数据继续用 SQLite**（角色卡、蓝图/细纲、草稿版本）— 这是 vela 的现有架构，不需要改
2. **新增文件系统层**用于：
   - 对标书结构化存储（对标/目录）
   - 拆文库输出（拆文库/目录）
   - 追踪文件（追踪/伏笔.md、时间线.md、角色状态.md）
   - 参考资料（参考资料/目录）
3. **设定/大纲/正文**继续使用现有数据库结构（ChapterBlueprint、CharacterData 等），但在文件系统上也提供 Markdown 导出视图
4. **新增 IPC 通道**用于文件系统读写（对标/拆文/追踪）

### 理由

- SQLite 适合结构化数据（角色卡字段、章节蓝图元数据、版本管理）
- Markdown 文件系统适合半结构化内容（对标拆解报告、伏笔追踪、研究资料）— 这些内容格式自由，不适合强 Schema
- 对标/拆文库有大量 Markdown 内容，用文件系统存储更自然
- 不改变现有数据库 Schema，仅追加表/字段

### 影响

- electron/ 层新增文件系统读写模块
- src/services/ 新增对标/拆文/追踪服务
- 现有 db:project-core-get 等 IPC 通道不变

---

## ADR-004：Skills 扩展策略

**日期**：2026-07-04  
**状态**：已决定  
**决策者**：项目经理（Hermes Agent）

### 背景

Vela v0.1.0 有 5 个内置 Skill（review-chapter, brainstorm, character-analysis, continuity-check, writing-coach）。
oh-story-claudecode 有 13 个高度专业的 Skill。

### 决策

**将 oh-story-claudecode 的 13 个 Skill 适配为 Vela Skill 格式，新增 7 个内置 Skill，总计 12 个内置 Skill。**

Vela Skill 格式：
```yaml
---
name: skill-name
display_name: 显示名称
description: 功能描述
when_to_use: 触发条件
allowed-tools: [tool1, tool2]
argument-hint: 参数提示
---
# Skill 提示词内容（Markdown）
```

新增 Skill 对照：

| oh-story Skill | Vela Skill | 说明 |
|---------------|-----------|------|
| story-setup | project-init（项目初始化） | 项目创建 + 目录结构 + Agent 注册 |
| story | writing-toolbox（写作工具箱路由） | 意图识别 → Skill 分发 |
| story-long-write | novel-write（长篇写作） | 从大纲到正文的完整流程 |
| story-long-analyze | novel-analyze（长篇拆文） | 黄金三章/爽点/节奏分析 |
| story-long-scan | market-scan（市场扫榜） | 平台趋势分析 + 选题决策 |
| story-deslop | deai-filter（去 AI 味） | AI 痕迹检测与修复 |
| story-review | multi-review（多视角审稿） | 多维度质量审查 |

保留的原有 Skill：review-chapter, brainstorm, character-analysis, continuity-check, writing-coach

### 影响

- skill-registry.ts 的 registerBuiltinSkills() 函数扩展
- 新增 7 个 Skill 提示词模板文件（src/services/prompts/skills/）