/**
 * Activity Feed - Real-time activity stream
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export type ActivityType = 
  | 'agent.created' | 'agent.executed' | 'agent.updated' | 'agent.deleted'
  | 'workflow.created' | 'workflow.executed' | 'workflow.completed'
  | 'memory.added' | 'memory.accessed'
  | 'skill.executed'
  | 'user.login' | 'user.logout'
  | 'system.startup' | 'system.shutdown' | 'system.error'
  | 'backup.created' | 'backup.restored'
  | 'config.changed';

export interface Activity {
  id: string;
  type: ActivityType;
  userId?: string;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  importance: 'low' | 'normal' | 'high' | 'critical';
  timestamp: Date;
}

// Add activity
export function addActivity(activity: Omit<Activity, 'id' | 'timestamp'>): Activity {
  const db = getDB();
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date();

  db.prepare(`
    INSERT INTO activities (id, type, user_id, title, description, entity_type, entity_id, metadata, importance, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    activity.type,
    activity.userId ?? null,
    activity.title,
    activity.description ?? null,
    activity.entityType ?? null,
    activity.entityId ?? null,
    activity.metadata ? JSON.stringify(activity.metadata) : null,
    activity.importance,
    now.toISOString()
  );

  const result: Activity = { ...activity, id, timestamp: now };

  // Emit for real-time updates
  events.emit('activity.new', result);

  // Also emit based on importance
  if (activity.importance === 'critical') {
    events.emit('activity.critical', result);
  }

  return result;
}

// Get recent activities
export function getRecentActivities(options: {
  types?: ActivityType[];
  importance?: Activity['importance'];
  limit?: number;
  offset?: number;
} = {}): Activity[] {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.types?.length) {
    conditions.push(`type IN (${options.types.map(() => '?').join(',')})`);
    params.push(...options.types);
  }

  if (options.importance) {
    conditions.push('importance = ?');
    params.push(options.importance);
  }

  let query = 'SELECT * FROM activities';
  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY timestamp DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }
  if (options.offset) {
    query += ' OFFSET ?';
    params.push(options.offset);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToActivity);
}

// Get activity feed for dashboard
export function getActivityFeed(limit: number = 20): Activity[] {
  return getRecentActivities({ limit });
}

// Get unread count (for notifications)
export function getUnreadCount(since?: Date): number {
  const db = getDB();
  const cutoff = since?.toISOString() ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = db.prepare('SELECT COUNT(*) as count FROM activities WHERE timestamp > ?').get(cutoff) as any;
  return row.count;
}

// Get activity statistics
export function getActivityStats(timeRange?: { hours?: number }): {
  total: number;
  byType: Record<string, number>;
  byImportance: Record<string, number>;
} {
  const db = getDB();
  let whereClause = '';
  const params: unknown[] = [];

  if (timeRange?.hours) {
    const cutoff = new Date(Date.now() - timeRange.hours * 60 * 60 * 1000).toISOString();
    whereClause = 'WHERE timestamp > ?';
    params.push(cutoff);
  }

  const total = (db.prepare(`SELECT COUNT(*) as count FROM activities ${whereClause}`).get(...params) as any).count;

  const typeRows = db.prepare(`
    SELECT type, COUNT(*) as count FROM activities ${whereClause} GROUP BY type
  `).all(...params) as any[];
  const byType: Record<string, number> = {};
  for (const row of typeRows) {
    byType[row.type] = row.count;
  }

  const importanceRows = db.prepare(`
    SELECT importance, COUNT(*) as count FROM activities ${whereClause} GROUP BY importance
  `).all(...params) as any[];
  const byImportance: Record<string, number> = {};
  for (const row of importanceRows) {
    byImportance[row.importance] = row.count;
  }

  return { total, byType, byImportance };
}

// Clean old activities
export function cleanOldActivities(olderThanDays: number): number {
  const db = getDB();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM activities WHERE timestamp < ? AND importance != "critical"').run(cutoff);
  return result.changes;
}

// Setup auto-logging for events
export function setupActivityLogging(): void {
  const activityEvents: Array<{ event: string; type: ActivityType; importance: Activity['importance'] }> = [
    { event: 'agent.created', type: 'agent.created', importance: 'normal' },
    { event: 'agent.executed', type: 'agent.executed', importance: 'normal' },
    { event: 'workflow.created', type: 'workflow.created', importance: 'normal' },
    { event: 'workflow.completed', type: 'workflow.completed', importance: 'high' },
    { event: 'memory.added', type: 'memory.added', importance: 'low' },
    { event: 'backup.created', type: 'backup.created', importance: 'high' },
    { event: 'system.error', type: 'system.error', importance: 'critical' },
  ];

  for (const { event, type, importance } of activityEvents) {
    events.on(event, (data: any) => {
      addActivity({
        type,
        title: formatActivityTitle(type, data),
        description: formatActivityDescription(type, data),
        entityType: data.entityType || getEntityTypeFromEvent(event),
        entityId: data.agentId || data.workflowId || data.entityId,
        metadata: data,
        importance,
      });
    });
  }
}

// Format helpers
function formatActivityTitle(type: ActivityType, data: any): string {
  const name = data.name || data.agentId?.slice(0, 8) || data.workflowId?.slice(0, 8) || 'Unknown';
  const actions: Record<string, string> = {
    'agent.created': `Created agent "${name}"`,
    'agent.executed': `Executed agent "${name}"`,
    'workflow.created': `Created workflow "${name}"`,
    'workflow.completed': `Workflow "${name}" completed`,
    'memory.added': `Added memory`,
    'backup.created': `Created backup`,
    'system.error': 'System error occurred',
  };
  return actions[type] || type;
}

function formatActivityDescription(type: ActivityType, data: any): string {
  if (type === 'agent.executed' && data.task) {
    return `Task: ${data.task.slice(0, 50)}...`;
  }
  if (type === 'system.error' && data.error) {
    return data.error;
  }
  return '';
}

function getEntityTypeFromEvent(event: string): string {
  if (event.includes('agent')) return 'agent';
  if (event.includes('workflow')) return 'workflow';
  if (event.includes('memory')) return 'memory';
  if (event.includes('skill')) return 'skill';
  return 'system';
}

// Initialize tables
export function initActivityTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      user_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      entity_type TEXT,
      entity_id TEXT,
      metadata TEXT,
      importance TEXT DEFAULT 'normal',
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activities_timestamp ON activities(timestamp);
    CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
    CREATE INDEX IF NOT EXISTS idx_activities_importance ON activities(importance);
  `);
}

// Helper
function rowToActivity(row: any): Activity {
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    entityType: row.entity_type ?? undefined,
    entityId: row.entity_id ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    importance: row.importance,
    timestamp: new Date(row.timestamp),
  };
}
