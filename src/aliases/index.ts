/**
 * Alias System - Quick commands and shortcuts
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface CommandAlias {
  id: string;
  name: string;
  command: string;
  description?: string;
  args?: string[];
  options?: Record<string, string>;
  category?: string;
  usageCount: number;
  createdAt: Date;
}

// Create alias
export function createAlias(alias: Omit<CommandAlias, 'id' | 'usageCount' | 'createdAt'>): CommandAlias {
  const db = getDB();
  const id = `alias-${Date.now()}`;
  const now = new Date();

  db.prepare(`
    INSERT INTO command_aliases (id, name, command, description, args, options, category, usage_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    alias.name,
    alias.command,
    alias.description ?? null,
    alias.args ? JSON.stringify(alias.args) : null,
    alias.options ? JSON.stringify(alias.options) : null,
    alias.category ?? null,
    0,
    now.toISOString()
  );

  events.emit('alias.created', { aliasId: id, name: alias.name });

  return {
    ...alias,
    id,
    usageCount: 0,
    createdAt: now,
  };
}

// Get alias
export function getAlias(id: string): CommandAlias | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM command_aliases WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToAlias(row);
}

// Get alias by name
export function getAliasByName(name: string): CommandAlias | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM command_aliases WHERE name = ?').get(name) as any;
  if (!row) return null;
  return rowToAlias(row);
}

// List aliases
export function listAliases(filter?: { category?: string }): CommandAlias[] {
  const db = getDB();
  let query = 'SELECT * FROM command_aliases';
  const params: unknown[] = [];

  if (filter?.category) {
    query += ' WHERE category = ?';
    params.push(filter.category);
  }

  query += ' ORDER BY usage_count DESC, name ASC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToAlias);
}

// Update alias
export function updateAlias(id: string, updates: Partial<Omit<CommandAlias, 'id' | 'createdAt'>>): CommandAlias | null {
  const db = getDB();
  const alias = getAlias(id);
  if (!alias) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.command !== undefined) {
    sets.push('command = ?');
    params.push(updates.command);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.args !== undefined) {
    sets.push('args = ?');
    params.push(JSON.stringify(updates.args));
  }
  if (updates.options !== undefined) {
    sets.push('options = ?');
    params.push(JSON.stringify(updates.options));
  }
  if (updates.category !== undefined) {
    sets.push('category = ?');
    params.push(updates.category);
  }

  if (sets.length === 0) return alias;

  params.push(id);
  db.prepare(`UPDATE command_aliases SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  return getAlias(id);
}

// Delete alias
export function deleteAlias(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM command_aliases WHERE id = ?').run(id);
  events.emit('alias.deleted', { aliasId: id });
  return result.changes > 0;
}

// Execute alias
export async function executeAlias(name: string, extraArgs: string[] = []): Promise<boolean> {
  const alias = getAliasByName(name);
  if (!alias) return false;

  // Increment usage
  const db = getDB();
  db.prepare('UPDATE command_aliases SET usage_count = usage_count + 1 WHERE id = ?').run(alias.id);

  // Build command
  const args = [...(alias.args || []), ...extraArgs];
  const options = alias.options || {};
  
  const optionStr = Object.entries(options)
    .map(([k, v]) => `--${k}="${v}"`)
    .join(' ');
  
  const fullCommand = `hyper ${alias.command} ${args.join(' ')} ${optionStr}`.trim();
  
  console.log(`Executing: ${fullCommand}`);
  
  // In real implementation, this would execute the command
  // For now, just log it
  events.emit('alias.executed', { aliasId: alias.id, command: fullCommand });
  
  return true;
}

// Get alias as string (for display)
export function formatAlias(alias: CommandAlias): string {
  const args = alias.args?.join(' ') || '';
  const options = alias.options 
    ? Object.entries(alias.options).map(([k, v]) => `--${k}="${v}"`).join(' ')
    : '';
  return `hyper ${alias.command} ${args} ${options}`.trim();
}

// Create default aliases
export function createDefaultAliases(): void {
  const defaults: Omit<CommandAlias, 'id' | 'usageCount' | 'createdAt'>[] = [
    {
      name: 'agents',
      command: 'agent list',
      description: 'List all agents',
      category: 'quick',
    },
    {
      name: 'workflows',
      command: 'workflow list',
      description: 'List all workflows',
      category: 'quick',
    },
    {
      name: 'memories',
      command: 'memory list',
      description: 'List all memories',
      category: 'quick',
    },
    {
      name: 'status',
      command: 'monitor status',
      description: 'Show system status',
      category: 'quick',
    },
    {
      name: 'search',
      command: 'search',
      description: 'Global search',
      category: 'quick',
      args: [''],
    },
    {
      name: 'backup-now',
      command: 'backup create',
      description: 'Create immediate backup',
      category: 'utility',
    },
    {
      name: 'daily-report',
      command: 'logs stats',
      description: 'Show daily log statistics',
      category: 'reporting',
    },
    {
      name: 'models',
      command: 'model list',
      description: 'List AI models',
      category: 'quick',
    },
  ];

  for (const alias of defaults) {
    const exists = getAliasByName(alias.name);
    if (!exists) {
      createAlias(alias);
    }
  }
}

// Initialize tables
export function initAliasTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_aliases (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      command TEXT NOT NULL,
      description TEXT,
      args TEXT,
      options TEXT,
      category TEXT,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_aliases_name ON command_aliases(name);
    CREATE INDEX IF NOT EXISTS idx_aliases_category ON command_aliases(category);
  `);
}

// Helper
function rowToAlias(row: any): CommandAlias {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    description: row.description ?? undefined,
    args: row.args ? JSON.parse(row.args) : undefined,
    options: row.options ? JSON.parse(row.options) : undefined,
    category: row.category ?? undefined,
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at),
  };
}
