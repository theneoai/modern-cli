/**
 * Core Type Definitions for HyperTerminal
 */

// ============ Agent Types ============

export interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  icon?: string;
  config: AgentConfig;
  state: AgentState;
  metrics: AgentMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentConfig {
  model: string;
  provider: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  skills: string[];
  memoryEnabled: boolean;
  autoRespond: boolean;
  responseDelay: number;
}

export interface AgentState {
  status: 'idle' | 'working' | 'thinking' | 'meeting' | 'resting' | 'error';
  energy: number;      // 0-100
  focus: number;       // 0-100
  mood: number;        // -100 to 100
  currentTask?: string;
  location?: string;
  lastActive: Date;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  messagesSent: number;
  messagesReceived: number;
  totalTokensUsed: number;
  totalRuntime: number; // seconds
  avgResponseTime: number; // ms
}

export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  config: Partial<AgentConfig>;
  defaultSkills: string[];
  personality: Personality;
}

export interface Personality {
  traits: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  communicationStyle: 'formal' | 'casual' | 'technical' | 'creative';
  decisionMaking: 'analytical' | 'intuitive' | 'collaborative' | 'autonomous';
}

// ============ Organization Types ============

export interface Organization {
  id: string;
  name: string;
  type: 'company' | 'team' | 'community' | 'town';
  description?: string;
  config: OrgConfig;
  economy: OrgEconomy;
  createdAt: Date;
}

export interface OrgConfig {
  mission?: string;
  values: string[];
  culture: 'hierarchical' | 'flat' | 'holacracy' | 'ad-hoc';
  workHours?: { start: string; end: string };
  timezone?: string;
}

export interface OrgEconomy {
  currency: string;
  budget: number;
  revenue: number;
  expenses: number;
  salaryBaseline: number;
}

export interface Department {
  id: string;
  orgId: string;
  name: string;
  function: string;
  headId?: string;
  memberIds: string[];
  budget: number;
  goals: Goal[];
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  target: number;
  current: number;
  deadline?: Date;
  status: 'active' | 'completed' | 'cancelled';
}

// ============ Social Types ============

export interface SocialRelation {
  fromAgentId: string;
  toAgentId: string;
  type: 'colleague' | 'supervisor' | 'subordinate' | 'friend' | 'rival' | 'mentor' | 'mentee';
  strength: number; // -1 to 1
  interactions: number;
  lastInteraction: Date;
}

export interface SocialInteraction {
  id: string;
  type: 'message' | 'meeting' | 'collaboration' | 'conflict' | 'transaction';
  participants: string[];
  content?: string;
  outcome: any;
  timestamp: Date;
  duration?: number;
}

// ============ Memory Types ============

export interface Memory {
  id: string;
  agentId: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'working';
  content: string;
  summary?: string;
  embedding?: number[];
  importance: number; // 0-10
  tags: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  accessedAt?: Date;
  accessCount: number;
}

export interface MemoryQuery {
  agentId?: string;
  type?: Memory['type'];
  tags?: string[];
  query?: string;
  minImportance?: number;
  limit?: number;
  since?: Date;
  until?: Date;
}

// ============ Workflow Types ============

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  definition: WorkflowDefinition;
  version: string;
  author: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: Variable[];
  triggers: Trigger[];
}

export interface WorkflowNode {
  id: string;
  type: 'agent' | 'skill' | 'condition' | 'loop' | 'delay' | 'parallel' | 'merge' | 'start' | 'end';
  config: Record<string, any>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
  label?: string;
}

export interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: any;
  required?: boolean;
}

export interface Trigger {
  type: 'manual' | 'scheduled' | 'event' | 'webhook';
  config: Record<string, any>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  context: ExecutionContext;
  startedAt: Date;
  completedAt?: Date;
}

export interface ExecutionContext {
  variables: Record<string, any>;
  nodeStates: Record<string, any>;
  logs: ExecutionLog[];
}

export interface ExecutionLog {
  timestamp: Date;
  nodeId?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

// ============ Task Types ============

export interface Task {
  id: string;
  title: string;
  description?: string;
  assigneeId?: string;
  workflowId?: string;
  parentId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  priority: number; // 1-10
  data: Record<string, any>;
  result?: any;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  subtasks?: Task[];
}

// ============ Skill/MCP Types ============

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  tags: string[];
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  implementation: SkillImplementation;
  permissions: Permission[];
  sandbox?: SandboxConfig;
  enabled: boolean;
  createdAt: Date;
}

export interface SkillImplementation {
  type: 'javascript' | 'python' | 'wasm' | 'docker' | 'mcp';
  code?: string;
  entry?: string;
  mcpServer?: MCPServerConfig;
  dependencies?: Dependency[];
}

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface Permission {
  resource: string;
  action: 'read' | 'write' | 'execute' | 'admin';
}

export interface SandboxConfig {
  memory: number;      // MB
  cpu: number;         // milliseconds
  timeout: number;     // milliseconds
  network: boolean;
  filesystem: 'none' | 'readonly' | 'readwrite';
  allowedPaths?: string[];
}

export interface Dependency {
  name: string;
  version: string;
  type: 'npm' | 'pip' | 'system';
}

// ============ Economy Types ============

export interface Transaction {
  id: string;
  fromAgentId?: string;
  toAgentId?: string;
  fromOrgId?: string;
  toOrgId?: string;
  amount: number;
  currency: string;
  type: 'salary' | 'bonus' | 'expense' | 'revenue' | 'transfer' | 'market';
  description?: string;
  metadata?: any;
  timestamp: Date;
}

// ============ UI Types ============

export interface ViewState {
  mode: 'shell' | 'board' | 'editor' | 'split';
  panels: Panel[];
  activePanel: string;
  theme: 'dark' | 'light';
}

export interface Panel {
  id: string;
  type: 'terminal' | 'agent-list' | 'org-chart' | 'workflow' | 'memory' | 'chat';
  title: string;
  data?: any;
  position?: { x: number; y: number; width: number; height: number };
}

// ============ Plugin Types ============

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  entry: string;
  config?: Record<string, any>;
  enabled: boolean;
  installedAt: Date;
}

export interface PluginAPI {
  registerCommand: (cmd: any) => void;
  registerSkill: (skill: Skill) => void;
  registerAgentTemplate: (template: AgentTemplate) => void;
  registerWorkflowTemplate: (workflow: Workflow) => void;
  subscribeEvent: <K extends string>(event: K, handler: (data: any) => void) => () => void;
  getService: <T>(name: string) => T;
  getStorage: (namespace: string) => Storage;
}

// ============ Message Types ============

export interface Message {
  id: string;
  from: string;  // agentId or 'user'
  to?: string;   // agentId or 'broadcast'
  content: string;
  type: 'text' | 'code' | 'image' | 'file' | 'system';
  metadata?: Record<string, any>;
  timestamp: Date;
  threadId?: string;
}

// ============ Utility Types ============

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type WithRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Result<T, E = Error> {
  success: boolean;
  data?: T;
  error?: E;
}
