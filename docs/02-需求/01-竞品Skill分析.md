# Vela v0.2.0 竞品 Skill 分析报告

## 一、竞品来源汇总

| 来源 | 类型 | Skill 数 | 核心价值 |
|------|------|---------|---------|
| **oh-story-claudecode** | 网文写作全流程 | 13 Skill + 7 Agent | 最完整的网文工业化写作体系 |
| **creative-writing-skills** | 通用创意写作 | 13 Skill + 11 Agent | 专注文风保持、人物模拟、读者反馈 |
| **awesome-claude-skills** | Claude Skill 目录 | 199 Skill（含写作类） | SEO写作、内容研究、品牌声音、标题生成 |
| **seo-geo-claude-skills** | SEO写作 | 20 Skill | SEO+GEO 双优化、关键词研究 |
| **writing-editing-plugin** | 写作编辑 | 1 Plugin | 专业校对、风格编辑、文本转换 |
| **marketing-skills** | 营销写作 | 23+ Skill | 文案框架（PAS/AIDA）、CRO、邮件序列 |
| **academic-research-skills** | 学术写作 | 多 Skill + 25 Agent | 深度研究、反幻觉验证、同行评审 |
| **Deep-Research-skills** | 深度研究 | 1 Skill | 结构化研究、人类检查点控制 |

## 二、值得集成到 Vela 的 Skill 分类

### 第一类：oh-story-claudecode 全部 13 Skill（最高优先级）

| Skill | 功能 | 分类 |
|-------|------|------|
| story-setup | 项目初始化 + Agent 部署 | 基础 |
| story | 写作工具箱路由（意图识别→分发） | 基础 |
| story-long-write | 长篇写作（Phase 1-5 完整流程） | 核心 |
| story-long-analyze | 长篇拆文（结构/节奏/情绪模块） | 核心 |
| story-long-scan | 长篇扫榜（起点/番茄/晋江市场） | 辅助 |
| story-short-write | 短篇写作（情绪设计/反转构思） | 核心 |
| story-short-analyze | 短篇拆文（故事核/情感线/反转） | 核心 |
| story-short-scan | 短篇扫榜（知乎盐言/番茄短篇） | 辅助 |
| story-deslop | 去 AI 味（7 Gate 检测+三遍修复） | 核心 |
| story-import | 小说导入（逆向解析为标准结构） | 辅助 |
| story-review | 多视角审稿（4 Agent 对抗式审查） | 核心 |
| story-cover | AI 封面生成 | 扩展 |
| browser-cdp | 浏览器操控（登录态抓数据） | 不集成* |

> *browser-cdp 不集成：vela 是 Electron 桌面应用，不需要 CDP 协议操控外部浏览器。

### 第二类：creative-writing-skills 增量功能（高优先级）

| Skill | oh-story 已有？ | 增量价值 |
|-------|:---:|------|
| creative-writing-modes | 部分 | **写作模式系统**（新稿/修订/桥接/替代/润色）— 比 vela 现有写稿→修稿更细粒度 |
| writing-principles | 部分 | **写作原则**（读者奖励通道、AI 失败模式、品味纪律）— 全新视角 |
| story-planning | 有 | 方向+头脑风暴+大纲+故事架构 — 互补 |
| story-review | 有 | 编辑审阅+发展编辑+行编辑+校订 — 更多审阅维度 |
| story-memory | 无 | **故事记忆系统**（上下文/事实提取/参考写作/持久问题追踪）— 重要增量 |
| reader-sim | 无 | **读者模拟** — 从指定读者视角模拟首次阅读体验 — 独有功能 |
| character-sim | 无 | **角色对话模拟** — 与角色对话以发现声音和测试关系 — 独有功能 |
| llm-writing | 无 | **LLM 语言纪律** — 捕捉非选择的 LLM 默认词/句式 — 独有功能 |
| style-creator | 无 | **风格创建器** — 从现有散文分析并创建风格参考文件 — 独有功能 |

### 第三类：通用写作 Skill（中等优先级）

| 来源 | Skill | 价值 |
|------|-------|------|
| skiln.co | Brand Voice Skill | 品牌声音分析+强制执行 — 适用于多项目写作者 |
| skiln.co | Content Research Writer | 多源研究+引用追踪+大纲生成 |
| skiln.co | Headline Writing Skill | 标题变体A/B生成+情感评分 |
| skiln.co | Office Document Skills | DOCX/PPTX/PDF 格式化导出 |

## 三、Skill 集成决策

### 直接适配（保留方法论，改写为 Vela Skill 格式）

共集成 **20 个 Skill**，分为基础/核心/进阶三个层级：

| 层级 | Skill 名称 | 来源 | 功能 |
|------|-----------|------|------|
| 基础 | project-init | oh-story setup | 项目初始化 + 目录结构 + Agent 注册 |
| 基础 | writing-toolbox | oh-story story | 意图路由 + Skill 分发 |
| 基础 | style-creator | cw-skills | 从散文样本创建风格文件 |
| 核心 | novel-outline | oh-story long-write (Phase 1-3) | 选题→设定→大纲搭建 |
| 核心 | novel-draft | oh-story long-write (Phase 4) | 正文生成+上下文追踪 |
| 核心 | novel-analyze | oh-story long-analyze | 长篇拆文（结构/节奏/情绪模块） |
| 核心 | short-write | oh-story short-write | 短篇写作（情绪/反转/精修） |
| 核心 | short-analyze | oh-story short-analyze | 短篇拆文（故事核/反转设计） |
| 核心 | deai-filter | oh-story deslop | 去 AI 味（7 Gate + 三遍修复） |
| 核心 | multi-review | oh-story review | 多视角审稿（4 维度） |
| 核心 | character-sim | cw-skills | 角色对话模拟 |
| 核心 | reader-sim | cw-skills | 读者视角模拟 |
| 进阶 | market-scan | oh-story scan（合并长/短） | 市场扫榜+选题决策 |
| 进阶 | novel-import | oh-story import | 已有小说逆向导入 |
| 进阶 | cover-gen | oh-story cover | AI 封面生成 |
| 进阶 | story-memory | cw-skills | 事实提取+上下文+问题追踪 |
| 进阶 | writing-modes | cw-skills | 写作模式切换（新稿/修订/桥接/润色） |
| 进阶 | writing-principles | cw-skills | 读者奖励通道+AI 失败模式 |
| 进阶 | llm-discipline | cw-skills | LLM 默认词检测+替换 |
| 进阶 | research-assist | Content Research Writer | 多源研究+引用+大纲 |
| 扩展 | brand-voice | Brand Voice Skill | 品牌声音分析（多项目协作） |
| 扩展 | headline-gen | Headline Writing | 标题A/B变体+评分 |
| 扩展 | doc-export | Office Document Skills | DOCX/PPTX/PDF 导出 |

### 不集成的

| Skill | 原因 |
|-------|------|
| browser-cdp | Electron 不需要 CDP 浏览器操控 |
| SEO/GEO 全套 | vela 是写作 IDE 不是 SEO 工具 |
| 营销套件（邮件/广告/社交） | 偏离小说创作核心场景 |
| 学术研究全流程 | 偏离网文小说场景（research-assist 取其研究部分） |

## 四、Vela 原有 Skill 保留

| Skill | 状态 |
|-------|------|
| review-chapter（章节审阅） | 保留，与 multi-review 互补充 |
| brainstorm（脑暴创意） | 保留 |
| character-analysis（角色分析） | 保留 |
| continuity-check（连续性检查） | 保留，增强为追踪系统 |
| writing-coach（写作教练） | 保留 |

原有 5 个 + 新增 23 个 = **总计 28 个内置 Skill**

## 五、面向 UI 的 Skill 分类组织

为了方便在 vela 界面上布局，按使用场景将 Skill 分组：

```
📁 项目初始化
  ├── project-init         项目初始化
  └── novel-import         小说导入

📁 市场调研
  ├── market-scan          市场扫榜
  ├── novel-analyze        长篇拆文
  └── short-analyze        短篇拆文

📁 故事架构
  ├── novel-outline        大纲搭建
  ├── brainstorm           脑暴创意
  └── writing-toolbox      写作工具箱

📁 正文写作
  ├── novel-draft          长篇写作
  ├── short-write          短篇写作
  ├── writing-modes        写作模式
  ├── writing-principles   写作原则
  └── writing-coach        写作教练

📁 精修润色
  ├── deai-filter          去AI味
  ├── multi-review         多视角审稿
  ├── review-chapter       章节审阅
  ├── character-analysis   角色分析
  └── continuity-check     连续性检查

📁 角色与读者
  ├── character-sim        角色对话模拟
  ├── reader-sim           读者视角模拟
  └── style-creator        风格创建

📁 辅助工具
  ├── story-memory         故事记忆
  ├── llm-discipline       LLM语言纪律
  ├── research-assist      研究辅助
  ├── brand-voice          品牌声音
  ├── headline-gen         标题生成
  ├── cover-gen            封面生成
  └── doc-export           文档导出
```

## 六、Agent 体系扩展

| Agent | 来源 | 模型 | 职责 |
|-------|------|------|------|
| **story-architect**（架构师） | oh-story | 强推理模型 | 题材定位、大纲结构、钩子/反转设计 |
| **character-designer**（角色设计师） | oh-story | 中等模型 | 角色档案、语言风格、动机链 |
| **narrative-writer**（叙事写手） | oh-story | 中等模型 | 正文写作、去AI味、格式合规 |
| **consistency-checker**（一致性检查器） | oh-story | 轻量模型 | 事实冲突扫描、伏笔追踪 |
| **story-explorer**（故事探索者） | oh-story | 轻量模型 | 角色/伏笔/设定/进度只读查询 |
| **critic**（评论者） | cw-skills | 强推理模型 | 深度对抗式批评 |
| **editor**（编辑） | cw-skills | 中等模型 | 整体书编辑视角 |
| **reader-sim**（读者模拟器） | cw-skills | 中等模型 | 读者体验反馈 |
| **character-sim**（角色模拟器） | cw-skills | 中等模型 | 角色内对话 |
| **brainstormer**（脑暴者） | cw-skills | 任何模型 | 创意选项生成 |
| **outliner**（大纲师） | cw-skills | 中等模型 | 弧线/章节/节拍级大纲 |
| **style-creator**（风格创建器） | cw-skills | 中等模型 | 散文风格分析+风格文件创建 |
| **chronicler**（编年史家） | cw-skills | 轻量模型 | 事实状态提取进知识库 |

> 总计 13 个 Agent，vela 原有 0 个 Agent 体系（只有一个通用 Agent 引擎）

## 七、UI 布局调整建议

当前 vela UI 结构：
```
标题栏
├── 活动栏（左侧图标导航）
├── 侧边栏（文件树/项目结构）
├── 编辑区（正文编辑器）
├── AI 面板（对话式助手）
└── 底部面板（终端/输出）
```

v0.2.0 建议调整：
1. **侧边栏增强**：新增「Skill 面板」视图 — 按分类展示所有可用 Skill，支持点选调用
2. **AI 面板增强**：新增「Agent 选择器」— 切换当前使用的 Agent 角色
3. **活动栏新增图标**：
   - 📊 架构面板（大纲/角色/世界观可视化）
   - 📝 写作工作流（全流程步骤引导）
   - 🔍 审阅面板（审稿报告/一致性检查）
4. **底部面板新增 Tab**：
   - 🗂️ 追踪面板（伏笔/时间线/角色状态）
   - 📚 对标面板（对标书参考数据）