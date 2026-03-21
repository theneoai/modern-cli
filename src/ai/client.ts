/**
 * client.ts — 统一 AI 客户端
 *
 * 公开 API 与原版完全兼容 (sendMessage / sendMessageStream)
 * 内部通过 Provider Registry 路由到对应 Adapter
 *
 * 上下文隔离:
 *   - 每个 (providerId + modelId) 组合维护独立对话历史
 *   - 切换 provider/model 时上下文自动切换
 *   - 切回时自动恢复，无需重新输入
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { getConfig } from '../utils/config.js';
import { keyStore } from './keystore.js';
import { PROVIDERS, getProvider } from './providers/registry.js';
import { AnthropicAdapter } from './providers/anthropic-adapter.js';
import { OpenAICompatAdapter } from './providers/openai-compat-adapter.js';
import type { ProviderAdapter } from './providers/registry.js';

export type StreamCallback = (delta: string) => void;
export type UsageInfo = { inputTokens: number; outputTokens: number };

export interface AIResponse {
  content: string;
  usage: UsageInfo;
  model: string;
  stopReason: string | null;
}

// ── Adapter Cache ─────────────────────────────────────────────────────────────

const _adapters = new Map<string, ProviderAdapter>();

function getAdapter(providerId: string): ProviderAdapter {
  if (!_adapters.has(providerId)) {
    let adapter: ProviderAdapter;
    const def = getProvider(providerId);
    if (!def) throw new Error(`Unknown provider: ${providerId}`);

    if (def.compatible === 'anthropic') {
      adapter = new AnthropicAdapter();
    } else {
      adapter = new OpenAICompatAdapter(providerId);
    }
    _adapters.set(providerId, adapter);
  }
  return _adapters.get(providerId)!;
}

/** Reset adapter cache (call after config/key changes) */
export function resetClient(): void {
  _adapters.clear();
}

// ── Build SendOptions ─────────────────────────────────────────────────────────

function buildOpts(systemOverride?: string) {
  const cfg = getConfig();
  const providerId = cfg.provider ?? 'anthropic';
  const def = getProvider(providerId);
  const baseURL = cfg.providerBaseURL ?? def?.baseURL;

  // Key resolution order:
  //   1. keyStore (encrypted store + env var fallback)
  //   2. legacy ANTHROPIC_API_KEY for backward compat
  const apiKey =
    keyStore.getKey(providerId) ??
    (providerId === 'anthropic' ? (process.env['ANTHROPIC_API_KEY'] ?? '') : '') ??
    '';

  if (!apiKey && def?.requiresKey) {
    throw new Error(
      `No API key for provider "${providerId}".\n` +
      `Run: neo key add ${providerId} <your-api-key>\n` +
      (def.apiKeyEnvVar ? `Or set env var: ${def.apiKeyEnvVar}` : '')
    );
  }

  return {
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    system: systemOverride ?? cfg.systemPrompt,
    apiKey,
    baseURL,
    providerId,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a message and get a full response.
 * Maintains backward compatibility with original signature.
 */
export async function sendMessage(
  messages: MessageParam[],
  systemOverride?: string,
): Promise<AIResponse> {
  const opts = buildOpts(systemOverride);
  const adapter = getAdapter(opts.providerId);
  return adapter.sendMessage(messages, opts);
}

/**
 * Send a message with streaming.
 * Maintains backward compatibility with original signature.
 */
export async function sendMessageStream(
  messages: MessageParam[],
  onDelta: StreamCallback,
  systemOverride?: string,
): Promise<AIResponse> {
  const opts = buildOpts(systemOverride);
  const adapter = getAdapter(opts.providerId);
  return adapter.sendMessageStream(messages, opts, onDelta);
}

// ── Model Constants (for backward compat) ─────────────────────────────────────

export const MODELS = {
  'claude-opus-4-6':   'Claude Opus 4.6 — Most powerful',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6 — Balanced',
  'claude-haiku-4-5':  'Claude Haiku 4.5 — Fastest',
} as const;

export type ModelId = keyof typeof MODELS;

// ── Provider info helpers ─────────────────────────────────────────────────────

export { PROVIDERS, getProvider, listProviders, formatModelLabel } from './providers/registry.js';
export { keyStore } from './keystore.js';
