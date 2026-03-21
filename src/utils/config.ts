/**
 * config.ts — 应用配置管理
 *
 * 新增字段:
 *   provider        当前活跃 provider (默认 anthropic)
 *   providerBaseURL 自定义端点覆盖 (用于 ollama / custom)
 *   modelContexts   per-provider 上下文保留
 */

import Conf from 'conf';
import type { ProviderDef } from '../ai/providers/registry.js';

export interface CliConfig {
  // ── AI Provider ────────────────────────────────────────────────────────────
  apiKey?: string;              // legacy: Anthropic only (migrate to keyStore)
  provider: string;             // active provider id e.g. "anthropic" | "openai" | "ollama"
  providerBaseURL?: string;     // override base URL (for ollama/custom/self-hosted)
  model: string;                // active model id (scoped to current provider)
  maxTokens: number;
  systemPrompt: string;
  temperature?: number;

  // ── Per-provider model preferences ────────────────────────────────────────
  // Saved so switching back restores previous model choice
  providerModels: Record<string, string>;   // { "openai": "gpt-4o-mini", "ollama": "qwen2.5" }

  // ── Context Preservation ──────────────────────────────────────────────────
  // Keyed by "providerId/modelId" — stores compressed context summaries
  // Full conversation kept in memory (not persisted, too large)
  contextSummaries: Record<string, string>; // summary per provider+model

  // ── App behaviour ──────────────────────────────────────────────────────────
  streamingEnabled: boolean;
  historyEnabled: boolean;
  historyMaxMessages: number;
  theme: 'dark' | 'light';
}

const DEFAULT_CONFIG: CliConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
  systemPrompt:
    'You are a helpful, knowledgeable AI assistant running in a terminal. ' +
    'Be concise but thorough. Use markdown formatting where appropriate. ' +
    'When showing code, always specify the language for syntax highlighting.',
  temperature: 0.7,
  providerModels: {},
  contextSummaries: {},
  streamingEnabled: true,
  historyEnabled: true,
  historyMaxMessages: 20,
  theme: 'dark',
};

export const conf = new Conf<CliConfig>({
  projectName: 'neocli',
  defaults: DEFAULT_CONFIG,
  schema: {
    apiKey:          { type: 'string' },
    provider:        { type: 'string' },
    providerBaseURL: { type: 'string' },
    model:           { type: 'string' },
    maxTokens:       { type: 'number', minimum: 256, maximum: 200000 },
    systemPrompt:    { type: 'string', minLength: 1 },
    temperature:     { type: 'number', minimum: 0, maximum: 2 },
    providerModels:  { type: 'object' },
    contextSummaries:{ type: 'object' },
    streamingEnabled:{ type: 'boolean' },
    historyEnabled:  { type: 'boolean' },
    historyMaxMessages: { type: 'number', minimum: 1, maximum: 1000 },
    theme:           { type: 'string', enum: ['dark', 'light'] },
  },
});

export function getConfig(): CliConfig {
  return {
    apiKey:           conf.get('apiKey') ?? process.env['ANTHROPIC_API_KEY'],
    provider:         conf.get('provider'),
    providerBaseURL:  conf.get('providerBaseURL'),
    model:            conf.get('model'),
    maxTokens:        conf.get('maxTokens'),
    systemPrompt:     conf.get('systemPrompt'),
    temperature:      conf.get('temperature'),
    providerModels:   conf.get('providerModels') ?? {},
    contextSummaries: conf.get('contextSummaries') ?? {},
    streamingEnabled: conf.get('streamingEnabled'),
    historyEnabled:   conf.get('historyEnabled'),
    historyMaxMessages: conf.get('historyMaxMessages'),
    theme:            conf.get('theme'),
  };
}

export function setConfig<K extends keyof CliConfig>(key: K, value: CliConfig[K]): void {
  conf.set(key, value);
}

export function resetConfig(): void {
  conf.clear();
}

export function getConfigPath(): string {
  return conf.path;
}

// ── Provider switching helpers ────────────────────────────────────────────────

/**
 * Switch to a provider (and optionally a specific model).
 * Saves current model for the old provider so switching back restores it.
 * Returns the model that was selected.
 */
export function switchProvider(newProviderId: string, modelId?: string): string {
  const current = getConfig();

  // Save current model for old provider
  const providerModels = { ...current.providerModels };
  providerModels[current.provider] = current.model;
  conf.set('providerModels', providerModels);

  // Switch provider
  conf.set('provider', newProviderId);

  // Restore or set model for new provider
  const restoredModel = modelId ?? providerModels[newProviderId];
  if (restoredModel) {
    conf.set('model', restoredModel);
    return restoredModel;
  }
  // Use provider's default model — lazily imported to avoid circular dep at module load
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const registry = require('../ai/providers/registry.js') as { PROVIDERS: Record<string, ProviderDef> };
  const def = registry.PROVIDERS[newProviderId];
  const defaultModel = def?.defaultModel ?? def?.models[0]?.id ?? '';
  if (defaultModel) conf.set('model', defaultModel);
  return defaultModel;
}

/**
 * Switch model within the current provider.
 */
export function switchModel(modelId: string): void {
  const current = getConfig();
  const providerModels = { ...current.providerModels };
  providerModels[current.provider] = modelId;
  conf.set('model', modelId);
  conf.set('providerModels', providerModels);
}

/**
 * Save a context summary for the current provider+model pair.
 */
export function saveContextSummary(providerId: string, modelId: string, summary: string): void {
  const key = `${providerId}/${modelId}`;
  const summaries = conf.get('contextSummaries') ?? {};
  summaries[key] = summary;
  conf.set('contextSummaries', summaries);
}

/**
 * Get saved context summary for a provider+model pair.
 */
export function getContextSummary(providerId: string, modelId: string): string | undefined {
  const key = `${providerId}/${modelId}`;
  return (conf.get('contextSummaries') ?? {})[key];
}
