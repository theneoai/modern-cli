/**
 * Favorites System - Bookmark frequently used entities
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface Favorite {
  id: string;
  entityType: 'agent' | 'workflow' | 'skill' | 'memory' | 'task' | 'entity' | 'rule';
  entityId: string;
  entityName: string;
  notes?: string;
  order: number;
  createdAt: Date;
}

// Add to favorites
export function addFavorite(
  entityType: Favorite['entityType'],
  entityId: string,
  entityName: string,
  notes?: string
): Favorite {
  const db = getDB();
  const id = `fav-${Date.now()}`;
  const now = new Date();

  // Get max order
  const maxOrder = (db.prepare('SELECT MAX("order") as max FROM favorites').get() as any)?.max || 0;

  try {
    db.prepare(`
      INSERT INTO favorites (id, entity_type, entity_id, entity_name, notes, "order", created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, entityType, entityId, entityName, notes ?? null, maxOrder + 1, now.toISOString());

    const favorite: Favorite = {
      id,
      entityType,
      entityId,
      entityName,
      notes,
      order: maxOrder + 1,
      createdAt: now,
    };

    events.emit('favorite.added', { favorite });
    return favorite;
  } catch {
    // Already favorited
    throw new Error('Entity is already in favorites');
  }
}

// Remove from favorites
export function removeFavorite(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM favorites WHERE id = ?').run(id);
  events.emit('favorite.removed', { favoriteId: id });
  return result.changes > 0;
}

// List favorites
export function listFavorites(type?: Favorite['entityType']): Favorite[] {
  const db = getDB();
  let query = 'SELECT * FROM favorites';
  const params: unknown[] = [];

  if (type) {
    query += ' WHERE entity_type = ?';
    params.push(type);
  }

  query += ' ORDER BY "order" ASC, created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToFavorite);
}

// Reorder favorite
export function reorderFavorite(id: string, newOrder: number): boolean {
  const db = getDB();
  const result = db.prepare('UPDATE favorites SET "order" = ? WHERE id = ?').run(newOrder, id);
  return result.changes > 0;
}

// Check if entity is favorited
export function isFavorited(entityType: string, entityId: string): boolean {
  const db = getDB();
  const row = db.prepare('SELECT 1 FROM favorites WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId);
  return !!row;
}

// Update favorite notes
export function updateFavoriteNotes(id: string, notes: string): boolean {
  const db = getDB();
  const result = db.prepare('UPDATE favorites SET notes = ? WHERE id = ?').run(notes, id);
  return result.changes > 0;
}

// Quick access - get top favorites
export function getQuickAccess(limit: number = 5): Favorite[] {
  return listFavorites().slice(0, limit);
}

// Initialize tables
export function initFavoritesTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      notes TEXT,
      "order" INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(entity_type);
    CREATE INDEX IF NOT EXISTS idx_favorites_order ON favorites("order");
  `);
}

// Helper
function rowToFavorite(row: any): Favorite {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    notes: row.notes ?? undefined,
    order: row.order,
    createdAt: new Date(row.created_at),
  };
}
