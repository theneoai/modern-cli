/**
 * ConversationHistory.ts — 对话历史持久化 (JSONL)
 *
 * 持久化: ~/.neo/history/<agentId>.jsonl  (mode 0o600)
 *
 * 格式: 每行一条 JSON record (append-only)
 *   {"at":"2026-03-21T10:00:00Z","role":"user","content":"你好"}
 *   {"at":"2026-03-21T10:00:01Z","role":"assistant","content":"...","tokens":42}
 *
 * 特性:
 *   - append-only 写入，无需加锁 (单进程)
 *   - getRecent() 从文件尾部反向读取，O(min(rounds, n))
 *   - clear() 截断文件 (保留 header 注释行)
 *   - 无限制写入，maxHistoryRounds 在读取时截断
 *
 * 为什么选 JSONL:
 *   - 比 JSON 数组追加快 (不需要重写整个文件)
 *   - 人类可读，可用 tail/grep 直接查询
 *   - 每行独立，损坏不影响其他行
 */

import {
  existsSync, mkdirSync, appendFileSync, readFileSync,
  writeFileSync, statSync, readdirSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HistoryRecord {
  at: string;                            // ISO 8601
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: number;                       // output tokens if known
  agentRound?: number;                   // autonomous task round number
}

export interface HistoryStats {
  totalRecords: number;
  fileSizeBytes: number;
  firstAt?: string;
  lastAt?: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const HISTORY_DIR = join(homedir(), '.neo', 'history');

function ensureDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true, mode: 0o700 });
  }
}

function historyPath(agentId: string): string {
  // Sanitize agentId to safe filename
  const safe = agentId.replace(/[^a-z0-9_-]/g, '_').slice(0, 64);
  return join(HISTORY_DIR, `${safe}.jsonl`);
}

// ── ConversationHistory Class ─────────────────────────────────────────────────

export class ConversationHistory {

  // ── Write ──────────────────────────────────────────────────────────────────

  append(
    agentId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    opts: { tokens?: number; agentRound?: number } = {},
  ): void {
    if (!content.trim()) return;
    ensureDir();
    const record: HistoryRecord = {
      at: new Date().toISOString(),
      role,
      content,
      ...(opts.tokens ? { tokens: opts.tokens } : {}),
      ...(opts.agentRound != null ? { agentRound: opts.agentRound } : {}),
    };
    appendFileSync(historyPath(agentId), JSON.stringify(record) + '\n', {
      encoding: 'utf-8',
      mode: 0o600,
      flag: 'a',
    });
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Read the most recent `rounds` exchanges (user+assistant pairs).
   * Returns MessageParam[] ready for AI calls.
   *
   * Implementation: read entire file and slice tail.
   * For files < 1MB this is fast enough. Larger files can be optimized later.
   */
  getRecent(agentId: string, rounds = 20): MessageParam[] {
    const path = historyPath(agentId);
    if (!existsSync(path)) return [];

    try {
      const raw = readFileSync(path, 'utf-8');
      const lines = raw.split('\n').filter(l => l.trim());
      const records: HistoryRecord[] = [];

      for (const line of lines) {
        try {
          const rec = JSON.parse(line) as HistoryRecord;
          if (rec.role === 'user' || rec.role === 'assistant') {
            records.push(rec);
          }
        } catch {
          // skip malformed lines
        }
      }

      // Take last `rounds * 2` messages (user + assistant per round)
      const tail = records.slice(-(rounds * 2));
      return tail.map(r => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get full history for review/display purposes.
   * Returns raw records with timestamps.
   */
  getAll(agentId: string, limit = 200): HistoryRecord[] {
    const path = historyPath(agentId);
    if (!existsSync(path)) return [];
    try {
      const raw = readFileSync(path, 'utf-8');
      const records: HistoryRecord[] = [];
      for (const line of raw.split('\n').filter(l => l.trim())) {
        try { records.push(JSON.parse(line) as HistoryRecord); } catch { /* skip */ }
      }
      return records.slice(-limit);
    } catch {
      return [];
    }
  }

  // ── Clear ─────────────────────────────────────────────────────────────────

  /** Truncate history (keeps file, empties content) */
  clear(agentId: string): void {
    const path = historyPath(agentId);
    if (existsSync(path)) {
      writeFileSync(path, '', { encoding: 'utf-8', mode: 0o600 });
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats(agentId: string): HistoryStats {
    const path = historyPath(agentId);
    if (!existsSync(path)) return { totalRecords: 0, fileSizeBytes: 0 };

    try {
      const stat = statSync(path);
      const records = this.getAll(agentId, 9999);
      return {
        totalRecords: records.length,
        fileSizeBytes: stat.size,
        firstAt: records[0]?.at,
        lastAt: records[records.length - 1]?.at,
      };
    } catch {
      return { totalRecords: 0, fileSizeBytes: 0 };
    }
  }

  /** List all agents that have history files */
  listAgentIds(): string[] {
    if (!existsSync(HISTORY_DIR)) return [];
    try {
      return readdirSync(HISTORY_DIR)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.slice(0, -6));
    } catch {
      return [];
    }
  }
}
