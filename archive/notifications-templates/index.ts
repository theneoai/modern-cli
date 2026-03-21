/**
 * Notification Templates - Reusable notification patterns
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface NotificationTemplate {
  id: string;
  name: string;
  description?: string;
  title: string;
  message: string;
  channel: 'desktop' | 'email' | 'sms' | 'webhook' | 'push';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  variables: string[]; // Extracted from title/message like {{variable}}
  category?: string;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Create template
export function createTemplate(
  template: Omit<NotificationTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>
): NotificationTemplate {
  const db = getDB();
  const id = `nt-${Date.now()}`;
  const now = new Date();

  // Extract variables from title and message
  const variables = extractVariables(template.title + ' ' + template.message);

  db.prepare(`
    INSERT INTO notification_templates (id, name, description, title, message, channel, priority, variables, category, usage_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    template.name,
    template.description ?? null,
    template.title,
    template.message,
    template.channel,
    template.priority,
    JSON.stringify(variables),
    template.category ?? null,
    0,
    now.toISOString(),
    now.toISOString()
  );

  const result: NotificationTemplate = { ...template, id, variables, usageCount: 0, createdAt: now, updatedAt: now };
  events.emit('notification_template.created', { templateId: id });
  return result;
}

// Get template
export function getTemplate(id: string): NotificationTemplate | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM notification_templates WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToTemplate(row);
}

// Get template by name
export function getTemplateByName(name: string): NotificationTemplate | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM notification_templates WHERE name = ?').get(name) as any;
  if (!row) return null;
  return rowToTemplate(row);
}

// List templates
export function listTemplates(options: { category?: string; limit?: number } = {}): NotificationTemplate[] {
  const db = getDB();
  let query = 'SELECT * FROM notification_templates';
  const params: unknown[] = [];

  if (options.category) {
    query += ' WHERE category = ?';
    params.push(options.category);
  }

  query += ' ORDER BY usage_count DESC, created_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToTemplate);
}

// Update template
export function updateTemplate(id: string, updates: Partial<Omit<NotificationTemplate, 'id' | 'createdAt'>>): NotificationTemplate | null {
  const db = getDB();
  const template = getTemplate(id);
  if (!template) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.title !== undefined) {
    sets.push('title = ?');
    params.push(updates.title);
  }
  if (updates.message !== undefined) {
    sets.push('message = ?');
    params.push(updates.message);
  }
  if (updates.priority !== undefined) {
    sets.push('priority = ?');
    params.push(updates.priority);
  }
  if (updates.channel !== undefined) {
    sets.push('channel = ?');
    params.push(updates.channel);
  }

  if (sets.length === 0) return template;

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE notification_templates SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getTemplate(id);
}

// Delete template
export function deleteTemplate(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM notification_templates WHERE id = ?').run(id);
  events.emit('notification_template.deleted', { templateId: id });
  return result.changes > 0;
}

// Render template with variables
export function renderTemplate(
  templateId: string,
  variables: Record<string, string>
): { title: string; message: string; channel: string; priority: string } | null {
  const template = getTemplate(templateId);
  if (!template) return null;

  // Increment usage
  const db = getDB();
  db.prepare('UPDATE notification_templates SET usage_count = usage_count + 1 WHERE id = ?').run(templateId);

  let title = template.title;
  let message = template.message;

  // Replace variables
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    title = title.replace(regex, value);
    message = message.replace(regex, value);
  }

  return {
    title,
    message,
    channel: template.channel,
    priority: template.priority,
  };
}

// Send notification from template
export async function sendFromTemplate(
  templateId: string,
  variables: Record<string, string>
): Promise<boolean> {
  const rendered = renderTemplate(templateId, variables);
  if (!rendered) return false;

  const { createNotification } = await import('../notifications/index.js');
  createNotification({
    title: rendered.title,
    message: rendered.message,
    priority: rendered.priority as any,
    channel: rendered.channel as any,
  });

  return true;
}

// Extract variables from template string
function extractVariables(text: string): string[] {
  const regex = /{{\s*(\w+)\s*}}/g;
  const matches: string[] = [];
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1]);
  }
  
  return [...new Set(matches)];
}

// Create default templates
export function createDefaultTemplates(): void {
  const defaults: Omit<NotificationTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'workflow-completed',
      description: 'Notification when workflow completes',
      title: 'Workflow "{{name}}" Completed',
      message: 'Workflow execution finished with status: {{status}}. Duration: {{duration}}ms',
      channel: 'desktop',
      priority: 'normal',
      category: 'workflow',
    },
    {
      name: 'agent-error',
      description: 'Notification when agent fails',
      title: 'Agent "{{name}}" Failed',
      message: 'Error: {{error}}. Task: {{task}}',
      channel: 'desktop',
      priority: 'high',
      category: 'agent',
    },
    {
      name: 'system-alert',
      description: 'System alert notification',
      title: '🚨 System Alert: {{alertType}}',
      message: '{{message}}. Current value: {{value}}. Threshold: {{threshold}}',
      channel: 'desktop',
      priority: 'urgent',
      category: 'system',
    },
    {
      name: 'daily-summary',
      description: 'Daily activity summary',
      title: '📊 Daily Summary - {{date}}',
      message: 'Agents: {{agentCount}} executions | Workflows: {{workflowCount}} completed | Errors: {{errorCount}}',
      channel: 'email',
      priority: 'low',
      category: 'reporting',
    },
    {
      name: 'memory-full',
      description: 'Memory usage warning',
      title: '⚠️ Memory Usage High',
      message: 'Memory usage is at {{percentage}}%. Consider cleaning old data.',
      channel: 'desktop',
      priority: 'high',
      category: 'system',
    },
  ];

  for (const template of defaults) {
    const exists = getTemplateByName(template.name);
    if (!exists) {
      createTemplate(template);
    }
  }
}

// Initialize tables
export function initNotificationTemplateTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channel TEXT NOT NULL,
      priority TEXT NOT NULL,
      variables TEXT NOT NULL,
      category TEXT,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notif_templates_category ON notification_templates(category);
    CREATE INDEX IF NOT EXISTS idx_notif_templates_name ON notification_templates(name);
  `);
}

// Helper
function rowToTemplate(row: any): NotificationTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    title: row.title,
    message: row.message,
    channel: row.channel,
    priority: row.priority,
    variables: JSON.parse(row.variables),
    category: row.category ?? undefined,
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
