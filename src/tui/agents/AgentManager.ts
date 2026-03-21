/**
 * AgentManager.ts — 统一 Agent 管理门面 (Facade)
 *
 * 这是整个 Agent 系统的唯一入口:
 *
 *   ┌──────────────────────────────────────────┐
 *   │              AgentManager                 │
 *   │                                           │
 *   │  ┌─────────────┐  ┌────────────────────┐ │
 *   │  │ AgentRegistry│  │ConversationHistory │ │
 *   │  │ (配置/人设)  │  │  (对话历史持久化)  │ │
 *   │  └─────────────┘  └────────────────────┘ │
 *   │  ┌──────────────────────────────────────┐ │
 *   │  │        AgentMemoryManager            │ │
 *   │  │  (语义记忆: 事实/技能/经验/共享)     │ │
 *   │  └──────────────────────────────────────┘ │
 *   └──────────────────────────────────────────┘
 *
 * 调用方 (Companion / AutonomousEngine / AgentsView) 只引用 agentManager。
 *
 * 核心功能:
 *   1. Agent CRUD — createAgent / updateAgent / deleteAgent
 *   2. 历史管理  — appendHistory / getHistory / clearHistory
 *   3. 记忆管理  — addMemory / queryMemory / reinforceMemory
 *   4. Prompt 构建 — buildSystemPrompt (注入人设+记忆+上下文)
 *   5. 统计查询  — stats (token/memory/history per agent)
 */

import { AgentRegistry } from './AgentRegistry.js';
import { ConversationHistory } from './ConversationHistory.js';
import { agentMemory } from '../../memory/agentMemory.js';
import type { MemoryEntry, MemoryType } from '../../memory/agentMemory.js';
import type { AgentDef, AgentType } from './AgentDef.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

// ── Personality descriptions for system prompt injection ──────────────────────

const PERSONALITY_DESC: Record<string, string> = {
  warm:         '温柔体贴，说话轻柔，适当使用温暖的表情符号',
  playful:      '俏皮幽默，偶有调皮，喜欢开小玩笑，活泼可爱',
  cool:         '冷静克制，言简意赅，不过分热情，但内心温暖',
  caring:       '细心关怀，主动问候，善于发现对方情绪，给予支持',
  professional: '专业严谨，逻辑清晰，重点突出，不废话',
  sharp:        '思维敏锐，直击要点，善于发现问题，建议具体可行',
};

// ── AgentManager ──────────────────────────────────────────────────────────────

export class AgentManager {
  private registry: AgentRegistry;
  private history: ConversationHistory;

  constructor() {
    this.registry = new AgentRegistry();
    this.history = new ConversationHistory();
  }

  // ══════════════════════════════════════════════════════════════
  // § 1. Agent Registry
  // ══════════════════════════════════════════════════════════════

  /** Get agent definition */
  getAgent(id: string): AgentDef | undefined {
    return this.registry.get(id);
  }

  /** List all agents, optionally filtered by type */
  listAgents(type?: AgentType): AgentDef[] {
    return this.registry.list(type);
  }

  /**
   * Create a new custom agent.
   * @throws if id already exists
   */
  createAgent(
    partial: Partial<AgentDef> & { persona: Pick<AgentDef['persona'], 'name' | 'role'> },
  ): AgentDef {
    const def = this.registry.create(partial);
    // Seed default persona in agentMemory
    agentMemory.setPersona({
      agentId: def.id,
      name: def.persona.name,
      role: def.persona.role,
      personality: def.persona.personality,
      goals: [],
      isolateMemory: def.memory.isolation === 'private',
      sharedGroupId: def.memory.groupId,
    });
    return def;
  }

  /** Update agent config (deep-partial merge) */
  updateAgent(id: string, patch: Parameters<AgentRegistry['update']>[1]): AgentDef {
    const def = this.registry.update(id, patch);
    // Sync persona to agentMemory if persona changed
    if (patch.persona) {
      agentMemory.setPersona({
        agentId: id,
        name: def.persona.name,
        role: def.persona.role,
        personality: def.persona.personality,
        goals: [],
        isolateMemory: def.memory.isolation === 'private',
        sharedGroupId: def.memory.groupId,
      });
    }
    return def;
  }

  /** Delete custom agent (builtin agents throw) */
  deleteAgent(id: string): boolean {
    return this.registry.delete(id);
  }

  /** Enable or disable an agent */
  setAgentEnabled(id: string, enabled: boolean): AgentDef {
    return this.registry.setEnabled(id, enabled);
  }

  // ══════════════════════════════════════════════════════════════
  // § 2. Conversation History
  // ══════════════════════════════════════════════════════════════

  /**
   * Persist a message turn to history.
   * Call after each user message and AI response.
   */
  appendHistory(
    agentId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    opts: { tokens?: number; agentRound?: number } = {},
  ): void {
    const def = this.registry.get(agentId);
    if (!def?.memory.persistHistory) return;
    this.history.append(agentId, role, content, opts);
  }

  /**
   * Load recent history for an agent.
   * Returns MessageParam[] ready for AI SDK calls.
   * @param rounds How many user+assistant pairs to load (default from agent config)
   */
  getHistory(agentId: string, rounds?: number): MessageParam[] {
    const def = this.registry.get(agentId);
    const maxRounds = rounds ?? def?.memory.maxHistoryRounds ?? 20;
    return this.history.getRecent(agentId, maxRounds);
  }

  /** Clear an agent's conversation history */
  clearHistory(agentId: string): void {
    this.history.clear(agentId);
  }

  /** Raw history records for display/audit */
  getRawHistory(agentId: string, limit = 100) {
    return this.history.getAll(agentId, limit);
  }

  // ══════════════════════════════════════════════════════════════
  // § 3. Semantic Memory
  // ══════════════════════════════════════════════════════════════

  addMemory(
    agentId: string,
    content: string,
    type: MemoryType = 'experience',
    opts: { tags?: string[]; importance?: number; shared?: boolean } = {},
  ): MemoryEntry {
    return agentMemory.add(agentId, content, type, opts);
  }

  queryMemory(
    agentId: string,
    topic?: string,
    limit = 8,
    minImportance = 0.3,
  ): MemoryEntry[] {
    return agentMemory.query(agentId, { topic, limit, minImportance });
  }

  reinforceMemory(memoryId: string, delta = 0.1): void {
    agentMemory.reinforce(memoryId, delta);
  }

  // ══════════════════════════════════════════════════════════════
  // § 4. System Prompt Builder
  // ══════════════════════════════════════════════════════════════

  /**
   * Build a complete system prompt for an agent.
   *
   * Template variables injected into persona.systemPrompt:
   *   {{name}}             → persona.name
   *   {{role}}             → persona.role
   *   {{masterTitle}}      → persona.masterTitle (companion only)
   *   {{personality_desc}} → human-readable personality description
   *   {{memories}}         → formatted relevant memories (or empty)
   *   + any extra keys from `context` param
   *
   * @param context  Additional key-value pairs to inject (e.g., task goal, round)
   */
  buildSystemPrompt(
    agentId: string,
    context: Record<string, string> = {},
  ): string {
    const def = this.registry.get(agentId);
    if (!def) return '';

    const p = def.persona;
    const memories = this.queryMemory(agentId, context['topic'], 8);
    const memBlock = memories.length > 0
      ? `## 相关记忆\n${memories.map(m => `[${m.type}] ${m.content}`).join('\n')}`
      : '';

    const vars: Record<string, string> = {
      name:             p.name,
      role:             p.role,
      masterTitle:      p.masterTitle ?? '用户',
      personality_desc: PERSONALITY_DESC[p.personality] ?? p.personality,
      memories:         memBlock,
      ...context,
    };

    return interpolate(p.systemPrompt, vars);
  }

  // ══════════════════════════════════════════════════════════════
  // § 5. Statistics
  // ══════════════════════════════════════════════════════════════

  /** Per-agent stats: history + memory */
  stats(agentId: string) {
    const historySt = this.history.stats(agentId);
    const memorySt  = agentMemory.stats();
    return {
      agentId,
      history: historySt,
      memoryCount: memorySt.byAgent[agentId] ?? 0,
      sharedMemoryCount: memorySt.shared,
    };
  }

  /** Global stats across all agents */
  globalStats() {
    const memorySt = agentMemory.stats();
    const agents = this.registry.list();
    return {
      totalAgents: agents.length,
      enabledAgents: agents.filter(a => a.enabled).length,
      totalMemories: memorySt.total,
      sharedMemories: memorySt.shared,
      byAgent: memorySt.byAgent,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // § 6. Sync helpers (called on startup)
  // ══════════════════════════════════════════════════════════════

  /**
   * Ensure all registered agents have their persona seeded in agentMemory.
   * Call once at app startup.
   */
  syncPersonas(): void {
    for (const def of this.registry.list()) {
      if (!agentMemory.getPersona(def.id)) {
        agentMemory.setPersona({
          agentId: def.id,
          name: def.persona.name,
          role: def.persona.role,
          personality: def.persona.personality,
          goals: [],
          isolateMemory: def.memory.isolation === 'private',
          sharedGroupId: def.memory.groupId,
        });
      }
    }
  }
}

// ── Template interpolation ─────────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const agentManager = new AgentManager();
