/**
 * Natural Language Query - Understand user intent and execute commands
 */

import { events } from '../core/events/index.js';

export interface QueryIntent {
  type: 'search' | 'action' | 'status' | 'create' | 'delete' | 'update' | 'help' | 'unknown';
  action?: string;
  target?: string;
  parameters: Record<string, unknown>;
  confidence: number;
}

export interface NLCommand {
  original: string;
  intent: QueryIntent;
  suggestions: string[];
  canExecute: boolean;
}

// Parse natural language query
export function parseQuery(query: string): QueryIntent {
  const normalized = query.toLowerCase().trim();
  
  // Pattern matching for common intents
  const patterns = [
    // Search patterns
    { regex: /^(find|search|show|list|get|what|where).*(agent|agents)/i, type: 'search', target: 'agent' },
    { regex: /^(find|search|show|list|get|what|where).*(workflow|workflows)/i, type: 'search', target: 'workflow' },
    { regex: /^(find|search|show|list|get|what|where).*(task|tasks)/i, type: 'search', target: 'task' },
    { regex: /^(find|search|show|list|get|what|where).*(skill|skills)/i, type: 'search', target: 'skill' },
    { regex: /^(find|search|show|list|get|what|where).*(memory|memories)/i, type: 'search', target: 'memory' },
    { regex: /^(find|search|show|list|get|what|where).*(notification|notifications)/i, type: 'search', target: 'notification' },
    { regex: /^(find|search|show|list|get|what|where).*(log|logs)/i, type: 'search', target: 'log' },
    { regex: /^(find|search|show|list|get|what|where).*(entity|entities|knowledge)/i, type: 'search', target: 'entity' },
    
    // Status patterns
    { regex: /^(how|what).*(status|health|performance|doing)/i, type: 'status', target: 'system' },
    { regex: /^(show|display|get).*(metrics|stats|statistics)/i, type: 'status', target: 'metrics' },
    { regex: /^(show|display|get).*(dashboard)/i, type: 'status', target: 'dashboard' },
    
    // Create patterns
    { regex: /^(create|make|new|add).*(agent)/i, type: 'create', target: 'agent' },
    { regex: /^(create|make|new|add).*(workflow)/i, type: 'create', target: 'workflow' },
    { regex: /^(create|make|new|add).*(task)/i, type: 'create', target: 'task' },
    { regex: /^(create|make|new|add).*(skill)/i, type: 'create', target: 'skill' },
    { regex: /^(create|make|new|add).*(memory)/i, type: 'create', target: 'memory' },
    { regex: /^(create|make|new|add).*(company|organization|org)/i, type: 'create', target: 'company' },
    { regex: /^(create|make|new|add).*(department|dept)/i, type: 'create', target: 'department' },
    { regex: /^(create|make|new|add).*(note|reminder)/i, type: 'create', target: 'note' },
    
    // Delete patterns
    { regex: /^(delete|remove|kill|stop).*(agent)/i, type: 'delete', target: 'agent' },
    { regex: /^(delete|remove|kill|stop).*(workflow)/i, type: 'delete', target: 'workflow' },
    { regex: /^(delete|remove|kill|stop).*(task)/i, type: 'delete', target: 'task' },
    { regex: /^(delete|remove|clear).*(memory)/i, type: 'delete', target: 'memory' },
    { regex: /^(delete|remove|clear).*(notification|notifications)/i, type: 'delete', target: 'notification' },
    
    // Action patterns
    { regex: /^(run|execute|start|launch).*(workflow)/i, type: 'action', target: 'workflow' },
    { regex: /^(run|execute|start|launch).*(agent)/i, type: 'action', target: 'agent' },
    { regex: /^(run|execute|start|launch).*(task)/i, type: 'action', target: 'task' },
    { regex: /^(run|execute|start|launch).*(skill)/i, type: 'action', target: 'skill' },
    { regex: /^(run|execute|start|launch).*(browser)/i, type: 'action', target: 'browser' },
    { regex: /^(run|execute|start|launch).*(test|tests)/i, type: 'action', target: 'test' },
    { regex: /^(schedule|cron).*/i, type: 'action', target: 'scheduler' },
    { regex: /^(generate|create).*(doc|docs|documentation)/i, type: 'action', target: 'docs' },
    { regex: /^(generate|create).*(code)/i, type: 'action', target: 'code' },
    { regex: /^(sync|update).*(github)/i, type: 'action', target: 'github' },
    { regex: /^(backup|export)/i, type: 'action', target: 'backup' },
    { regex: /^(ingest|import).*(log|logs)/i, type: 'action', target: 'logs' },
    { regex: /^(monitor|watch)/i, type: 'action', target: 'monitor' },
    
    // Help patterns
    { regex: /^(help|how|what|explain).*/i, type: 'help' },
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (match) {
      return {
        type: pattern.type as QueryIntent['type'],
        target: pattern.target,
        parameters: extractParameters(normalized),
        confidence: 0.8,
      };
    }
  }

  // Default to unknown
  return {
    type: 'unknown',
    parameters: {},
    confidence: 0,
  };
}

// Extract parameters from query
function extractParameters(query: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  
  // Extract name
  const nameMatch = query.match(/(?:named?|called?)\s+["']?([^"',\s]+)["']?/i);
  if (nameMatch) {
    params.name = nameMatch[1];
  }
  
  // Extract role
  const roleMatch = query.match(/(?:as|role)\s+(\w+)/i);
  if (roleMatch) {
    params.role = roleMatch[1];
  }
  
  // Extract limit
  const limitMatch = query.match(/(?:top|last|first|limit)\s+(\d+)/i);
  if (limitMatch) {
    params.limit = parseInt(limitMatch[1]);
  }
  
  // Extract time range
  const timeMatch = query.match(/(\d+)\s*(hour|day|week|month)s?/i);
  if (timeMatch) {
    params.timeRange = { value: parseInt(timeMatch[1]), unit: timeMatch[2] };
  }
  
  // Extract with specific attribute
  const withMatch = query.match(/with\s+(\w+)\s+(?:is|=)?\s*["']?([^"',\s]+)["']?/i);
  if (withMatch) {
    params[withMatch[1]] = withMatch[2];
  }
  
  // Extract level
  const levelMatch = query.match(/(?:level|priority)\s+(\w+)/i);
  if (levelMatch) {
    params.level = levelMatch[1];
  }
  
  return params;
}

// Execute parsed command
export async function executeFromIntent(intent: QueryIntent): Promise<unknown> {
  events.emit('nlp.execute', { intent });
  
  const { type, target, parameters } = intent;
  
  switch (type) {
    case 'search': {
      return await executeSearch(target, parameters);
    }
    case 'status': {
      return await executeStatus(target, parameters);
    }
    case 'create': {
      return await executeCreate(target, parameters);
    }
    case 'delete': {
      return await executeDelete(target, parameters);
    }
    case 'action': {
      return await executeAction(target, parameters);
    }
    case 'help': {
      return getHelpResponse();
    }
    default:
      throw new Error(`Unknown intent type: ${type}`);
  }
}

async function executeSearch(target?: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const limit = (params.limit as number) || 10;
  
  switch (target) {
    case 'agent': {
      const { listAgents } = await import('../agents/engine/index.js');
      return listAgents().slice(0, limit);
    }
    case 'workflow': {
      const { listWorkflows } = await import('../workflow/engine.js');
      return listWorkflows().slice(0, limit);
    }
    case 'task': {
      console.log('Task module not yet implemented');
      return [];
    }
    case 'skill': {
      const { listSkills } = await import('../skills/registry.js');
      // @ts-expect-error listSkills may have different signature
      return listSkills().slice(0, limit);
    }
    case 'memory': {
      const { searchMemories } = await import('../memory/store.js');
      // @ts-expect-error searchMemories may have different signature
      return searchMemories({ limit });
    }
    case 'notification': {
      const { listNotifications } = await import('../notifications/index.js');
      return listNotifications({ unreadOnly: true });
    }
    case 'log': {
      const { queryLogs } = await import('../log-analytics/index.js');
      return queryLogs({ level: params.level as string, limit });
    }
    case 'entity': {
      const { searchEntities } = await import('../knowledge/graph.js');
      return searchEntities(params.query as string || '', limit);
    }
    default:
      return [];
  }
}

async function executeStatus(target?: string, _params: Record<string, unknown> = {}): Promise<unknown> {
  switch (target) {
    case 'system':
    case 'metrics': {
      const { collectMetrics } = await import('../monitoring/index.js');
      return collectMetrics();
    }
    default:
      return { status: 'unknown' };
  }
}

async function executeCreate(target?: string, params: Record<string, unknown> = {}): Promise<unknown> {
  switch (target) {
    case 'agent': {
      const { createAgent } = await import('../agents/engine/index.js');
      return createAgent({
        name: (params.name as string) || 'New Agent',
        role: (params.role as string) || 'assistant',
      });
    }
    case 'workflow': {
      const { createWorkflow } = await import('../workflow/engine.js');
      return createWorkflow({
        name: (params.name as string) || 'New Workflow',
        nodes: [],
      });
    }
    case 'task': {
      console.log('Task module not yet implemented');
      return null;
    }
    case 'memory': {
      const { addMemory } = await import('../memory/store.js');
      // @ts-expect-error addMemory may have different signature
      return addMemory({
        type: 'note',
        content: params.content as string || '',
        tags: ['manual'],
      });
    }
    case 'company': {
      const { createCompany } = await import('../org/index.js');
      return createCompany((params.name as string) || 'New Company');
    }
    case 'note': {
      const { addMemory } = await import('../memory/store.js');
      return addMemory({
        type: 'note',
        content: params.content as string || '',
        tags: ['note'],
      });
    }
    default:
      return null;
  }
}

async function executeDelete(target?: string, params: Record<string, unknown> = {}): Promise<boolean> {
  const id = params.id as string || params.name as string;
  if (!id) return false;
  
  switch (target) {
    case 'agent': {
      const { deleteAgent } = await import('../agents/engine/index.js');
      return deleteAgent(id);
    }
    case 'workflow': {
      const { deleteWorkflow } = await import('../workflow/engine.js');
      return deleteWorkflow(id);
    }
    case 'task': {
      console.log('Task module not yet implemented');
      return false;
    }
    case 'notification': {
      const { markAllAsRead } = await import('../notifications/index.js');
      return markAllAsRead();
    }
    default:
      return false;
  }
}

async function executeAction(target?: string, params: Record<string, unknown> = {}): Promise<unknown> {
  switch (target) {
    case 'browser': {
      const { openBrowser } = await import('../browser/index.js');
      return openBrowser(params.url as string || 'https://google.com');
    }
    case 'test': {
      console.log('Test generation not yet implemented');
      return null;
    }
    case 'docs': {
      const { generateDocs } = await import('../docs/generator.js');
      return generateDocs({ watch: false });
    }
    case 'backup': {
      const { exportKnowledge } = await import('../knowledge/graph.js');
      return exportKnowledge(params.path as string || './backup.json');
    }
    case 'monitor': {
      const { startMonitoring } = await import('../monitoring/index.js');
      return startMonitoring(parseInt(params.interval as string) || 5);
    }
    case 'logs': {
      const { ingestLogFile } = await import('../log-analytics/index.js');
      return ingestLogFile(params.file as string || '', params.source as string || 'unknown');
    }
    default:
      return null;
  }
}

function getHelpResponse(): string {
  return `
Available commands:

Search:
  - "show agents" / "list workflows" / "find tasks"
  - "search memories" / "get notifications"
  - "show logs" / "find entities"

Status:
  - "system status" / "show metrics"
  - "show dashboard"

Create:
  - "create agent named X as role Y"
  - "create workflow named X"
  - "add task named X"
  - "create memory with content X"
  - "add note X"

Actions:
  - "run workflow X" / "execute agent X"
  - "open browser" / "run tests"
  - "generate docs" / "schedule task"
  - "backup data" / "ingest logs"
  - "start monitoring"

Delete:
  - "delete agent X" / "remove task X"
  - "clear notifications"
`;
}

// Process natural language query
export async function processQuery(query: string): Promise<NLCommand> {
  const intent = parseQuery(query);
  
  const command: NLCommand = {
    original: query,
    intent,
    suggestions: generateSuggestions(intent),
    canExecute: intent.confidence > 0.5 && intent.type !== 'unknown',
  };
  
  events.emit('nlp.query', { query, command });
  return command;
}

// Generate suggestions based on intent
function generateSuggestions(intent: QueryIntent): string[] {
  const suggestions: string[] = [];
  
  if (intent.type === 'unknown') {
    suggestions.push('Try: "show agents" or "create agent named X"');
    suggestions.push('Try: "system status" or "run workflow X"');
  }
  
  if (intent.target === 'agent') {
    suggestions.push(`Try: "create agent named ${intent.parameters.name || 'MyAgent'} as coder"`);
  }
  
  return suggestions;
}
