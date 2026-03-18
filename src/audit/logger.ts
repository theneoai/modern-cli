/**
 * Audit Logger - Comprehensive operation logging
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export type AuditAction = 
  | 'create' | 'update' | 'delete' | 'read' | 'list'
  | 'execute' | 'run' | 'schedule' | 'cancel'
  | 'login' | 'logout' | 'auth' | 'permission'
  | 'export' | 'import' | 'backup' | 'restore'
  | 'config' | 'setting';

export type AuditResource =
  | 'agent' | 'workflow' | 'skill' | 'memory' | 'task'
  | 'user' | 'company' | 'department' | 'org'
  | 'model' | 'rule' | 'notification' | 'schedule'
  | 'entity' | 'relation' | 'log' | 'config';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  severity: AuditSeverity;
  status: 'success' | 'failure' | 'blocked';
  message: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface AuditQuery {
  action?: AuditAction;
  resource?: AuditResource;
  severity?: AuditSeverity;
  status?: 'success' | 'failure' | 'blocked';
  userId?: string;
  resourceId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

// Log audit event
export function logAudit(event: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
  const db = getDB();
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date();

  const log: AuditLog = {
    ...event,
    id,
    timestamp,
  };

  db.prepare(`
    INSERT INTO audit_logs (
      id, timestamp, user_id, session_id, action, resource, resource_id,
      severity, status, message, details, ip_address, user_agent, duration, before_state, after_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    timestamp.toISOString(),
    event.userId ?? null,
    event.sessionId ?? null,
    event.action,
    event.resource,
    event.resourceId ?? null,
    event.severity,
    event.status,
    event.message,
    event.details ? JSON.stringify(event.details) : null,
    event.ipAddress ?? null,
    event.userAgent ?? null,
    event.duration ?? null,
    event.before ? JSON.stringify(event.before) : null,
    event.after ? JSON.stringify(event.after) : null
  );

  // Emit critical events
  if (event.severity === 'critical') {
    events.emit('audit.critical', log);
  }

  return log;
}

// Quick audit methods
export function auditCreate(resource: AuditResource, resourceId: string, details?: Record<string, unknown>): AuditLog {
  return logAudit({
    action: 'create',
    resource,
    resourceId,
    severity: 'info',
    status: 'success',
    message: `Created ${resource}: ${resourceId}`,
    details,
  });
}

export function auditUpdate(resource: AuditResource, resourceId: string, before: Record<string, unknown>, after: Record<string, unknown>): AuditLog {
  return logAudit({
    action: 'update',
    resource,
    resourceId,
    severity: 'info',
    status: 'success',
    message: `Updated ${resource}: ${resourceId}`,
    before,
    after,
  });
}

export function auditDelete(resource: AuditResource, resourceId: string, details?: Record<string, unknown>): AuditLog {
  return logAudit({
    action: 'delete',
    resource,
    resourceId,
    severity: 'warning',
    status: 'success',
    message: `Deleted ${resource}: ${resourceId}`,
    details,
  });
}

export function auditExecute(resource: AuditResource, resourceId: string, success: boolean, duration?: number, details?: Record<string, unknown>): AuditLog {
  return logAudit({
    action: 'execute',
    resource,
    resourceId,
    severity: success ? 'info' : 'error',
    status: success ? 'success' : 'failure',
    message: `${success ? 'Executed' : 'Failed to execute'} ${resource}: ${resourceId}`,
    duration,
    details,
  });
}

export function auditAuth(action: 'login' | 'logout', userId: string, success: boolean, details?: Record<string, unknown>): AuditLog {
  return logAudit({
    action,
    resource: 'user',
    resourceId: userId,
    severity: success ? 'info' : 'warning',
    status: success ? 'success' : 'failure',
    message: `${action === 'login' ? 'Login' : 'Logout'} ${success ? 'successful' : 'failed'}: ${userId}`,
    details,
  });
}

// Query audit logs
export function queryAudit(query: AuditQuery = {}): AuditLog[] {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.action) {
    conditions.push('action = ?');
    params.push(query.action);
  }
  if (query.resource) {
    conditions.push('resource = ?');
    params.push(query.resource);
  }
  if (query.severity) {
    conditions.push('severity = ?');
    params.push(query.severity);
  }
  if (query.status) {
    conditions.push('status = ?');
    params.push(query.status);
  }
  if (query.userId) {
    conditions.push('user_id = ?');
    params.push(query.userId);
  }
  if (query.resourceId) {
    conditions.push('resource_id = ?');
    params.push(query.resourceId);
  }
  if (query.startTime) {
    conditions.push('timestamp >= ?');
    params.push(query.startTime.toISOString());
  }
  if (query.endTime) {
    conditions.push('timestamp <= ?');
    params.push(query.endTime.toISOString());
  }

  let sql = 'SELECT * FROM audit_logs';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY timestamp DESC';

  if (query.limit) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }
  if (query.offset) {
    sql += ' OFFSET ?';
    params.push(query.offset);
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(rowToAudit);
}

// Get audit statistics
export function getAuditStats(timeRange?: { hours?: number; days?: number }): {
  total: number;
  byAction: Record<string, number>;
  byResource: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  failures: number;
  critical: number;
} {
  const db = getDB();
  let whereClause = '';
  const params: unknown[] = [];

  if (timeRange) {
    const hours = timeRange.hours ?? (timeRange.days ?? 0) * 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    whereClause = 'WHERE timestamp > ?';
    params.push(cutoff);
  }

  const stats = {
    total: 0,
    byAction: {} as Record<string, number>,
    byResource: {} as Record<string, number>,
    bySeverity: {} as Record<string, number>,
    byStatus: {} as Record<string, number>,
    failures: 0,
    critical: 0,
  };

  // Get total
  const totalRow = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`).get(...params) as any;
  stats.total = totalRow.count;

  // Get by action
  const actionRows = db.prepare(`SELECT action, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY action`).all(...params) as any[];
  for (const row of actionRows) {
    stats.byAction[row.action] = row.count;
  }

  // Get by resource
  const resourceRows = db.prepare(`SELECT resource, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY resource`).all(...params) as any[];
  for (const row of resourceRows) {
    stats.byResource[row.resource] = row.count;
  }

  // Get by severity
  const severityRows = db.prepare(`SELECT severity, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY severity`).all(...params) as any[];
  for (const row of severityRows) {
    stats.bySeverity[row.severity] = row.count;
    if (row.severity === 'critical') stats.critical = row.count;
  }

  // Get by status
  const statusRows = db.prepare(`SELECT status, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY status`).all(...params) as any[];
  for (const row of statusRows) {
    stats.byStatus[row.status] = row.count;
    if (row.status === 'failure') stats.failures = row.count;
  }

  return stats;
}

// Export audit logs
export function exportAudit(query: AuditQuery = {}): string {
  const logs = queryAudit(query);
  return JSON.stringify(logs, null, 2);
}

// Clean old audit logs
export function cleanOldAudit(olderThanDays: number): number {
  const db = getDB();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoff);
  return result.changes;
}

// Helper function
function rowToAudit(row: any): AuditLog {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    userId: row.user_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id ?? undefined,
    severity: row.severity,
    status: row.status,
    message: row.message,
    details: row.details ? JSON.parse(row.details) : undefined,
    ipAddress: row.ip_address ?? undefined,
    userAgent: row.user_agent ?? undefined,
    duration: row.duration ?? undefined,
    before: row.before_state ? JSON.parse(row.before_state) : undefined,
    after: row.after_state ? JSON.parse(row.after_state) : undefined,
  };
}

// Initialize tables
export function initAuditTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT,
      session_id TEXT,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      duration INTEGER,
      before_state TEXT,
      after_state TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_severity ON audit_logs(severity);
    CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_logs(status);
  `);
}

// Auto-audit hooks for event system
export function setupAutoAudit(): void {
  const autoAuditEvents = [
    { event: 'agent.created', action: 'create' as AuditAction, resource: 'agent' as AuditResource },
    { event: 'agent.executed', action: 'execute' as AuditAction, resource: 'agent' as AuditResource },
    { event: 'workflow.created', action: 'create' as AuditAction, resource: 'workflow' as AuditResource },
    { event: 'workflow.executed', action: 'execute' as AuditAction, resource: 'workflow' as AuditResource },
    { event: 'model.request_completed', action: 'execute' as AuditAction, resource: 'model' as AuditResource },
    { event: 'automation.rule_executed', action: 'execute' as AuditAction, resource: 'rule' as AuditResource },
  ];

  for (const { event, action, resource } of autoAuditEvents) {
    events.on(event, (data: any) => {
      logAudit({
        action,
        resource,
        resourceId: data.agentId || data.workflowId || data.modelId || data.ruleId,
        severity: 'info',
        status: 'success',
        message: `${action} ${resource}: ${data.agentId || data.workflowId || data.modelId || data.ruleId}`,
        details: data,
      });
    });
  }
}
