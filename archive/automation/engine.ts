/**
 * Automation Engine - Rule-based workflow automation with triggers
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: TriggerConfig;
  conditions: ConditionConfig[];
  actions: ActionConfig[];
  cooldownMinutes?: number;
  lastExecuted?: Date;
  executionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriggerConfig {
  type: 'schedule' | 'event' | 'webhook' | 'file' | 'metric' | 'manual';
  config: Record<string, unknown>;
}

export interface ConditionConfig {
  type: 'equals' | 'contains' | 'gt' | 'lt' | 'regex' | 'exists' | 'and' | 'or' | 'not';
  field?: string;
  value?: unknown;
  conditions?: ConditionConfig[];
}

export interface ActionConfig {
  type: 'run_workflow' | 'run_agent' | 'send_notification' | 'webhook' | 'execute_script' | 'log' | 'update_entity';
  config: Record<string, unknown>;
}

export interface RuleExecution {
  id: string;
  ruleId: string;
  triggeredAt: Date;
  executedAt: Date;
  success: boolean;
  output?: string;
  error?: string;
}

// Create automation rule
export function createRule(rule: Omit<AutomationRule, 'id' | 'executionCount' | 'createdAt' | 'updatedAt'>): AutomationRule {
  const db = getDB();
  const id = `rule-${Date.now()}`;
  const now = new Date();

  const newRule: AutomationRule = {
    ...rule,
    id,
    executionCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO automation_rules (id, name, description, enabled, trigger, conditions, actions, cooldown_minutes, execution_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    rule.name,
    rule.description ?? null,
    rule.enabled ? 1 : 0,
    JSON.stringify(rule.trigger),
    JSON.stringify(rule.conditions),
    JSON.stringify(rule.actions),
    rule.cooldownMinutes ?? null,
    0,
    now.toISOString(),
    now.toISOString()
  );

  events.emit('automation.rule_created', { ruleId: id });
  return newRule;
}

// Get rule by ID
export function getRule(id: string): AutomationRule | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM automation_rules WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToRule(row);
}

// List all rules
export function listRules(filter?: { enabled?: boolean }): AutomationRule[] {
  const db = getDB();
  let query = 'SELECT * FROM automation_rules';
  const params: unknown[] = [];

  if (filter?.enabled !== undefined) {
    query += ' WHERE enabled = ?';
    params.push(filter.enabled ? 1 : 0);
  }

  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(rowToRule);
}

// Update rule
export function updateRule(id: string, updates: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>): AutomationRule | null {
  const db = getDB();
  const rule = getRule(id);
  if (!rule) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push('description = ?');
    params.push(updates.description);
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }
  if (updates.trigger !== undefined) {
    sets.push('trigger = ?');
    params.push(JSON.stringify(updates.trigger));
  }
  if (updates.conditions !== undefined) {
    sets.push('conditions = ?');
    params.push(JSON.stringify(updates.conditions));
  }
  if (updates.actions !== undefined) {
    sets.push('actions = ?');
    params.push(JSON.stringify(updates.actions));
  }
  if (updates.cooldownMinutes !== undefined) {
    sets.push('cooldown_minutes = ?');
    params.push(updates.cooldownMinutes);
  }

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE automation_rules SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  events.emit('automation.rule_updated', { ruleId: id });
  return getRule(id);
}

// Delete rule
export function deleteRule(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM automation_rules WHERE id = ?').run(id);
  events.emit('automation.rule_deleted', { ruleId: id });
  return result.changes > 0;
}

// Toggle rule enabled state
export function toggleRule(id: string, enabled?: boolean): AutomationRule | null {
  const rule = getRule(id);
  if (!rule) return null;
  return updateRule(id, { enabled: enabled ?? !rule.enabled });
}

// Evaluate conditions
export function evaluateConditions(conditions: ConditionConfig[], context: Record<string, unknown>): boolean {
  for (const condition of conditions) {
    if (!evaluateCondition(condition, context)) {
      return false;
    }
  }
  return true;
}

function evaluateCondition(condition: ConditionConfig, context: Record<string, unknown>): boolean {
  const { type, field, value, conditions: subConditions } = condition;

  switch (type) {
    case 'equals':
      return context[field!] === value;
    case 'contains':
      return String(context[field!]).includes(String(value));
    case 'gt':
      return Number(context[field!]) > Number(value);
    case 'lt':
      return Number(context[field!]) < Number(value);
    case 'regex': {
      const regex = new RegExp(String(value));
      return regex.test(String(context[field!]));
    }
    case 'exists':
      return context[field!] !== undefined;
    case 'and':
      return subConditions?.every(c => evaluateCondition(c, context)) ?? true;
    case 'or':
      return subConditions?.some(c => evaluateCondition(c, context)) ?? false;
    case 'not':
      return !evaluateCondition(subConditions?.[0] ?? { type: 'equals', field: '', value: '' }, context);
    default:
      return true;
  }
}

// Execute actions
export async function executeActions(actions: ActionConfig[], context: Record<string, unknown>): Promise<boolean> {
  for (const action of actions) {
    try {
      await executeAction(action, context);
    } catch (error) {
      console.error(`Action failed: ${action.type}`, error);
      return false;
    }
  }
  return true;
}

async function executeAction(action: ActionConfig, context: Record<string, unknown>): Promise<void> {
  const { type, config } = action;

  switch (type) {
    case 'run_workflow': {
      const { executeWorkflow } = await import('../workflow/engine.js');
      await executeWorkflow(config.workflowId as string, { ...context, ...config.input });
      break;
    }
    case 'run_agent': {
      const { executeAgent } = await import('../agents/engine/index.js');
      await executeAgent(config.agentId as string, config.task as string);
      break;
    }
    case 'send_notification': {
      const { createNotification } = await import('../notifications/index.js');
      createNotification({
        title: config.title as string,
        message: config.message as string,
        priority: (config.priority as string) || 'normal',
        channel: 'desktop',
      });
      break;
    }
    case 'webhook': {
      const { fetch } = await import('undici');
      await fetch(config.url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...context, ...config.payload }),
      });
      break;
    }
    case 'execute_script': {
      const { execSync } = await import('child_process');
      execSync(config.script as string, { encoding: 'utf-8' });
      break;
    }
    case 'log': {
      console.log(`[Automation] ${config.message}`, context);
      break;
    }
    case 'update_entity': {
      const { updateEntity } = await import('../knowledge/graph.js');
      updateEntity(config.entityId as string, config.properties as Record<string, unknown>);
      break;
    }
  }
}

// Execute rule
export async function executeRule(ruleId: string, context: Record<string, unknown> = {}): Promise<RuleExecution> {
  const db = getDB();
  const rule = getRule(ruleId);
  if (!rule) throw new Error(`Rule not found: ${ruleId}`);

  const executionId = `exec-${Date.now()}`;
  const triggeredAt = new Date();

  // Check cooldown
  if (rule.cooldownMinutes && rule.lastExecuted) {
    const minutesSinceLast = (Date.now() - rule.lastExecuted.getTime()) / 1000 / 60;
    if (minutesSinceLast < rule.cooldownMinutes) {
      const execution: RuleExecution = {
        id: executionId,
        ruleId,
        triggeredAt,
        executedAt: new Date(),
        success: false,
        error: 'Cooldown period not elapsed',
      };
      saveExecution(execution);
      return execution;
    }
  }

  // Evaluate conditions
  const conditionsMet = evaluateConditions(rule.conditions, context);
  if (!conditionsMet) {
    const execution: RuleExecution = {
      id: executionId,
      ruleId,
      triggeredAt,
      executedAt: new Date(),
      success: false,
      error: 'Conditions not met',
    };
    saveExecution(execution);
    return execution;
  }

  // Execute actions
  try {
    await executeActions(rule.actions, context);

    // Update execution count and last executed
    db.prepare(`
      UPDATE automation_rules SET execution_count = execution_count + 1, last_executed = ? WHERE id = ?
    `).run(new Date().toISOString(), ruleId);

    const execution: RuleExecution = {
      id: executionId,
      ruleId,
      triggeredAt,
      executedAt: new Date(),
      success: true,
    };
    saveExecution(execution);

    events.emit('automation.rule_executed', { ruleId, executionId });
    return execution;
  } catch (error) {
    const execution: RuleExecution = {
      id: executionId,
      ruleId,
      triggeredAt,
      executedAt: new Date(),
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    saveExecution(execution);
    return execution;
  }
}

function saveExecution(execution: RuleExecution): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO rule_executions (id, rule_id, triggered_at, executed_at, success, output, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    execution.id,
    execution.ruleId,
    execution.triggeredAt.toISOString(),
    execution.executedAt.toISOString(),
    execution.success ? 1 : 0,
    execution.output ?? null,
    execution.error ?? null
  );
}

// Get rule execution history
export function getRuleExecutions(ruleId?: string, limit: number = 50): RuleExecution[] {
  const db = getDB();
  let query = 'SELECT * FROM rule_executions';
  const params: unknown[] = [];

  if (ruleId) {
    query += ' WHERE rule_id = ?';
    params.push(ruleId);
  }

  query += ' ORDER BY executed_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(row => ({
    id: row.id,
    ruleId: row.rule_id,
    triggeredAt: new Date(row.triggered_at),
    executedAt: new Date(row.executed_at),
    success: row.success === 1,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
  }));
}

// Process event trigger
export async function processEvent(eventName: string, eventData: Record<string, unknown>): Promise<void> {
  const rules = listRules({ enabled: true }).filter(r => 
    r.trigger.type === 'event' && r.trigger.config.event === eventName
  );

  for (const rule of rules) {
    await executeRule(rule.id, eventData);
  }
}

// Helper function to convert DB row to rule
function rowToRule(row: any): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    enabled: row.enabled === 1,
    trigger: JSON.parse(row.trigger),
    conditions: JSON.parse(row.conditions),
    actions: JSON.parse(row.actions),
    cooldownMinutes: row.cooldown_minutes ?? undefined,
    lastExecuted: row.last_executed ? new Date(row.last_executed) : undefined,
    executionCount: row.execution_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Initialize database tables
export function initAutomationTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS automation_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 1,
      trigger TEXT NOT NULL,
      conditions TEXT NOT NULL,
      actions TEXT NOT NULL,
      cooldown_minutes INTEGER,
      last_executed TIMESTAMP,
      execution_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rule_executions (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      triggered_at TIMESTAMP,
      executed_at TIMESTAMP,
      success INTEGER,
      output TEXT,
      error TEXT,
      FOREIGN KEY (rule_id) REFERENCES automation_rules(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rule_executions_rule_id ON rule_executions(rule_id);
    CREATE INDEX IF NOT EXISTS idx_rule_executions_executed_at ON rule_executions(executed_at);
  `);
}

// Create preset rules
export function createPresetRules(): void {
  const presets = [
    {
      name: 'High CPU Alert',
      description: 'Notify when CPU usage is high',
      trigger: { type: 'metric', config: { metric: 'cpu', threshold: 80 } },
      conditions: [{ type: 'gt', field: 'cpu_usage', value: 80 }],
      actions: [
        {
          type: 'send_notification',
          config: { title: 'High CPU Usage', message: 'CPU usage exceeded 80%', priority: 'high' },
        },
      ],
      cooldownMinutes: 15,
    },
    {
      name: 'Error Log Alert',
      description: 'Notify on error logs',
      trigger: { type: 'event', config: { event: 'log.error' } },
      conditions: [{ type: 'equals', field: 'level', value: 'error' }],
      actions: [
        {
          type: 'send_notification',
          config: { title: 'Error Detected', message: 'An error was logged', priority: 'high' },
        },
      ],
      cooldownMinutes: 5,
    },
    {
      name: 'Daily Report',
      description: 'Generate daily summary report',
      trigger: { type: 'schedule', config: { cron: '0 9 * * *' } },
      conditions: [],
      actions: [
        { type: 'log', config: { message: 'Generating daily report' } },
      ],
    },
  ];

  for (const preset of presets) {
    const exists = listRules().some(r => r.name === preset.name);
    if (!exists) {
      createRule(preset as any);
    }
  }
}
