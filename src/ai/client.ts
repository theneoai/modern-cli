import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Message } from "@anthropic-ai/sdk/resources/messages.js";
import { getConfig } from "../utils/config.js";

export type StreamCallback = (delta: string) => void;
export type UsageInfo = { inputTokens: number; outputTokens: number };

export interface AIResponse {
  content: string;
  usage: UsageInfo;
  model: string;
  stopReason: string | null;
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const config = getConfig();
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error(
        "API key not configured. Run: ai config set apiKey YOUR_KEY\n" +
        "Or set ANTHROPIC_API_KEY environment variable."
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** Reset client (e.g. after config change) */
export function resetClient(): void {
  _client = null;
}

/**
 * Send a message and get a full response (no streaming).
 */
export async function sendMessage(
  messages: MessageParam[],
  systemOverride?: string
): Promise<AIResponse> {
  const client = getClient();
  const config = getConfig();

  const response: Message = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemOverride ?? config.systemPrompt,
    messages,
  });

  const textContent = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  return {
    content: textContent,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    model: response.model,
    stopReason: response.stop_reason,
  };
}

/**
 * Send a message with streaming. Calls onDelta for each text chunk.
 * Returns the full response when done.
 */
export async function sendMessageStream(
  messages: MessageParam[],
  onDelta: StreamCallback,
  systemOverride?: string
): Promise<AIResponse> {
  const client = getClient();
  const config = getConfig();

  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let model = config.model;
  let stopReason: string | null = null;

  const stream = await client.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemOverride ?? config.systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const delta = event.delta.text;
      fullText += delta;
      onDelta(delta);
    } else if (event.type === "message_start") {
      inputTokens = event.message.usage.input_tokens;
      model = event.message.model;
    } else if (event.type === "message_delta") {
      outputTokens = event.usage.output_tokens;
      stopReason = event.delta.stop_reason ?? null;
    }
  }

  return {
    content: fullText,
    usage: { inputTokens, outputTokens },
    model,
    stopReason,
  };
}

/**
 * Available models with display names.
 */
export const MODELS = {
  "claude-opus-4-6": "Claude Opus 4.6 — Most powerful, adaptive thinking",
  "claude-sonnet-4-6": "Claude Sonnet 4.6 — Balanced speed & intelligence",
  "claude-haiku-4-5": "Claude Haiku 4.5 — Fastest & most cost-effective",
} as const;

export type ModelId = keyof typeof MODELS;
