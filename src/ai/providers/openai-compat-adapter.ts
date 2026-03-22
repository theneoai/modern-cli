/**
 * openai-compat-adapter.ts — OpenAI Chat Completions 兼容适配器
 *
 * 适用于: OpenAI · Gemini · Moonshot/Kimi · DeepSeek · Mistral
 *        Groq · Together · Ollama · LM Studio · vLLM · Custom
 *
 * 纯 fetch 实现，无 openai npm 包依赖
 * SSE 流式解析支持 data: {...} 和 data: [DONE]
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { AIResponse, StreamCallback } from '../client.js';
import type { ProviderAdapter, SendOptions } from './registry.js';
import { assertSafeUrl } from '../../utils/security.js';

// ── OpenAI wire types ──────────────────────────────────────────────────────────

interface OAIMessage { role: string; content: string }

interface OAIRequest {
  model: string;
  messages: OAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  system?: string;     // some providers (Mistral) accept this
}

interface OAIResponse {
  id?: string;
  model?: string;
  choices: Array<{
    message?: { role: string; content: string };
    delta?:   { role?: string; content?: string };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// ── Convert Anthropic MessageParam → OpenAI messages ─────────────────────────

function toOAIMessages(
  messages: MessageParam[],
  system?: string,
): OAIMessage[] {
  const out: OAIMessage[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    const content = typeof m.content === 'string'
      ? m.content
      : (m.content as Array<{ type: string; text?: string }>)
          .filter(b => b.type === 'text')
          .map(b => b.text ?? '')
          .join('');
    out.push({ role: m.role, content });
  }
  return out;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

function headers(apiKey: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
  return h;
}

async function postJSON(url: string, body: OAIRequest, apiKey: string): Promise<OAIResponse> {
  assertSafeUrl(url);
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`[${res.status}] ${err}`);
  }
  return res.json() as Promise<OAIResponse>;
}

async function* streamSSE(url: string, body: OAIRequest, apiKey: string): AsyncGenerator<string> {
  assertSafeUrl(url);
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`[${res.status}] ${err}`);
  }
  if (!res.body) return;

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() ?? '';     // last (potentially partial) line back to buffer

    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      yield data;
    }
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class OpenAICompatAdapter implements ProviderAdapter {
  constructor(readonly providerId: string) {}

  async sendMessage(messages: MessageParam[], opts: SendOptions): Promise<AIResponse> {
    const url = `${opts.baseURL ?? 'https://api.openai.com/v1'}/chat/completions`;
    const body: OAIRequest = {
      model: opts.model,
      messages: toOAIMessages(messages, opts.system),
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    };

    const resp = await postJSON(url, body, opts.apiKey);
    const content = resp.choices[0]?.message?.content ?? '';
    return {
      content,
      usage: {
        inputTokens:  resp.usage?.prompt_tokens ?? 0,
        outputTokens: resp.usage?.completion_tokens ?? 0,
      },
      model: resp.model ?? opts.model,
      stopReason: resp.choices[0]?.finish_reason ?? null,
    };
  }

  async sendMessageStream(
    messages: MessageParam[],
    opts: SendOptions,
    onDelta: StreamCallback,
  ): Promise<AIResponse> {
    const url = `${opts.baseURL ?? 'https://api.openai.com/v1'}/chat/completions`;
    const body: OAIRequest = {
      model: opts.model,
      messages: toOAIMessages(messages, opts.system),
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.7,
    };

    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;
    let responseModel = opts.model;

    for await (const raw of streamSSE(url, body, opts.apiKey)) {
      let chunk: OAIResponse;
      try { chunk = JSON.parse(raw) as OAIResponse; }
      catch { continue; }

      responseModel = chunk.model ?? responseModel;

      const delta = chunk.choices[0]?.delta?.content;
      if (delta) { fullText += delta; onDelta(delta); }

      const finish = chunk.choices[0]?.finish_reason;
      if (finish) stopReason = finish;

      if (chunk.usage) {
        inputTokens  = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }
    }

    // Estimate tokens if not provided by the API.
    // Using ~3.5 chars/token for English prose (GPT/Claude average).
    // This is an approximation — actual counts vary by language/model.
    if (inputTokens === 0 && outputTokens === 0) {
      const CHARS_PER_TOKEN = 3.5;
      inputTokens  = Math.ceil(messages.reduce((s, m) => s + String(m.content).length, 0) / CHARS_PER_TOKEN);
      outputTokens = Math.ceil(fullText.length / CHARS_PER_TOKEN);
    }

    return { content: fullText, usage: { inputTokens, outputTokens }, model: responseModel, stopReason };
  }
}
