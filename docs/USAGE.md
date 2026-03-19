# HyperTerminal 使用指南

> AI-native 个人操作系统 - 完整使用手册

## 📦 安装

### 从源码运行

```bash
# 克隆仓库
git clone https://github.com/theneoai/modern-cli.git
cd modern-cli

# 安装依赖
npm install

# 构建
npm run build

# 运行
node dist/index.js --help
```

### 初始化系统

```bash
# 初始化数据库和配置
hyper init

# 或使用向导进行详细配置
hyper init --wizard
```

---

## 🚀 快速开始

### 1. 创建第一个 Agent

```bash
# 列出默认 agent
hyper agent list

# 创建自定义 agent
hyper agent create my-assistant --role assistant

# 运行 agent
hyper agent run my-assistant "帮我总结今天的任务"
```

### 2. 创建工作流

```bash
# 创建工作流
hyper workflow create my-pipeline

# 查看工作流
hyper workflow list

# 运行工作流
hyper workflow run my-pipeline
```

### 3. 使用自然语言

```bash
# 直接用自然语言操作
hyper ask "列出所有 agents"
ask "显示系统状态"
ask "创建一个叫 researcher 的 agent"
```

---

## 📋 核心命令详解

### Agent 管理

```bash
# 查看所有 agent
hyper agent list

# 按角色筛选
hyper agent list --role coder

# 创建 agent
hyper agent create <name> [options]
  --role <role>        # 角色: researcher, planner, coder, reviewer, synthesizer
  --model <model>      # 指定 AI 模型
  --prompt <prompt>    # 系统提示词

# 运行 agent 执行任务
hyper agent run <id> "任务描述"

# 删除 agent
hyper agent delete <id>

# 查看 agent 详情
hyper agent show <id>
```

### 工作流管理

```bash
# 列出工作流
hyper workflow list

# 创建工作流
hyper workflow create <name>
  --type <type>        # sequential, parallel, conditional

# 运行工作流
hyper workflow run <id> [options]
  --input <json>       # 输入参数

# 查看工作流详情
hyper workflow show <id>

# 可视化工作流
hyper workflow visualize <id> --output workflow.svg

# 删除工作流
hyper workflow delete <id>
```

### 记忆管理

```bash
# 查看记忆
hyper memory list [agent-id]

# 搜索记忆
hyper memory search "关键词"

# 添加记忆
hyper memory add "内容" --tags "重要,待办"

# 删除记忆
hyper memory delete <id>
```

### 知识图谱

```bash
# 添加实体
hyper knowledge entity add "TypeScript" --type concept
hyper knowledge entity add "React" --type concept

# 创建关系
hyper knowledge relate "TypeScript" "JavaScript" --type superset_of
hyper knowledge relate "React" "JavaScript" --type built_with

# 搜索知识
hyper knowledge search "编程语言"

# 查找路径
hyper knowledge path "TypeScript" "React"

# 可视化图谱
hyper knowledge visualize --output graph.svg
```

---

## 🔧 系统管理

### 监控和日志

```bash
# 查看系统状态
hyper monitor status

# 启动监控守护进程
hyper monitor start --interval 5

# 查看日志
hyper logs query --level error --limit 20

# 查看日志统计
hyper logs stats

# 查看审计日志
hyper audit list --limit 50
```

### 备份和恢复

```bash
# 创建备份
hyper backup create

# 列出备份
hyper backup list

# 恢复备份
hyper backup restore ./backups/hyperterminal-backup-xxx.json

# 导出数据
hyper backup export ./export.json --agents --workflows --memories

# 导入数据
hyper backup import ./export.json --merge
```

### 数据库迁移

```bash
# 查看迁移状态
hyper migrate status

# 应用迁移
hyper migrate up

# 回滚迁移
hyper migrate down 1

# 验证数据库完整性
hyper migrate verify
```

---

## 🤖 AI 模型管理

```bash
# 列出模型
hyper model list

# 添加 OpenAI 模型
hyper model add gpt-4o \
  --provider openai \
  --model-id gpt-4o \
  --cost-in 0.005 \
  --cost-out 0.015

# 添加 Anthropic 模型
hyper model add claude-sonnet \
  --provider anthropic \
  --model-id claude-3-5-sonnet-20241022 \
  --cost-in 0.003 \
  --cost-out 0.015

# 设置默认模型
hyper model default <id>

# 查看使用统计
hyper model stats
```

---

## ⚡ 自动化

### 创建自动化规则

```bash
# 列出规则
hyper automation list

# 创建规则
hyper automation create "high-cpu-alert" \
  --trigger metric \
  --condition '{"metric": "cpu", "operator": "gt", "value": 80}' \
  --action notify

# 手动执行规则
hyper automation run <id>

# 启用/禁用规则
hyper automation toggle <id>
```

### 任务调度

```bash
# 列出定时任务
hyper scheduler list

# 创建定时任务（每天 9 点执行）
hyper scheduler create "daily-report" \
  --cron "0 9 * * *" \
  --type workflow \
  --target report-generator

# 启动调度器
hyper scheduler start
```

---

## 🏷️ 标签和收藏

```bash
# 创建标签
hyper tag create "重要" --color "#ff0000"
hyper tag create "待办" --color "#00ff00"

# 给实体打标签
hyper tag add agent my-agent "重要"

# 按标签查找
hyper tag find "重要"

# 添加到收藏
hyper favorite add agent my-agent "My Agent"

# 查看收藏
hyper favorite list
```

---

## 🎨 模板系统

```bash
# 列出模板
hyper template list

# 应用模板
hyper template apply <id>

# 创建内置模板
hyper template presets
```

可用模板：
- `Research Team` - 研究团队配置
- `Code Review Pipeline` - 代码审查流程
- `Content Creation Team` - 内容创作团队
- `Data Processing Workflow` - 数据处理工作流

---

## 🔍 全局搜索

```bash
# 搜索所有实体
hyper search "关键词"

# 按类型搜索
hyper search "agent" --types agent,workflow

# 限制结果数
hyper search "test" --limit 10
```

---

## 📊 分析和报告

```bash
# 查看系统健康度
hyper analytics health

# 查看洞察
hyper analytics insights

# 查看趋势
hyper analytics trend agent-executions --days 7
hyper analytics trend cpu-usage --days 1

# 导出分析报告
hyper analytics export --format json > report.json
```

---

## 🌐 浏览器自动化

```bash
# 打开网页
hyper browser open https://example.com

# 截图
hyper browser screenshot https://example.com --output screenshot.png

# 执行脚本
hyper browser script navigate.js
```

---

## 💬 评论和协作

```bash
# 查看评论
hyper comment list agent my-agent

# 添加评论
hyper comment add agent my-agent "这个 agent 表现很好"

# 添加带作者的评论
hyper comment add workflow my-flow "需要优化" --author "Alice"
```

---

## ⚙️ 偏好设置

```bash
# 查看当前设置
hyper prefs show

# 修改主题
hyper prefs set theme dark

# 修改语言
hyper prefs set language zh-CN

# 重置为默认
hyper prefs reset
```

---

## 🔑 API 密钥管理

```bash
# 列出 API 密钥
hyper apikey list

# 创建新密钥
hyper apikey create "My App" --scopes "read,write" --days 30

# 轮换密钥
hyper apikey rotate <id>

# 撤销密钥
hyper apikey revoke <id>

# 查看统计
hyper apikey stats
```

---

## 📦 批量操作

```bash
# 列出批量任务
hyper batch list

# 创建批量删除任务
hyper batch create "cleanup-old-agents" \
  --operation delete \
  --type agent

# 创建批量标签任务
hyper batch create "tag-all-workflows" \
  --operation tag \
  --type workflow \
  --tags "production"

# 执行批量任务
hyper batch run <id>
```

---

## 🎯 使用示例

### 示例 1：研究团队设置

```bash
# 1. 创建研究团队成员
hyper agent create researcher-1 --role researcher
hyper agent create researcher-2 --role researcher
hyper agent create synthesizer --role synthesizer

# 2. 创建研究工作流
hyper workflow create research-pipeline

# 3. 运行多智能体编排
hyper orchestrate run "研究量子计算最新进展"
```

### 示例 2：代码审查流程

```bash
# 1. 应用代码审查模板
hyper template presets
hyper template apply code-review-pipeline

# 2. 运行审查工作流
hyper workflow run code-review-pipeline --input '{"pr": 123}'

# 3. 生成文档
hyper docs generate --input src/ --output docs/

# 4. 生成测试
hyper test generate src/utils.ts
```

### 示例 3：知识管理

```bash
# 1. 添加知识实体
hyper knowledge entity add "Python" --type "programming-language"
hyper knowledge entity add "Django" --type "framework"

# 2. 建立关系
hyper knowledge relate "Django" "Python" --type built_with

# 3. 搜索相关知识
hyper knowledge search "web 开发"

# 4. 导出知识图谱
hyper knowledge export --output knowledge.json
```

### 示例 4：监控和警报

```bash
# 1. 启动监控
hyper monitor start --interval 5

# 2. 创建警报规则
hyper automation create "cpu-alert" \
  --trigger metric \
  --condition '{"metric": "cpu", "threshold": 80}' \
  --action notify

# 3. 查看系统状态
hyper monitor status

# 4. 查看分析报告
hyper analytics health
```

---

## 💡 提示和技巧

### 使用别名加速操作

```bash
# 创建常用别名
hyper alias create agents "agent list"
hyper alias create status "monitor status"
hyper alias create backup-now "backup create"

# 使用别名
hyper agents
hyper status
hyper backup-now
```

### 使用自然语言

```bash
# 直接用中文提问
hyper ask "显示所有 agents"
hyper ask "创建一个叫 helper 的 agent"
hyper ask "备份数据"
```

### 快捷命令

```bash
# 快速查看收藏
hyper favorite list

# 快速搜索
hyper search "重要"

# 快速查看活动
hyper activity feed --limit 10
```

---

## ❓ 故障排除

### 数据库锁定

```bash
# 如果数据库被锁定，尝试关闭其他进程
# 或删除 WAL 文件后重启
rm ~/.hyperterminal/data.db-wal
rm ~/.hyperterminal/data.db-shm
hyper init
```

### 性能问题

```bash
# 清理旧数据
hyper audit clean 30
hyper monitor clean 7

# 查看性能分析
hyper profile stats
```

### 恢复出厂设置

```bash
# 备份数据
hyper backup create

# 重置数据库
hyper migrate reset

# 重新初始化
hyper init
```

---

## 📚 更多资源

- [功能概览](./FEATURES.md)
- [开发总结](./FINAL_SUMMARY.md)
- [CHANGELOG](../CHANGELOG.md)

---

**Happy Hacking! 🚀**
