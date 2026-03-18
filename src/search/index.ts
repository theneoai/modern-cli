/**
 * Global Search - Search across all HyperTerminal data
 */

import { getDB } from '../core/db/index.js';

export interface SearchResult {
  type: 'agent' | 'workflow' | 'memory' | 'skill' | 'task' | 'entity' | 'notification' | 'log' | 'rule' | 'model';
  id: string;
  title: string;
  description?: string;
  relevance: number;
  data: Record<string, unknown>;
}

export interface SearchOptions {
  types?: SearchResult['type'][];
  limit?: number;
  offset?: number;
  fuzzy?: boolean;
}

// Global search across all entities
export function globalSearch(query: string, options: SearchOptions = {}): SearchResult[] {
  const { types, limit = 20, fuzzy = true } = options;
  const results: SearchResult[] = [];
  const searchTypes = types || ['agent', 'workflow', 'memory', 'skill', 'entity', 'rule', 'model'];
  
  const searchTerm = fuzzy ? `%${query}%` : query;
  const db = getDB();

  // Search agents
  if (searchTypes.includes('agent')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM agents 
        WHERE name LIKE ? OR role LIKE ? OR config LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'agent',
          id: row.id,
          title: row.name,
          description: `Role: ${row.role}`,
          relevance: calculateRelevance(query, [row.name, row.role]),
          data: { role: row.role, createdAt: row.created_at },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Search workflows
  if (searchTypes.includes('workflow')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM workflows 
        WHERE name LIKE ? OR description LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'workflow',
          id: row.id,
          title: row.name,
          description: row.description,
          relevance: calculateRelevance(query, [row.name, row.description]),
          data: { status: row.status, createdAt: row.created_at },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Search memories
  if (searchTypes.includes('memory')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM memories 
        WHERE content LIKE ? OR summary LIKE ? OR tags LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'memory',
          id: row.id,
          title: row.summary || row.content.slice(0, 50),
          description: `Type: ${row.type}`,
          relevance: calculateRelevance(query, [row.content, row.summary]),
          data: { type: row.type, importance: row.importance },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Search skills
  if (searchTypes.includes('skill')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM skills 
        WHERE name LIKE ? OR description LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'skill',
          id: row.id,
          title: row.name,
          description: row.description,
          relevance: calculateRelevance(query, [row.name, row.description]),
          data: { type: row.type },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Search knowledge entities
  if (searchTypes.includes('entity')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM knowledge_entities 
        WHERE name LIKE ? OR properties LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'entity',
          id: row.id,
          title: row.name,
          description: `Type: ${row.type}`,
          relevance: calculateRelevance(query, [row.name, JSON.parse(row.properties || '{}').description]),
          data: { type: row.type },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Search automation rules
  if (searchTypes.includes('rule')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM automation_rules 
        WHERE name LIKE ? OR description LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'rule',
          id: row.id,
          title: row.name,
          description: row.description,
          relevance: calculateRelevance(query, [row.name, row.description]),
          data: { enabled: row.enabled === 1 },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Search AI models
  if (searchTypes.includes('model')) {
    try {
      const rows = db.prepare(`
        SELECT * FROM ai_models 
        WHERE name LIKE ? OR model_id LIKE ? OR provider LIKE ?
        LIMIT ?
      `).all(searchTerm, searchTerm, searchTerm, limit) as any[];
      
      for (const row of rows) {
        results.push({
          type: 'model',
          id: row.id,
          title: row.name,
          description: `${row.provider} - ${row.model_id}`,
          relevance: calculateRelevance(query, [row.name, row.model_id]),
          data: { provider: row.provider, enabled: row.enabled === 1 },
        });
      }
    } catch { /* table may not exist */ }
  }

  // Sort by relevance and return top results
  return results
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

// Calculate relevance score
function calculateRelevance(query: string, fields: (string | undefined)[]): number {
  const normalizedQuery = query.toLowerCase();
  let score = 0;
  
  for (const field of fields) {
    if (!field) continue;
    const normalizedField = field.toLowerCase();
    
    // Exact match gets highest score
    if (normalizedField === normalizedQuery) {
      score += 1.0;
    }
    // Starts with query gets high score
    else if (normalizedField.startsWith(normalizedQuery)) {
      score += 0.8;
    }
    // Contains query gets medium score
    else if (normalizedField.includes(normalizedQuery)) {
      score += 0.5;
    }
    // Word boundary match gets lower score
    else if (normalizedField.split(/\s+/).some(word => word.includes(normalizedQuery))) {
      score += 0.3;
    }
  }
  
  return Math.min(score, 1.0);
}

// Quick search with suggestions
export function quickSearch(query: string): { results: SearchResult[]; suggestions: string[] } {
  const results = globalSearch(query, { limit: 10 });
  
  // Generate suggestions based on result types
  const suggestions: string[] = [];
  const types = new Set(results.map(r => r.type));
  
  if (types.has('agent')) {
    suggestions.push(`Try: "hyper agent run ${query} <task>"`);
  }
  if (types.has('workflow')) {
    suggestions.push(`Try: "hyper workflow run ${query}"`);
  }
  if (types.has('memory')) {
    suggestions.push(`Try: "hyper memory search ${query}"`);
  }
  
  return { results, suggestions };
}

// Get recent items
export function getRecentItems(type: SearchResult['type'], limit: number = 10): SearchResult[] {
  const db = getDB();
  const results: SearchResult[] = [];
  
  const tableMap: Record<string, string> = {
    agent: 'agents',
    workflow: 'workflows',
    memory: 'memories',
    skill: 'skills',
    entity: 'knowledge_entities',
    rule: 'automation_rules',
    model: 'ai_models',
  };
  
  const table = tableMap[type];
  if (!table) return [];
  
  try {
    const rows = db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ?`).all(limit) as any[];
    
    for (const row of rows) {
      results.push({
        type,
        id: row.id,
        title: row.name || row.title || row.content?.slice(0, 50) || 'Untitled',
        description: row.description || row.role || row.type,
        relevance: 1.0,
        data: row,
      });
    }
  } catch { /* table may not exist */ }
  
  return results;
}

// Search statistics
export function getSearchStats(): Record<string, number> {
  const db = getDB();
  const stats: Record<string, number> = {};
  
  const tables = [
    { name: 'agents', key: 'agents' },
    { name: 'workflows', key: 'workflows' },
    { name: 'memories', key: 'memories' },
    { name: 'skills', key: 'skills' },
    { name: 'knowledge_entities', key: 'entities' },
    { name: 'automation_rules', key: 'rules' },
    { name: 'ai_models', key: 'models' },
  ];
  
  for (const { name, key } of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as any;
      stats[key] = row.count;
    } catch {
      stats[key] = 0;
    }
  }
  
  return stats;
}
