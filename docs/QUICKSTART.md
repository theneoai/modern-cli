# HyperTerminal 快速入门

## 🚀 5 分钟上手

### 1. 安装和初始化

```bash
cd modern-cli
npm install
npm run build
./bin/dev.js init
```

### 2. 第一个 Agent

```bash
# 查看默认 agent
hyper agent list

# 运行 agent
hyper agent run assistant "你好，HyperTerminal!"
```

### 3. 第一个工作流

```bash
# 创建工作流
hyper workflow create hello-world

# 运行工作流
hyper workflow run hello-world
```

---

## 📋 常用命令速查

### Agent
```bash
hyper agent list              # 列出 agents
hyper agent create <name>     # 创建 agent
hyper agent run <id> <task>   # 运行 agent
```

### 工作流
```bash
hyper workflow list           # 列出工作流
hyper workflow create <name>  # 创建工作流
hyper workflow run <id>       # 运行工作流
```

### 记忆
```bash
hyper memory list             # 查看记忆
hyper memory search <query>   # 搜索记忆
```

### 系统
```bash
hyper monitor status          # 系统状态
hyper backup create           # 创建备份
hyper search <query>          # 全局搜索
```

### 自然语言
```bash
hyper ask "显示所有 agents"
hyper ask "系统状态如何"
hyper ask "备份数据"
```

---

## 💡 3 个实用场景

### 场景 1：快速研究

```bash
# 创建研究团队
hyper template presets
hyper template apply research-team

# 运行研究任务
hyper orchestrate run "研究 AI 最新进展"
```

### 场景 2：代码审查

```bash
# 运行代码审查工作流
hyper workflow run code-review --input '{"file": "src/index.ts"}'

# 生成测试
hyper test generate src/index.ts
```

### 场景 3：知识整理

```bash
# 添加知识
hyper knowledge entity add "概念名称" --type concept

# 搜索知识
hyper knowledge search "关键词"

# 可视化
hyper knowledge visualize
```

---

## 🎨 快捷操作

### 别名 (Aliases)

```bash
# 创建快捷命令
hyper alias create agents "agent list"
hyper alias create status "monitor status"

# 使用
hyper agents
hyper status
```

### 收藏 (Favorites)

```bash
# 收藏常用 agent
hyper favorite add agent my-agent "常用 Agent"

# 查看收藏
hyper favorite list
```

---

## ❓ 常见问题

**Q: 如何查看帮助？**
```bash
hyper --help
hyper <command> --help
```

**Q: 如何调试问题？**
```bash
hyper logs query --level error
hyper audit list
```

**Q: 数据存储在哪里？**
```
~/.hyperterminal/data.db
```

---

更多详情请看 [完整使用指南](./USAGE.md)
