/**
 * anthropic-adapter.ts — Anthropic Claude 适配器
 * 使用原生 @anthropic-ai/sdk，支持 tool_use 循环
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  ToolResultBlockParam,
  ContentBlock,
} from '@anthropic-ai/sdk/resources/messages.js';
import type { AIResponse, StreamCallback } from '../client.js';
import type { ProviderAdapter, SendOptions } from './registry.js';
import { getActiveTools, dispatchToolCall } from '../../mcp/manager.js';

let _client: Anthropic | null = null;
let _lastKey = '';

function getClient(apiKey: string): Anthropic {
  if (!_client || apiKey !== _lastKey) {
    _client = new Anthropic({ apiKey });
    _lastKey = apiKey;
  }
  return _client;
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic';

  async sendMessage(messages: MessageParam[], opts: SendOptions): Promise<AIResponse> {
    const client = getClient(opts.apiKey);
    const tools = await buildTools();
    const system = opts.system ?? '';

    if (tools.length === 0) {
      const resp = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system,
        messages,
      });
      return {
        content: resp.content.filter((b: ContentBlock) => b.type === 'text').map((b: ContentBlock) => b.type === 'text' ? b.text : '').join(''),
        usage: { inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens },
        model: resp.model,
        stopReason: resp.stop_reason,
      };
    }
    return this._runWithTools(client, messages, opts, tools, undefined);
  }

  async sendMessageStream(messages: MessageParam[], opts: SendOptions, onDelta: StreamCallback): Promise<AIResponse> {
    const client = getClient(opts.apiKey);
    const tools = await buildTools();
    const system = opts.system ?? '';

    if (tools.length === 0) {
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let model = opts.model;
      let stopReason: string | null = null;

      const stream = await client.messages.stream({ model: opts.model, max_tokens: opts.maxTokens, system, messages });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          onDelta(event.delta.text);
        } else if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
          model = event.message.model;
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
          stopReason = event.delta.stop_reason ?? null;
        }
      }
      return { content: fullText, usage: { inputTokens, outputTokens }, model, stopReason };
    }
    return this._runWithTools(client, messages, opts, tools, onDelta);
  }

  private async _runWithTools(
    client: Anthropic,
    messages: MessageParam[],
    opts: SendOptions,
    tools: Tool[],
    onDelta?: StreamCallback,
  ): Promise<AIResponse> {
    const local = [...messages];
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let model = opts.model;
    let stopReason: string | null = null;
    const system = opts.system ?? '';

    const MAX_TOOL_ROUNDS = 10;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (onDelta) {
        const stream = await client.messages.stream({ model: opts.model, max_tokens: opts.maxTokens, system, messages: local, tools });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text; onDelta(event.delta.text);
          } else if (event.type === 'message_start') {
            inputTokens += event.message.usage.input_tokens; model = event.message.model;
          } else if (event.type === 'message_delta') {
            outputTokens += event.usage.output_tokens; stopReason = event.delta.stop_reason ?? null;
          }
        }
        const final = await stream.finalMessage();
        const toolBlocks = final.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
        if (toolBlocks.length === 0 || stopReason === 'end_turn') break;
        local.push({ role: 'assistant', content: final.content });
        const results: ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async b => {
            onDelta(`\n[🔧 ${b.name}]\n`);
            const r = await dispatchToolCall(b.name, b.input as Record<string, unknown>);
            return { type: 'tool_result' as const, tool_use_id: b.id, content: r.content, is_error: r.isError };
          })
        );
        local.push({ role: 'user', content: results });
      } else {
        const resp = await client.messages.create({ model: opts.model, max_tokens: opts.maxTokens, system, messages: local, tools });
        inputTokens += resp.usage.input_tokens; outputTokens += resp.usage.output_tokens;
        model = resp.model; stopReason = resp.stop_reason;
        fullText += resp.content.filter(b => b.type === 'text').map(b => b.type === 'text' ? b.text : '').join('');
        const toolBlocks = resp.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
        if (toolBlocks.length === 0 || stopReason === 'end_turn') break;
        local.push({ role: 'assistant', content: resp.content });
        const results: ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async b => {
            const r = await dispatchToolCall(b.name, b.input as Record<string, unknown>);
            return { type: 'tool_result' as const, tool_use_id: b.id, content: r.content, is_error: r.isError };
          })
        );
        local.push({ role: 'user', content: results });
      }
    }
    if (fullText && !fullText.includes('[⚠ 工具调用达到上限]')) {
      // If we exhausted all rounds without end_turn, append a notice
      const finalStopReason = stopReason;
      if (finalStopReason === 'tool_use') {
        fullText += '\n\n[⚠ 工具调用达到上限 (10 次)，任务已截断]';
        if (onDelta) onDelta('\n\n[⚠ 工具调用达到上限 (10 次)，任务已截断]');
      }
    }
    return { content: fullText, usage: { inputTokens, outputTokens }, model, stopReason };
  }
}

async function buildTools(): Promise<Tool[]> {
  const active = await getActiveTools();
  return active.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as unknown as Tool.InputSchema }));
}
