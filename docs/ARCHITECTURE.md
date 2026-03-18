# HyperTerminal 系统架构设计

## 系统概览

HyperTerminal 采用分层架构设计，从底层数据到上层 UI 清晰分离，确保可扩展性和可维护性。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │   Terminal   │ │   TUI App    │ │   Web View   │ │  API Server│ │
│  │   (Main)     │ │   (Dashboard)│ │   (Optional) │ │  (External)│ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         CORE LAYER                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │    Shell     │ │    Agent     │ │   Workflow   │ │   Org      │ │
│  │   Engine     │ │    System    │ │    Engine    │ │  Engine    │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         SERVICE LAYER                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │     LLM      │ │     MCP      │ │    Memory    │ │   Event    │ │
│  │   Service    │ │   Registry   │ │   Service    │ │   Bus      │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │    SQLite    │ │  Vector DB   │ │    Graph     │ │    File    │ │
│  │  (Primary)   │ │  (Embedding) │ │    (Neo4j)   │ │  (Binary)  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## 模块详细设计

### 1. Shell Engine (核心交互)

```typescript
// 命令解析器
interface CommandParser {
  parse(input: string): ParsedCommand;
  registerCommand(cmd: Command): void;
  getCompletions(prefix: string): Completion[];
}

// 渲染引擎
interface RenderEngine {
  render(output: Output): void;
  clear(): void;
  setMode(mode: 'chat' | 'board' | 'editor'): void;
}

// 快捷键管理
interface KeyBinding {
  key: string;
  context: string;
  action: () => void;
  description: string;
}
```

### 2. Agent System (智能体系统)

```typescript
// Agent 定义
interface Agent {
  id: string;
  name: string;
  role: string;
  personality: Personality;
  
  // 能力
  model: LLMConfig;
  skills: Skill[];
  memory: MemorySystem;
  
  // 状态
  state: AgentState;
  metrics: AgentMetrics;
  
  // 方法
  think(input: string): Promise<Thought>;
  act(action: Action): Promise<Result>;
  communicate(message: Message): Promise<Response>;
}

// Agent 状态机
interface AgentState {
  status: 'idle' | 'working' | 'thinking' | 'meeting' | 'resting';
  energy: number;      // 0-100
  focus: number;       // 0-100
  mood: number;        // -100 to 100
  currentTask?: Task;
}

// 记忆系统
interface MemorySystem {
  // 工作记忆 (短期)
  working: WorkingMemory;
  
  // 情景记忆 (中期)
  episodic: EpisodicMemory;
  
  // 语义记忆 (长期)
  semantic: SemanticMemory;
  
  // 程序记忆 (技能)
  procedural: ProceduralMemory;
  
  // 方法
  remember(event: Event): Promise<void>;
  recall(query: string): Promise<Memory[]>;
  consolidate(): Promise<void>;
}
```

### 3. Organization Engine (组织引擎)

```typescript
// 组织实体
interface Organization {
  id: string;
  name: string;
  type: 'company' | 'team' | 'community';
  
  // 结构
  departments: Department[];
  hierarchy: Tree<Agent>;
  
  // 文化
  values: string[];
  mission: string;
  
  // 经济
  budget: Currency;
  assets: Asset[];
}

// 部门
interface Department {
  id: string;
  name: string;
  function: DepartmentFunction;
  head: Agent;
  members: Agent[];
  budget: Currency;
  goals: Goal[];
}

// 社会图谱
interface SocialGraph {
  // 关系网络
  relationships: Relationship[];
  
  // 信任矩阵
  trustMatrix: Matrix<Agent, Agent, number>;
  
  // 影响力
  influence: Map<Agent, number>;
  
  // 社群
  communities: Community[];
}

// 经济系统
interface Economy {
  // 货币
  currency: string;
  
  // 市场
  taskMarket: TaskMarket;
  skillMarket: SkillMarket;
  
  // 交易
  transactions: Transaction[];
  
  // 统计
  gdp: number;
  circulation: number;
}
```

### 4. Workflow Engine (工作流引擎)

```typescript
// 工作流定义
interface Workflow {
  id: string;
  name: string;
  description: string;
  
  // DAG 结构
  nodes: Node[];
  edges: Edge[];
  
  // 配置
  triggers: Trigger[];
  variables: Variable[];
  
  // 元数据
  version: string;
  author: string;
  tags: string[];
}

// 节点类型
interface Node {
  id: string;
  type: 'agent' | 'skill' | 'condition' | 'loop' | 'delay' | 'parallel';
  config: NodeConfig;
  position: Position;
}

// 执行上下文
interface ExecutionContext {
  workflowId: string;
  runId: string;
  variables: Map<string, any>;
  state: ExecutionState;
  log: ExecutionLog;
}

// 自动化生成
interface AutoGenerator {
  // 自然语言 → 工作流
  generateWorkflow(description: string): Promise<Workflow>;
  
  // 需求 → Agent
  generateAgent(requirements: string): Promise<Agent>;
  
  // 问题 → 技能
  generateSkill(problem: string): Promise<Skill>;
}
```

### 5. MCP Registry (技能系统)

```typescript
// 技能定义
interface Skill {
  id: string;
  name: string;
  version: string;
  
  // 元数据
  description: string;
  author: string;
  tags: string[];
  
  // 接口
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  
  // 实现
  implementation: SkillImplementation;
  
  // 权限
  permissions: Permission[];
  sandbox: SandboxConfig;
}

// 技能实现
interface SkillImplementation {
  type: 'javascript' | 'python' | 'wasm' | 'docker';
  code: string;
  entry: string;
  dependencies: Dependency[];
}

// 技能组合
interface CompositeSkill extends Skill {
  subSkills: Skill[];
  orchestration: OrchestrationLogic;
}
```

## 数据模型

### 核心实体关系

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    User     │◄─────►│   Agent     │◄─────►│   Task      │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     │                     │
       │                     │                     │
       ▼                     ▼                     ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│Organization │◄─────►│  Memory     │       │  Workflow   │
└─────────────┘       └─────────────┘       └─────────────┘
       │                     ▲                     ▲
       │                     │                     │
       ▼                     │                     │
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  Society    │◄─────►│   Skill     │◄─────►│   Event     │
└─────────────┘       └─────────────┘       └─────────────┘
```

### 数据库 Schema (SQLite)

```sql
-- 核心实体
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  config JSON NOT NULL,
  state JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config JSON NOT NULL,
  economy JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  definition JSON NOT NULL,
  version TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 关系
CREATE TABLE agent_org (
  agent_id TEXT REFERENCES agents(id),
  org_id TEXT REFERENCES organizations(id),
  department TEXT,
  role TEXT,
  reports_to TEXT,
  PRIMARY KEY (agent_id, org_id)
);

CREATE TABLE social_relations (
  from_agent TEXT REFERENCES agents(id),
  to_agent TEXT REFERENCES agents(id),
  type TEXT NOT NULL,
  strength REAL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_agent, to_agent, type)
);

-- 记忆
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  importance REAL NOT NULL,
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 任务与执行
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  assignee_id TEXT REFERENCES agents(id),
  workflow_id TEXT REFERENCES workflows(id),
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  data JSON NOT NULL,
  result JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSON NOT NULL,
  source TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 事件驱动架构

### 事件总线

```typescript
interface EventBus {
  emit(event: Event): void;
  on(pattern: string, handler: EventHandler): Subscription;
  once(pattern: string, handler: EventHandler): void;
}

// 核心事件类型
type CoreEvents =
  | { type: 'agent.created'; payload: { agentId: string } }
  | { type: 'agent.state.changed'; payload: { agentId: string; from: State; to: State } }
  | { type: 'agent.message.received'; payload: { agentId: string; message: Message } }
  | { type: 'task.assigned'; payload: { taskId: string; agentId: string } }
  | { type: 'task.completed'; payload: { taskId: string; result: Result } }
  | { type: 'workflow.triggered'; payload: { workflowId: string; context: Context } }
  | { type: 'workflow.completed'; payload: { workflowId: string; runId: string } }
  | { type: 'economy.transaction'; payload: { from: string; to: string; amount: number } };
```

## 扩展架构

### 插件系统

```typescript
interface Plugin {
  name: string;
  version: string;
  
  // 生命周期
  activate(context: PluginContext): void;
  deactivate(): void;
  
  // 贡献点
  commands?: Command[];
  skills?: Skill[];
  agents?: AgentTemplate[];
  workflows?: WorkflowTemplate[];
  themes?: Theme[];
}

interface PluginContext {
  // API 访问
  registerCommand(cmd: Command): void;
  registerSkill(skill: Skill): void;
  subscribeEvent(pattern: string, handler: EventHandler): void;
  
  // 服务访问
  getService<T>(name: string): T;
  
  // 存储
  getStorage(namespace: string): Storage;
}
```

### MCP 协议实现

```typescript
// MCP Server 接口
interface MCPServer {
  // 工具
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: any): Promise<ToolResult>;
  
  // 资源
  listResources(): Promise<Resource[]>;
  readResource(uri: string): Promise<ResourceContent>;
  
  // 提示
  listPrompts(): Promise<Prompt[]>;
  getPrompt(name: string, args: any): Promise<PromptContent>;
}

// 内置 MCP 服务器
const BuiltinMCPServers = {
  filesystem: FileSystemServer,
  shell: ShellServer,
  web: WebServer,
  git: GitServer,
  database: DatabaseServer,
};
```

## 安全架构

### 沙箱机制

```typescript
interface Sandbox {
  // 执行环境隔离
  execute(code: string, context: SandboxContext): Promise<any>;
  
  // 资源限制
  limits: {
    memory: number;      // MB
    cpu: number;         // milliseconds
    timeout: number;     // milliseconds
    network: boolean;    // allow network?
    filesystem: 'none' | 'readonly' | 'readwrite';
  };
}

// 权限系统
interface Permission {
  resource: string;
  action: 'read' | 'write' | 'execute' | 'admin';
  condition?: (context: Context) => boolean;
}
```

## 部署架构

### 本地优先模式 (默认)

```
┌─────────────────────────────────────┐
│         User's Computer             │
│  ┌─────────────────────────────┐   │
│  │     HyperTerminal App       │   │
│  │  ┌─────────┐  ┌──────────┐  │   │
│  │  │  Core   │  │  Agents  │  │   │
│  │  │  Logic  │  │          │  │   │
│  │  └─────────┘  └──────────┘  │   │
│  │  ┌─────────┐  ┌──────────┐  │   │
│  │  │ SQLite  │  │ VectorDB │  │   │
│  │  │ (Local) │  │ (Local)  │  │   │
│  │  └─────────┘  └──────────┘  │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
              │
              │ (API calls)
              ▼
    ┌─────────────────────┐
    │   External LLM API  │
    │  (OpenAI/Claude/etc)│
    └─────────────────────┘
```

### 混合模式 (可选)

```
┌─────────────────┐      ┌─────────────────────────────────────┐
│  User Device    │◄────►│        HyperTerminal Cloud          │
│  (Thin Client)  │      │  ┌─────────┐  ┌─────────┐  ┌──────┐ │
│                 │      │  │ Agent   │  │ Shared  │  │ Sync │ │
│                 │      │  │ Runtime │  │ Memory  │  │      │ │
│                 │      │  └─────────┘  └─────────┘  └──────┘ │
└─────────────────┘      └─────────────────────────────────────┘
```

## 技术栈选型

| 层面 | 技术 | 理由 |
|------|------|------|
| 语言 | TypeScript | 类型安全、生态丰富、可编译到多平台 |
| 运行时 | Node.js 20+ | 成熟稳定、异步性能优秀 |
| CLI 框架 | Ink + React | 用 React 构建 TUI，组件化开发 |
| 数据库 | SQLite + LanceDB | 轻量、零配置、向量支持 |
| LLM | 多模型支持 | OpenAI、Claude、Ollama 等 |
| 打包 | pkg + npm | 二进制分发 + 源码安装 |
| 测试 | Vitest | 快速、ESM 原生支持 |

## 性能目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 启动时间 | < 500ms | 冷启动到可交互 |
| 命令响应 | < 100ms | 本地命令延迟 |
| Agent 响应 | < 3s | 首 token 时间 |
| 内存占用 | < 500MB | 基础运行 |
| 并发 Agent | 100+ | 同时活跃 |
| 数据规模 | 1M+ 记录 | 单表支持 |

---

*架构设计是演进式的，随项目发展持续迭代。*
