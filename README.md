# 🚀 HyperTerminal

> 面向未来的超级终端 - AI 原生的个人操作系统

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://github.com/theneoai/modern-cli)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

HyperTerminal 是一个完全键盘驱动、AI 原生的个人操作系统，运行在终端中但拥有现代操作系统的所有能力。

## ✨ 核心特性

### 🤖 AI Agent 系统
- **智能体团队** - 拥有 researcher、planner、coder、reviewer、synthesizer 等内置角色
- **自定义 Agent** - 创建具有独特个性和能力的 AI 助手
- **记忆系统** - 长期记忆、情景记忆、语义记忆
- **多 Agent 协作** - 自动化任务分配和团队协作

### 🏢 组织与社会系统
- **虚拟公司** - 创建和运营 AI 公司
- **组织架构** - 部门、汇报线、权限管理
- **社会模拟** - Agent 间的关系网络、信任度、影响力
- **经济系统** - 内部货币、薪资、预算管理

### ⚡ 工作流自动化
- **可视化编排** - DAG 形式的工作流定义
- **自动代码生成** - 自然语言描述 → 自动创建工具和插件
- **触发器系统** - 时间、事件、Webhook 触发
- **模板市场** - 可复用的工作流模板

### 🛠️ 技能与 MCP
- **内置技能** - Shell、文件、Git、HTTP 等
- **MCP 协议** - 标准化技能接口
- **技能市场** - 发现和使用社区技能
- **权限沙箱** - 安全的技能执行环境

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

## 🚀 快速开始

### 1. 初始化
```bash
hyper init
```

### 2. 查看 Agent 列表
```bash
hyper agent list
```

### 3. 运行任务
```bash
# 让 Coder Agent 写代码
hyper agent run <coder-id> "写一个快速排序算法"

# 让 Researcher 做研究
hyper agent run <researcher-id> "调研最新的 AI 模型"
```

### 4. 创建组织
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
```

### 组织管理
```bash
hyper org list                # 列出组织
hyper org create <name>       # 创建组织
hyper org show <id>           # 显示详情
hyper org join <org> <agent>  # 添加成员
hyper org chart <id>          # 组织架构图
```

### 配置管理
```bash
hyper config show             # 显示配置
hyper config path             # 配置文件路径
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

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     HyperTerminal UI                        │
├─────────────────────────────────────────────────────────────┤
│                     Agent Runtime                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐   │
│  │ Agent A │ │ Agent B │ │ Agent C │ │     Memory      │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Organization Engine                      │
├─────────────────────────────────────────────────────────────┤
│                   Workflow Engine                           │
├─────────────────────────────────────────────────────────────┤
│                      MCP Layer                              │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer (SQLite)                      │
└─────────────────────────────────────────────────────────────┘
```

## 🛣️ 路线图

### v0.2 (当前)
- ✅ 基础 CLI 框架
- ✅ Agent 系统（CRUD + 执行）
- ✅ 组织系统
- ✅ 数据持久化

### v0.3 (计划中)
- 🔄 交互式 TUI 界面
- 🔄 工作流引擎
- 🔄 记忆系统完善
- 🔄 MCP 技能系统

### v0.5 (计划中)
- 📋 多 Agent 编排
- 📋 自动代码生成
- 📋 社会模拟系统
- 📋 经济系统

### v1.0 (计划中)
- 📋 完整社会模拟
- 📋 虚拟城镇
- 📋 技能市场
- 📋 插件生态

## 🤝 贡献

欢迎提交 Issue 和 PR！

```bash
git clone https://github.com/theneoai/modern-cli.git
cd modern-cli
npm install
npm run dev
```

## 📄 许可

MIT License © 2026 HyperTerminal Contributors

---

<p align="center">
  <i>🌟 Star us on GitHub if you find this useful!</i>
</p>
