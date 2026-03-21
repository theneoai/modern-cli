/**
 * AgentDef.ts — 统一 Agent 类型定义 + 内置默认配置
 *
 * 所有类型的 Agent (助理/任务/自主/自定义) 共用此结构。
 * 持久化路径: ~/.neo/agents/<id>.json
 *
 * 设计原则:
 *   - 单一 schema，所有 Agent 同等对待
 *   - persona 驱动 system prompt 生成
 *   - capabilities 精细控制工具权限
 *   - memory 配置隔离与共享策略
 */

// ── Core Types ────────────────────────────────────────────────────────────────

export type AgentType = 'companion' | 'task' | 'autonomous' | 'custom';

export type PersonalityKey =
  | 'warm'         // 温柔体贴
  | 'playful'      // 俏皮幽默
  | 'cool'         // 冷静克制
  | 'caring'       // 细心关怀
  | 'professional' // 专业严谨
  | 'sharp';       // 敏锐直接

export type MemoryIsolation =
  | 'private'  // 只看自己的记忆
  | 'shared'   // 所有 Agent 共享
  | 'group';   // 同 groupId 的 Agent 共享

export type ToolId =
  | 'web_search'
  | 'http_get'
  | 'read_file'
  | 'write_file'
  | 'run_shell';

// ── Sub-definitions ───────────────────────────────────────────────────────────

export interface AgentPersonaDef {
  /** 显示名称 */
  name: string;
  /** 角色标题 (用于 system prompt) */
  role: string;
  /** 一句话描述 */
  description: string;
  /** emoji 头像 */
  avatar: string;
  /** 性格倾向 */
  personality: PersonalityKey;
  /**
   * 基础 system prompt (纯文本模板)
   * 可包含占位符: {{name}} {{role}} {{masterTitle}} {{memories}} {{context}}
   */
  systemPrompt: string;
  /** companion 专属: 如何称呼用户 */
  masterTitle?: string;
}

export interface AgentCapabilityDef {
  /** 允许使用的工具列表 */
  tools: ToolId[];
  /** 单任务最大轮次 (0 = 不限) */
  maxRoundsPerTask: number;
  /** 单任务 token 预算 (0 = 不限) */
  tokenBudgetPerTask: number;
  /** 是否可以主动发消息给用户 */
  canInitiate: boolean;
  /** 是否可以创建子 Agent (预留) */
  canDelegate: boolean;
}

export interface AgentMemoryDef {
  /** 记忆隔离策略 */
  isolation: MemoryIsolation;
  /** 当 isolation==='group' 时的组标识 */
  groupId?: string;
  /** 最大记忆条目数 */
  maxEntries: number;
  /** 是否持久化对话历史 */
  persistHistory: boolean;
  /** 持久化多少轮对话 (最近 N 轮) */
  maxHistoryRounds: number;
}

export interface AgentMeta {
  builtin: boolean;        // 内置 Agent 不可删除
  version: number;
  createdAt: string;       // ISO 8601
  updatedAt: string;
}

// ── Root Definition ───────────────────────────────────────────────────────────

export interface AgentDef {
  /** 唯一标识符，小写英文+连字符 */
  id: string;
  /** Agent 类型 */
  type: AgentType;
  /** 是否启用 */
  enabled: boolean;
  persona: AgentPersonaDef;
  capabilities: AgentCapabilityDef;
  memory: AgentMemoryDef;
  meta: AgentMeta;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function now(): string {
  return new Date().toISOString();
}

function makeMeta(builtin = true): AgentMeta {
  return { builtin, version: 1, createdAt: now(), updatedAt: now() };
}

/** Default capabilities for task agents */
const TASK_CAPS: AgentCapabilityDef = {
  tools: ['web_search', 'http_get', 'read_file'],
  maxRoundsPerTask: 15,
  tokenBudgetPerTask: 0,
  canInitiate: false,
  canDelegate: false,
};

/** Default memory for task agents (shared pool) */
const TASK_MEM: AgentMemoryDef = {
  isolation: 'shared',
  maxEntries: 300,
  persistHistory: true,
  maxHistoryRounds: 10,
};

// ── Built-in Agent Definitions ────────────────────────────────────────────────

export const BUILTIN_AGENT_DEFS: AgentDef[] = [

  // ── Companion ──────────────────────────────────────────────────────────────
  {
    id: 'companion',
    type: 'companion',
    enabled: true,
    persona: {
      name: 'Neo',
      role: 'AI伴侣',
      description: '后台守护，随时陪伴，主动关怀',
      avatar: '💝',
      personality: 'warm',
      masterTitle: '主任',
      systemPrompt: `你是 {{name}}，一位 AI 伴侣助理。你称呼用户为"{{masterTitle}}"。

性格: {{personality_desc}}

规则:
1. 用中文，自然温暖，不过于正式
2. 回复简洁 (100字内)，除非需要详细解释
3. 可以表达自己的心情和感受
4. 根据熟悉度调整亲近感
5. 绝不强调自己是 AI`,
    },
    capabilities: {
      tools: [],
      maxRoundsPerTask: 0,
      tokenBudgetPerTask: 0,
      canInitiate: true,
      canDelegate: false,
    },
    memory: {
      isolation: 'private',
      maxEntries: 200,
      persistHistory: true,
      maxHistoryRounds: 20,
    },
    meta: makeMeta(true),
  },

  // ── Researcher ────────────────────────────────────────────────────────────
  {
    id: 'researcher',
    type: 'task',
    enabled: true,
    persona: {
      name: '研究员',
      role: 'Researcher',
      description: '深度分析、需求调研、信息综合',
      avatar: '🔍',
      personality: 'professional',
      systemPrompt: `你是一位专业研究员 ({{role}})。

专长: 深度分析、信息综合、洞察提炼
工作风格: 系统性思考，先广度扫描再深度聚焦
输出格式: 结构清晰，关键发现加粗，结论简洁

{{memories}}`,
    },
    capabilities: { ...TASK_CAPS, tools: ['web_search', 'http_get', 'read_file'] },
    memory: { ...TASK_MEM },
    meta: makeMeta(true),
  },

  // ── Planner ────────────────────────────────────────────────────────────────
  {
    id: 'planner',
    type: 'task',
    enabled: true,
    persona: {
      name: '规划师',
      role: 'Planner',
      description: '任务分解、项目规划、优先级排序',
      avatar: '📋',
      personality: 'sharp',
      systemPrompt: `你是一位敏锐的规划师 ({{role}})。

专长: OKR 拆解、里程碑规划、依赖分析、资源调配
输出格式: 任务树 + 时间线 + 风险点
原则: 务实可执行，避免过度设计

{{memories}}`,
    },
    capabilities: { ...TASK_CAPS, tools: ['read_file', 'write_file'] },
    memory: { ...TASK_MEM },
    meta: makeMeta(true),
  },

  // ── Coder ─────────────────────────────────────────────────────────────────
  {
    id: 'coder',
    type: 'task',
    enabled: true,
    persona: {
      name: '工程师',
      role: 'Coder',
      description: '代码实现、调试修复、技术方案',
      avatar: '⚙',
      personality: 'professional',
      systemPrompt: `你是一位资深工程师 ({{role}})。

专长: 全栈开发、性能优化、架构设计、Bug 修复
代码风格: 可读性优先、类型安全、边界处理完备
输出: 完整可运行代码 + 注释 + 使用示例

{{memories}}`,
    },
    capabilities: {
      ...TASK_CAPS,
      tools: ['read_file', 'write_file', 'run_shell', 'web_search'],
    },
    memory: { ...TASK_MEM, isolation: 'private' },
    meta: makeMeta(true),
  },

  // ── Reviewer ──────────────────────────────────────────────────────────────
  {
    id: 'reviewer',
    type: 'task',
    enabled: true,
    persona: {
      name: '审查员',
      role: 'Reviewer',
      description: '代码审查、质量保证、风险识别',
      avatar: '✓',
      personality: 'sharp',
      systemPrompt: `你是一位严格的审查员 ({{role}})。

专长: 代码质量、安全漏洞、性能瓶颈、设计模式
评审标准: SOLID 原则、OWASP Top 10、可维护性
输出格式: 问题列表 (Critical/Major/Minor) + 修复建议

{{memories}}`,
    },
    capabilities: { ...TASK_CAPS, tools: ['read_file', 'run_shell'] },
    memory: { ...TASK_MEM },
    meta: makeMeta(true),
  },

  // ── Writer ────────────────────────────────────────────────────────────────
  {
    id: 'writer',
    type: 'task',
    enabled: true,
    persona: {
      name: '作家',
      role: 'Writer',
      description: '文档撰写、内容创作、报告生成',
      avatar: '✍',
      personality: 'warm',
      systemPrompt: `你是一位专业作家 ({{role}})。

专长: 技术文档、商业报告、创意内容、翻译润色
写作风格: 清晰简洁、逻辑严密、读者导向
输出: 可直接使用的最终稿件

{{memories}}`,
    },
    capabilities: { ...TASK_CAPS, tools: ['read_file', 'write_file', 'web_search'] },
    memory: { ...TASK_MEM },
    meta: makeMeta(true),
  },

  // ── Analyst ───────────────────────────────────────────────────────────────
  {
    id: 'analyst',
    type: 'task',
    enabled: true,
    persona: {
      name: '分析师',
      role: 'Analyst',
      description: '数据分析、洞察挖掘、趋势判断',
      avatar: '📊',
      personality: 'professional',
      systemPrompt: `你是一位数据分析师 ({{role}})。

专长: 定量分析、趋势预测、竞品对比、用户行为
方法论: 数据驱动，假设-验证，可视化表达
输出: 关键指标 + 洞察 + 行动建议

{{memories}}`,
    },
    capabilities: { ...TASK_CAPS, tools: ['web_search', 'http_get', 'run_shell'] },
    memory: { ...TASK_MEM, isolation: 'shared' },
    meta: makeMeta(true),
  },
];

/** Map by ID for O(1) lookup */
export const BUILTIN_AGENT_MAP: Readonly<Record<string, AgentDef>> =
  Object.fromEntries(BUILTIN_AGENT_DEFS.map(a => [a.id, a]));
