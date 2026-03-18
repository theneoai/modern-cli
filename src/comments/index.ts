/**
 * Comments System - Add notes and discussions to entities
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface Comment {
  id: string;
  entityType: 'agent' | 'workflow' | 'skill' | 'memory' | 'task' | 'entity';
  entityId: string;
  parentId?: string; // For threaded comments
  author?: string;
  content: string;
  mentions?: string[]; // User mentions
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Add comment
export function addComment(
  entityType: Comment['entityType'],
  entityId: string,
  content: string,
  options: { author?: string; parentId?: string } = {}
): Comment {
  const db = getDB();
  const id = `comment-${Date.now()}`;
  const now = new Date();

  // Extract mentions
  const mentions = extractMentions(content);

  db.prepare(`
    INSERT INTO comments (id, entity_type, entity_id, parent_id, author, content, mentions, resolved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entityType,
    entityId,
    options.parentId ?? null,
    options.author ?? null,
    content,
    JSON.stringify(mentions),
    0,
    now.toISOString(),
    now.toISOString()
  );

  const comment: Comment = {
    id,
    entityType,
    entityId,
    parentId: options.parentId,
    author: options.author,
    content,
    mentions,
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };

  events.emit('comment.added', { comment });
  return comment;
}

// Get comment
export function getComment(id: string): Comment | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToComment(row);
}

// Get comments for entity
export function getComments(
  entityType: Comment['entityType'],
  entityId: string,
  options: { includeResolved?: boolean; limit?: number } = {}
): Comment[] {
  const db = getDB();
  let query = 'SELECT * FROM comments WHERE entity_type = ? AND entity_id = ?';
  const params: unknown[] = [entityType, entityId];

  if (!options.includeResolved) {
    query += ' AND resolved = 0';
  }

  query += ' ORDER BY created_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToComment);
}

// Get threaded comments
export function getThreadedComments(
  entityType: Comment['entityType'],
  entityId: string
): Array<Comment & { replies: Comment[] }> {
  const allComments = getComments(entityType, entityId, { includeResolved: true });
  const topLevel = allComments.filter(c => !c.parentId);
  
  return topLevel.map(comment => ({
    ...comment,
    replies: allComments.filter(c => c.parentId === comment.id),
  }));
}

// Update comment
export function updateComment(id: string, content: string): Comment | null {
  const db = getDB();
  const comment = getComment(id);
  if (!comment) return null;

  const mentions = extractMentions(content);

  db.prepare(`
    UPDATE comments SET content = ?, mentions = ?, updated_at = ? WHERE id = ?
  `).run(content, JSON.stringify(mentions), new Date().toISOString(), id);

  events.emit('comment.updated', { commentId: id });
  return getComment(id);
}

// Resolve comment
export function resolveComment(id: string): boolean {
  const db = getDB();
  const result = db.prepare('UPDATE comments SET resolved = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  
  if (result.changes > 0) {
    events.emit('comment.resolved', { commentId: id });
  }
  
  return result.changes > 0;
}

// Delete comment
export function deleteComment(id: string): boolean {
  const db = getDB();
  
  // Delete replies first
  db.prepare('DELETE FROM comments WHERE parent_id = ?').run(id);
  
  const result = db.prepare('DELETE FROM comments WHERE id = ?').run(id);
  events.emit('comment.deleted', { commentId: id });
  
  return result.changes > 0;
}

// Get comment count for entity
export function getCommentCount(entityType: string, entityId: string): { total: number; unresolved: number } {
  const db = getDB();
  const total = (db.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?')
    .get(entityType, entityId) as any).count;
  
  const unresolved = (db.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ? AND resolved = 0')
    .get(entityType, entityId) as any).count;
  
  return { total, unresolved };
}

// Search comments
export function searchComments(query: string): Comment[] {
  const db = getDB();
  const searchTerm = `%${query}%`;
  const rows = db.prepare('SELECT * FROM comments WHERE content LIKE ? ORDER BY created_at DESC')
    .all(searchTerm) as any[];
  return rows.map(rowToComment);
}

// Get recent comments
export function getRecentComments(limit: number = 20): Comment[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM comments ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(rowToComment);
}

// Get mentions for user
export function getMentions(username: string): Comment[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM comments WHERE mentions LIKE ? ORDER BY created_at DESC')
    .all(`%"${username}"%`) as any[];
  return rows.map(rowToComment);
}

// Extract @mentions from content
function extractMentions(content: string): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = content.match(mentionRegex);
  return matches ? matches.map(m => m.slice(1)) : [];
}

// Initialize tables
export function initCommentTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      parent_id TEXT,
      author TEXT,
      content TEXT NOT NULL,
      mentions TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    );

    CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
    CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at);
  `);
}

// Helper
function rowToComment(row: any): Comment {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    parentId: row.parent_id ?? undefined,
    author: row.author ?? undefined,
    content: row.content,
    mentions: row.mentions ? JSON.parse(row.mentions) : undefined,
    resolved: row.resolved === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
