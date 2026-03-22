# 🚀 HyperTerminal

> 面向未来的超级终端 - AI 原生的个人操作系统

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/theneoai/modern-cli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-81%20passing-brightgreen.svg)](https://github.com/theneoai/modern-cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)

HyperTerminal 是一个完全键盘驱动、AI 原生的个人操作系统，运行在终端中但拥有现代操作系统的所有能力。20+ 功能子系统，50+ CLI 命令，约 15,000 行 TypeScript。

## ✨ 核心特性

### 🤖 AI Agent 系统
- **5 种内置角色** — researcher、planner、coder、reviewer、synthesizer
- **多 Agent 编排** — manager-worker、协作、竞争三种策略
- **记忆系统** — 情景记忆、语义记忆、程序记忆、工作记忆
- **自定义 Agent** — 创建具有独特个性和能力的 AI 助手

### ⚡ 工作流与自动化
- **工作流引擎** — DAG 形式，支持顺序/并行/条件/循环节点
- **自动化规则** — 事件驱动的条件-动作规则系统
- **任务调度器** — Cron 定时任务，持久化存储
- **自然语言命令** — 用自然语言驱动 CLI

### 🛠️ 技能与 MCP
- **技能注册** — MCP 兼容的技能系统，支持自动发现
- **内置技能** — Shell、文件、Git、HTTP
- **浏览器自动化** — Playwright 驱动的 Web 自动化
- **GitHub 集成** — Issue/PR 同步与 Commit 分析

### 🏢 组织与经济系统
- **虚拟公司** — 创建和运营 AI 公司
- **组织架构** — 部门、汇报线、权限管理
- **经济系统** — HTC（HyperTerminal Credits）内部货币

### 🧠 知识与数据
- **知识图谱** — 实体-关系数据库，支持路径查找和语义搜索
- **日志分析** — 模式提取、异常检测、统计分析
- **审计日志** — 完整的操作追踪与严重性分级
- **数据可视化** — 图表、仪表板、指标展示

### 💻 终端界面 (TUI)
- **全屏 TUI** — React 驱动的终端 UI，含侧边栏、任务面板、命令面板
- **响应式布局** — 自适应终端大小
- **Command Palette** — Tab/Ctrl+P 快速启动命令
- **语音界面** — STT/TTS，支持热词唤醒（"Hey Hyper"）

## 📦 安装

### 通过 npm
```bash
npm install -g hyperterminal
```

### 通过二进制（无需 Node）
```bash
# macOS ARM64
curl -L https://github.com/theneoai/modern-cli/releases/latest/download/hyper-macos-arm64 -o hyper
chmod +x hyper
sudo mv hyper /usr/local/bin/

# Linux x64
curl -L https://github.com/theneoai/modern-cli/releases/latest/download/hyper-linux-x64 -o hyper
chmod +x hyper
sudo mv hyper /usr/local/bin/
```

### 从源码构建
```bash
git clone https://github.com/theneoai/modern-cli.git
cd modern-cli
npm install
npm run build
```

## 🚀 快速开始

### 1. 初始化
```bash
hyper init
```

### 2. 启动交互式 TUI
```bash
hyper tui
```

### 3. 运行 Agent 任务
```bash
# 让 Coder Agent 写代码
hyper agent run <coder-id> "写一个快速排序算法"

# 让 Researcher 做研究
hyper agent run <researcher-id> "调研最新的 AI 模型"

# 多 Agent 协作
hyper orchestrate run "设计并实现一个 REST API"
```

### 4. 自然语言命令
```bash
hyper ask "显示所有 agents"
hyper ask "系统状态如何"
hyper ask "备份数据"
```

### 5. 创建组织
```bash
hyper org create "My AI Team" --type company
hyper org join <org-id> <agent-id> --department "Engineering" --role "Lead"
```

## 📚 命令参考

### Agent 管理
```bash
hyper agent list              # 列出所有 Agent
hyper agent create <name>     # 创建新 Agent
hyper agent run <id> <task>   # 执行任务
hyper agent delete <id>       # 删除 Agent
hyper agent templates         # 查看模板
hyper orchestrate run <task>  # 多 Agent 编排
```

### 工作流
```bash
hyper workflow list           # 列出工作流
hyper workflow create <name>  # 创建工作流
hyper workflow run <id>       # 运行工作流
hyper scheduler list          # 查看定时任务
```

### 记忆与知识
```bash
hyper memory list             # 查看记忆
hyper memory search <query>   # 搜索记忆
hyper knowledge search <q>    # 搜索知识图谱
hyper knowledge entity add    # 添加知识实体
hyper knowledge visualize     # 可视化知识图谱
```

### 组织管理
```bash
hyper org list                # 列出组织
hyper org create <name>       # 创建组织
hyper org show <id>           # 显示详情
hyper org join <org> <agent>  # 添加成员
hyper org chart <id>          # 组织架构图
```

### 数据管理
```bash
hyper backup create           # 创建备份
hyper backup export           # 导出数据
hyper backup import <file>    # 导入数据
hyper search <query>          # 全局搜索
hyper audit list              # 查看审计日志
hyper apikey list             # 管理 API 密钥
```

### 系统管理
```bash
hyper monitor status          # 系统状态
hyper analytics health        # 健康检查
hyper profile                 # 性能分析
hyper logs query              # 日志查询
hyper notify list             # 通知管理
hyper config show             # 显示配置
```

### 集成工具
```bash
hyper github sync             # GitHub 同步
hyper browser open <url>      # 浏览器自动化
hyper docs generate           # 生成文档
hyper test generate <file>    # 生成测试
hyper voice start             # 启动语音界面
```

## 🔧 配置

### 设置 API Key
```bash
# 通过环境变量
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
```

### 配置文件位置
- macOS: `~/Library/Preferences/hyperterminal-nodejs/config.json`
- Linux: `~/.config/hyperterminal-nodejs/config.json`
- Windows: `%APPDATA%/hyperterminal-nodejs/config.json`
- 数据库: `~/.hyperterminal/data.db`

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     HyperTerminal TUI                        │
│         (React-based · Command Palette · Voice I/O)          │
├─────────────────────────────────────────────────────────────┤
│                     Agent Runtime                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Agent A  │ │ Agent B  │ │ Agent C  │ │ Memory Store │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│           Orchestration & Automation Layer                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Workflow │ │Scheduler │ │Automation│ │  Org Engine  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                  Knowledge & Analytics                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │Knowledge │ │   Logs   │ │  Audit   │ │  Monitoring  │   │
│  │  Graph   │ │Analytics │ │  Trail   │ │              │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│              Skills & Integrations (MCP)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │  Shell   │ │  GitHub  │ │ Browser  │ │   AI Models  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer (SQLite · WAL)                  │
└─────────────────────────────────────────────────────────────┘
```

**技术栈**: TypeScript (strict) · ESM · Node 18+ · SQLite · Playwright · React TUI

## 🛣️ 路线图

### v0.2 (当前 ✅)
- ✅ 完整 CLI 框架（50+ 命令）
- ✅ AI Agent 系统（5 角色 + 多 Agent 编排）
- ✅ 工作流引擎（DAG + 自动化规则）
- ✅ 记忆系统（4 种记忆类型）
- ✅ 知识图谱
- ✅ 交互式 TUI 界面
- ✅ 组织与经济系统
- ✅ 集成工具（GitHub、浏览器、语音）
- ✅ 数据持久化（SQLite）
- ✅ 81 项测试全部通过

### v0.3 (开发中 🔄)
- 🔄 团队协作空间
- 🔄 实时通讯（频道、消息、线程）
- 🔄 可视化工作流编排器
- 🔄 个人任务与日历视图
- 🔄 WebSocket 实时推送

### v0.5 (计划中 📋)
- 📋 AI 智能摘要与行动项提取
- 📋 团队数据仪表板
- 📋 SSO 与数据加密
- 📋 代码 AI Review 自动化

### v1.0 (愿景 🌟)
- 🌟 虚拟工作空间（3D 办公室）
- 🌟 插件与技能市场
- 🌟 自主 Agent（24/7 运行）
- 🌟 完整社会模拟

## 🤝 贡献

欢迎提交 Issue 和 PR！

```bash
git clone https://github.com/theneoai/modern-cli.git
cd modern-cli
npm install
npm run dev
```

详见 [完整文档](docs/) | [快速入门](docs/QUICKSTART.md) | [使用指南](docs/USAGE.md) | [架构设计](docs/ARCHITECTURE.md)

## 📄 许可

MIT License © 2026 HyperTerminal Contributors

---

<p align="center">
  <i>Star us on GitHub if you find this useful!</i>
</p>
