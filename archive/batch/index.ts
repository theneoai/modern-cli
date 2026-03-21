/**
 * Batch Operations - Bulk actions on entities
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface BatchJob {
  id: string;
  name: string;
  operation: 'delete' | 'update' | 'export' | 'tag' | 'execute';
  entityType: string;
  filters: Record<string, unknown>;
  updates?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: { total: number; processed: number; succeeded: number; failed: number };
  results?: unknown[];
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// Create batch job
export function createBatchJob(
  name: string,
  operation: BatchJob['operation'],
  entityType: string,
  filters: Record<string, unknown>,
  updates?: Record<string, unknown>
): BatchJob {
  const db = getDB();
  const id = `batch-${Date.now()}`;
  const now = new Date();

  const job: BatchJob = {
    id,
    name,
    operation,
    entityType,
    filters,
    updates,
    status: 'pending',
    progress: { total: 0, processed: 0, succeeded: 0, failed: 0 },
    createdAt: now,
  };

  db.prepare(`
    INSERT INTO batch_jobs (id, name, operation, entity_type, filters, updates, status, progress, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    operation,
    entityType,
    JSON.stringify(filters),
    updates ? JSON.stringify(updates) : null,
    'pending',
    JSON.stringify(job.progress),
    now.toISOString()
  );

  events.emit('batch.created', { jobId: id });
  return job;
}

// Get batch job
export function getBatchJob(id: string): BatchJob | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM batch_jobs WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToBatchJob(row);
}

// List batch jobs
export function listBatchJobs(options: { status?: string; limit?: number } = {}): BatchJob[] {
  const db = getDB();
  let query = 'SELECT * FROM batch_jobs';
  const params: unknown[] = [];

  if (options.status) {
    query += ' WHERE status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY created_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToBatchJob);
}

// Execute batch job
export async function executeBatchJob(id: string): Promise<BatchJob> {
  const db = getDB();
  const job = getBatchJob(id);
  if (!job) throw new Error('Batch job not found');
  if (job.status === 'running') throw new Error('Job already running');

  // Mark as running
  db.prepare('UPDATE batch_jobs SET status = ?, started_at = ? WHERE id = ?')
    .run('running', new Date().toISOString(), id);

  events.emit('batch.started', { jobId: id });

  try {
    let results: unknown[] = [];

    switch (job.operation) {
      case 'delete':
        results = await batchDelete(job.entityType, job.filters);
        break;
      case 'tag':
        results = await batchTag(job.entityType, job.filters, job.updates?.tags as string[]);
        break;
      case 'update':
        results = await batchUpdate(job.entityType, job.filters, job.updates || {});
        break;
      case 'export':
        results = await batchExport(job.entityType, job.filters);
        break;
      default:
        throw new Error(`Unknown operation: ${job.operation}`);
    }

    // Mark as completed
    db.prepare(`
      UPDATE batch_jobs 
      SET status = ?, completed_at = ?, results = ?, 
          progress = json_set(progress, '$.succeeded', ?)
      WHERE id = ?
    `).run('completed', new Date().toISOString(), JSON.stringify(results), results.length, id);

    events.emit('batch.completed', { jobId: id, count: results.length });

  } catch (error) {
    // Mark as failed
    db.prepare('UPDATE batch_jobs SET status = ?, error = ? WHERE id = ?')
      .run('failed', error instanceof Error ? error.message : String(error), id);
    
    events.emit('batch.failed', { jobId: id, error });
    throw error;
  }

  return getBatchJob(id)!;
}

// Batch delete
async function batchDelete(entityType: string, filters: Record<string, unknown>): Promise<string[]> {
  const db = getDB();
  const table = getTableForEntityType(entityType);
  if (!table) throw new Error(`Unknown entity type: ${entityType}`);

  // Get IDs to delete
  let query = `SELECT id FROM ${table}`;
  const params: unknown[] = [];
  
  if (filters.ids && Array.isArray(filters.ids)) {
    query += ` WHERE id IN (${filters.ids.map(() => '?').join(',')})`;
    params.push(...filters.ids);
  }

  const rows = db.prepare(query).all(...params) as any[];
  const ids = rows.map(r => r.id);

  // Delete in batches
  for (const id of ids) {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }

  return ids;
}

// Batch tag
async function batchTag(entityType: string, _filters: Record<string, unknown>, tags?: string[]): Promise<string[]> {
  if (!tags?.length) return [];

  const { tagEntity, initTagTables } = await import('../tags/index.js');
  initTagTables();

  const db = getDB();
  const table = getTableForEntityType(entityType);
  if (!table) return [];

  // Get IDs to tag
  const rows = db.prepare(`SELECT id FROM ${table}`).all() as any[];
  
  for (const row of rows) {
    for (const tag of tags) {
      tagEntity(entityType as any, row.id, tag);
    }
  }

  return rows.map(r => r.id);
}

// Batch update
async function batchUpdate(entityType: string, _filters: Record<string, unknown>, updates: Record<string, unknown>): Promise<string[]> {
  const db = getDB();
  const table = getTableForEntityType(entityType);
  if (!table) throw new Error(`Unknown entity type: ${entityType}`);

  const rows = db.prepare(`SELECT id FROM ${table}`).all() as any[];
  
  // Build update SQL
  const setClauses: string[] = [];
  const params: unknown[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    params.push(value);
  }

  if (setClauses.length === 0) return [];

  // Update each row
  const ids: string[] = [];
  for (const row of rows) {
    db.prepare(`UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...params, row.id);
    ids.push(row.id);
  }

  return ids;
}

// Batch export
async function batchExport(entityType: string, _filters: Record<string, unknown>): Promise<unknown[]> {
  const db = getDB();
  const table = getTableForEntityType(entityType);
  if (!table) return [];

  const rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
  return rows;
}

// Helper to map entity type to table
function getTableForEntityType(type: string): string | null {
  const map: Record<string, string> = {
    agent: 'agents',
    workflow: 'workflows',
    memory: 'memories',
    skill: 'skills',
    task: 'tasks',
    entity: 'knowledge_entities',
    rule: 'automation_rules',
  };
  return map[type] || null;
}

// Cancel batch job
export function cancelBatchJob(id: string): boolean {
  const db = getDB();
  const job = getBatchJob(id);
  if (job?.status !== 'running') return false;

  db.prepare('UPDATE batch_jobs SET status = ? WHERE id = ?').run('failed', id);
  events.emit('batch.cancelled', { jobId: id });
  return true;
}

// Delete batch job
export function deleteBatchJob(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM batch_jobs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Initialize tables
export function initBatchTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      filters TEXT NOT NULL,
      updates TEXT,
      status TEXT DEFAULT 'pending',
      progress TEXT NOT NULL,
      results TEXT,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_batch_status ON batch_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_batch_created ON batch_jobs(created_at);
  `);
}

// Helper
function rowToBatchJob(row: any): BatchJob {
  return {
    id: row.id,
    name: row.name,
    operation: row.operation,
    entityType: row.entity_type,
    filters: JSON.parse(row.filters),
    updates: row.updates ? JSON.parse(row.updates) : undefined,
    status: row.status,
    progress: JSON.parse(row.progress),
    results: row.results ? JSON.parse(row.results) : undefined,
    error: row.error ?? undefined,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}
