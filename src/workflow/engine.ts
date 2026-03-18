/**
 * Workflow Engine - DAG-based task execution
 * Supports: sequential, parallel, conditional, loop nodes
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB, insert, update, selectOne, selectAll } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import { executeAgent, getAgent } from '../agents/engine/index.js';
import type { Workflow, WorkflowExecution } from '../types/index.js';

export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
}

// Create workflow
export function createWorkflow(data: Omit<Workflow, 'id' | 'createdAt' | 'updatedAt'>): Workflow {
  const workflow: Workflow = {
    id: uuidv4(),
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  insert('workflows', {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    definition: JSON.stringify(workflow.definition),
    version: workflow.version,
    author: workflow.author,
    tags: JSON.stringify(workflow.tags),
  });

  events.emit('workflow.created', { workflowId: workflow.id, name: workflow.name });
  return workflow;
}

// Get workflow
export function getWorkflow(id: string): Workflow | undefined {
  const row = selectOne<any>('workflows', id);
  if (!row) return undefined;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    definition: JSON.parse(row.definition),
    version: row.version,
    author: row.author,
    tags: JSON.parse(row.tags),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// List workflows
export function listWorkflows(): Workflow[] {
  const rows = selectAll<any>('workflows');
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    definition: JSON.parse(row.definition),
    version: row.version,
    author: row.author,
    tags: JSON.parse(row.tags),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

// Delete workflow
export function deleteWorkflow(id: string): boolean {
  const workflow = getWorkflow(id);
  if (!workflow) return false;
  
  const db = getDB();
  db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
  return true;
}

// Execute workflow
export async function executeWorkflow(
  workflowId: string,
  initialVariables: Record<string, any> = {}
): Promise<WorkflowExecution> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

  // const executionId = uuidv4();
  const startTime = Date.now();

  const execution: WorkflowExecution = {
    id: executionId,
    workflowId,
    status: 'running',
    context: {
      variables: { ...initialVariables },
      nodeStates: {},
      logs: [],
    },
    startedAt: new Date(),
  };

  // Save execution
  insert('executions', {
    id: execution.id,
    workflow_id: workflowId,
    status: 'running',
    context: JSON.stringify(execution.context),
    started_at: execution.startedAt.toISOString(),
  });

  events.emit('workflow.triggered', { 
    workflowId, 
    runId: executionId, 
    context: initialVariables 
  });

  try {
    const { nodes, edges } = workflow.definition;
    
    // Build dependency graph
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const incomingEdges = new Map<string, string[]>();
    const outgoingEdges = new Map<string, string[]>();
    
    for (const edge of edges) {
      if (!outgoingEdges.has(edge.from)) outgoingEdges.set(edge.from, []);
      if (!incomingEdges.has(edge.to)) incomingEdges.set(edge.to, []);
      outgoingEdges.get(edge.from)!.push(edge.to);
      incomingEdges.get(edge.to)!.push(edge.from);
    }

    // Find start nodes
    const startNodes = nodes.filter(n => !incomingEdges.has(n.id) || incomingEdges.get(n.id)!.length === 0);
    
    // Execute nodes in topological order
    const executed = new Set<string>();
    const executing = new Set<string>();

    async function executeNode(nodeId: string): Promise<any> {
      if (executed.has(nodeId)) return execution.context.nodeStates[nodeId];
      if (executing.has(nodeId)) throw new Error(`Circular dependency detected at ${nodeId}`);
      
      executing.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) throw new Error(`Node ${nodeId} not found`);

      // Wait for dependencies
      const deps = incomingEdges.get(nodeId) || [];
      const depResults = await Promise.all(deps.map(d => executeNode(d)));

      events.emit('workflow.step.started', {
        workflowId,
        runId: executionId,
        stepId: nodeId,
      });

      // Execute node based on type
      let result: any;
      // const nodeStart = Date.now();

      try {
        switch (node.type) {
          case 'start':
            result = execution.context.variables;
            break;

          case 'agent':
            const agentId = node.config.agentId;
            const prompt = node.config.prompt;
            const agent = getAgent(agentId);
            if (!agent) throw new Error(`Agent ${agentId} not found`);
            
            const agentResult = await executeAgent(agentId, prompt);
            result = agentResult.output;
            break;

          case 'skill':
            const skillName = node.config.skill;
            const skillInput = node.config.input || {};
            result = await executeSkill(skillName, skillInput);
            break;

          case 'condition':
            const condition = node.config.condition;
            result = evaluateCondition(condition, execution.context.variables);
            break;

          case 'code':
            const code = node.config.code;
            result = await executeCode(code, execution.context.variables);
            break;

          case 'delay':
            const delayMs = node.config.delay || 1000;
            await new Promise(r => setTimeout(r, delayMs));
            result = { delayed: delayMs };
            break;

          case 'merge':
            result = depResults;
            break;

          case 'end':
            result = execution.context.variables;
            break;

          default:
            result = { message: `Unknown node type: ${node.type}` };
        }

        execution.context.nodeStates[nodeId] = result;
        executed.add(nodeId);
        executing.delete(nodeId);

        // Log success
        execution.context.logs.push({
          timestamp: new Date(),
          nodeId,
          level: 'info',
          message: `Node ${nodeId} completed`,
          data: result,
        });

        events.emit('workflow.step.completed', {
          workflowId,
          runId: executionId,
          stepId: nodeId,
          result,
        });

        return result;

      } catch (error) {
        execution.context.logs.push({
          timestamp: new Date(),
          nodeId,
          level: 'error',
          message: `Node ${nodeId} failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        throw error;
      }
    }

    // Execute all start nodes in parallel
    await Promise.all(startNodes.map(n => executeNode(n.id)));

    // Mark completed
    execution.status = 'completed';
    execution.completedAt = new Date();

    update('executions', executionId, {
      status: 'completed',
      context: JSON.stringify(execution.context),
      completed_at: execution.completedAt.toISOString(),
    });

    events.emit('workflow.completed', {
      workflowId,
      runId: executionId,
      result: execution.context.variables,
      duration: Date.now() - startTime,
    });

  } catch (error) {
    execution.status = 'failed';
    execution.completedAt = new Date();

    update('executions', executionId, {
      status: 'failed',
      context: JSON.stringify(execution.context),
      completed_at: execution.completedAt.toISOString(),
    });

    events.emit('workflow.failed', {
      workflowId,
      runId: executionId,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }

  return execution;
}

// Execute skill
async function executeSkill(name: string, input: any): Promise<any> {
  const skills: Record<string, Function> = {
    'shell': async (cmd: string) => ({ command: cmd, status: 'executed' }),
    'http': async (url: string) => ({ url, method: 'GET', status: 200 }),
    'log': async (msg: string) => ({ logged: msg }),
    'wait': async (ms: number) => { await new Promise(r => setTimeout(r, ms)); return { waited: ms }; },
  };

  const skill = skills[name];
  if (!skill) throw new Error(`Skill ${name} not found`);
  
  return skill(input);
}

// Evaluate condition
function evaluateCondition(condition: string, variables: Record<string, any>): boolean {
  try {
    // Simple condition evaluation
    const func = new Function('vars', `with(vars) { return ${condition}; }`);
    return func(variables);
  } catch {
    return false;
  }
}

// Execute code
async function executeCode(code: string, variables: Record<string, any>): Promise<any> {
  try {
    const func = new Function('vars', `with(vars) { ${code}; return vars; }`);
    return func({ ...variables });
  } catch (error) {
    throw new Error(`Code execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Get execution status
export function getExecution(id: string): WorkflowExecution | undefined {
  const db = getDB();
  const stmt = db.prepare('SELECT * FROM executions WHERE id = ?');
  const row = stmt.get(id) as any;
  
  if (!row) return undefined;

  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    context: JSON.parse(row.context),
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

// List executions
export function listExecutions(workflowId?: string): WorkflowExecution[] {
  const db = getDB();
  let stmt;
  
  if (workflowId) {
    stmt = db.prepare('SELECT * FROM executions WHERE workflow_id = ? ORDER BY started_at DESC');
    const rows = stmt.all(workflowId) as any[];
    return rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      context: JSON.parse(row.context),
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    }));
  } else {
    stmt = db.prepare('SELECT * FROM executions ORDER BY started_at DESC');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      status: row.status,
      context: JSON.parse(row.context),
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    }));
  }
}

// Create table for executions
export function initWorkflowTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      workflow_id TEXT REFERENCES workflows(id),
      status TEXT NOT NULL,
      context JSON NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id);
  `);
}
