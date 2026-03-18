# modern-ai-cli 产品需求文档（PRD）

**产品名称：** modern-ai-cli
**二进制命令：** `ai`
**版本：** 0.1.0
**文档日期：** 2026-03-18
**状态：** 草稿

---

## 目录

1. [产品概述](#1-产品概述)
2. [目标用户](#2-目标用户)
3. [用户痛点与使用场景](#3-用户痛点与使用场景)
4. [产品目标与成功指标](#4-产品目标与成功指标)
5. [功能模块总览](#5-功能模块总览)
6. [CLI 交互规范](#6-cli-交互规范)
7. [命令详细需求](#7-命令详细需求)
   - 7.1 [ai ask — 单次问答](#71-ai-ask--单次问答)
   - 7.2 [ai chat — 交互式对话](#72-ai-chat--交互式对话)
   - 7.3 [ai generate — 代码生成](#73-ai-generate--代码生成)
   - 7.4 [ai agent — 多智能体](#74-ai-agent--多智能体)
   - 7.5 [ai mcp — 技能扩展](#75-ai-mcp--技能扩展)
   - 7.6 [ai plugin — 插件管理](#76-ai-plugin--插件管理)
   - 7.7 [ai config — 配置管理](#77-ai-config--配置管理)
   - 7.8 [ai whatsnew — 更新日志](#78-ai-whatsnew--更新日志)
8. [AI 模式规范](#8-ai-模式规范)
9. [配置项规范](#9-配置项规范)
10. [错误处理规范](#10-错误处理规范)
11. [UI 与输出规范](#11-ui-与输出规范)
12. [非功能性需求](#12-非功能性需求)
13. [技术约束](#13-技术约束)
14. [发布与分发](#14-发布与分发)

---

## 1. 产品概述

`modern-ai-cli` 是一个面向开发者的 AI 终端助手，基于 Anthropic Claude API 构建。用户通过 `ai` 命令在终端中直接与 Claude 交互，无需打开浏览器或第三方应用。

产品的核心价值是**让 AI 能力无缝嵌入开发者已有的终端工作流**，覆盖从简单问答到复杂多智能体任务协作的全部场景。

### 产品定位

```
简单问答  →  交互对话  →  代码生成  →  多智能体协作
   ↑              ↑             ↑              ↑
  ai ask       ai chat      ai generate    ai agent run
```

---

## 2. 目标用户

### 主要用户：后端 / 全栈开发者

- 日常在终端工作，不愿离开命令行环境
- 需要快速获取代码片段、文档解释、命令查询
- 熟悉 CLI 工具的使用约定（flags、管道、stdin/stdout）

### 次要用户：DevOps / 平台工程师

- 需要快速生成 Shell 脚本、查询运维命令
- 希望将 AI 调用集成到自动化脚本或 CI/CD 流程中
- 关注工具的可脚本化能力（`--no-stream`、JSON 输出、非交互模式）

### 延伸用户：技术团队负责人

- 需要协调多个 AI 角色完成复杂任务分析（`ai agent run`）
- 希望能定义团队专属的 AI 角色和工作流
- 需要留存会议/讨论记录（`ai agent meet`）

---

## 3. 用户痛点与使用场景

### 痛点 1：频繁切换上下文

> "我在终端调试代码，想问 AI 一个问题，但每次都要切换到浏览器，粘贴代码，再切回来，效率极低。"

**对应功能：** `ai ask`、`ai chat --mode debug`

---

### 痛点 2：重复性代码编写

> "写测试、写文档、写工具函数这些事情很重复，我希望直接在终端描述需求，让 AI 生成然后写入文件。"

**对应功能：** `ai generate -t test -o tests/foo.test.ts`

---

### 痛点 3：复杂任务需要多视角

> "设计一个新功能时，我需要从需求分析、技术方案、代码实现、质量审查多个维度思考，但一个 AI 对话做不到这种结构化分工。"

**对应功能：** `ai agent run "设计带限流的 REST API"`

---

### 痛点 4：AI 能力无法扩展

> "我希望 AI 能直接帮我执行 Shell 命令、读取本地文件，而不是只给我文字建议。"

**对应功能：** `ai mcp enable shell`、`ai mcp enable files`

---

### 痛点 5：每次对话从零开始

> "我在不同终端 session 里和 AI 讨论过同一个项目，但每次都要重新解释背景。"

**对应功能：** `ai chat --session <id>`、`ai agent memory`

---

## 4. 产品目标与成功指标

| 目标 | 成功指标 |
|---|---|
| 零门槛上手 | 用户 `npm i -g modern-ai-cli` 后 3 分钟内完成第一次问答 |
| 工作流嵌入 | `ai ask` / `ai generate` 支持无交互模式，可用于脚本和管道 |
| 响应速度 | 首字节延迟 < 2 秒（流式），非流式完整响应 < 10 秒（4096 tokens） |
| 扩展生态 | MCP 技能和插件可通过 npm 一行命令安装 |
| 可靠性 | API 错误、网络超时有明确提示，不崩溃退出码可被脚本捕获 |

---

## 5. 功能模块总览

```
ai
├── ask            单次问答（非交互，可脚本化）
├── chat           多轮交互对话（带会话持久化）
├── generate       代码 / 文档生成（可输出文件）
├── agent          多智能体系统
│   ├── run        自动规划并执行复杂任务
│   ├── solo       运行单个指定角色
│   ├── roles      列出所有角色
│   ├── create     创建自定义角色
│   ├── edit       编辑自定义角色
│   ├── show       查看角色详情
│   ├── remove     删除自定义角色
│   ├── export     导出角色为 JSON
│   ├── import     从 JSON 导入角色
│   ├── workflow   工作流管理（list/run/save/remove/template）
│   ├── org        组织结构管理（show/run/list）
│   ├── memory     智能体记忆管理（list/add/search/distill/clear/stats）
│   └── meet       结构化多智能体会议（start/list/show/remove/modes）
├── mcp            MCP 技能管理（list/enable/disable/install/remove/search/run）
├── plugin         插件管理（list/install/remove）
├── config         配置管理（show/set/wizard/reset/path）
└── whatsnew       查看更新日志
```

---

## 6. CLI 交互规范

### 6.1 全局约定

| 约定 | 要求 |
|---|---|
| 命令命名 | 全小写，单词用连字符分隔，动词在前（`agent run`、`mcp enable`） |
| 常用命令别名 | `ask→a`、`chat→c`、`generate→gen/g`、`mcp list→mcp ls`、`workflow list→workflow ls` |
| 帮助信息 | 每个命令和子命令均支持 `--help`；顶层 `ai --help` 显示分组示例 |
| 版本信息 | `ai --version` / `ai -v` 输出 `<version> (<git-hash>) [dirty]` |
| 建议提示 | 命令拼写错误时显示最接近的建议（Commander `showSuggestionAfterError`） |
| 退出码 | 成功 `0`，用户取消 `0`，运行错误 `1`，参数错误 `1` |

### 6.2 输入约定

| 场景 | 处理方式 |
|---|---|
| 多词参数 | 通过 `<arg...>` 变长参数接收，内部 join 为单个字符串，无需引号 |
| 可选交互参数 | 参数缺失时通过 `@clack/prompts` 交互式补全，非 TTY 时报错退出 |
| 标志覆盖配置 | CLI 标志（如 `--mode`、`--system`）始终优先于持久化配置 |
| stdin 管道 | 暂不支持 stdin 输入（后续版本规划） |

### 6.3 输出约定

| 场景 | 格式要求 |
|---|---|
| 正常输出 | Markdown 渲染后输出到 stdout |
| 错误信息 | 红色前缀 `✖ Error: ...`，输出到 stderr |
| 成功提示 | 绿色前缀 `✔ ...`，输出到 stdout |
| 警告信息 | 黄色前缀 `⚠ ...`，输出到 stdout |
| token 用量 | 灰色 footer，格式：`↑ <n> tokens in  ↓ <n> tokens out` |
| 模型信息 | 灰色 footer，格式：`model: <name>  ·  stop: <reason>` |
| 分隔线 | 灰色横线，用于分隔多轮对话 |
| 非 TTY 环境 | 禁止输出 ANSI 颜色码和 spinner，纯文本输出 |

### 6.4 流式输出约定

1. 命令启动后先显示 spinner（"Thinking…"）
2. 收到第一个字符时清除 spinner，开始逐字输出
3. 全部输出完毕后，换行，输出 footer（token 用量 + 模型信息）
4. `--no-stream` 时：spinner 持续显示直到完整响应返回，再一次性渲染

---

## 7. 命令详细需求

---

### 7.1 `ai ask` — 单次问答

**用途：** 向 Claude 提问，获得一次性回答。适合查询类问题、代码解释、快速帮助。

**命令格式：**
```
ai ask <question...> [options]
ai a   <question...> [options]
```

**选项：**

| 选项 | 简写 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `--mode <mode>` | `-m` | enum | `default` | AI 工作模式（见第 8 节） |
| `--system <prompt>` | `-s` | string | — | 覆盖系统提示词 |
| `--no-stream` | — | boolean | false | 禁用流式输出 |
| `--no-usage` | — | boolean | false | 隐藏 token 用量信息 |

**交互流程：**
```
$ ai ask how does async/await work in JavaScript

  ┌ You ──────────────────────────────────
  │ how does async/await work in JavaScript
  └────────────────────────────────────────

✦ Claude
  ⠸ Thinking…       ← spinner（流式模式，收到首字节后清除）

  async/await is syntactic sugar over Promises...
  （流式逐字输出）

  ──────────────────────────────────────────
  ↑ 12 tokens in  ↓ 342 tokens out
  model: claude-opus-4-6  ·  stop: end_turn
```

**需求明细：**

- R-ASK-01：问题参数为变长 `<question...>`，多个单词自动拼接，不要求用户加引号
- R-ASK-02：`--mode` 仅接受 `default | code | explain | debug | shell | refactor | creative`，非法值报错并列出有效值
- R-ASK-03：流式模式下，`--no-usage` 仍然显示模型/stop reason footer（仅隐藏 token 行）
- R-ASK-04：启用了 MCP 技能时，工具调用过程中每个工具调用显示内联提示 `[🔧 tool_name]`
- R-ASK-05：`--system` 与 `--mode` 同时指定时，`--system` 优先，`--mode` 被忽略
- R-ASK-06：API key 未配置时，输出提示 `Run: ai config set apiKey YOUR_KEY` 后以退出码 1 退出

---

### 7.2 `ai chat` — 交互式对话

**用途：** 与 Claude 进行多轮对话，支持会话持久化和恢复，适合持续性探讨、调试会话、需要上下文连续的任务。

**命令格式：**
```
ai chat [options]
ai c   [options]
```

**选项：**

| 选项 | 简写 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `--mode <mode>` | `-m` | enum | `default` | 初始 AI 模式 |
| `--system <prompt>` | `-s` | string | — | 覆盖系统提示词 |
| `--session <id>` | — | string | — | 恢复指定 session ID 的历史对话 |

**会话内斜杠命令：**

| 命令 | 功能 | 注意事项 |
|---|---|---|
| `/clear` | 清空当前对话历史（不删除文件） | 需要确认提示 |
| `/mode` | 交互式选择 AI 模式 | 立即生效，后续请求使用新模式 |
| `/history` | 打印当前会话消息摘要（每条截取前 60 字符） | — |
| `/save` | 手动保存当前 session | 若第一条消息存在，取前 50 字符作为标题 |
| `/load` | 交互式选择并加载历史 session | 最多显示最近 10 个 |
| `/usage` | 切换 token 用量显示开关 | 初始继承 `config.historyEnabled` |
| `/model` | 显示当前使用的模型名 | — |
| `/help` | 显示所有斜杠命令 | — |
| `/exit` / `/quit` | 退出对话 | 退出前触发自动保存 |

**需求明细：**

- R-CHAT-01：进入对话时，显示当前模式名和描述（`Mode: code — Expert software engineer...`）
- R-CHAT-02：对话上下文超出 `historyMaxMessages * 2` 条时，自动删除最早的消息（滚动窗口）
- R-CHAT-03：每满 5 轮（用户消息 + 助手消息各算 1 轮）自动保存一次 session
- R-CHAT-04：退出时（`/exit`、Ctrl+C）若 `historyEnabled` 为 true 且对话不为空，自动保存并打印 session ID
- R-CHAT-05：`--session <id>` 不存在时，输出错误信息并以退出码 1 退出（不创建新 session）
- R-CHAT-06：通过 `--session` 恢复时，先展示最近 4 条历史消息作为"上下文预览"，再进入对话
- R-CHAT-07：用户输入为空时，提示"Please enter a message"，不调用 API
- R-CHAT-08：API 调用失败时，打印错误但**不退出**对话循环，用户可继续输入（同时回滚刚才的用户消息）
- R-CHAT-09：非 TTY 环境（如管道）不进入交互模式，直接报错退出

**自动保存文件格式：**
```typescript
interface ChatSession {
  id: string;          // UUID
  title: string;       // 首条用户消息的前 50 字符，默认 "New conversation"
  messages: MessageParam[];
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
```

---

### 7.3 `ai generate` — 代码生成

**用途：** 根据描述生成代码、组件、测试、文档或脚本，可直接写入文件。

**命令格式：**
```
ai generate [description] [options]
ai gen      [description] [options]
ai g        [description] [options]
```

**选项：**

| 选项 | 简写 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `--type <type>` | `-t` | enum | — | 生成类型（见下方） |
| `--language <lang>` | `-l` | string | TypeScript | 目标语言或框架 |
| `--output <file>` | `-o` | string | — | 输出到指定文件 |
| `--no-explain` | — | boolean | false | 仅输出代码，跳过解释 |

**生成类型：**

| 类型值 | 描述 | 生成内容要求 |
|---|---|---|
| `component` | UI 组件 | props/interface 定义、完整实现、使用示例、JSDoc 注释 |
| `function` | 函数或工具方法 | 类型签名、完整实现（含错误处理）、单元测试、JSDoc |
| `test` | 测试套件 | 正常路径、边界情况、错误情况、边界值测试 |
| `docs` | 文档 / README | 概览、API 参考、示例、常见用例 |
| `script` | Shell / 自动化脚本 | shebang、错误处理、`--help` 文本、内联注释 |

**交互流程（参数缺失时）：**
```
$ ai generate

  ┌ AI Code Generator ─────────────────────

  ✦ What do you want to generate?
  ❯ UI Component (React, Vue, etc.)
    Function or utility
    Test suite (unit/integration)
    Documentation or README
    Shell or automation script

  ✦ Describe the function to generate:
  › a debounce hook that supports cancellation

  ✦ Language or framework?
  › TypeScript   [默认值预填]
```

**需求明细：**

- R-GEN-01：`--type` 和 `description` 均可省略，省略时通过交互式菜单补全
- R-GEN-02：非 TTY 环境下，若 `--type` 或 `description` 缺失，报错退出（不进入交互模式）
- R-GEN-03：`--output` 文件已存在时，弹出确认框"File exists. Overwrite?"，默认选 **No**
- R-GEN-04：写入文件时，从输出中提取第一个 markdown 代码块内容（````\w+\n...\n````）；若无代码块则写入完整输出
- R-GEN-05：写入成功后显示 `✔ Written to: <path>`
- R-GEN-06：`--language` 默认值随 `--type` 变化：`script` 类型默认 `bash`，其他默认 `TypeScript`
- R-GEN-07：生成结束后显示摘要行：`• Generated <type>: <description 前 50 字符>`

---

### 7.4 `ai agent` — 多智能体

**用途：** 将复杂任务分解给多个专业 AI 角色协同完成，或定义可复用的团队工作流。

---

#### 7.4.1 内置角色规范

| 角色 | 职责 | 系统提示要点 |
|---|---|---|
| `researcher` | 分析需求、收集上下文、识别约束 | 不写代码，输出结构化 markdown 分析 |
| `planner` | 将任务拆解为有序可执行步骤 | 输出编号计划，标注并行/串行关系 |
| `coder` | 编写、重构或调试代码 | 生产级代码质量，带错误处理和类型 |
| `reviewer` | 检查 bug、安全问题、代码质量 | 指出问题并提供修复建议 |
| `synthesizer` | 整合所有输出为最终答案 | 解决矛盾，输出整洁 markdown |

#### 7.4.2 `ai agent run [task]` — 自动规划执行

**需求明细：**

- R-AGENT-RUN-01：task 参数省略时，交互式输入任务描述
- R-AGENT-RUN-02：规划阶段：调用 Claude 生成 `AgentPlan`（JSON），包含 `goal`、`tasks[]`、`executionMode`
- R-AGENT-RUN-03：规划完成后，展示 `Mode: <parallel|sequential>  Tasks: <n>` 摘要
- R-AGENT-RUN-04：并行模式下，可同时运行的任务（无 `dependsOn` 冲突）同时启动
- R-AGENT-RUN-05：所有任务完成后，显示每个 agent 的完整输出（按 role 标题分组）
- R-AGENT-RUN-06：最终显示汇总行：`Completed in <Xs>  ·  <n> agents  ·  <total> tokens`
- R-AGENT-RUN-07：任务执行期间使用 `AgentBoard` 实时展示各任务状态（TTY）；非 TTY 降级为纯文本日志
- R-AGENT-RUN-08：任意 agent 失败时，打印该任务错误，**继续**执行其他不依赖它的任务，最终汇报失败数量

**AgentBoard 状态显示：**
```
  ┌ Multi-Agent Run ───────────────────────────────
  │ Goal: build a REST API with rate limiting
  │ Mode: sequential  Tasks: 4
  │
  │  🔍 researcher   [task-1]  ✔  2.3s   812 tokens
  │  📋 planner      [task-2]  ✔  1.8s   634 tokens
  │  💻 coder        [task-3]  ⠸ running…
  │  🔎 reviewer     [task-4]  ○ pending
  └────────────────────────────────────────────────
```

#### 7.4.3 `ai agent solo <role> [task]` — 单角色执行

- R-AGENT-SOLO-01：`<role>` 必须是内置角色或已创建的自定义 agent 名，否则报错并提示 `Run: ai agent roles`
- R-AGENT-SOLO-02：task 省略时交互式输入
- R-AGENT-SOLO-03：流式输出，完成后显示时间和 token 用量

#### 7.4.4 自定义 Agent 管理

**创建 (`ai agent create [name]`) 需求：**

- R-AGENT-CREATE-01：name 必须为小写字母、数字、连字符组合，不可与内置角色重名
- R-AGENT-CREATE-02：必填字段：`name`、`systemPrompt`；可选：`description`、`icon`（单个 emoji）、`tags`（逗号分隔）
- R-AGENT-CREATE-03：创建成功后提示用法：`Use: ai agent solo <name> "<task>"`
- R-AGENT-CREATE-04：自动规划器（`agent run`）会将自定义 agent 纳入候选

**编辑 (`ai agent edit <name>`) 需求：**

- R-AGENT-EDIT-01：支持 `--description`、`--prompt`、`--icon`、`--tags` 标志直接修改，省略时进入交互式流程
- R-AGENT-EDIT-02：编辑 systemPrompt 前展示当前提示词的前 200 字符预览

**导出/导入：**

- R-AGENT-EXPORT-01：`export` 输出 JSON 到 stdout，用户可重定向到文件（`> my-agent.json`）
- R-AGENT-IMPORT-01：`import <file>` 导入时若 name 已存在，询问是否覆盖

---

#### 7.4.5 工作流管理 (`ai agent workflow`)

工作流是预定义的 agent 步骤管道，可复用于不同目标。

**工作流 JSON Schema：**
```typescript
interface WorkflowDefinition {
  name: string;
  description: string;
  executionMode: "parallel" | "sequential";
  steps: Array<{
    role: string;           // 角色名（内置或自定义）
    promptTemplate: string; // 支持 {{goal}} 占位符
    dependsOn?: string[];   // 前置步骤的 role 名
  }>;
}
```

**内置模板（`ai agent workflow template`）：**

| 模板名 | 步骤 | 模式 |
|---|---|---|
| `research-code-review` | researcher → coder → reviewer | sequential |
| `parallel-analysis` | researcher + planner（并行）→ synthesizer | mixed |
| `full-pipeline` | researcher → planner → coder → reviewer → synthesizer | sequential |

**需求明细：**

- R-WF-01：`workflow run <name>` 若 name 不存在，尝试作为文件路径加载，都不存在则报错
- R-WF-02：`workflow template <name>` 输出 JSON 到 stdout，便于用户重定向为新工作流文件
- R-WF-03：`promptTemplate` 中的 `{{goal}}` 在执行时替换为用户输入的 goal

---

#### 7.4.6 组织结构 (`ai agent org`)

将自定义 agent 组织为"公司/部门"层级结构，支持按组织单位批量执行。

**需求明细：**

- R-ORG-01：`org show` 以树状图展示公司 → 部门 → agent 的层级
- R-ORG-02：`org run <company> [goal] [--dept <name>]` 将该公司（或指定部门）所有 agent 作为一个团队执行任务
- R-ORG-03：`org list` 显示各公司的 agent 数量、部门数、是否有层级结构

---

#### 7.4.7 记忆管理 (`ai agent memory`)

为每个 agent 和共享内存池提供持久化记忆存储，记忆在 `agent run` / `agent meet` 中自动注入上下文。

**记忆类型：**

| 类型 | 用途 | 生命周期 |
|---|---|---|
| `episodic` | 具体事件记录 | 长期，可被 distill 压缩 |
| `semantic` | 概念/知识点 | 长期 |
| `procedural` | 操作步骤或流程 | 长期 |
| `working` | 当前任务临时状态 | 短期，distill 时清除 |

**重要度评分（importance）：** 0–10 整数，用于过滤低价值记忆

**需求明细：**

- R-MEM-01：`memory list` 不指定 agent 时，列出所有有记忆的 agent
- R-MEM-02：`memory distill [agent]` 调用 AI 压缩旧记忆：合并重复语义记忆、删除 working 类型记忆、为 episodic 记忆生成摘要
- R-MEM-03：`memory stats` 按 agent 展示表格：总条数、各类型数量、平均重要度
- R-MEM-04：`memory shared` 显示所有 agent 可访问的共享记忆池，支持 `--query` 关键字过滤
- R-MEM-05：`memory clear` 不指定 agent 时，二次确认"Clear memories for ALL n agents?"

---

#### 7.4.8 结构化会议 (`ai agent meet`)

让多个 agent 就某个主题进行有结构的对话，生成讨论记录和摘要。

**会议模式：**

| 模式 | 行为 |
|---|---|
| `roundtable` | 轮流发言，每轮每个参与者回应一次（默认） |
| `debate` | 参与者持对立立场进行辩论 |
| `brainstorm` | 开放式发散，每个参与者自由提出想法 |
| `review` | 对提案进行批判性审查 |

**需求明细：**

- R-MEET-01：`meet start` 默认参与者为 `researcher, planner, synthesizer`
- R-MEET-02：`--participants "cto,cfo,engineer"` 支持自定义参与者（可以是自定义 agent 名）
- R-MEET-03：`--rounds <n>` 控制讨论轮次，默认 2 轮
- R-MEET-04：`--no-memory` 禁止将共享记忆注入参与者的上下文
- R-MEET-05：`--no-save-memory` 会议结束后不将洞察保存到共享记忆池
- R-MEET-06：会议过程通过 `MeetingBoard` 实时展示每位参与者的发言（带姓名、图标、时间戳）
- R-MEET-07：`meet show <id>` 支持前缀匹配 ID（只需输入前 8 位）
- R-MEET-08：`meet show <id> --summary` 仅显示 AI 生成的会议摘要（若存在）

---

### 7.5 `ai mcp` — 技能扩展

**用途：** 管理可扩展 Claude 能力的工具技能包（MCP Skills）。启用后，AI 在 `ask` / `chat` / `agent` 命令中可直接调用对应工具。

**内置技能（始终安装，需手动启用）：**

| 技能名 | 工具 | 功能 |
|---|---|---|
| `shell` | `run_command` | 执行 Shell 命令 |
| `files` | `read_file`, `write_file`, `list_directory` | 读写本地文件 |
| `http` | `fetch_url` | 请求 URL / 调用 API |
| `calculator` | `evaluate` | 计算数学表达式 |

**需求明细：**

- R-MCP-01：`mcp list` 显示每个技能的状态（enabled/disabled）、来源（builtin/npm/local）、版本、工具列表
- R-MCP-02：`mcp enable <name>` 成功后提示：`Claude will now have access to its tools in ai ask / ai chat.`
- R-MCP-03：`mcp install <ref>` — `ref` 以 `.` 或 `/` 开头时作为本地路径处理，否则作为 npm 包名处理
- R-MCP-04：npm 包名须符合 `modern-ai-cli-skill-*` 前缀约定（安装时校验）
- R-MCP-05：`mcp remove` 不允许删除内置技能，尝试时报错 `Built-in skills cannot be removed`
- R-MCP-06：`mcp search [query]` 请求远程注册表；注册表不可达时，fallback 显示内置技能列表
- R-MCP-07：`mcp run <tool> --input '{"key":"val"}'` 用于调试，`--input` 必须是合法 JSON
- R-MCP-08：工具调用循环上限为 **10 轮**，超出时停止并返回已有结果

**工具调用可见性：**
- 流式模式下，每次工具调用在输出流中插入内联标注：`[🔧 run_command]`
- 工具返回错误时，内联显示 `[error] <message>`

---

### 7.6 `ai plugin` — 插件管理

**用途：** 管理 Commander.js 命令扩展插件，允许第三方通过 npm 包为 `ai` 添加新的顶层命令。

**插件约定：**
- npm 包名必须符合 `modern-ai-cli-plugin-*` 前缀
- 包必须导出 `register(program: Command): void` 函数
- 插件在 CLI 启动时自动加载（`loadPlugins(program)`）

**子命令：**

| 子命令 | 说明 |
|---|---|
| `plugin list` | 列出已安装插件及其提供的命令 |
| `plugin install <name>` | 从 npm 安装并注册插件 |
| `plugin remove <name>` | 卸载插件 |

**需求明细：**

- R-PLUGIN-01：安装插件后，需要重启 CLI 才能加载新命令（安装完成时提示此说明）
- R-PLUGIN-02：插件加载失败（语法错误、缺少 `register` 导出）时，打印警告但**不阻止** CLI 启动
- R-PLUGIN-03：`plugin list` 若无已安装插件，提示 `No plugins installed. Run: ai plugin install <name>`

---

### 7.7 `ai config` — 配置管理

**用途：** 管理 CLI 的持久化配置项。

**子命令：**

| 子命令 | 别名 | 说明 |
|---|---|---|
| `config show` | `config list` | 显示所有配置项（API key 脱敏为 `***xxxx`） |
| `config set <key> <value>` | — | 设置单个配置项 |
| `config wizard` | `config setup` | 交互式首次配置向导 |
| `config reset [-f]` | — | 重置所有配置到默认值 |
| `config path` | — | 打印配置文件的绝对路径 |

**配置向导流程：**
```
ai config wizard

  ◆ Let's set up your AI CLI

  ✦ Anthropic API key:  ●●●●●●●●●●●●●●●●●●  （密码输入）
  ✦ Default model:
    ❯ claude-opus-4-6   — Most powerful, adaptive thinking
      claude-sonnet-4-6 — Balanced speed & intelligence
      claude-haiku-4-5  — Fastest & most cost-effective
  ✦ Max output tokens:  4096
  ✦ Enable streaming responses?  ● Yes / ○ No
  ✦ Enable chat history?         ● Yes / ○ No

  ◆ Configuration saved to: /home/user/.config/modern-ai-cli/config.json
```

**需求明细：**

- R-CONFIG-01：`config set apiKey` 成功后立即重置 AI 客户端实例（使新 key 生效）
- R-CONFIG-02：`config set model` 仅接受 `claude-opus-4-6 | claude-sonnet-4-6 | claude-haiku-4-5`
- R-CONFIG-03：`config set maxTokens` 接受 256–128000 范围的整数，越界报错
- R-CONFIG-04：`config set streamingEnabled` / `historyEnabled` 接受 `true/false/1/0/yes/no`
- R-CONFIG-05：`config reset` 不带 `-f` 时，弹出确认框，默认选 **No**
- R-CONFIG-06：wizard 中 API key 输入框使用 password 类型（字符显示为 `●`）
- R-CONFIG-07：wizard 中 API key 格式校验：必须以 `sk-ant-` 开头（已有 key 时可留空跳过）

---

### 7.8 `ai whatsnew` — 更新日志

**用途：** 查看产品最新版本的变更内容。

**需求明细：**

- R-WN-01：展示 `CHANGELOG.md` 中最新版本的内容，渲染为 markdown
- R-WN-02：启动时后台检查 npm 最新版本（非阻塞），若有新版本，在命令执行完成后**尾部追加**提示：
  ```
  ╭─────────────────────────────────────────╮
  │  Update available: 0.1.0 → 0.2.0        │
  │  Run: npm i -g modern-ai-cli            │
  ╰─────────────────────────────────────────╯
  ```
- R-WN-03：版本检查结果缓存 24 小时，避免每次启动都发起网络请求

---

## 8. AI 模式规范

模式通过 `--mode` 选项在 `ask` / `chat` / `generate` 命令中使用，决定系统提示词内容。

| 模式 | 描述 | 适用场景 |
|---|---|---|
| `default` | 通用助手，简洁但全面 | 一般性问题 |
| `code` | 专业软件工程师，注重代码质量、类型、最佳实践 | 代码编写、架构设计 |
| `explain` | 耐心的老师，分步拆解复杂概念 | 学习、技术原理解释 |
| `refactor` | 高级代码审查员，提供可操作的重构建议 | 代码优化、质量提升 |
| `debug` | 调试专家，识别根因并给出修复方案 | 排查 bug |
| `creative` | 创意写作助手，适应用户风格 | 文案、故事创作 |
| `shell` | Shell/CLI 专家，输出安全带注释的脚本 | 命令行操作、自动化脚本 |

**模式切换需求：**

- R-MODE-01：`ai chat` 中通过 `/mode` 可随时切换，切换后立即生效（下一条消息起使用新模式）
- R-MODE-02：`--mode` 与 `--system` 同时使用时，`--system` 完全覆盖，`--mode` 被忽略（不报错，静默）

---

## 9. 配置项规范

| 键名 | 类型 | 默认值 | 约束 | 说明 |
|---|---|---|---|---|
| `apiKey` | string | — | 格式 `sk-ant-*` | Anthropic API Key，优先级低于环境变量 `ANTHROPIC_API_KEY` |
| `model` | enum | `claude-opus-4-6` | 见枚举值 | 全局默认模型 |
| `maxTokens` | number | `4096` | 256–128000 | 单次请求最大输出 token 数 |
| `systemPrompt` | string | default 模式提示词 | 非空 | 全局默认系统提示词 |
| `streamingEnabled` | boolean | `true` | — | 是否默认启用流式输出 |
| `historyEnabled` | boolean | `true` | — | 是否自动保存 chat session |
| `historyMaxMessages` | number | `20` | 1–100 | 对话上下文保留的消息对数 |
| `theme` | enum | `"dark"` | `"dark" \| "light"` | UI 色彩主题 |

**配置优先级（高→低）：**
```
CLI 标志（--mode, --system）
  > 环境变量（ANTHROPIC_API_KEY）
    > 持久化配置文件（conf store）
      > 代码默认值
```

---

## 10. 错误处理规范

### 10.1 错误分类与退出码

| 错误类型 | 退出码 | 输出目标 | 示例 |
|---|---|---|---|
| API 调用失败（网络/鉴权/限流） | 1 | stderr | `✖ Error: 401 Unauthorized` |
| 参数错误（未知命令/缺少参数） | 1 | stderr | `✖ Unknown command: foo  Run: ai --help` |
| 用户主动取消（Ctrl+C / clack cancel） | 0 | stdout | `Cancelled.` |
| 配置错误（API key 未设置） | 1 | stderr | `✖ Error: API key not configured. Run: ai config set apiKey YOUR_KEY` |
| 文件操作失败 | 1 | stderr | `✖ Error: ENOENT: no such file` |

### 10.2 具体场景处理

| 场景 | 处理要求 |
|---|---|
| API key 未设置 | 报错并给出 `ai config set apiKey` 或设置 `ANTHROPIC_API_KEY` 的提示 |
| 模型名非法 | 列出所有有效模型名 |
| `--output` 目录不存在 | 报错提示目录路径，不自动创建 |
| `--session` ID 不存在 | 报错，不 fallback 到新 session |
| 工作流文件 JSON 格式错误 | 报错并指出文件路径 |
| agent 角色不存在 | 报错并提示 `Run: ai agent roles` |
| MCP 工具调用超出 10 轮 | 停止循环，返回已有内容，输出警告 |
| 非 TTY 下需要交互输入 | 报错"此命令需要交互式终端，请提供必要参数" |

### 10.3 全局错误捕获

- 顶层 `main()` 的 `catch` 捕获所有未处理异常，输出 `✖ Unexpected error: <message>` 后以退出码 1 退出
- 命令内部的 `catch` 仅在必要时调用 `process.exit(1)`；`ai chat` 中 API 错误**不**调用 `process.exit`

---

## 11. UI 与输出规范

### 11.1 颜色主题

| 语义 | dark 主题 | light 主题 | 用途 |
|---|---|---|---|
| `primary` | 亮青色 | 深青色 | 品牌色、标题 |
| `secondary` | 亮蓝色 | 深蓝色 | 命令示例、次级信息 |
| `success` | 亮绿色 | 深绿色 | 成功操作 |
| `warning` | 亮黄色 | 深黄色 | 警告 |
| `error` | 亮红色 | 深红色 | 错误 |
| `muted` | 灰色 | 暗灰色 | 次要信息、footer |
| `assistant` | 亮紫色 | 深紫色 | Claude 名称标注 |
| `user` | 亮青色 | 深青色 | 用户名称标注 |

### 11.2 图标集

| 图标变量 | 值 | 使用场景 |
|---|---|---|
| `sparkle` | `✦` | 品牌标识 |
| `ai` | `✦` | Claude 发言前缀 |
| `user` | `◆` | 用户发言前缀 |
| `success` | `✔` | 成功操作 |
| `error` | `✖` | 错误 |
| `warning` | `⚠` | 警告 |
| `bullet` | `•` | 列表项 |

### 11.3 Spinner 规范

| 场景 | Spinner 文本 |
|---|---|
| `ai ask` / `ai chat` 等待响应 | `Thinking…` |
| `ai agent` 规划阶段 | `Planning task decomposition…` |
| `ai agent solo` 单 agent 执行 | `<role> agent thinking…` |
| `ai mcp install` | `Installing skill <name>…` |
| `ai mcp search` | `Fetching skill registry…` |
| `ai agent memory distill` | `Distilling memories for <agent>...` |

### 11.4 响应格式化

- 所有 AI 输出通过 `marked` + `marked-terminal` 渲染（支持代码高亮、表格、标题层级）
- 代码块使用终端友好的等宽字体渲染
- 标题（`#`/`##`/`###`）使用加粗 + 对应语义颜色

---

## 12. 非功能性需求

### 12.1 性能

| 指标 | 要求 |
|---|---|
| 首字节延迟（流式） | < 2 秒（正常网络条件） |
| CLI 启动时间 | < 300ms（不含 API 调用） |
| 版本更新检查 | 后台非阻塞，不影响命令执行 |
| 插件加载 | 所有插件并行加载，单个插件加载失败不阻塞启动 |

### 12.2 可靠性

| 场景 | 要求 |
|---|---|
| API 超时 | 返回错误提示，不挂起 |
| 流式中断 | 输出已接收内容，显示 `[stream interrupted]` |
| 配置文件损坏 | 重置为默认值，不崩溃 |
| 工具调用循环 | 最多 10 轮，超出后安全退出 |

### 12.3 可用性

| 要求 | 描述 |
|---|---|
| 帮助完整性 | 每个命令均有 `--help`，包含参数说明和使用示例 |
| 错误可读性 | 错误信息包含：问题描述 + 恢复步骤（`Run: ...`） |
| 进度可见性 | 所有耗时操作（> 0.5s）显示 spinner 或实时进度 |
| 无障碍 | 非 TTY 环境自动降级为纯文本输出，不输出 ANSI 码 |

### 12.4 安全性

| 要求 | 描述 |
|---|---|
| API key 保护 | 不在日志/输出中明文显示 key，仅展示末 4 位 |
| shell 技能 | 执行命令前提示用户确认（危险命令检测） |
| files 技能 | 写入操作前提示目标路径 |

---

## 13. 技术约束

| 约束项 | 值 |
|---|---|
| 运行时 | Node.js ≥ 18，ESM 模式 |
| TypeScript | strict 模式 |
| 模块格式 | ESM only（`"type": "module"`） |
| 支持平台 | Linux x64/arm64、macOS x64/arm64、Windows x64 |
| 二进制打包 | Node 20，通过 `@yao-pkg/pkg` |
| 最大输出 token | 128000（API 上限） |
| 对话上下文保留 | 最大 100 条消息对（配置上限） |

---

## 14. 发布与分发

### 14.1 安装方式

```bash
# npm 全局安装
npm install -g modern-ai-cli

# 或下载预编译二进制（无需 Node.js 环境）
curl -fsSL https://github.com/.../releases/latest/.../linux-x64 -o ai && chmod +x ai
```

### 14.2 首次使用流程

```
1. npm i -g modern-ai-cli
2. ai config wizard          # 配置 API key 和偏好设置
3. ai ask "hello world"      # 验证配置是否正确
4. ai mcp enable shell       # 按需启用工具技能
```

### 14.3 版本与更新

- 版本遵循 [Semantic Versioning](https://semver.org/)
- 通过 `semantic-release` 自动发布，基于 `conventionalcommits`
- 每次启动后台检查是否有新版本，有则在命令结束时尾部展示更新提示
- 更新检查结果缓存 24 小时

### 14.4 二进制构建目标

| 平台 | 架构 | 输出文件 |
|---|---|---|
| Linux | x64 | `modern-ai-cli-linux-x64` |
| Linux | arm64 | `modern-ai-cli-linux-arm64` |
| macOS | x64 | `modern-ai-cli-macos-x64` |
| macOS | arm64 | `modern-ai-cli-macos-arm64` |
| Windows | x64 | `modern-ai-cli-win-x64.exe` |
