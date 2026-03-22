/**
 * Database Layer - SQLite with vector support
 * 
 * Provides data persistence for:
 * - Agents, Organizations, Workflows
 * - Memories with embeddings
 * - Tasks, Events, Social relations
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { getConfigDir } from '../config/paths.js';

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (!db) {
    const configDir = getConfigDir();
    mkdirSync(configDir, { recursive: true });
    const dbPath = join(configDir, 'hyper.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function initSchema(): void {
  const database = db!;
  
  // Core entities
  database.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT '🤖',
      config JSON NOT NULL,
      state JSON NOT NULL DEFAULT '{"status":"idle","energy":100,"focus":100,"mood":0}',
      metrics JSON DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('company', 'team', 'community', 'town')),
      description TEXT,
      config JSON NOT NULL,
      economy JSON DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      definition JSON NOT NULL,
      version TEXT NOT NULL DEFAULT '0.1.0',
      author TEXT,
      tags JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      description TEXT,
      author TEXT,
      tags JSON,
      input_schema JSON,
      output_schema JSON,
      implementation JSON NOT NULL,
      enabled BOOLEAN DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Relations
    CREATE TABLE IF NOT EXISTS agent_org (
      agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
      org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
      department TEXT,
      role TEXT,
      reports_to TEXT,
      salary INTEGER DEFAULT 0,
      PRIMARY KEY (agent_id, org_id)
    );

    CREATE TABLE IF NOT EXISTS social_relations (
      from_agent TEXT REFERENCES agents(id) ON DELETE CASCADE,
      to_agent TEXT REFERENCES agents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      strength REAL NOT NULL CHECK(strength >= -1 AND strength <= 1),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (from_agent, to_agent, type)
    );

    -- Memories with vector support (stored as JSON for now)
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('episodic', 'semantic', 'procedural', 'working')),
      content TEXT NOT NULL,
      embedding JSON,
      summary TEXT,
      importance REAL NOT NULL DEFAULT 5 CHECK(importance >= 0 AND importance <= 10),
      tags JSON,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      accessed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);

    -- Tasks and execution
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      assignee_id TEXT REFERENCES agents(id),
      workflow_id TEXT REFERENCES workflows(id),
      parent_id TEXT REFERENCES tasks(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
      priority INTEGER DEFAULT 5 CHECK(priority >= 1 AND priority <= 10),
      data JSON NOT NULL DEFAULT '{}',
      result JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

    -- Events
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload JSON NOT NULL,
      source TEXT NOT NULL,
      target TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);

    -- Economy
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      from_agent TEXT REFERENCES agents(id),
      to_agent TEXT REFERENCES agents(id),
      from_org TEXT REFERENCES organizations(id),
      to_org TEXT REFERENCES organizations(id),
      amount INTEGER NOT NULL,
      currency TEXT DEFAULT 'HTC',
      type TEXT NOT NULL,
      description TEXT,
      metadata JSON,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Plugin registry
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      source TEXT NOT NULL,
      config JSON,
      enabled BOOLEAN DEFAULT 1,
      installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- User sessions
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT,
      messages JSON NOT NULL DEFAULT '[]',
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Helper functions for common operations
export function insert<T extends Record<string, any>>(table: string, data: T): T & { id: string } {
  const db = getDB();
  const keys = Object.keys(data);
  const placeholders = keys.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);
  const result = stmt.run(...Object.values(data));
  return { ...data, id: result.lastInsertRowid as unknown as string };
}

export function update<T extends Record<string, any>>(table: string, id: string, data: Partial<T>): void {
  const db = getDB();
  const keys = Object.keys(data);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  stmt.run(...Object.values(data), id);
}

export function selectOne<T>(table: string, id: string): T | undefined {
  const db = getDB();
  const stmt = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
  return stmt.get(id) as T | undefined;
}

export function selectAll<T>(table: string, where?: string, params?: any[]): T[] {
  const db = getDB();
  let sql = `SELECT * FROM ${table}`;
  if (where) sql += ` WHERE ${where}`;
  const stmt = db.prepare(sql);
  return params ? stmt.all(...params) as T[] : stmt.all() as T[];
}

export function remove(table: string, id: string): void {
  const db = getDB();
  const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
  stmt.run(id);
}
