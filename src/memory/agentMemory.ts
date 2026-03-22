/**
 * agentMemory.ts — 智能体记忆系统
 *
 * 功能:
 *   - 每个 agent 可配置独立人设 (persona) 和隔离记忆
 *   - 也可配置加入共享记忆池，多 agent 经验复用
 *   - 记忆分类: experience / fact / skill / persona
 *   - 重要性评分 (0-1), 支持基于重要性的检索
 *   - 持久化到 ~/.neo/agent-memories.json (600 权限)
 *
 * 记忆隔离模式:
 *   isolated = true  → 只能看到自己的记忆 + 显式共享的记忆
 *   isolated = false → 可访问所有 agent 的记忆 (协作模式)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export type MemoryType = 'experience' | 'fact' | 'skill' | 'persona' | 'shared';

export interface MemoryEntry {
  id: string;
  agentId: string | '__shared__';  // __shared__ = visible to all
  type: MemoryType;
  content: string;
  tags: string[];
  importance: number;   // 0.0 – 1.0
  accessCount: number;
  createdAt: string;    // ISO
  updatedAt: string;
}

export interface AgentPersona {
  agentId: string;
  name: string;
  role: string;
  personality: string;
  goals: string[];
  isolateMemory: boolean;  // true = private pool; false = can see all agents
  sharedGroupId?: string;  // agents with same groupId share memories
}

interface MemoryStore {
  personas: Record<string, AgentPersona>;
  memories: MemoryEntry[];
}

// ── Persistence ───────────────────────────────────────────────────────────────

const STORE_DIR  = path.join(os.homedir(), '.neo');
const STORE_FILE = path.join(STORE_DIR, 'agent-memories.json');

function loadStore(): MemoryStore {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return { personas: {}, memories: [] };
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(raw) as MemoryStore;
  } catch {
    return { personas: {}, memories: [] };
  }
}

function saveStore(store: MemoryStore): void {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, STORE_FILE);
}

// ── AgentMemory class ─────────────────────────────────────────────────────────

export class AgentMemoryManager {
  private store: MemoryStore;

  constructor() {
    this.store = loadStore();
  }

  // ── Persona management ─────────────────────────────────────────────────────

  /** Register or update an agent persona */
  setPersona(persona: AgentPersona): void {
    this.store.personas[persona.agentId] = persona;
    saveStore(this.store);
  }

  getPersona(agentId: string): AgentPersona | undefined {
    return this.store.personas[agentId];
  }

  listPersonas(): AgentPersona[] {
    return Object.values(this.store.personas);
  }

  removePersona(agentId: string): void {
    delete this.store.personas[agentId];
    // Remove isolated memories for this agent
    this.store.memories = this.store.memories.filter(m =>
      m.agentId !== agentId || m.agentId === '__shared__'
    );
    saveStore(this.store);
  }

  /**
   * Build system prompt fragment for an agent, embedding its persona + relevant memories.
   * Called before each AI request to inject context.
   */
  buildSystemContext(agentId: string, topic?: string): string {
    const persona = this.store.personas[agentId];
    const memories = this.query(agentId, { topic, limit: 8, minImportance: 0.3 });

    const parts: string[] = [];

    if (persona) {
      parts.push(`## 你的身份\n名称: ${persona.name}\n角色: ${persona.role}\n性格: ${persona.personality}`);
      if (persona.goals.length > 0) {
        parts.push(`目标:\n${persona.goals.map(g => `- ${g}`).join('\n')}`);
      }
    }

    if (memories.length > 0) {
      const memText = memories
        .sort((a, b) => b.importance - a.importance)
        .map(m => `[${m.type}] ${m.content}`)
        .join('\n');
      parts.push(`## 相关记忆\n${memText}`);
    }

    return parts.join('\n\n');
  }

  // ── Memory CRUD ────────────────────────────────────────────────────────────

  /** Add a memory entry for an agent */
  add(
    agentId: string,
    content: string,
    type: MemoryType = 'experience',
    opts: { tags?: string[]; importance?: number; shared?: boolean } = {},
  ): MemoryEntry {
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      agentId: opts.shared ? '__shared__' : agentId,
      type,
      content,
      tags: opts.tags ?? [],
      importance: opts.importance ?? 0.5,
      accessCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.memories.push(entry);
    // Keep at most 2000 entries, pruning lowest importance when over limit
    if (this.store.memories.length > 2000) {
      this.store.memories.sort((a, b) => a.importance - b.importance);
      this.store.memories.splice(0, 200);
    }
    saveStore(this.store);
    return entry;
  }

  /** Share an existing memory to the shared pool */
  shareMemory(memoryId: string, agentId: string): boolean {
    const m = this.store.memories.find(x => x.id === memoryId && x.agentId === agentId);
    if (!m) return false;
    m.agentId = '__shared__';
    m.updatedAt = new Date().toISOString();
    saveStore(this.store);
    return true;
  }

  /** Update importance (e.g. after successful use) */
  reinforce(memoryId: string, delta = 0.1): void {
    const m = this.store.memories.find(x => x.id === memoryId);
    if (m) {
      m.importance = Math.min(1, m.importance + delta);
      m.accessCount++;
      m.updatedAt = new Date().toISOString();
      saveStore(this.store);
    }
  }

  removeMemory(memoryId: string): void {
    this.store.memories = this.store.memories.filter(m => m.id !== memoryId);
    saveStore(this.store);
  }

  // ── Memory retrieval ───────────────────────────────────────────────────────

  /**
   * Query memories visible to an agent based on isolation settings.
   * Visibility rules:
   *   - Always sees __shared__ memories
   *   - If isolateMemory=false: sees all agents' memories
   *   - If sharedGroupId set: sees memories of agents in same group
   *   - Always sees own memories
   */
  query(
    agentId: string,
    opts: {
      topic?: string;
      type?: MemoryType;
      tags?: string[];
      limit?: number;
      minImportance?: number;
    } = {},
  ): MemoryEntry[] {
    const persona = this.store.personas[agentId];
    const limit = opts.limit ?? 20;
    const minImp = opts.minImportance ?? 0;

    const visibleAgentIds = this._visibleAgents(agentId, persona);

    let results = this.store.memories.filter(m => {
      if (!visibleAgentIds.has(m.agentId)) return false;
      if (m.importance < minImp) return false;
      if (opts.type && m.type !== opts.type) return false;
      if (opts.tags && opts.tags.length > 0) {
        if (!opts.tags.some(t => m.tags.includes(t))) return false;
      }
      return true;
    });

    // Keyword relevance score if topic provided
    if (opts.topic) {
      const kws = opts.topic.toLowerCase().split(/\s+/).filter(Boolean);
      results = results
        .map(m => ({
          m,
          score: kws.filter(kw => m.content.toLowerCase().includes(kw)).length / kws.length,
        }))
        .filter(x => x.score > 0 || opts.topic === '')
        .sort((a, b) => b.score * b.m.importance - a.score * a.m.importance)
        .map(x => x.m);
    } else {
      results = results.sort((a, b) => b.importance - a.importance);
    }

    // Record access
    const top = results.slice(0, limit);
    for (const m of top) {
      m.accessCount++;
      m.updatedAt = new Date().toISOString();
    }
    if (top.length > 0) saveStore(this.store);

    return top;
  }

  private _visibleAgents(agentId: string, persona?: AgentPersona): Set<string> {
    const visible = new Set<string>([agentId, '__shared__']);
    if (!persona || !persona.isolateMemory) {
      // Open mode: see all agents
      for (const m of this.store.memories) visible.add(m.agentId);
    } else if (persona.sharedGroupId) {
      // Group mode: see agents in same group
      for (const p of Object.values(this.store.personas)) {
        if (p.sharedGroupId === persona.sharedGroupId) visible.add(p.agentId);
      }
    }
    return visible;
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  stats(): {
    total: number;
    shared: number;
    byAgent: Record<string, number>;
    byType: Record<string, number>;
  } {
    const byAgent: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let shared = 0;
    for (const m of this.store.memories) {
      byAgent[m.agentId] = (byAgent[m.agentId] ?? 0) + 1;
      byType[m.type]     = (byType[m.type] ?? 0) + 1;
      if (m.agentId === '__shared__') shared++;
    }
    return { total: this.store.memories.length, shared, byAgent, byType };
  }
}

/** Singleton instance */
export const agentMemory = new AgentMemoryManager();
