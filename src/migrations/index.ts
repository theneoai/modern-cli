/**
 * Database Migrations - Schema versioning and migrations
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface Migration {
  id: string;
  name: string;
  version: number;
  description?: string;
  up: string; // SQL to apply
  down?: string; // SQL to rollback
  appliedAt?: Date;
}

export interface MigrationStatus {
  currentVersion: number;
  latestVersion: number;
  pending: Migration[];
  applied: Migration[];
}

// Migration registry
const migrations: Migration[] = [
  {
    id: '001-init',
    name: 'Initial schema',
    version: 1,
    description: 'Create initial tables',
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: '002-agents',
    name: 'Add agents table',
    version: 2,
    up: `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT,
        config TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: '003-workflows',
    name: 'Add workflows table',
    version: 3,
    up: `
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        nodes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: '004-memories',
    name: 'Add memories table',
    version: 4,
    up: `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        type TEXT,
        content TEXT,
        tags TEXT,
        importance INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: '005-knowledge',
    name: 'Add knowledge graph tables',
    version: 5,
    up: `
      CREATE TABLE IF NOT EXISTS knowledge_entities (
        id TEXT PRIMARY KEY,
        type TEXT,
        name TEXT,
        properties TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS knowledge_relations (
        id TEXT PRIMARY KEY,
        from_entity TEXT,
        to_entity TEXT,
        type TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
];

// Get migration status
export function getMigrationStatus(): MigrationStatus {
  const db = getDB();
  
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get applied migrations
  const appliedRows = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all() as any[];
  const appliedVersions = new Set(appliedRows.map(r => r.version));
  
  const currentVersion = appliedRows.length > 0 
    ? Math.max(...appliedRows.map(r => r.version))
    : 0;

  const applied: Migration[] = [];
  const pending: Migration[] = [];

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      applied.push({
        ...migration,
        appliedAt: new Date(appliedRows.find(r => r.version === migration.version)?.applied_at),
      });
    } else {
      pending.push(migration);
    }
  }

  return {
    currentVersion,
    latestVersion: migrations.length > 0 ? Math.max(...migrations.map(m => m.version)) : 0,
    pending,
    applied,
  };
}

// Apply pending migrations
export function migrate(options: { target?: number; dryRun?: boolean } = {}): {
  applied: Migration[];
  errors: string[];
} {
  const db = getDB();
  const status = getMigrationStatus();
  const applied: Migration[] = [];
  const errors: string[] = [];

  const toApply = options.target
    ? status.pending.filter(m => m.version <= options.target!)
    : status.pending;

  for (const migration of toApply) {
    try {
      if (!options.dryRun) {
        // Execute migration
        db.exec(migration.up);
        
        // Record migration
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
          .run(migration.version, migration.name);
        
        events.emit('migration.applied', { version: migration.version, name: migration.name });
      }
      
      applied.push({
        ...migration,
        appliedAt: new Date(),
      });
    } catch (error) {
      errors.push(`Migration ${migration.version} (${migration.name}): ${error instanceof Error ? error.message : String(error)}`);
      break; // Stop on first error
    }
  }

  return { applied, errors };
}

// Rollback migrations
export function rollback(steps: number = 1): {
  rolledBack: Migration[];
  errors: string[];
} {
  const db = getDB();
  const status = getMigrationStatus();
  const rolledBack: Migration[] = [];
  const errors: string[] = [];

  const toRollback = status.applied.slice(-steps).reverse();

  for (const migration of toRollback) {
    if (!migration.down) {
      errors.push(`Migration ${migration.version} has no rollback`);
      continue;
    }

    try {
      db.exec(migration.down);
      
      db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version);
      
      events.emit('migration.rolledback', { version: migration.version, name: migration.name });
      rolledBack.push(migration);
    } catch (error) {
      errors.push(`Rollback ${migration.version}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { rolledBack, errors };
}

// Create new migration file
export function createMigration(
  name: string,
  up: string,
  down?: string
): Migration {
  const status = getMigrationStatus();
  const version = status.latestVersion + 1;
  
  const migration: Migration = {
    id: `${version.toString().padStart(3, '0')}-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    version,
    up,
    down,
  };

  // In real implementation, this would write to a file
  // For now, just return the migration object
  return migration;
}

// Verify database integrity
export function verifyIntegrity(): { valid: boolean; issues: string[] } {
  const db = getDB();
  const issues: string[] = [];

  try {
    // Check if we can query tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const tableNames = tables.map(t => t.name);

    // Check required tables
    const required = ['agents', 'workflows', 'memories', 'schema_migrations'];
    for (const table of required) {
      if (!tableNames.includes(table)) {
        issues.push(`Missing required table: ${table}`);
      }
    }

    // Check foreign keys
    db.prepare('PRAGMA foreign_key_check').all();

  } catch (error) {
    issues.push(`Integrity check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { valid: issues.length === 0, issues };
}

// Get migration history
export function getMigrationHistory(): Array<{
  version: number;
  name: string;
  appliedAt: Date;
  status: 'applied' | 'pending';
}> {
  const status = getMigrationStatus();
  
  return migrations.map(m => {
    const applied = status.applied.find(a => a.version === m.version);
    return {
      version: m.version,
      name: m.name,
      appliedAt: applied?.appliedAt || new Date(),
      status: applied ? 'applied' : 'pending',
    };
  });
}

// Reset database (DANGEROUS!)
export function resetDatabase(): boolean {
  const db = getDB();
  
  // Get all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as any[];

  // Drop all tables
  for (const { name } of tables) {
    db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
  }

  events.emit('database.reset');
  return true;
}

// Export schema
export function exportSchema(): string {
  const db = getDB();
  
  const tables = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
  `).all() as any[];

  const indexes = db.prepare(`
    SELECT sql FROM sqlite_master 
    WHERE type='index' AND sql IS NOT NULL
  `).all() as any[];

  return [...tables.map(t => t.sql), ...indexes.map(i => i.sql)].join(';\n\n');
}
