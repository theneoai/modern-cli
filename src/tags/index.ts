/**
 * Tag System - Cross-entity tagging and categorization
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface Tag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  entityCount: number;
  createdAt: Date;
}

export interface TaggedEntity {
  entityType: 'agent' | 'workflow' | 'memory' | 'skill' | 'task' | 'entity';
  entityId: string;
  tagId: string;
  taggedAt: Date;
}

// Create tag
export function createTag(name: string, options: { color?: string; description?: string } = {}): Tag {
  const db = getDB();
  const id = `tag-${Date.now()}`;
  const now = new Date();

  // Normalize name
  const normalizedName = name.toLowerCase().trim().replace(/\s+/g, '-');

  try {
    db.prepare(`
      INSERT INTO tags (id, name, color, description, entity_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, normalizedName, options.color ?? null, options.description ?? null, 0, now.toISOString());

    events.emit('tag.created', { tagId: id, name: normalizedName });

    return {
      id,
      name: normalizedName,
      color: options.color,
      description: options.description,
      entityCount: 0,
      createdAt: now,
    };
  } catch (error) {
    // Tag might already exist
    const existing = getTagByName(normalizedName);
    if (existing) return existing;
    throw error;
  }
}

// Get tag by ID
export function getTag(id: string): Tag | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToTag(row);
}

// Get tag by name
export function getTagByName(name: string): Tag | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM tags WHERE name = ?').get(name.toLowerCase().trim()) as any;
  if (!row) return null;
  return rowToTag(row);
}

// List all tags
export function listTags(): Tag[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM tags ORDER BY entity_count DESC, name ASC').all() as any[];
  return rows.map(rowToTag);
}

// Update tag
export function updateTag(id: string, updates: Partial<Omit<Tag, 'id' | 'createdAt'>>): Tag | null {
  const db = getDB();
  const tag = getTag(id);
  if (!tag) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.color !== undefined) {
    sets.push('color = ?');
    params.push(updates.color);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }

  if (sets.length === 0) return tag;

  params.push(id);
  db.prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  return getTag(id);
}

// Delete tag
export function deleteTag(id: string): boolean {
  const db = getDB();
  
  // Remove all associations first
  db.prepare('DELETE FROM entity_tags WHERE tag_id = ?').run(id);
  
  const result = db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  events.emit('tag.deleted', { tagId: id });
  return result.changes > 0;
}

// Tag an entity
export function tagEntity(
  entityType: TaggedEntity['entityType'],
  entityId: string,
  tagName: string
): boolean {
  const db = getDB();
  
  // Get or create tag
  let tag = getTagByName(tagName);
  if (!tag) {
    tag = createTag(tagName);
  }

  try {
    db.prepare(`
      INSERT INTO entity_tags (entity_type, entity_id, tag_id, tagged_at)
      VALUES (?, ?, ?, ?)
    `).run(entityType, entityId, tag.id, new Date().toISOString());

    // Update entity count
    db.prepare('UPDATE tags SET entity_count = entity_count + 1 WHERE id = ?').run(tag.id);

    events.emit('entity.tagged', { entityType, entityId, tagId: tag.id });
    return true;
  } catch {
    // Already tagged
    return false;
  }
}

// Untag an entity
export function untagEntity(
  entityType: TaggedEntity['entityType'],
  entityId: string,
  tagId: string
): boolean {
  const db = getDB();
  
  const result = db.prepare(`
    DELETE FROM entity_tags 
    WHERE entity_type = ? AND entity_id = ? AND tag_id = ?
  `).run(entityType, entityId, tagId);

  if (result.changes > 0) {
    db.prepare('UPDATE tags SET entity_count = entity_count - 1 WHERE id = ?').run(tagId);
    events.emit('entity.untagged', { entityType, entityId, tagId });
  }

  return result.changes > 0;
}

// Get entity tags
export function getEntityTags(
  entityType: TaggedEntity['entityType'],
  entityId: string
): Tag[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT t.* FROM tags t
    JOIN entity_tags et ON t.id = et.tag_id
    WHERE et.entity_type = ? AND et.entity_id = ?
  `).all(entityType, entityId) as any[];
  return rows.map(rowToTag);
}

// Find entities by tag
export function findByTag(
  tagName: string,
  entityType?: TaggedEntity['entityType']
): Array<{ type: TaggedEntity['entityType']; id: string; taggedAt: Date }> {
  const db = getDB();
  const tag = getTagByName(tagName);
  if (!tag) return [];

  let query = `
    SELECT entity_type, entity_id, tagged_at FROM entity_tags
    WHERE tag_id = ?
  `;
  const params: unknown[] = [tag.id];

  if (entityType) {
    query += ' AND entity_type = ?';
    params.push(entityType);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    type: row.entity_type,
    id: row.entity_id,
    taggedAt: new Date(row.tagged_at),
  }));
}

// Search tags
export function searchTags(query: string): Tag[] {
  const db = getDB();
  const searchTerm = `%${query.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT * FROM tags 
    WHERE name LIKE ? OR description LIKE ?
    ORDER BY entity_count DESC
  `).all(searchTerm, searchTerm) as any[];
  return rows.map(rowToTag);
}

// Get tag statistics
export function getTagStats(): {
  totalTags: number;
  totalTaggedEntities: number;
  byEntityType: Record<string, number>;
  topTags: Array<{ name: string; count: number }>;
} {
  const db = getDB();
  
  const totalTags = (db.prepare('SELECT COUNT(*) as count FROM tags').get() as any).count;
  
  const totalTagged = (db.prepare('SELECT COUNT(*) as count FROM entity_tags').get() as any).count;
  
  const byTypeRows = db.prepare(`
    SELECT entity_type, COUNT(*) as count FROM entity_tags GROUP BY entity_type
  `).all() as any[];
  const byEntityType: Record<string, number> = {};
  for (const row of byTypeRows) {
    byEntityType[row.entity_type] = row.count;
  }
  
  const topTagRows = db.prepare(`
    SELECT name, entity_count FROM tags ORDER BY entity_count DESC LIMIT 10
  `).all() as any[];
  
  return {
    totalTags,
    totalTaggedEntities: totalTagged,
    byEntityType,
    topTags: topTagRows.map(r => ({ name: r.name, count: r.entity_count })),
  };
}

// Auto-tag based on content
export function suggestTags(
  content: string,
  _entityType: TaggedEntity['entityType']
): string[] {
  const suggestions: string[] = [];
  const content_lower = content.toLowerCase();
  
  // Keyword-based suggestions
  const keywords: Record<string, string[]> = {
    'code': ['programming', 'development', 'coding'],
    'research': ['research', 'analysis', 'investigation'],
    'design': ['design', 'ui', 'ux', 'creative'],
    'data': ['data', 'analytics', 'database'],
    'ai': ['ai', 'ml', 'model', 'neural'],
    'bug': ['bug', 'fix', 'error', 'issue'],
    'feature': ['feature', 'enhancement', 'improvement'],
    'urgent': ['urgent', 'critical', 'asap', 'important'],
    'testing': ['test', 'testing', 'qa', 'quality'],
    'documentation': ['doc', 'documentation', 'readme', 'guide'],
  };
  
  for (const [tag, words] of Object.entries(keywords)) {
    if (words.some(w => content_lower.includes(w))) {
      suggestions.push(tag);
    }
  }
  
  return [...new Set(suggestions)];
}

// Initialize tables
export function initTagTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      color TEXT,
      description TEXT,
      entity_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS entity_tags (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      tagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entity_type, entity_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_type, entity_id);
  `);
}

// Helper
function rowToTag(row: any): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    description: row.description ?? undefined,
    entityCount: row.entity_count,
    createdAt: new Date(row.created_at),
  };
}
