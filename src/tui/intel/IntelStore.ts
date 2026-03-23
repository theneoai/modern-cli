/**
 * IntelStore.ts — 情报数据持久化
 *
 * 持久化: ~/.neo/intel.json
 * 格式: 数组，按时间倒序，最多保留 MAX_ITEMS 条
 *
 * IntelItem 字段:
 *   id        唯一 ID
 *   source    来源 (hackernews / weather / github / rss / search / monitor)
 *   title     标题 / 摘要
 *   url       原始链接 (可选)
 *   body      详细内容 (可选)
 *   score     重要性分数 0-100
 *   tags      分类标签
 *   fetchedAt ISO 时间戳
 *   read      是否已读
 */

import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntelSource =
  | 'hackernews'
  | 'weather'
  | 'github'
  | 'rss'
  | 'search'
  | 'exchange'
  | 'monitor'
  | 'manual';

export interface IntelItem {
  id: string;
  source: IntelSource;
  title: string;
  url?: string;
  body?: string;
  score: number;       // 0-100 importance
  tags: string[];
  fetchedAt: string;   // ISO 8601
  read: boolean;
  extra?: Record<string, unknown>; // source-specific metadata
}

// ── Storage ───────────────────────────────────────────────────────────────────

const NEO_DIR  = join(homedir(), '.neo');
const INTEL_FILE = join(NEO_DIR, 'intel.json');
const MAX_ITEMS = 300;

function ensureDir() {
  if (!existsSync(NEO_DIR)) mkdirSync(NEO_DIR, { recursive: true, mode: 0o700 });
}

// ── IntelStore ────────────────────────────────────────────────────────────────

export class IntelStore {
  private items: IntelItem[] = [];
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  // ── Load / Save ──────────────────────────────────────────────────────────

  private load() {
    try {
      if (existsSync(INTEL_FILE)) {
        const raw = readFileSync(INTEL_FILE, 'utf-8');
        this.items = JSON.parse(raw) as IntelItem[];
      }
    } catch {
      this.items = [];
    }
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 2000);
  }

  flush() {
    if (!this.dirty) return;
    try {
      ensureDir();
      writeFileSync(INTEL_FILE, JSON.stringify(this.items, null, 2), { encoding: 'utf-8', mode: 0o600 });
      this.dirty = false;
    } catch {}
  }

  // ── Write ────────────────────────────────────────────────────────────────

  /** Add or update items. De-duplicates by title+source within 24h. */
  upsert(incoming: Omit<IntelItem, 'id' | 'read' | 'fetchedAt'>[]): IntelItem[] {
    const now = new Date().toISOString();
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const added: IntelItem[] = [];

    for (const item of incoming) {
      // Deduplicate: same source + same title in last 24h
      const isDup = this.items.some(
        e => e.source === item.source
          && e.title === item.title
          && new Date(e.fetchedAt).getTime() > cutoff,
      );
      if (isDup) continue;

      const newItem: IntelItem = {
        ...item,
        id: `${item.source}-${randomUUID()}`,
        fetchedAt: now,
        read: false,
      };
      this.items.unshift(newItem);
      added.push(newItem);
    }

    // Trim to max
    if (this.items.length > MAX_ITEMS) {
      this.items = this.items.slice(0, MAX_ITEMS);
    }

    if (added.length > 0) {
      this.dirty = true;
      this.scheduleSave();
    }

    return added;
  }

  markRead(id: string) {
    const item = this.items.find(i => i.id === id);
    if (item && !item.read) {
      item.read = true;
      this.dirty = true;
      this.scheduleSave();
    }
  }

  // ── Query ────────────────────────────────────────────────────────────────

  getRecent(limit = 20, source?: IntelSource): IntelItem[] {
    const items = source ? this.items.filter(i => i.source === source) : this.items;
    return items.slice(0, limit);
  }

  getUnread(limit = 10): IntelItem[] {
    return this.items.filter(i => !i.read).slice(0, limit);
  }

  search(query: string, limit = 10): IntelItem[] {
    const q = query.toLowerCase();
    return this.items
      .filter(i => i.title.toLowerCase().includes(q) || i.body?.toLowerCase().includes(q))
      .slice(0, limit);
  }

  /** Context block for injection into companion system prompt */
  toContextBlock(limit = 8): string {
    const recent = this.getRecent(limit);
    if (recent.length === 0) return '';
    const lines = recent.map(i => {
      const age = Math.round((Date.now() - new Date(i.fetchedAt).getTime()) / 60000);
      const ageStr = age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
      return `[${i.source}|${ageStr}] ${i.title}`;
    });
    return `## 最新情报 (${recent.length} items)\n${lines.join('\n')}`;
  }

  stats() {
    return {
      total: this.items.length,
      unread: this.items.filter(i => !i.read).length,
      bySource: Object.fromEntries(
        (['hackernews','weather','github','rss','search','exchange','monitor'] as IntelSource[])
          .map(s => [s, this.items.filter(i => i.source === s).length]),
      ),
    };
  }
}

export const intelStore = new IntelStore();
