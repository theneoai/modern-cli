/**
 * Knowledge Graph - Connect and visualize knowledge
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface KnowledgeNode {
  id: string;
  type: 'concept' | 'entity' | 'document' | 'agent' | 'task' | 'memory';
  label: string;
  properties: Record<string, any>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Record<string, any>;
  weight: number;
  createdAt: Date;
}

// Create node
export function createNode(
  type: KnowledgeNode['type'],
  label: string,
  properties: Record<string, any> = {}
): KnowledgeNode {
  const node: KnowledgeNode = {
    id: uuidv4(),
    type,
    label,
    properties,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO knowledge_nodes (id, type, label, properties, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    node.id,
    node.type,
    node.label,
    JSON.stringify(node.properties),
    node.createdAt.toISOString(),
    node.updatedAt.toISOString()
  );

  events.emit('knowledge.node.created', { nodeId: node.id, type, label });
  return node;
}

// Create edge
export function createEdge(
  sourceId: string,
  targetId: string,
  type: string,
  properties: Record<string, any> = {},
  weight: number = 1
): KnowledgeEdge {
  const edge: KnowledgeEdge = {
    id: uuidv4(),
    sourceId,
    targetId,
    type,
    properties,
    weight,
    createdAt: new Date(),
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO knowledge_edges (id, source_id, target_id, type, properties, weight, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    edge.id,
    edge.sourceId,
    edge.targetId,
    edge.type,
    JSON.stringify(edge.properties),
    edge.weight,
    edge.createdAt.toISOString()
  );

  events.emit('knowledge.edge.created', { edgeId: edge.id, type, sourceId, targetId });
  return edge;
}

// Get node by ID
export function getNode(id: string): KnowledgeNode | undefined {
  const db = getDB();
  const row = db.prepare('SELECT * FROM knowledge_nodes WHERE id = ?').get(id) as any;
  if (!row) return undefined;

  return deserializeNode(row);
}

// Find nodes
export function findNodes(filters: {
  type?: KnowledgeNode['type'];
  label?: string;
  query?: string;
  limit?: number;
}): KnowledgeNode[] {
  const db = getDB();
  let sql = 'SELECT * FROM knowledge_nodes WHERE 1=1';
  const params: any[] = [];

  if (filters.type) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }

  if (filters.label) {
    sql += ' AND label LIKE ?';
    params.push(`%${filters.label}%`);
  }

  if (filters.query) {
    sql += ' AND (label LIKE ? OR properties LIKE ?)';
    params.push(`%${filters.query}%`, `%${filters.query}%`);
  }

  sql += ' ORDER BY updated_at DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(deserializeNode);
}

// Get connected nodes
export function getConnectedNodes(nodeId: string, edgeType?: string): Array<{ node: KnowledgeNode; edge: KnowledgeEdge; direction: 'in' | 'out' }> {
  const db = getDB();
  let sql = `
    SELECT n.*, e.*, CASE WHEN e.source_id = ? THEN 'out' ELSE 'in' END as direction
    FROM knowledge_edges e
    JOIN knowledge_nodes n ON (e.source_id = ? AND e.target_id = n.id) OR (e.target_id = ? AND e.source_id = n.id)
    WHERE e.source_id = ? OR e.target_id = ?
  `;
  const params = [nodeId, nodeId, nodeId, nodeId, nodeId];

  if (edgeType) {
    sql += ' AND e.type = ?';
    params.push(edgeType);
  }

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map(row => ({
    node: deserializeNode(row),
    edge: deserializeEdge(row),
    direction: row.direction as 'in' | 'out',
  }));
}

// Find path between nodes (BFS)
export function findPath(startId: string, endId: string, maxDepth: number = 5): KnowledgeEdge[] | null {
  const db = getDB();
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: KnowledgeEdge[] }> = [{ nodeId: startId, path: [] }];

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;

    if (nodeId === endId) {
      return path;
    }

    if (visited.has(nodeId) || path.length >= maxDepth) {
      continue;
    }

    visited.add(nodeId);

    // Get outgoing edges
    const edges = db.prepare('SELECT * FROM knowledge_edges WHERE source_id = ?').all(nodeId) as any[];
    for (const edge of edges) {
      if (!visited.has(edge.target_id)) {
        queue.push({
          nodeId: edge.target_id,
          path: [...path, deserializeEdge(edge)],
        });
      }
    }
  }

  return null;
}

// Calculate node importance (PageRank-like)
export function calculateNodeImportance(iterations: number = 10): Map<string, number> {
  const db = getDB();
  const nodes = db.prepare('SELECT id FROM knowledge_nodes').all() as { id: string }[];
  const scores = new Map<string, number>();

  // Initialize
  for (const node of nodes) {
    scores.set(node.id, 1 / nodes.length);
  }

  // Iterate
  for (let i = 0; i < iterations; i++) {
    const newScores = new Map<string, number>();

    for (const node of nodes) {
      let score = 0.15 / nodes.length; // Damping factor

      // Get incoming edges
      const incoming = db.prepare('SELECT * FROM knowledge_edges WHERE target_id = ?').all(node.id) as any[];
      for (const edge of incoming) {
        const sourceScore = scores.get(edge.source_id) || 0;
        const outgoingCount = db.prepare('SELECT COUNT(*) as count FROM knowledge_edges WHERE source_id = ?').get(edge.source_id) as { count: number };
        score += (0.85 * sourceScore) / (outgoingCount.count || 1);
      }

      newScores.set(node.id, score);
    }

    // Normalize
    const sum = Array.from(newScores.values()).reduce((a, b) => a + b, 0);
    for (const [id, score] of newScores) {
      newScores.set(id, score / sum);
    }

    scores.clear();
    for (const [id, score] of newScores) {
      scores.set(id, score);
    }
  }

  return scores;
}

// Export to various formats
export function exportGraph(format: 'json' | 'cypher' | 'gml' | 'dot'): string {
  const db = getDB();
  const nodes = db.prepare('SELECT * FROM knowledge_nodes').all() as any[];
  const edges = db.prepare('SELECT * FROM knowledge_edges').all() as any[];

  switch (format) {
    case 'json':
      return JSON.stringify({
        nodes: nodes.map(deserializeNode),
        edges: edges.map(deserializeEdge),
      }, null, 2);

    case 'cypher':
      let cypher = '';
      for (const node of nodes) {
        const props = JSON.stringify(deserializeNode(node).properties).replace(/"/g, '\\"');
        cypher += `CREATE (:${node.type} {id: "${node.id}", label: "${node.label}", properties: "${props}"})\n`;
      }
      for (const edge of edges) {
        cypher += `MATCH (a {id: "${edge.source_id}"}), (b {id: "${edge.target_id}"}) CREATE (a)-[:${edge.type} {weight: ${edge.weight}}]->(b)\n`;
      }
      return cypher;

    case 'dot':
      let dot = 'digraph KnowledgeGraph {\n';
      dot += '  rankdir=LR;\n';
      for (const node of nodes) {
        dot += `  "${node.id}" [label="${node.label}"];\n`;
      }
      for (const edge of edges) {
        dot += `  "${edge.source_id}" -> "${edge.target_id}" [label="${edge.type}"];\n`;
      }
      dot += '}';
      return dot;

    default:
      throw new Error(`Format ${format} not supported`);
  }
}

// Auto-extract knowledge from text
export async function extractKnowledgeFromText(text: string): Promise<{ nodes: KnowledgeNode[]; edges: KnowledgeEdge[] }> {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  // Simple entity extraction (in production, use NLP library)
  const entityPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  const entities = [...text.matchAll(entityPattern)].map(m => m[0]);

  // Create nodes for unique entities
  const uniqueEntities = [...new Set(entities)];
  for (const entity of uniqueEntities.slice(0, 10)) {
    const node = createNode('entity', entity, { extractedFrom: text.slice(0, 100) });
    nodes.push(node);
  }

  // Create edges between co-occurring entities
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (text.indexOf(nodes[i].label) < text.indexOf(nodes[j].label)) {
        const edge = createEdge(nodes[i].id, nodes[j].id, 'related_to', {}, 0.5);
        edges.push(edge);
      }
    }
  }

  return { nodes, edges };
}

// Visualize as SVG
export function generateGraphSVG(width: number = 800, height: number = 600): string {
  const db = getDB();
  const nodes = db.prepare('SELECT * FROM knowledge_nodes LIMIT 50').all() as any[];
  const edges = db.prepare('SELECT * FROM knowledge_edges LIMIT 100').all() as any[];

  // Simple force-directed layout simulation
  const positions = new Map<string, { x: number; y: number }>();
  
  // Initialize random positions
  for (const node of nodes) {
    positions.set(node.id, {
      x: Math.random() * (width - 100) + 50,
      y: Math.random() * (height - 100) + 50,
    });
  }

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" fill="#0f172a"/>`;

  // Draw edges
  for (const edge of edges) {
    const source = positions.get(edge.source_id);
    const target = positions.get(edge.target_id);
    if (source && target) {
      svg += `<line x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" stroke="#334155" stroke-width="1"/>`;
    }
  }

  // Draw nodes
  const colors: Record<string, string> = {
    concept: '#6366f1',
    entity: '#8b5cf6',
    document: '#ec4899',
    agent: '#10b981',
    task: '#f59e0b',
    memory: '#3b82f6',
  };

  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (pos) {
      const color = colors[node.type] || '#94a3b8';
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="20" fill="${color}"/>`;
      svg += `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" fill="white" font-size="10">${node.label.slice(0, 10)}</text>`;
    }
  }

  svg += '</svg>';
  return svg;
}

// Initialize tables
export function initKnowledgeTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      properties TEXT,
      embedding BLOB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_type ON knowledge_nodes(type);
    CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_label ON knowledge_nodes(label);

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES knowledge_nodes(id),
      target_id TEXT REFERENCES knowledge_nodes(id),
      type TEXT NOT NULL,
      properties TEXT,
      weight REAL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_source ON knowledge_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_target ON knowledge_edges(target_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_edges_type ON knowledge_edges(type);
  `);
}

function deserializeNode(row: any): KnowledgeNode {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    properties: JSON.parse(row.properties || '{}'),
    embedding: row.embedding,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function deserializeEdge(row: any): KnowledgeEdge {
  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    type: row.type,
    properties: JSON.parse(row.properties || '{}'),
    weight: row.weight,
    createdAt: new Date(row.created_at),
  };
}
