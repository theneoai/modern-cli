# NEO

> AI 原生超级终端 — 键盘优先的心流体验个人操作系统

[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](https://github.com/theneoai/modern-cli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

NEO 是一个键盘驱动、AI 原生的终端操作系统。启动即进入全屏 TUI，内置多 AI 提供商支持、7 种专业 Agent、MCP 工具系统和插件扩展机制。

## ✨ 核心特性

### 🤖 AI Agent 系统
- **7 种内置 Agent** — companion（AI 伴侣）、researcher（研究员）、planner（规划师）、coder（工程师）、reviewer（审查员）、writer（作家）、analyst（分析师）
- **记忆隔离策略** — private / shared / group 三种隔离模式
- **对话历史持久化** — 跨会话保留上下文
- **自主执行引擎** — AutonomousEngine 支持多轮自主任务

### 🌐 多 AI Provider 支持
内置 11 个 Provider，开箱即用：

| Provider | 特点 |
|----------|------|
| Anthropic Claude | Claude Opus/Sonnet/Haiku，推荐默认 |
| OpenAI | GPT-4o、o1、o3-mini |
| Google Gemini | 超长上下文，免费额度 |
| DeepSeek | 极低成本，编程能力强 |
| Moonshot (Kimi) | 超长上下文，中文优化 |
| Mistral | 欧洲开源，Codestral 编程专用 |
| Groq | 最快推理速度 (LPU) |
| Ollama | 本地运行，无需 API Key |
| Together AI | 开源模型聚合 |
| OpenCode | 编程专用 AI |
| 自定义 | 任何 OpenAI 兼容端点 |

### 🛠️ MCP 工具系统
- **内置工具** — web_search、http_get、read_file、write_file、run_shell
- **插件注册 API** — `registerSkill()` 接入第三方技能
- **Plugin SDK** — 标准化扩展接口

### 💻 全屏 TUI 界面
- **React + Ink** 驱动的终端 UI
- **布局** — 侧边栏 + 主面板 + 任务面板 + 输入栏 + Stats 面板
- **Command Palette** — Ctrl+P 快速命令
- **Modal 系统** — Help、Confirm、Input 对话框
- **Toast 通知** — 非阻塞消息提示
- **Voice Engine** — 语音交互（STT/TTS）

### 🔌 插件生态
- analytics — 使用分析
- token-counter — Token 用量追踪
- weather-time — 天气时间信息
- messaging — 消息集成
- email-reminder — 邮件提醒

## 📦 安装

### 通过 npm
```bash
npm install -g neocli
```

### 通过二进制（无需 Node）
```bash
# macOS ARM64
curl -L https://github.com/theneoai/modern-cli/releases/latest/download/neo-macos-arm64 -o neo
chmod +x neo
sudo mv neo /usr/local/bin/

# macOS x64
curl -L https://github.com/theneoai/modern-cli/releases/latest/download/neo-macos-x64 -o neo
chmod +x neo
sudo mv neo /usr/local/bin/

# Linux x64
curl -L https://github.com/theneoai/modern-cli/releases/latest/download/neo-linux-x64 -o neo
chmod +x neo
sudo mv neo /usr/local/bin/

# Linux ARM64
curl -L https://github.com/theneoai/modern-cli/releases/latest/download/neo-linux-arm64 -o neo
chmod +x neo
sudo mv neo /usr/local/bin/

# Windows x64
# 下载 neo-win-x64.exe 并添加到 PATH
```

### 从源码构建
```bash
git clone https://github.com/theneoai/modern-cli.git
cd modern-cli
npm install
npm run build
```

## 🚀 快速开始

### 启动 TUI（默认行为）
```bash
neo
# 等同于:
neo tui
neo ui
```

### 配置 AI Provider

```bash
# 添加 Anthropic API Key（推荐）
neo key add anthropic sk-ant-...

# 添加 OpenAI API Key
neo key add openai sk-...

# 或通过环境变量
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
```

### 查看可用 Provider
```bash
neo providers
```

## 📚 CLI 命令参考

NEO 以 TUI 为核心，CLI 提供配置和密钥管理命令：

```bash
neo                          # 启动 TUI（默认）
neo tui / neo ui             # 同上

neo config                   # 列出所有配置
neo config <key>             # 查看某项配置
neo config <key> <value>     # 修改某项配置

neo key list                 # 列出已配置的 API Key
neo key add <provider> <key> # 添加 API Key
neo key rm <provider>        # 删除 API Key

neo providers                # 列出可用 Provider 和模型

neo version                  # 显示版本信息
neo -v / neo --version       # 同上
```

### TUI 内键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+P` | 打开 Command Palette |
| `Ctrl+M` | 切换 AI 模型/Provider |
| `Escape` | 关闭弹窗/取消 |
| `Tab` | 切换焦点 |
| `↑↓` | 滚动 / 选择 |
| `Enter` | 确认 / 发送 |

## 🔧 配置

### 可配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `provider` | `anthropic` | 活跃 AI Provider |
| `model` | `claude-sonnet-4-6` | 活跃模型 |
| `maxTokens` | `4096` | 单次最大输出 Token |
| `temperature` | `0.7` | 生成温度 |
| `streamingEnabled` | `true` | 流式输出 |
| `historyEnabled` | `true` | 保留对话历史 |
| `historyMaxMessages` | `20` | 历史最大条数 |
| `theme` | `dark` | 主题 (dark/light) |

### 配置文件位置
- macOS: `~/Library/Preferences/neocli/config.json`
- Linux: `~/.config/neocli/config.json`
- Windows: `%APPDATA%/neocli/config.json`

## 🏗️ 项目结构

```
src/
├── index.ts                 # CLI 入口 (Commander.js)
├── ai/
│   ├── client.ts            # AI 客户端（流式/非流式）
│   ├── keystore.ts          # API Key 管理
│   ├── prompts.ts           # Prompt 模板
│   └── providers/
│       ├── registry.ts      # Provider 注册（11 个）
│       ├── anthropic-adapter.ts
│       └── openai-compat-adapter.ts
├── mcp/
│   ├── builtins.ts          # 内置工具技能
│   ├── manager.ts           # MCP 工具注册与调度
│   └── types.ts
├── memory/
│   └── agentMemory.ts       # Agent 记忆系统
├── sdk/
│   └── plugin.ts            # 插件 SDK
├── tui/
│   ├── index.ts             # TUI 入口
│   ├── theme.ts             # 主题系统
│   ├── agents/              # Agent 系统（7 内置）
│   ├── companion/           # AI 伴侣 + 语音引擎
│   ├── components/          # React UI 组件
│   ├── contexts/            # React Context
│   ├── hooks/               # 自定义 Hooks
│   ├── intel/               # 情报引擎
│   └── plugins/             # 内置插件
└── utils/
    ├── config.ts            # 配置管理 (conf)
    ├── history.ts           # 历史记录
    └── security.ts          # 安全工具
```

## 🏛️ 架构

```
┌─────────────────────────────────────────────────────────┐
│                    NEO TUI (React + Ink)                  │
│    Sidebar · MainPanel · TaskPanel · CommandPalette       │
├─────────────────────────────────────────────────────────┤
│                   Agent Runtime (7 内置)                  │
│  companion · researcher · planner · coder · reviewer      │
│                   writer · analyst                        │
│         AutonomousEngine · AgentMemory                   │
├─────────────────────────────────────────────────────────┤
│              AI Provider Layer (11 个)                    │
│  Anthropic · OpenAI · Gemini · DeepSeek · Groq · ...    │
├─────────────────────────────────────────────────────────┤
│              MCP 工具系统 + Plugin SDK                    │
│   web_search · http_get · read_file · write_file · shell │
├─────────────────────────────────────────────────────────┤
│               配置 & 存储 (conf · SQLite)                 │
└─────────────────────────────────────────────────────────┘
```

**技术栈**: TypeScript (strict) · ESM · Node 18+ · React 18 · Ink 5 · Commander.js · better-sqlite3 · Playwright · Zod

## 🤝 贡献

```bash
git clone https://github.com/theneoai/modern-cli.git
cd modern-cli
npm install
npm run dev      # 监听构建
npm run build    # 生产构建
npm run lint     # ESLint
npm run typecheck # TypeScript 类型检查
```

## 📄 许可

MIT License © 2026 NEO Contributors

---

<p align="center">
  <i>Star us on GitHub if you find this useful!</i>
</p>
