/**
 * Template System - Reusable workflows and agent templates
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import { randomUUID } from 'crypto';

export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'agent' | 'workflow' | 'skill' | 'task' | 'org';
  tags: string[];
  content: TemplateContent;
  author?: string;
  isBuiltin: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type TemplateContent = 
  | AgentTemplate
  | WorkflowTemplate
  | SkillTemplate
  | TaskTemplate
  | OrgTemplate;

export interface AgentTemplate {
  type: 'agent';
  role: string;
  config: {
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    skills?: string[];
  };
}

export interface WorkflowTemplate {
  type: 'workflow';
  nodes: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
    dependencies?: string[];
  }>;
}

export interface SkillTemplate {
  type: 'skill';
  handler: string;
  parameters: Record<string, unknown>;
}

export interface TaskTemplate {
  type: 'task';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
}

export interface OrgTemplate {
  type: 'org';
  structure: {
    departments: string[];
    roles: string[];
  };
}

// Create template
export function createTemplate(template: Omit<Template, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): Template {
  const db = getDB();
  const id = `template-${randomUUID().slice(0, 8)}`;
  const now = new Date();

  const newTemplate: Template = {
    ...template,
    id,
    usageCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO templates (id, name, description, category, tags, content, author, is_builtin, usage_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    template.name,
    template.description,
    template.category,
    JSON.stringify(template.tags),
    JSON.stringify(template.content),
    template.author ?? null,
    template.isBuiltin ? 1 : 0,
    0,
    now.toISOString(),
    now.toISOString()
  );

  events.emit('template.created', { templateId: id });
  return newTemplate;
}

// Get template
export function getTemplate(id: string): Template | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToTemplate(row);
}

// List templates
export function listTemplates(filter?: { category?: string; tags?: string[] }): Template[] {
  const db = getDB();
  let query = 'SELECT * FROM templates';
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filter?.category) {
    conditions.push('category = ?');
    params.push(filter.category);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY usage_count DESC, created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];
  let templates = rows.map(rowToTemplate);

  // Filter by tags in memory (SQLite doesn't have good array support)
  if (filter?.tags) {
    templates = templates.filter(t => 
      filter.tags!.some(tag => t.tags.includes(tag))
    );
  }

  return templates;
}

// Apply template
export async function applyTemplate(templateId: string, overrides: Record<string, unknown> = {}): Promise<unknown> {
  const template = getTemplate(templateId);
  if (!template) throw new Error(`Template not found: ${templateId}`);

  // Increment usage count
  const db = getDB();
  db.prepare('UPDATE templates SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), templateId);

  const content = template.content;

  switch (content.type) {
    case 'agent': {
      const { createAgent } = await import('../agents/engine/index.js');
      return createAgent({
        name: (overrides.name as string) || `${template.name} Agent`,
        role: content.role,
        config: { ...content.config, ...overrides.config },
      });
    }
    case 'workflow': {
      const { createWorkflow } = await import('../workflow/engine.js');
      return createWorkflow({
        name: (overrides.name as string) || `${template.name} Workflow`,
        nodes: content.nodes.map(n => ({ ...n, config: { ...n.config, ...overrides.nodeConfig } })),
      });
    }
    case 'task': {
      console.log('Task template applied (task system not fully implemented)');
      return null;
    }
    default:
      throw new Error(`Unknown template type: ${content.type}`);
  }
}

// Delete template
export function deleteTemplate(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM templates WHERE id = ? AND is_builtin = 0').run(id);
  events.emit('template.deleted', { templateId: id });
  return result.changes > 0;
}

// Search templates
export function searchTemplates(query: string): Template[] {
  const db = getDB();
  const searchTerm = `%${query}%`;
  const rows = db.prepare(`
    SELECT * FROM templates 
    WHERE name LIKE ? OR description LIKE ? OR tags LIKE ?
    ORDER BY usage_count DESC
  `).all(searchTerm, searchTerm, searchTerm) as any[];
  return rows.map(rowToTemplate);
}

// Create builtin templates
export function createBuiltinTemplates(): void {
  const builtins: Omit<Template, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Research Team',
      description: 'Multi-agent research team with lead researcher and reviewers',
      category: 'agent',
      tags: ['research', 'team', 'multi-agent'],
      content: {
        type: 'agent',
        role: 'researcher',
        config: {
          systemPrompt: 'You are a research specialist. Analyze information thoroughly and provide detailed insights.',
          temperature: 0.7,
        },
      },
      isBuiltin: true,
    },
    {
      name: 'Code Review Pipeline',
      description: 'Sequential workflow for code review: analyze -> review -> approve',
      category: 'workflow',
      tags: ['code', 'review', 'pipeline'],
      content: {
        type: 'workflow',
        nodes: [
          { id: 'analyze', type: 'agent', config: { role: 'analyzer' } },
          { id: 'review', type: 'agent', config: { role: 'reviewer' }, dependencies: ['analyze'] },
          { id: 'approve', type: 'condition', config: { condition: 'review.passed' } },
        ],
      },
      isBuiltin: true,
    },
    {
      name: 'Content Creation Team',
      description: 'Creative team for content generation with writer and editor',
      category: 'agent',
      tags: ['content', 'creative', 'writing'],
      content: {
        type: 'agent',
        role: 'planner',
        config: {
          systemPrompt: 'You are a creative content strategist. Develop engaging content ideas and outlines.',
          temperature: 0.8,
        },
      },
      isBuiltin: true,
    },
    {
      name: 'Data Processing Workflow',
      description: 'Parallel processing workflow for batch data operations',
      category: 'workflow',
      tags: ['data', 'batch', 'parallel'],
      content: {
        type: 'workflow',
        nodes: [
          { id: 'source', type: 'skill', config: { action: 'fetch_data' } },
          { id: 'process1', type: 'skill', config: { action: 'transform' }, dependencies: ['source'] },
          { id: 'process2', type: 'skill', config: { action: 'analyze' }, dependencies: ['source'] },
          { id: 'merge', type: 'skill', config: { action: 'combine' }, dependencies: ['process1', 'process2'] },
        ],
      },
      isBuiltin: true,
    },
    {
      name: 'Customer Support Agent',
      description: 'Agent configured for customer support interactions',
      category: 'agent',
      tags: ['support', 'customer', 'service'],
      content: {
        type: 'agent',
        role: 'assistant',
        config: {
          systemPrompt: 'You are a helpful customer support specialist. Be polite, empathetic, and solution-oriented.',
          temperature: 0.6,
        },
      },
      isBuiltin: true,
    },
  ];

  for (const template of builtins) {
    const exists = listTemplates({ category: template.category }).some(
      t => t.name === template.name && t.isBuiltin
    );
    if (!exists) {
      createTemplate(template);
    }
  }
}

// Initialize tables
export function initTemplateTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT,
      is_builtin INTEGER DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
    CREATE INDEX IF NOT EXISTS idx_templates_builtin ON templates(is_builtin);
  `);
}

// Helper
function rowToTemplate(row: any): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: JSON.parse(row.tags),
    content: JSON.parse(row.content),
    author: row.author ?? undefined,
    isBuiltin: row.is_builtin === 1,
    usageCount: row.usage_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
