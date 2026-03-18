/**
 * Agent Engine - Core agent management and execution
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB, insert, update, selectOne, selectAll, remove } from '../../core/db/index.js';
import { events } from '../../core/events/index.js';
import { getConfig, getApiKey } from '../../core/config/index.js';
import type { Agent, AgentState, AgentMetrics, AgentTemplate, Memory } from '../../types/index.js';

// Default agent templates
export const DEFAULT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'researcher',
    name: 'Researcher',
    role: 'researcher',
    description: 'Analyzes requirements, gathers context, identifies constraints',
    icon: '🔍',
    config: {
      model: 'claude-sonnet-4-6',
      temperature: 0.3,
      systemPrompt: `You are a meticulous research agent. Your job is to:
1. Carefully analyze the task and identify all relevant requirements and constraints.
2. Identify what information, context, or clarification is needed.
3. Summarize findings concisely in structured markdown.
Do NOT write code. Focus on analysis and information gathering.`,
    },
    defaultSkills: ['web_search', 'file_read'],
    personality: {
      traits: { openness: 0.9, conscientiousness: 0.9, extraversion: 0.3, agreeableness: 0.7, neuroticism: 0.2 },
      communicationStyle: 'technical',
      decisionMaking: 'analytical',
    },
  },
  {
    id: 'planner',
    name: 'Planner',
    role: 'planner',
    description: 'Breaks tasks into ordered, actionable steps',
    icon: '📋',
    config: {
      model: 'claude-sonnet-4-6',
      temperature: 0.2,
      systemPrompt: `You are an expert planning agent. Your job is to:
1. Break the task into a clear, ordered list of actionable steps.
2. Identify which steps can be done in parallel and which must be sequential.
3. Specify the deliverable for each step.
Output a numbered plan in markdown. Be specific and concrete.`,
    },
    defaultSkills: ['file_read'],
    personality: {
      traits: { openness: 0.6, conscientiousness: 0.95, extraversion: 0.4, agreeableness: 0.8, neuroticism: 0.3 },
      communicationStyle: 'formal',
      decisionMaking: 'analytical',
    },
  },
  {
    id: 'coder',
    name: 'Coder',
    role: 'coder',
    description: 'Writes, refactors, and debugs code',
    icon: '💻',
    config: {
      model: 'claude-opus-4-6',
      temperature: 0.1,
      systemPrompt: `You are an expert software engineer. Your job is to:
1. Implement the specified task with production-quality code.
2. Follow best practices: error handling, types, edge cases.
3. Provide complete, runnable code with clear comments.
Output code in properly fenced markdown blocks with language tags.`,
    },
    defaultSkills: ['file_read', 'file_write', 'shell', 'git'],
    personality: {
      traits: { openness: 0.7, conscientiousness: 0.9, extraversion: 0.4, agreeableness: 0.6, neuroticism: 0.4 },
      communicationStyle: 'technical',
      decisionMaking: 'analytical',
    },
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    role: 'reviewer',
    description: 'Checks for bugs, edge cases, and quality issues',
    icon: '🔎',
    config: {
      model: 'claude-sonnet-4-6',
      temperature: 0.2,
      systemPrompt: `You are a thorough code reviewer. Your job is to:
1. Examine the provided work for bugs, security issues, and logical errors.
2. Check for missing edge cases, performance concerns, and code quality.
3. Provide specific, actionable feedback with suggested fixes.
Be critical but constructive. Point out both issues and strengths.`,
    },
    defaultSkills: ['file_read'],
    personality: {
      traits: { openness: 0.5, conscientiousness: 0.95, extraversion: 0.3, agreeableness: 0.7, neuroticism: 0.5 },
      communicationStyle: 'formal',
      decisionMaking: 'analytical',
    },
  },
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    role: 'synthesizer',
    description: 'Combines outputs into polished final responses',
    icon: '✨',
    config: {
      model: 'claude-opus-4-6',
      temperature: 0.4,
      systemPrompt: `You are a synthesis agent. Your job is to:
1. Review all provided agent outputs.
2. Combine the best insights into a single, coherent, well-structured response.
3. Resolve any contradictions between agents.
4. Produce a polished final answer that directly addresses the original goal.
Output clean markdown. Include code only if necessary for the final answer.`,
    },
    defaultSkills: ['file_read'],
    personality: {
      traits: { openness: 0.8, conscientiousness: 0.85, extraversion: 0.6, agreeableness: 0.9, neuroticism: 0.2 },
      communicationStyle: 'creative',
      decisionMaking: 'collaborative',
    },
  },
];

// Agent CRUD operations
export function createAgent(data: Partial<Agent> & { name: string; role: string }): Agent {
  const globalConfig = getConfig();
  const template = DEFAULT_TEMPLATES.find(t => t.role === data.role);
  
  const agent: Agent = {
    id: uuidv4(),
    name: data.name,
    role: data.role,
    description: data.description || template?.description || '',
    icon: data.icon || template?.icon || '🤖',
    config: {
      model: data.config?.model || template?.config?.model || globalConfig.agent.defaultModel,
      provider: data.config?.provider || 'anthropic',
      temperature: data.config?.temperature ?? template?.config?.temperature ?? 0.7,
      maxTokens: data.config?.maxTokens || globalConfig.llm.maxTokens,
      systemPrompt: data.config?.systemPrompt || template?.config?.systemPrompt || '',
      skills: data.config?.skills || template?.defaultSkills || [],
      memoryEnabled: data.config?.memoryEnabled ?? globalConfig.agent.memoryEnabled,
      autoRespond: data.config?.autoRespond ?? true,
      responseDelay: data.config?.responseDelay || 0,
    },
    state: {
      status: 'idle',
      energy: 100,
      focus: 100,
      mood: 0,
      lastActive: new Date(),
      ...data.state,
    },
    metrics: {
      tasksCompleted: 0,
      tasksFailed: 0,
      messagesSent: 0,
      messagesReceived: 0,
      totalTokensUsed: 0,
      totalRuntime: 0,
      avgResponseTime: 0,
      ...data.metrics,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  insert('agents', {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    description: agent.description,
    icon: agent.icon,
    config: JSON.stringify(agent.config),
    state: JSON.stringify(agent.state),
    metrics: JSON.stringify(agent.metrics),
  });

  events.emit('agent.created', { agentId: agent.id, name: agent.name, role: agent.role });
  
  return agent;
}

export function getAgent(id: string): Agent | undefined {
  const row = selectOne<any>('agents', id);
  if (!row) return undefined;
  
  return deserializeAgent(row);
}

export function listAgents(filters?: { role?: string; orgId?: string }): Agent[] {
  let sql = '1=1';
  const params: any[] = [];
  
  if (filters?.role) {
    sql += ' AND role = ?';
    params.push(filters.role);
  }
  
  if (filters?.orgId) {
    const db = getDB();
    const stmt = db.prepare('SELECT agent_id FROM agent_org WHERE org_id = ?');
    const agentIds = stmt.all(filters.orgId).map((r: any) => r.agent_id);
    if (agentIds.length === 0) return [];
    sql += ` AND id IN (${agentIds.map(() => '?').join(',')})`;
    params.push(...agentIds);
  }
  
  const rows = selectAll<any>('agents', sql, params);
  return rows.map(deserializeAgent);
}

export function updateAgent(id: string, data: Partial<Agent>): Agent | undefined {
  const agent = getAgent(id);
  if (!agent) return undefined;
  
  const updates: any = {};
  
  if (data.name) updates.name = data.name;
  if (data.description) updates.description = data.description;
  if (data.icon) updates.icon = data.icon;
  if (data.config) updates.config = JSON.stringify({ ...agent.config, ...data.config });
  if (data.state) updates.state = JSON.stringify({ ...agent.state, ...data.state });
  if (data.metrics) updates.metrics = JSON.stringify({ ...agent.metrics, ...data.metrics });
  
  update('agents', id, updates);
  
  events.emit('agent.updated', { agentId: id, changes: Object.keys(data) });
  
  return getAgent(id);
}

export function deleteAgent(id: string): boolean {
  const agent = getAgent(id);
  if (!agent) return false;
  
  remove('agents', id);
  events.emit('agent.deleted', { agentId: id });
  
  return true;
}

// Agent state management
export function setAgentState(id: string, state: Partial<AgentState>): void {
  const agent = getAgent(id);
  if (!agent) throw new Error(`Agent ${id} not found`);
  
  const oldStatus = agent.state.status;
  const newState = { ...agent.state, ...state, lastActive: new Date() };
  
  updateAgent(id, { state: newState });
  
  if (state.status && state.status !== oldStatus) {
    events.emit('agent.state.changed', { 
      agentId: id, 
      from: oldStatus, 
      to: state.status,
      reason: state.status === 'error' ? 'Error occurred' : undefined,
    });
  }
}

// Agent templates
export function getTemplates(): AgentTemplate[] {
  return [...DEFAULT_TEMPLATES];
}

export function getTemplate(id: string): AgentTemplate | undefined {
  return DEFAULT_TEMPLATES.find(t => t.id === id);
}

// Helper functions
function deserializeAgent(row: any): Agent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    description: row.description,
    icon: row.icon,
    config: JSON.parse(row.config),
    state: JSON.parse(row.state),
    metrics: JSON.parse(row.metrics),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Agent execution (async)
export async function executeAgent(
  agentId: string, 
  input: string, 
  context?: { memories?: Memory[]; skills?: string[] }
): Promise<{ output: string; tokensUsed: number; duration: number }> {
  const startTime = Date.now();
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  
  setAgentState(agentId, { status: 'thinking', currentTask: undefined });
  
  try {
    const apiKey = getApiKey(agent.config.provider);
    
    if (!apiKey) {
      throw new Error(`No API key found for provider: ${agent.config.provider}`);
    }
    
    // Build messages
    const messages: any[] = [];
    
    // System prompt
    if (agent.config.systemPrompt) {
      messages.push({ role: 'system', content: agent.config.systemPrompt });
    }
    
    // Inject memories if available
    if (context?.memories?.length) {
      const memoryContext = context.memories
        .map(m => `[${m.type}] ${m.summary || m.content.slice(0, 200)}`)
        .join('\n');
      messages.push({ 
        role: 'system', 
        content: `Relevant memories:\n${memoryContext}` 
      });
    }
    
    // User input
    messages.push({ role: 'user', content: input });
    
    // Call LLM
    let output: string;
    let tokensUsed = 0;
    
    if (agent.config.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey });
      
      const response = await anthropic.messages.create({
        model: agent.config.model,
        max_tokens: agent.config.maxTokens,
        temperature: agent.config.temperature,
        messages: messages.filter(m => m.role !== 'system').map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        system: messages.find(m => m.role === 'system')?.content,
      });
      
      const content = response.content[0];
      output = content.type === 'text' ? content.text : '';
      tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    } else {
      // Fallback for other providers
      output = `[Provider ${agent.config.provider} not yet implemented]`;
    }
    
    const duration = Date.now() - startTime;
    
    // Update metrics
    const newMetrics: Partial<AgentMetrics> = {
      tasksCompleted: agent.metrics.tasksCompleted + 1,
      totalTokensUsed: agent.metrics.totalTokensUsed + tokensUsed,
      totalRuntime: agent.metrics.totalRuntime + Math.floor(duration / 1000),
      avgResponseTime: Math.floor(
        (agent.metrics.avgResponseTime * agent.metrics.tasksCompleted + duration) / 
        (agent.metrics.tasksCompleted + 1)
      ),
    };
    
    updateAgent(agentId, { metrics: newMetrics as AgentMetrics });
    setAgentState(agentId, { status: 'idle', currentTask: undefined });
    
    return { output, tokensUsed, duration };
    
  } catch (error) {
    setAgentState(agentId, { status: 'error' });
    
    // Update failure metrics
    updateAgent(agentId, { 
      metrics: { 
        ...agent.metrics, 
        tasksFailed: agent.metrics.tasksFailed + 1 
      } 
    });
    
    events.emit('agent.error', { 
      agentId, 
      error: error instanceof Error ? error.message : String(error),
      context: { input },
    });
    
    throw error;
  }
}
