/**
 * Version Control - Track entity changes over time
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface EntityVersion {
  id: string;
  entityType: string;
  entityId: string;
  version: number;
  data: Record<string, unknown>;
  changeType: 'create' | 'update' | 'delete' | 'restore';
  changeSummary?: string;
  author?: string;
  parentVersion?: number;
  createdAt: Date;
}

// Create version snapshot
export function createVersion(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  options: {
    changeType?: EntityVersion['changeType'];
    changeSummary?: string;
    author?: string;
  } = {}
): EntityVersion {
  const db = getDB();
  const id = `ver-${Date.now()}`;
  const now = new Date();

  // Get next version number
  const lastVer = db.prepare(`
    SELECT version FROM entity_versions 
    WHERE entity_type = ? AND entity_id = ? 
    ORDER BY version DESC LIMIT 1
  `).get(entityType, entityId) as any;
  
  const version = (lastVer?.version || 0) + 1;

  db.prepare(`
    INSERT INTO entity_versions (id, entity_type, entity_id, version, data, change_type, change_summary, author, parent_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entityType,
    entityId,
    version,
    JSON.stringify(data),
    options.changeType || 'update',
    options.changeSummary ?? null,
    options.author ?? null,
    lastVer?.version ?? null,
    now.toISOString()
  );

  const result: EntityVersion = {
    id,
    entityType,
    entityId,
    version,
    data,
    changeType: options.changeType || 'update',
    changeSummary: options.changeSummary,
    author: options.author,
    parentVersion: lastVer?.version,
    createdAt: now,
  };

  events.emit('version.created', { version: result });
  return result;
}

// Get version by ID
export function getVersion(id: string): EntityVersion | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM entity_versions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToVersion(row);
}

// Get specific version of entity
export function getEntityVersion(
  entityType: string,
  entityId: string,
  version: number
): EntityVersion | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT * FROM entity_versions 
    WHERE entity_type = ? AND entity_id = ? AND version = ?
  `).get(entityType, entityId, version) as any;
  if (!row) return null;
  return rowToVersion(row);
}

// Get version history for entity
export function getVersionHistory(
  entityType: string,
  entityId: string,
  options: { limit?: number; offset?: number } = {}
): EntityVersion[] {
  const db = getDB();
  let query = `
    SELECT * FROM entity_versions 
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY version DESC
  `;
  const params: unknown[] = [entityType, entityId];

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }
  if (options.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToVersion);
}

// Get latest version
export function getLatestVersion(entityType: string, entityId: string): EntityVersion | null {
  const db = getDB();
  const row = db.prepare(`
    SELECT * FROM entity_versions 
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY version DESC LIMIT 1
  `).get(entityType, entityId) as any;
  if (!row) return null;
  return rowToVersion(row);
}

// Restore to version
export function restoreVersion(
  entityType: string,
  entityId: string,
  version: number
): EntityVersion | null {
  const targetVersion = getEntityVersion(entityType, entityId, version);
  if (!targetVersion) return null;

  // Create new version with restored data
  return createVersion(entityType, entityId, targetVersion.data, {
    changeType: 'restore',
    changeSummary: `Restored from version ${version}`,
  });
}

// Compare two versions
export function compareVersions(
  entityType: string,
  entityId: string,
  versionA: number,
  versionB: number
): { added: string[]; removed: string[]; changed: Array<{ key: string; from: unknown; to: unknown }> } {
  const verA = getEntityVersion(entityType, entityId, versionA);
  const verB = getEntityVersion(entityType, entityId, versionB);

  if (!verA || !verB) {
    return { added: [], removed: [], changed: [] };
  }

  const dataA = verA.data;
  const dataB = verB.data;
  const keysA = Object.keys(dataA);
  const keysB = Object.keys(dataB);

  const added = keysB.filter(k => !keysA.includes(k));
  const removed = keysA.filter(k => !keysB.includes(k));
  const changed: Array<{ key: string; from: unknown; to: unknown }> = [];

  for (const key of keysA.filter(k => keysB.includes(k))) {
    if (JSON.stringify(dataA[key]) !== JSON.stringify(dataB[key])) {
      changed.push({ key, from: dataA[key], to: dataB[key] });
    }
  }

  return { added, removed, changed };
}

// Get diff summary
export function getDiffSummary(
  entityType: string,
  entityId: string,
  fromVersion: number,
  toVersion: number
): string {
  const diff = compareVersions(entityType, entityId, fromVersion, toVersion);
  const parts: string[] = [];
  
  if (diff.added.length) parts.push(`+${diff.added.length} fields`);
  if (diff.removed.length) parts.push(`-${diff.removed.length} fields`);
  if (diff.changed.length) parts.push(`~${diff.changed.length} changes`);
  
  return parts.join(', ') || 'No changes';
}

// Clean old versions (keep last N)
export function cleanOldVersions(entityType: string, entityId: string, keepLast: number = 10): number {
  const db = getDB();
  const result = db.prepare(`
    DELETE FROM entity_versions 
    WHERE entity_type = ? AND entity_id = ? AND version <= (
      SELECT version FROM entity_versions 
      WHERE entity_type = ? AND entity_id = ? 
      ORDER BY version DESC LIMIT 1 OFFSET ?
    )
  `).run(entityType, entityId, entityType, entityId, keepLast);
  
  return result.changes;
}

// Get version statistics
export function getVersionStats(): {
  totalVersions: number;
  byEntityType: Record<string, number>;
  mostVersioned: Array<{ type: string; id: string; count: number }>;
} {
  const db = getDB();
  
  const total = (db.prepare('SELECT COUNT(*) as count FROM entity_versions').get() as any).count;
  
  const byTypeRows = db.prepare('SELECT entity_type, COUNT(*) as count FROM entity_versions GROUP BY entity_type').all() as any[];
  const byEntityType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byEntityType[row.entity_type] = row.count;
  }

  const mostRows = db.prepare(`
    SELECT entity_type, entity_id, COUNT(*) as count 
    FROM entity_versions 
    GROUP BY entity_type, entity_id 
    ORDER BY count DESC 
    LIMIT 10
  `).all() as any[];
  
  return {
    totalVersions: total,
    byEntityType,
    mostVersioned: mostRows.map(r => ({ type: r.entity_type, id: r.entity_id, count: r.count })),
  };
}

// Setup auto-versioning for events
export function setupAutoVersioning(): void {
  const versionEvents = [
    { event: 'agent.updated', type: 'agent' },
    { event: 'workflow.updated', type: 'workflow' },
    { event: 'skill.updated', type: 'skill' },
  ];

  for (const { event, type } of versionEvents) {
    events.on(event, (data: any) => {
      if (data.before && data.after) {
        createVersion(type, data.id, data.after, {
          changeType: 'update',
          changeSummary: `Updated ${type}`,
        });
      }
    });
  }
}

// Initialize tables
export function initVersionTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_versions (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      change_type TEXT NOT NULL,
      change_summary TEXT,
      author TEXT,
      parent_version INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id, version)
    );

    CREATE INDEX IF NOT EXISTS idx_versions_entity ON entity_versions(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_versions_version ON entity_versions(version);
    CREATE INDEX IF NOT EXISTS idx_versions_created ON entity_versions(created_at);
  `);
}

// Helper
function rowToVersion(row: any): EntityVersion {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    version: row.version,
    data: JSON.parse(row.data),
    changeType: row.change_type,
    changeSummary: row.change_summary ?? undefined,
    author: row.author ?? undefined,
    parentVersion: row.parent_version ?? undefined,
    createdAt: new Date(row.created_at),
  };
}
