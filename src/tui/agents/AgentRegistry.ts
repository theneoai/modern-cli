/**
 * AgentRegistry.ts — Agent 配置注册表
 *
 * 持久化: ~/.neo/agents/<id>.json  (mode 0o600)
 *
 * 职责:
 *   - 加载/保存所有 Agent 的配置文件
 *   - 内置 Agent 首次运行时自动播种
 *   - 提供 CRUD 操作
 *   - 自定义 Agent 可随时创建/修改/删除
 *
 * 设计:
 *   - 每个 Agent 独立文件，易于单独备份/编辑
 *   - 内置 Agent 标记 meta.builtin=true，不可删除
 *   - 运行时缓存，文件操作用原子写 (tmp → rename)
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentDef, AgentType } from './AgentDef.js';
import { BUILTIN_AGENT_DEFS, now } from './AgentDef.js';

// ── Storage ───────────────────────────────────────────────────────────────────

const AGENTS_DIR = join(homedir(), '.neo', 'agents');

function ensureDir(): void {
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true, mode: 0o700 });
  }
}

function agentPath(id: string): string {
  return join(AGENTS_DIR, `${id}.json`);
}

function writeAgent(def: AgentDef): void {
  ensureDir();
  const tmp = agentPath(def.id) + '.tmp';
  writeFileSync(tmp, JSON.stringify(def, null, 2), { encoding: 'utf-8', mode: 0o600 });
  renameSync(tmp, agentPath(def.id));
}

function readAgent(id: string): AgentDef | null {
  try {
    const raw = readFileSync(agentPath(id), 'utf-8');
    return JSON.parse(raw) as AgentDef;
  } catch {
    return null;
  }
}

// ── Registry Class ────────────────────────────────────────────────────────────

export class AgentRegistry {
  private cache = new Map<string, AgentDef>();

  constructor() {
    this.load();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private load(): void {
    ensureDir();

    // Seed built-in agents if their files don't exist yet
    for (const def of BUILTIN_AGENT_DEFS) {
      if (!existsSync(agentPath(def.id))) {
        writeAgent(def);
      }
    }

    // Load all agent files
    try {
      const files = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
      for (const file of files) {
        const id = file.slice(0, -5);
        const def = readAgent(id);
        if (def && def.id) {
          // Merge with builtin defaults to handle schema upgrades
          const builtin = BUILTIN_AGENT_DEFS.find(b => b.id === id);
          this.cache.set(id, builtin ? this.mergeWithBuiltin(def, builtin) : def);
        }
      }
    } catch {
      // If dir read fails, fall back to in-memory builtins
      for (const def of BUILTIN_AGENT_DEFS) {
        this.cache.set(def.id, def);
      }
    }
  }

  /**
   * Merge saved config with builtin defaults, preserving user customizations.
   * Priority: saved > builtin for persona/memory; builtin wins for meta.builtin
   */
  private mergeWithBuiltin(saved: AgentDef, builtin: AgentDef): AgentDef {
    return {
      ...builtin,
      ...saved,
      persona: { ...builtin.persona, ...saved.persona },
      capabilities: { ...builtin.capabilities, ...saved.capabilities },
      memory: { ...builtin.memory, ...saved.memory },
      meta: { ...saved.meta, builtin: builtin.meta.builtin },
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  list(type?: AgentType): AgentDef[] {
    const all = [...this.cache.values()];
    return type ? all.filter(a => a.type === type) : all;
  }

  get(id: string): AgentDef | undefined {
    return this.cache.get(id);
  }

  /**
   * Create a new custom agent.
   * id defaults to slug of persona.name if not provided.
   */
  create(partial: Partial<AgentDef> & { persona: Pick<AgentDef['persona'], 'name' | 'role'> }): AgentDef {
    const id = partial.id ?? slugify(partial.persona.name);
    if (this.cache.has(id)) throw new Error(`Agent "${id}" already exists`);

    const def: AgentDef = {
      id,
      type: partial.type ?? 'custom',
      enabled: partial.enabled ?? true,
      persona: {
        name: partial.persona.name,
        role: partial.persona.role,
        description: partial.persona.description ?? '',
        avatar: partial.persona.avatar ?? '🤖',
        personality: partial.persona.personality ?? 'professional',
        systemPrompt: partial.persona.systemPrompt ?? `你是 ${partial.persona.name}，角色: ${partial.persona.role}。\n\n{{memories}}`,
        masterTitle: partial.persona.masterTitle,
      },
      capabilities: partial.capabilities ?? {
        tools: ['web_search', 'read_file'],
        maxRoundsPerTask: 10,
        tokenBudgetPerTask: 0,
        canInitiate: false,
        canDelegate: false,
      },
      memory: partial.memory ?? {
        isolation: 'shared',
        maxEntries: 200,
        persistHistory: true,
        maxHistoryRounds: 10,
      },
      meta: {
        builtin: false,
        version: 1,
        createdAt: now(),
        updatedAt: now(),
      },
    };

    this.cache.set(id, def);
    writeAgent(def);
    return def;
  }

  /**
   * Update an agent's config.
   * Deep-merges persona, capabilities, memory sub-objects.
   */
  update(id: string, patch: DeepPartial<AgentDef>): AgentDef {
    const existing = this.cache.get(id);
    if (!existing) throw new Error(`Agent "${id}" not found`);

    const updated: AgentDef = {
      ...existing,
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      persona: patch.persona ? { ...existing.persona, ...patch.persona } : existing.persona,
      capabilities: patch.capabilities
        ? { ...existing.capabilities, ...patch.capabilities }
        : existing.capabilities,
      memory: patch.memory ? { ...existing.memory, ...patch.memory } : existing.memory,
      meta: { ...existing.meta, updatedAt: now() },
    };

    this.cache.set(id, updated);
    writeAgent(updated);
    return updated;
  }

  /**
   * Delete a custom agent. Built-in agents cannot be deleted (only disabled).
   */
  delete(id: string): boolean {
    const def = this.cache.get(id);
    if (!def) return false;
    if (def.meta.builtin) throw new Error(`内置 Agent "${id}" 不可删除，可用 disable 禁用`);

    this.cache.delete(id);
    try { unlinkSync(agentPath(id)); } catch { /* best-effort */ }
    return true;
  }

  /** Toggle enabled state */
  setEnabled(id: string, enabled: boolean): AgentDef {
    return this.update(id, { enabled });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u4e00-\u9fff]/g, (c) => c.codePointAt(0)!.toString(36)) // CJK → base36
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || `agent-${Date.now()}`;
}

// Minimal deep partial type
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
