/**
 * Agent Memory System
 *
 * Each agent has its own private memory store (episodic/semantic/procedural).
 * A shared memory pool is accessible to all agents.
 * Memories can be distilled (compressed by AI) to prevent unbounded growth.
 *
 * Storage layout:
 *   ~/.config/modern-ai-cli/memory/<agentName>.json   ← private
 *   ~/.config/modern-ai-cli/memory/shared.json         ← shared pool
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryType = "episodic" | "semantic" | "procedural" | "working";

export const MEMORY_TYPE_DESCRIPTIONS: Record<MemoryType, string> = {
  episodic:    "Specific events, interactions, and experiences",
  semantic:    "General facts, knowledge, and distilled insights",
  procedural:  "How-to knowledge, patterns, and workflows",
  working:     "Temporary notes for current task (auto-cleared after distill)",
};

export interface MemoryEntry {
  id: string;
  agentName: string; // "shared" for shared memories
  type: MemoryType;
  content: string;
  summary?: string;         // short 1-line summary for display
  tags: string[];
  importance: number;       // 0–10, higher = more important
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
  relatedIds?: string[];
  sourceTask?: string;      // task ID that generated this memory
}

export interface AgentMemoryStore {
  agentName: string;
  entries: MemoryEntry[];
  lastDistilledAt?: string;
  version: 1;
}

export interface DistillResult {
  removed: number;
  added: number;
  summary: string;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const MEMORY_DIR = join(homedir(), ".config", "modern-ai-cli", "memory");

function ensureDir(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function storePath(agentName: string): string {
  // sanitize to safe filename
  const safe = agentName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(MEMORY_DIR, `${safe}.json`);
}

function loadStore(agentName: string): AgentMemoryStore {
  const path = storePath(agentName);
  if (!existsSync(path)) {
    return { agentName, entries: [], version: 1 };
  }
  return JSON.parse(readFileSync(path, "utf8")) as AgentMemoryStore;
}

function saveStore(store: AgentMemoryStore): void {
  ensureDir();
  writeFileSync(storePath(store.agentName), JSON.stringify(store, null, 2));
}

// ---------------------------------------------------------------------------
// Private memory operations
// ---------------------------------------------------------------------------

export function addMemory(
  agentName: string,
  content: string,
  type: MemoryType = "episodic",
  opts: {
    tags?: string[];
    importance?: number;
    summary?: string;
    sourceTask?: string;
  } = {}
): MemoryEntry {
  const store = loadStore(agentName);
  const entry: MemoryEntry = {
    id: randomUUID(),
    agentName,
    type,
    content,
    summary: opts.summary,
    tags: opts.tags ?? [],
    importance: opts.importance ?? 5,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    accessCount: 0,
    sourceTask: opts.sourceTask,
  };
  store.entries.push(entry);
  saveStore(store);
  return entry;
}

export function getMemories(
  agentName: string,
  opts: {
    query?: string;
    type?: MemoryType;
    limit?: number;
    minImportance?: number;
  } = {}
): MemoryEntry[] {
  const store = loadStore(agentName);
  let entries = store.entries;

  if (opts.type) entries = entries.filter((e) => e.type === opts.type);
  if (opts.minImportance !== undefined)
    entries = entries.filter((e) => e.importance >= opts.minImportance!);

  if (opts.query) {
    const q = opts.query.toLowerCase();
    entries = entries
      .map((e) => ({
        entry: e,
        score: scoreMemory(e, q),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ entry }) => entry);
  } else {
    // default: most important + most recent
    entries = [...entries].sort(
      (a, b) =>
        b.importance - a.importance ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const limit = opts.limit ?? 20;
  const result = entries.slice(0, limit);

  // Update access counts
  const ids = new Set(result.map((e) => e.id));
  const updatedStore = loadStore(agentName);
  updatedStore.entries = updatedStore.entries.map((e) =>
    ids.has(e.id)
      ? { ...e, accessCount: e.accessCount + 1, lastAccessedAt: new Date().toISOString() }
      : e
  );
  saveStore(updatedStore);

  return result;
}

function scoreMemory(entry: MemoryEntry, query: string): number {
  let score = 0;
  if (entry.content.toLowerCase().includes(query)) score += 3;
  if (entry.summary?.toLowerCase().includes(query)) score += 2;
  if (entry.tags.some((t) => t.toLowerCase().includes(query))) score += 2;
  if (score > 0) score += entry.importance * 0.1; // importance as tiebreaker
  return score;
}

export function removeMemory(agentName: string, id: string): boolean {
  const store = loadStore(agentName);
  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.id !== id);
  saveStore(store);
  return store.entries.length < before;
}

export function clearMemories(agentName: string): number {
  const store = loadStore(agentName);
  const count = store.entries.length;
  store.entries = [];
  store.lastDistilledAt = undefined;
  saveStore(store);
  return count;
}

export function listAgentsWithMemory(): string[] {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((n) => n !== "shared");
}

// ---------------------------------------------------------------------------
// Shared memory
// ---------------------------------------------------------------------------

const SHARED_AGENT = "shared";

export function addSharedMemory(
  content: string,
  opts: {
    contributor?: string;
    tags?: string[];
    importance?: number;
    summary?: string;
    type?: MemoryType;
  } = {}
): MemoryEntry {
  return addMemory(SHARED_AGENT, content, opts.type ?? "semantic", {
    tags: [
      ...(opts.tags ?? []),
      ...(opts.contributor ? [`from:${opts.contributor}`] : []),
    ],
    importance: opts.importance ?? 5,
    summary: opts.summary,
  });
}

export function getSharedMemories(opts: {
  query?: string;
  limit?: number;
} = {}): MemoryEntry[] {
  return getMemories(SHARED_AGENT, { ...opts, limit: opts.limit ?? 10 });
}

export function clearSharedMemory(): number {
  return clearMemories(SHARED_AGENT);
}

// ---------------------------------------------------------------------------
// Memory distillation (AI-powered compression)
// ---------------------------------------------------------------------------

export async function distillMemories(agentName: string): Promise<DistillResult> {
  const store = loadStore(agentName);

  if (store.entries.length < 5) {
    return { removed: 0, added: 0, summary: "Not enough memories to distill (need ≥ 5)" };
  }

  // Separate working memories and low-importance old ones for compression
  const working = store.entries.filter((e) => e.type === "working");
  const old = store.entries
    .filter((e) => e.type !== "working" && e.importance < 7)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 30); // compress oldest low-importance memories

  const toCompress = [...working, ...old];
  if (toCompress.length < 3) {
    return { removed: 0, added: 0, summary: "No memories eligible for distillation" };
  }

  const config = await getConfig();
  const client = new Anthropic({ apiKey: config.apiKey });

  const memText = toCompress
    .map((e, i) => `[${i + 1}] (${e.type}, importance:${e.importance}) ${e.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-6",
    max_tokens: 1024,
    system: "You are a memory distillation agent. Compress and synthesize memories into compact semantic facts.",
    messages: [
      {
        role: "user",
        content: `The following are memories for agent "${agentName}". Distill them into 3-7 concise semantic facts that preserve the most important insights. Each fact should be 1-2 sentences.\n\nOutput ONLY a JSON array of strings (the distilled facts):\n\n${memText}`,
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "[]";
  let facts: string[] = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    facts = JSON.parse(match?.[0] ?? "[]") as string[];
  } catch {
    facts = [text]; // fallback: store raw summary
  }

  // Remove compressed memories, add distilled ones
  const compressedIds = new Set(toCompress.map((e) => e.id));
  const freshStore = loadStore(agentName);
  freshStore.entries = freshStore.entries.filter((e) => !compressedIds.has(e.id));

  for (const fact of facts) {
    const entry: MemoryEntry = {
      id: randomUUID(),
      agentName,
      type: "semantic",
      content: fact,
      tags: ["distilled"],
      importance: 7,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      accessCount: 0,
    };
    freshStore.entries.push(entry);
  }

  freshStore.lastDistilledAt = new Date().toISOString();
  saveStore(freshStore);

  return {
    removed: toCompress.length,
    added: facts.length,
    summary: `Compressed ${toCompress.length} memories → ${facts.length} distilled facts`,
  };
}

// ---------------------------------------------------------------------------
// Memory context builder (for injecting into agent prompts)
// ---------------------------------------------------------------------------

export function buildMemoryContext(
  agentName: string,
  query?: string,
  includeShared = true
): string {
  const privateMemories = getMemories(agentName, {
    query,
    limit: 8,
    minImportance: 3,
  });

  const sharedMemories = includeShared
    ? getSharedMemories({ query, limit: 5 })
    : [];

  if (privateMemories.length === 0 && sharedMemories.length === 0) return "";

  const sections: string[] = [];

  if (privateMemories.length > 0) {
    sections.push(
      "## Your Memory\n" +
        privateMemories
          .map((m) => `- [${m.type}] ${m.summary ?? m.content}`)
          .join("\n")
    );
  }

  if (sharedMemories.length > 0) {
    sections.push(
      "## Shared Team Memory\n" +
        sharedMemories
          .map((m) => `- ${m.summary ?? m.content}`)
          .join("\n")
    );
  }

  return `[Memory Context]\n${sections.join("\n\n")}\n`;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface MemoryStats {
  agentName: string;
  total: number;
  byType: Record<MemoryType, number>;
  avgImportance: number;
  lastDistilledAt?: string;
}

export function getMemoryStats(agentName: string): MemoryStats {
  const store = loadStore(agentName);
  const byType: Record<MemoryType, number> = {
    episodic: 0, semantic: 0, procedural: 0, working: 0,
  };
  let totalImportance = 0;
  for (const e of store.entries) {
    byType[e.type]++;
    totalImportance += e.importance;
  }
  return {
    agentName,
    total: store.entries.length,
    byType,
    avgImportance: store.entries.length > 0 ? totalImportance / store.entries.length : 0,
    lastDistilledAt: store.lastDistilledAt,
  };
}

export function getAllMemoryStats(): MemoryStats[] {
  if (!existsSync(MEMORY_DIR)) return [];
  return readdirSync(MEMORY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .map(getMemoryStats);
}
