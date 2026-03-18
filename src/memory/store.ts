/**
 * Memory System - Episodic, Semantic, Procedural, Working memory
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import type { Memory, MemoryQuery } from '../types/index.js';

export function addMemory(
  agentId: string,
  content: string,
  type: Memory['type'],
  options: {
    importance?: number;
    tags?: string[];
    summary?: string;
    metadata?: any;
  } = {}
): Memory {
  const memory: Memory = {
    id: uuidv4(),
    agentId,
    type,
    content,
    summary: options.summary || content.slice(0, 100),
    importance: options.importance ?? 5,
    tags: options.tags || [],
    metadata: options.metadata || {},
    createdAt: new Date(),
    accessCount: 0,
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO memories (id, agent_id, type, content, summary, importance, tags, metadata, created_at, access_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    memory.id,
    memory.agentId,
    memory.type,
    memory.content,
    memory.summary,
    memory.importance,
    JSON.stringify(memory.tags),
    JSON.stringify(memory.metadata),
    memory.createdAt.toISOString(),
    memory.accessCount
  );

  events.emit('memory.created', {
    memoryId: memory.id,
    agentId,
    type,
    importance: memory.importance,
  });

  return memory;
}

export function getMemories(query: MemoryQuery): Memory[] {
  const db = getDB();
  let sql = 'SELECT * FROM memories WHERE 1=1';
  const params: any[] = [];

  if (query.agentId) {
    sql += ' AND agent_id = ?';
    params.push(query.agentId);
  }

  if (query.type) {
    sql += ' AND type = ?';
    params.push(query.type);
  }

  if (query.minImportance) {
    sql += ' AND importance >= ?';
    params.push(query.minImportance);
  }

  if (query.tags && query.tags.length > 0) {
    sql += ' AND (' + query.tags.map(() => 'tags LIKE ?').join(' OR ') + ')';
    params.push(...query.tags.map(t => `%${t}%`));
  }

  if (query.query) {
    sql += ' AND (content LIKE ? OR summary LIKE ?)';
    params.push(`%${query.query}%`, `%${query.query}%`);
  }

  sql += ' ORDER BY importance DESC, created_at DESC';

  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(deserializeMemory);
}

export function accessMemory(id: string): Memory | undefined {
  const db = getDB();
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
  
  if (!row) return undefined;

  // Update access count and time
  db.prepare('UPDATE memories SET access_count = access_count + 1, accessed_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);

  events.emit('memory.accessed', { memoryId: id, agentId: row.agent_id });

  return deserializeMemory(row);
}

export function deleteMemory(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  return result.changes > 0;
}

export function consolidateMemories(agentId: string): void {
  const db = getDB();
  
  // Remove old working memories
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    DELETE FROM memories 
    WHERE agent_id = ? AND type = 'working' AND created_at < ?
  `).run(agentId, cutoff);

  // Consolidate similar episodic memories (simple implementation)
  const episodic = db.prepare(`
    SELECT * FROM memories 
    WHERE agent_id = ? AND type = 'episodic' AND importance < 5
    ORDER BY created_at DESC
    LIMIT 100 OFFSET 50
  `).all(agentId) as any[];

  // Mark old low-importance memories as consolidated
  for (const row of episodic) {
    db.prepare('UPDATE memories SET metadata = ? WHERE id = ?')
      .run(JSON.stringify({ ...JSON.parse(row.metadata), consolidated: true }), row.id);
  }

  events.emit('memory.consolidated', { agentId, count: episodic.length });
}

export function getMemoryStats(agentId?: string): { total: number; byType: Record<string, number> } {
  const db = getDB();
  let sql = 'SELECT type, COUNT(*) as count FROM memories';
  const params: any[] = [];

  if (agentId) {
    sql += ' WHERE agent_id = ?';
    params.push(agentId);
  }

  sql += ' GROUP BY type';

  const rows = db.prepare(sql).all(...params) as any[];
  const byType: Record<string, number> = {};
  let total = 0;

  for (const row of rows) {
    byType[row.type] = row.count;
    total += row.count;
  }

  return { total, byType };
}

function deserializeMemory(row: any): Memory {
  return {
    id: row.id,
    agentId: row.agent_id,
    type: row.type,
    content: row.content,
    summary: row.summary,
    importance: row.importance,
    tags: JSON.parse(row.tags),
    metadata: JSON.parse(row.metadata),
    createdAt: new Date(row.created_at),
    accessedAt: row.accessed_at ? new Date(row.accessed_at) : undefined,
    accessCount: row.access_count,
  };
}
