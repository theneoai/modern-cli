/**
 * AI Model Manager - Multi-provider LLM management
 */

import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'local' | 'custom';
  modelId: string; // Provider-specific model ID
  config: ModelConfig;
  capabilities: ModelCapability[];
  costPer1KTokens: { input: number; output: number };
  contextWindow: number;
  enabled: boolean;
  isDefault: boolean;
  priority: number; // Higher = preferred
  usage: {
    totalCalls: number;
    totalTokens: number;
    estimatedCost: number;
    lastUsed?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelConfig {
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeout?: number;
  customHeaders?: Record<string, string>;
}

export type ModelCapability = 
  | 'chat' 
  | 'completion' 
  | 'embedding' 
  | 'image-generation' 
  | 'vision' 
  | 'function-calling'
  | 'json-mode'
  | 'streaming';

export interface ModelRequest {
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  functions?: unknown[];
  responseFormat?: 'text' | 'json';
  stream?: boolean;
}

export interface ModelResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  model: string;
  latency: number;
}

// Add a new model
export function addModel(model: Omit<AIModel, 'id' | 'usage' | 'createdAt' | 'updatedAt'>): AIModel {
  const db = getDB();
  const id = `model-${Date.now()}`;
  const now = new Date();

  // If this is default, unset other defaults
  if (model.isDefault) {
    db.prepare('UPDATE ai_models SET is_default = 0 WHERE provider = ?').run(model.provider);
  }

  const newModel: AIModel = {
    ...model,
    id,
    usage: {
      totalCalls: 0,
      totalTokens: 0,
      estimatedCost: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  db.prepare(`
    INSERT INTO ai_models (id, name, provider, model_id, config, capabilities, cost_input, cost_output, context_window, enabled, is_default, priority, usage, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    model.name,
    model.provider,
    model.modelId,
    JSON.stringify(model.config),
    JSON.stringify(model.capabilities),
    model.costPer1KTokens.input,
    model.costPer1KTokens.output,
    model.contextWindow,
    model.enabled ? 1 : 0,
    model.isDefault ? 1 : 0,
    model.priority,
    JSON.stringify(newModel.usage),
    now.toISOString(),
    now.toISOString()
  );

  events.emit('model.added', { modelId: id });
  return newModel;
}

// Get model by ID
export function getModel(id: string): AIModel | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM ai_models WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToModel(row);
}

// Get default model for provider
export function getDefaultModel(provider?: string): AIModel | null {
  const db = getDB();
  let query = 'SELECT * FROM ai_models WHERE is_default = 1 AND enabled = 1';
  const params: unknown[] = [];

  if (provider) {
    query += ' AND provider = ?';
    params.push(provider);
  }

  query += ' ORDER BY priority DESC LIMIT 1';

  const row = db.prepare(query).get(...params) as any;
  if (!row) return null;
  return rowToModel(row);
}

// List all models
export function listModels(filter?: { enabled?: boolean; provider?: string; capability?: string }): AIModel[] {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.enabled !== undefined) {
    conditions.push('enabled = ?');
    params.push(filter.enabled ? 1 : 0);
  }
  if (filter?.provider) {
    conditions.push('provider = ?');
    params.push(filter.provider);
  }

  let query = 'SELECT * FROM ai_models';
  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY priority DESC, created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];
  const models = rows.map(rowToModel);

  if (filter?.capability) {
    return models.filter(m => m.capabilities.includes(filter.capability as ModelCapability));
  }
  return models;
}

// Update model
export function updateModel(id: string, updates: Partial<Omit<AIModel, 'id' | 'createdAt' | 'usage'>>): AIModel | null {
  const db = getDB();
  const model = getModel(id);
  if (!model) return null;

  // If setting as default, unset others
  if (updates.isDefault) {
    db.prepare('UPDATE ai_models SET is_default = 0').run();
  }

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.config !== undefined) {
    sets.push('config = ?');
    params.push(JSON.stringify(updates.config));
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }
  if (updates.isDefault !== undefined) {
    sets.push('is_default = ?');
    params.push(updates.isDefault ? 1 : 0);
  }
  if (updates.priority !== undefined) {
    sets.push('priority = ?');
    params.push(updates.priority);
  }

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE ai_models SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  events.emit('model.updated', { modelId: id });
  return getModel(id);
}

// Delete model
export function deleteModel(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM ai_models WHERE id = ?').run(id);
  events.emit('model.deleted', { modelId: id });
  return result.changes > 0;
}

// Select best model for request
export function selectModel(request: Partial<ModelRequest>, preferredProvider?: string): AIModel | null {
  const capabilities: ModelCapability[] = ['chat'];
  
  if (request.functions) capabilities.push('function-calling');
  if (request.responseFormat === 'json') capabilities.push('json-mode');
  if (request.stream) capabilities.push('streaming');

  let models = listModels({ enabled: true });

  // Filter by capabilities
  models = models.filter(m => capabilities.every(c => m.capabilities.includes(c)));

  // Prefer requested provider
  if (preferredProvider) {
    const providerModels = models.filter(m => m.provider === preferredProvider);
    if (providerModels.length > 0) {
      return providerModels[0];
    }
  }

  // Return highest priority
  return models[0] ?? null;
}

// Execute model request
export async function executeModelRequest(
  request: ModelRequest,
  modelId?: string
): Promise<ModelResponse> {
  const model = modelId ? getModel(modelId) : selectModel(request);
  if (!model) {
    throw new Error('No suitable model found');
  }

  const startTime = Date.now();
  void startTime;
  
  try {
    let response: ModelResponse;

    switch (model.provider) {
      case 'anthropic':
        response = await callAnthropic(request, model);
        break;
      case 'openai':
        response = await callOpenAI(request, model);
        break;
      default:
        throw new Error(`Provider ${model.provider} not implemented`);
    }

    // Update usage stats
    const cost = (response.usage.totalTokens / 1000) * 
      (model.costPer1KTokens.input + model.costPer1KTokens.output) / 2;
    
    updateModelUsage(model.id, {
      calls: 1,
      tokens: response.usage.totalTokens,
      cost,
    });

    events.emit('model.request_completed', {
      modelId: model.id,
      provider: model.provider,
      tokens: response.usage.totalTokens,
      latency: response.latency,
    });

    return response;
  } catch (error) {
    events.emit('model.request_failed', {
      modelId: model.id,
      provider: model.provider,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function callAnthropic(request: ModelRequest, model: AIModel): Promise<ModelResponse> {
  const apiKey = model.config.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.modelId,
      messages: request.messages || [{ role: 'user', content: request.prompt || '' }],
      system: request.system,
      max_tokens: request.maxTokens || model.config.maxTokens || 4096,
      temperature: request.temperature ?? model.config.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  
  return {
    content: data.content[0]?.text || '',
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
    finishReason: data.stop_reason,
    model: data.model,
    latency: 0,
  };
}

async function callOpenAI(request: ModelRequest, model: AIModel): Promise<ModelResponse> {
  const apiKey = model.config.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model.modelId,
      messages: request.messages || [{ role: 'user', content: request.prompt || '' }],
      max_tokens: request.maxTokens || model.config.maxTokens,
      temperature: request.temperature ?? model.config.temperature,
      response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    finishReason: data.choices[0]?.finish_reason,
    model: data.model,
    latency: 0,
  };
}

function updateModelUsage(modelId: string, usage: { calls: number; tokens: number; cost: number }): void {
  const db = getDB();
  const model = getModel(modelId);
  if (!model) return;

  const newUsage = {
    totalCalls: model.usage.totalCalls + usage.calls,
    totalTokens: model.usage.totalTokens + usage.tokens,
    estimatedCost: model.usage.estimatedCost + usage.cost,
    lastUsed: new Date(),
  };

  db.prepare('UPDATE ai_models SET usage = ? WHERE id = ?').run(
    JSON.stringify(newUsage),
    modelId
  );
}

// Get usage statistics
export function getUsageStats(): {
  totalCalls: number;
  totalTokens: number;
  estimatedCost: number;
  byProvider: Record<string, { calls: number; tokens: number; cost: number }>;
} {
  const models = listModels();
  const byProvider: Record<string, { calls: number; tokens: number; cost: number }> = {};
  
  let totalCalls = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const model of models) {
    const { totalCalls: calls, totalTokens: tokens, estimatedCost: cost } = model.usage;
    totalCalls += calls;
    totalTokens += tokens;
    totalCost += cost;

    if (!byProvider[model.provider]) {
      byProvider[model.provider] = { calls: 0, tokens: 0, cost: 0 };
    }
    byProvider[model.provider].calls += calls;
    byProvider[model.provider].tokens += tokens;
    byProvider[model.provider].cost += cost;
  }

  return {
    totalCalls,
    totalTokens,
    estimatedCost: totalCost,
    byProvider,
  };
}

// Initialize database tables
export function initModelTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      config TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      cost_input REAL NOT NULL,
      cost_output REAL NOT NULL,
      context_window INTEGER NOT NULL,
      enabled INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      usage TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider);
    CREATE INDEX IF NOT EXISTS idx_ai_models_enabled ON ai_models(enabled);
  `);
}

// Add default models
export function addDefaultModels(): void {
  const defaults = [
    {
      name: 'Claude 3.5 Sonnet',
      provider: 'anthropic' as const,
      modelId: 'claude-3-5-sonnet-20241022',
      config: { temperature: 0.7, maxTokens: 4096 },
      capabilities: ['chat', 'completion', 'vision', 'function-calling', 'streaming'] as ModelCapability[],
      costPer1KTokens: { input: 0.003, output: 0.015 },
      contextWindow: 200000,
      enabled: true,
      isDefault: true,
      priority: 100,
    },
    {
      name: 'GPT-4o',
      provider: 'openai' as const,
      modelId: 'gpt-4o',
      config: { temperature: 0.7, maxTokens: 4096 },
      capabilities: ['chat', 'completion', 'vision', 'function-calling', 'json-mode', 'streaming'] as ModelCapability[],
      costPer1KTokens: { input: 0.005, output: 0.015 },
      contextWindow: 128000,
      enabled: true,
      isDefault: false,
      priority: 90,
    },
  ];

  for (const model of defaults) {
    const exists = listModels().some(m => m.modelId === model.modelId);
    if (!exists) {
      addModel(model);
    }
  }
}

// Helper function to convert DB row to model
function rowToModel(row: any): AIModel {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    modelId: row.model_id,
    config: JSON.parse(row.config),
    capabilities: JSON.parse(row.capabilities),
    costPer1KTokens: { input: row.cost_input, output: row.cost_output },
    contextWindow: row.context_window,
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    priority: row.priority,
    usage: JSON.parse(row.usage),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
