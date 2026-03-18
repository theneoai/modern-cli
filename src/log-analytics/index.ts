/**
 * Log Analytics - Intelligent log analysis and anomaly detection
 */


import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  source: string;
  message: string;
  metadata?: any;
  hash: string; // For deduplication
}

export interface LogPattern {
  id: string;
  pattern: string;
  regex: RegExp;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  severity: 'low' | 'medium' | 'high';
}

export interface Anomaly {
  id: string;
  type: 'spike' | 'new_pattern' | 'error_burst' | 'latency';
  description: string;
  startTime: Date;
  endTime?: Date;
  affectedLogs: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  acknowledged: boolean;
}

// Ingest log file
export async function ingestLogFile(filePath: string, source: string): Promise<number> {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  const batch: LogEntry[] = [];
  const batchSize = 1000;

  for await (const line of rl) {
    const entry = parseLogLine(line, source);
    if (entry) {
      batch.push(entry);
      count++;

      if (batch.length >= batchSize) {
        await saveLogBatch(batch);
        batch.length = 0;
      }
    }
  }

  if (batch.length > 0) {
    await saveLogBatch(batch);
  }

  events.emit('logs.ingested', { source, count });
  return count;
}

// Parse log line
function parseLogLine(line: string, source: string): LogEntry | null {
  if (!line.trim()) return null;

  // Try common log formats
  
  // ISO timestamp format: 2024-01-15T10:30:00Z [INFO] message
  let match = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)\s*\[(\w+)\]\s*(.+)/);
  if (match) {
    return createLogEntry(match[1], match[2], match[3], source);
  }

  // Standard format: Jan 15 10:30:00 app[123]: message
  match = line.match(/(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\w+)\[(\d+)\]:\s*(.+)/);
  if (match) {
    return createLogEntry(match[1], 'info', match[4], source);
  }

  // JSON format
  try {
    const json = JSON.parse(line);
    return createLogEntry(
      json.timestamp || json.time || new Date().toISOString(),
      json.level || json.severity || 'info',
      json.message || json.msg || JSON.stringify(json),
      source,
      json
    );
  } catch {
    // Not JSON
  }

  // Default: treat entire line as message
  return createLogEntry(new Date().toISOString(), 'info', line, source);
}

function createLogEntry(
  timestamp: string,
  level: string,
  message: string,
  source: string,
  metadata?: any
): LogEntry {
  const normalizedLevel = normalizeLevel(level);
  const hash = hashString(`${timestamp}:${message}`);

  return {
    id: `${Date.now()}-${hash.slice(0, 8)}`,
    timestamp: new Date(timestamp),
    level: normalizedLevel,
    source,
    message: message.slice(0, 1000), // Limit length
    metadata,
    hash,
  };
}

function normalizeLevel(level: string): LogEntry['level'] {
  const map: Record<string, LogEntry['level']> = {
    'debug': 'debug', 'DEBUG': 'debug', 'Debug': 'debug',
    'info': 'info', 'INFO': 'info', 'Info': 'info', 'information': 'info',
    'warn': 'warn', 'WARN': 'warn', 'Warning': 'warn', 'warning': 'warn',
    'error': 'error', 'ERROR': 'error', 'Error': 'error',
    'fatal': 'fatal', 'FATAL': 'fatal', 'Fatal': 'fatal', 'critical': 'fatal',
  };
  return map[level] || 'info';
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

async function saveLogBatch(batch: LogEntry[]): Promise<void> {
  const db = getDB();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO logs (id, timestamp, level, source, message, metadata, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entry of batch) {
    stmt.run(
      entry.id,
      entry.timestamp.toISOString(),
      entry.level,
      entry.source,
      entry.message,
      JSON.stringify(entry.metadata),
      entry.hash
    );
  }
}

// Query logs
export function queryLogs(filters: {
  level?: LogEntry['level'];
  source?: string;
  startTime?: Date;
  endTime?: Date;
  search?: string;
  limit?: number;
}): LogEntry[] {
  const db = getDB();
  let sql = 'SELECT * FROM logs WHERE 1=1';
  const params: any[] = [];

  if (filters.level) {
    sql += ' AND level = ?';
    params.push(filters.level);
  }

  if (filters.source) {
    sql += ' AND source = ?';
    params.push(filters.source);
  }

  if (filters.startTime) {
    sql += ' AND timestamp >= ?';
    params.push(filters.startTime.toISOString());
  }

  if (filters.endTime) {
    sql += ' AND timestamp <= ?';
    params.push(filters.endTime.toISOString());
  }

  if (filters.search) {
    sql += ' AND message LIKE ?';
    params.push(`%${filters.search}%`);
  }

  sql += ' ORDER BY timestamp DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(deserializeLog);
}

// Get log statistics
export function getLogStats(timeRange: { hours?: number; days?: number } = { hours: 24 }): {
  total: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
  errorRate: number;
} {
  const db = getDB();
  const hours = timeRange.hours || (timeRange.days || 1) * 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const total = db.prepare('SELECT COUNT(*) as count FROM logs WHERE timestamp > ?').get(cutoff) as { count: number };

  const byLevel = db.prepare(`
    SELECT level, COUNT(*) as count FROM logs 
    WHERE timestamp > ? 
    GROUP BY level
  `).all(cutoff) as Array<{ level: string; count: number }>;

  const bySource = db.prepare(`
    SELECT source, COUNT(*) as count FROM logs 
    WHERE timestamp > ? 
    GROUP BY source
  `).all(cutoff) as Array<{ source: string; count: number }>;

  const errors = db.prepare(`
    SELECT COUNT(*) as count FROM logs 
    WHERE timestamp > ? AND level IN ('error', 'fatal')
  `).get(cutoff) as { count: number };

  return {
    total: total.count,
    byLevel: Object.fromEntries(byLevel.map(r => [r.level, r.count])),
    bySource: Object.fromEntries(bySource.map(r => [r.source, r.count])),
    errorRate: total.count > 0 ? (errors.count / total.count) * 100 : 0,
  };
}

// Detect anomalies
export function detectAnomalies(): Anomaly[] {
  const db = getDB();
  const anomalies: Anomaly[] = [];

  // Check for error spikes
  const lastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const prevHour = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const currentErrors = db.prepare(`
    SELECT COUNT(*) as count FROM logs 
    WHERE timestamp > ? AND level IN ('error', 'fatal')
  `).get(lastHour) as { count: number };

  const previousErrors = db.prepare(`
    SELECT COUNT(*) as count FROM logs 
    WHERE timestamp > ? AND timestamp <= ? AND level IN ('error', 'fatal')
  `).get(prevHour, lastHour) as { count: number };

  if (currentErrors.count > previousErrors.count * 2 && currentErrors.count > 10) {
    anomalies.push({
      id: `spike-${Date.now()}`,
      type: 'error_burst',
      description: `Error count increased by ${Math.round((currentErrors.count / (previousErrors.count || 1)) * 100)}%`,
      startTime: new Date(lastHour),
      affectedLogs: [],
      severity: currentErrors.count > 50 ? 'critical' : 'high',
      acknowledged: false,
    });
  }

  return anomalies;
}

// Extract patterns
export function extractPatterns(): LogPattern[] {
  const db = getDB();
  const logs = db.prepare('SELECT message FROM logs ORDER BY timestamp DESC LIMIT 10000').all() as Array<{ message: string }>;

  const patterns = new Map<string, { count: number; example: string }>();

  for (const log of logs) {
    // Extract pattern by replacing variable parts with placeholders
    const pattern = log.message
      .replace(/\b[0-9a-f]{8,}\b/g, '<ID>') // UUIDs, hashes
      .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\b/g, '<TIMESTAMP>') // Timestamps
      .replace(/\b\d+\.\d+\.\d+\.\d+\b/g, '<IP>') // IPs
      .replace(/\b\d+\b/g, '<NUM>'); // Numbers

    if (pattern.length > 20) {
      const existing = patterns.get(pattern);
      if (existing) {
        existing.count++;
      } else {
        patterns.set(pattern, { count: 1, example: log.message });
      }
    }
  }

  return Array.from(patterns.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([pattern, data], index) => ({
      id: `pattern-${index}`,
      pattern,
      regex: new RegExp(pattern.replace(/<[A-Z]+>/g, '.*')),
      count: data.count,
      firstSeen: new Date(),
      lastSeen: new Date(),
      severity: data.count > 1000 ? 'high' : data.count > 100 ? 'medium' : 'low',
    }));
}

// AI-powered log analysis
export async function analyzeLogsWithAI(query: string): Promise<string> {
  const stats = getLogStats({ hours: 1 });
  const errors = queryLogs({ level: 'error', limit: 10 });

  const context = `
Log Analysis Context:
- Total logs (last hour): ${stats.total}
- Error rate: ${stats.errorRate.toFixed(2)}%
- Recent errors: ${errors.length}

Top errors:
${errors.map(e => `- ${e.message.slice(0, 100)}`).join('\n')}

User query: ${query}
`;

  // In real implementation, use context to call LLM
  void context;
  return `Analysis: Based on recent logs, the system shows ${stats.errorRate > 5 ? 'elevated' : 'normal'} error rates.`;
}

// Cleanup old logs
export function cleanupOldLogs(days: number = 30): number {
  const db = getDB();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM logs WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

// Initialize tables
export function initLogTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      level TEXT DEFAULT 'info',
      source TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      hash TEXT UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    CREATE INDEX IF NOT EXISTS idx_logs_source ON logs(source);
    CREATE INDEX IF NOT EXISTS idx_logs_hash ON logs(hash);
  `);
}

function deserializeLog(row: any): LogEntry {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    level: row.level,
    source: row.source,
    message: row.message,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    hash: row.hash,
  };
}
