/**
 * Export/Import - Data portability and backup system
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface ExportOptions {
  include?: {
    agents?: boolean;
    workflows?: boolean;
    memories?: boolean;
    skills?: boolean;
    org?: boolean;
    knowledge?: boolean;
    notifications?: boolean;
    rules?: boolean;
    models?: boolean;
    logs?: boolean;
    audit?: boolean;
  };
  excludeData?: boolean; // Export only schemas
  encrypt?: boolean;
  password?: string;
}

export interface ExportManifest {
  version: string;
  exportedAt: Date;
  hyperterminalVersion: string;
  entities: Record<string, number>;
}

export interface ExportData {
  manifest: ExportManifest;
  agents?: unknown[];
  workflows?: unknown[];
  memories?: unknown[];
  skills?: unknown[];
  companies?: unknown[];
  departments?: unknown[];
  entities?: unknown[];
  relations?: unknown[];
  notifications?: unknown[];
  rules?: unknown[];
  models?: unknown[];
  logs?: unknown[];
  audit?: unknown[];
}

// Export all data
export async function exportData(options: ExportOptions = {}): Promise<ExportData> {
  const include = {
    agents: true,
    workflows: true,
    memories: true,
    skills: true,
    org: true,
    knowledge: true,
    notifications: false,
    rules: true,
    models: true,
    logs: false,
    audit: false,
    ...options.include,
  };

  const data: ExportData = {
    manifest: {
      version: '1.0',
      exportedAt: new Date(),
      hyperterminalVersion: '0.2.0',
      entities: {},
    },
  };

  const db = getDB();

  // Export agents
  if (include.agents) {
    try {
      data.agents = db.prepare('SELECT * FROM agents').all();
      data.manifest.entities.agents = data.agents.length;
    } catch {
      data.agents = [];
    }
  }

  // Export workflows
  if (include.workflows) {
    try {
      data.workflows = db.prepare('SELECT * FROM workflows').all();
      data.manifest.entities.workflows = data.workflows.length;
    } catch {
      data.workflows = [];
    }
  }

  // Export memories
  if (include.memories) {
    try {
      data.memories = db.prepare('SELECT * FROM memories').all();
      data.manifest.entities.memories = data.memories.length;
    } catch {
      data.memories = [];
    }
  }

  // Export skills
  if (include.skills) {
    try {
      data.skills = db.prepare('SELECT * FROM skills').all();
      data.manifest.entities.skills = data.skills.length;
    } catch {
      data.skills = [];
    }
  }

  // Export org
  if (include.org) {
    try {
      data.companies = db.prepare('SELECT * FROM companies').all();
      data.departments = db.prepare('SELECT * FROM departments').all();
      data.manifest.entities.companies = data.companies.length;
      data.manifest.entities.departments = data.departments.length;
    } catch {
      data.companies = [];
      data.departments = [];
    }
  }

  // Export knowledge
  if (include.knowledge) {
    try {
      data.entities = db.prepare('SELECT * FROM knowledge_entities').all();
      data.relations = db.prepare('SELECT * FROM knowledge_relations').all();
      data.manifest.entities.knowledgeEntities = data.entities.length;
      data.manifest.entities.knowledgeRelations = data.relations.length;
    } catch {
      data.entities = [];
      data.relations = [];
    }
  }

  // Export rules
  if (include.rules) {
    try {
      data.rules = db.prepare('SELECT * FROM automation_rules').all();
      data.manifest.entities.rules = data.rules.length;
    } catch {
      data.rules = [];
    }
  }

  // Export models
  if (include.models) {
    try {
      data.models = db.prepare('SELECT * FROM ai_models').all();
      data.manifest.entities.models = data.models.length;
    } catch {
      data.models = [];
    }
  }

  events.emit('export.completed', { manifest: data.manifest });
  return data;
}

// Export to file
export async function exportToFile(filePath: string, options: ExportOptions = {}): Promise<void> {
  const data = await exportData(options);
  
  // Ensure directory exists
  const dir = filePath.split('/').slice(0, -1).join('/');
  if (dir) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(filePath, JSON.stringify(data, null, 2));
}

// Import data
export async function importData(data: ExportData, options: { 
  merge?: boolean; 
  overwrite?: boolean;
  validate?: boolean;
} = {}): Promise<{ imported: Record<string, number>; errors: string[] }> {
  const { merge = false } = options;
  void options.overwrite;
  const result = { imported: {} as Record<string, number>, errors: [] as string[] };
  const db = getDB();

  // Validate manifest
  if (!data.manifest?.version) {
    throw new Error('Invalid export data: missing manifest');
  }

  // Import agents
  if (data.agents?.length) {
    try {
      let count = 0;
      for (const agent of data.agents) {
        try {
          if (merge) {
            db.prepare(`
              INSERT OR REPLACE INTO agents (id, name, role, config, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(agent.id, agent.name, agent.role, agent.config, agent.created_at);
          } else {
            db.prepare(`
              INSERT INTO agents (id, name, role, config, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(agent.id, agent.name, agent.role, agent.config, agent.created_at);
          }
          count++;
        } catch (e) {
          result.errors.push(`Agent ${agent.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      result.imported.agents = count;
    } catch (e) {
      result.errors.push(`Agents import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Import workflows
  if (data.workflows?.length) {
    try {
      let count = 0;
      for (const workflow of data.workflows) {
        try {
          if (merge) {
            db.prepare(`
              INSERT OR REPLACE INTO workflows (id, name, nodes, created_at)
              VALUES (?, ?, ?, ?)
            `).run(workflow.id, workflow.name, workflow.nodes, workflow.created_at);
          } else {
            db.prepare(`
              INSERT INTO workflows (id, name, nodes, created_at)
              VALUES (?, ?, ?, ?)
            `).run(workflow.id, workflow.name, workflow.nodes, workflow.created_at);
          }
          count++;
        } catch (e) {
          result.errors.push(`Workflow ${workflow.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      result.imported.workflows = count;
    } catch (e) {
      result.errors.push(`Workflows import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Import memories
  if (data.memories?.length) {
    try {
      let count = 0;
      for (const memory of data.memories) {
        try {
          db.prepare(`
            INSERT OR IGNORE INTO memories (id, agent_id, type, content, tags, importance, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(memory.id, memory.agent_id, memory.type, memory.content, memory.tags, memory.importance, memory.created_at);
          count++;
        } catch (e) {
          result.errors.push(`Memory ${memory.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      result.imported.memories = count;
    } catch (e) {
      result.errors.push(`Memories import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Import knowledge
  if (data.entities?.length) {
    try {
      let count = 0;
      for (const entity of data.entities) {
        try {
          db.prepare(`
            INSERT OR REPLACE INTO knowledge_entities (id, type, name, properties, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(entity.id, entity.type, entity.name, entity.properties, entity.created_at);
          count++;
        } catch (e) {
          result.errors.push(`Entity ${entity.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      result.imported.entities = count;
    } catch (e) {
      result.errors.push(`Entities import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  events.emit('import.completed', { imported: result.imported, errors: result.errors.length });
  return result;
}

// Import from file
export async function importFromFile(filePath: string, options: { merge?: boolean } = {}): Promise<{ imported: Record<string, number>; errors: string[] }> {
  const content = await readFile(filePath, 'utf-8');
  const data = JSON.parse(content) as ExportData;
  return importData(data, options);
}

// Create backup
export async function createBackup(backupDir?: string): Promise<string> {
  const dir = backupDir || './backups';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `hyperterminal-backup-${timestamp}.json`;
  const filePath = join(dir, fileName);

  await mkdir(dir, { recursive: true });
  await exportToFile(filePath, {
    include: {
      agents: true,
      workflows: true,
      memories: true,
      skills: true,
      org: true,
      knowledge: true,
      rules: true,
      models: true,
    },
  });

  return filePath;
}

// List backups
export async function listBackups(backupDir = './backups'): Promise<{ name: string; date: Date; size: number }[]> {
  try {
    const { readdir, stat } = await import('fs/promises');
    const files = await readdir(backupDir);
    const backups = [];

    for (const file of files) {
      if (file.endsWith('.json')) {
        const stats = await stat(join(backupDir, file));
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
        backups.push({
          name: file,
          date: dateMatch ? new Date(dateMatch[1].replace(/-/g, ':').replace('T', ' ')) : stats.mtime,
          size: stats.size,
        });
      }
    }

    return backups.sort((a, b) => b.date.getTime() - a.date.getTime());
  } catch {
    return [];
  }
}

// Restore from backup
export async function restoreBackup(filePath: string): Promise<{ imported: Record<string, number>; errors: string[] }> {
  return importFromFile(filePath, { merge: false });
}

// Verify export integrity
export function verifyExport(data: ExportData): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!data.manifest) {
    issues.push('Missing manifest');
  } else {
    if (!data.manifest.version) {
      issues.push('Missing manifest version');
    }
    if (!data.manifest.exportedAt) {
      issues.push('Missing export timestamp');
    }
  }

  // Check if at least one data section exists
  const hasData = Object.values(data).some(v => Array.isArray(v) && v.length > 0);
  if (!hasData) {
    issues.push('No data sections found');
  }

  return { valid: issues.length === 0, issues };
}

// Initialize
export function initExportImport(): void {
  // Nothing to initialize
}
