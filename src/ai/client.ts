import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Message,
  Tool,
  ToolUseBlock,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import { getConfig } from "../utils/config.js";
import { getActiveTools, dispatchToolCall } from "../mcp/manager.js";

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

// ---------------------------------------------------------------------------
// Tool execution loop (agentic tool_use handling)
// ---------------------------------------------------------------------------

/**
 * Execute a single API call, then handle any tool_use blocks by calling
 * the appropriate MCP skill handler and feeding results back.
 * Loops until stop_reason is "end_turn" or no tools remain.
 */
async function runWithTools(
  client: Anthropic,
  config: ReturnType<typeof getConfig>,
  messages: MessageParam[],
  system: string,
  tools: Tool[],
  onDelta?: StreamCallback
): Promise<AIResponse> {
  const localMessages = [...messages];
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let model = config.model;
  let stopReason: string | null = null;

  // Allow up to 10 tool-call rounds to prevent runaway loops
  for (let round = 0; round < 10; round++) {
    if (onDelta) {
      // Streaming path
      const stream = await client.messages.stream({
        model: config.model,
        max_tokens: config.maxTokens,
        system,
        messages: localMessages,
        tools: tools.length > 0 ? tools : undefined,
      });

      const toolUseBlocks: ToolUseBlock[] = [];
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const delta = event.delta.text;
          fullText += delta;
          onDelta(delta);
        } else if (
          event.type === "content_block_start" &&
          event.content_block.type === "tool_use"
        ) {
          toolUseBlocks.push(event.content_block as ToolUseBlock);
        } else if (
          event.type === "content_block_delta" &&
          event.delta.type === "input_json_delta" &&
          toolUseBlocks.length > 0
        ) {
          // Accumulate tool input JSON (ignore partial; we get it in message_stop)
        } else if (event.type === "message_start") {
          inputTokens += event.message.usage.input_tokens;
          model = event.message.model;
        } else if (event.type === "message_delta") {
          outputTokens += event.usage.output_tokens;
          stopReason = event.delta.stop_reason ?? null;
        }
      }

      // Get full message for tool blocks with complete input
      const finalMsg = await stream.finalMessage();
      const finalToolBlocks = finalMsg.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );

      if (finalToolBlocks.length === 0 || stopReason === "end_turn") break;

      // Execute tool calls
      localMessages.push({ role: "assistant", content: finalMsg.content });
      const toolResults: ToolResultBlockParam[] = await Promise.all(
        finalToolBlocks.map(async (block) => {
          if (onDelta) onDelta(`\n[🔧 ${block.name}]\n`);
          const result = await dispatchToolCall(
            block.name,
            block.input as Record<string, unknown>
          );
          if (onDelta) onDelta(result.isError ? `[error] ${result.content}\n` : "");
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result.content,
            is_error: result.isError,
          };
        })
      );
      localMessages.push({ role: "user", content: toolResults });

    } else {
      // Non-streaming path
      const response: Message = await client.messages.create({
        model: config.model,
        max_tokens: config.maxTokens,
        system,
        messages: localMessages,
        tools: tools.length > 0 ? tools : undefined,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      model = response.model;
      stopReason = response.stop_reason;

      const textBlocks = response.content.filter((b) => b.type === "text");
      fullText += textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("");

      const toolBlocks = response.content.filter(
        (b): b is ToolUseBlock => b.type === "tool_use"
      );
      if (toolBlocks.length === 0 || stopReason === "end_turn") break;

      localMessages.push({ role: "assistant", content: response.content });
      const toolResults: ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (block) => {
          const result = await dispatchToolCall(
            block.name,
            block.input as Record<string, unknown>
          );
          return {
            type: "tool_result" as const,
            tool_use_id: block.id,
            content: result.content,
            is_error: result.isError,
          };
        })
      );
      localMessages.push({ role: "user", content: toolResults });
    }
  }

  return {
    content: fullText,
    usage: { inputTokens, outputTokens },
    model,
    stopReason,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a message and get a full response (no streaming).
 * Automatically includes tools from enabled MCP skills.
 */
export async function sendMessage(
  messages: MessageParam[],
  systemOverride?: string
): Promise<AIResponse> {
  const client = getClient();
  const config = getConfig();
  const system = systemOverride ?? config.systemPrompt;

  const activeToolDefs = await getActiveTools();
  const tools: Tool[] = activeToolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  if (tools.length === 0) {
    // Fast path: no tools, plain message
    const response: Message = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system,
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

  return runWithTools(client, config, messages, system, tools);
}

/**
 * Send a message with streaming. Calls onDelta for each text chunk.
 * Automatically includes tools from enabled MCP skills.
 */
export async function sendMessageStream(
  messages: MessageParam[],
  onDelta: StreamCallback,
  systemOverride?: string
): Promise<AIResponse> {
  const client = getClient();
  const config = getConfig();
  const system = systemOverride ?? config.systemPrompt;

  const activeToolDefs = await getActiveTools();
  const tools: Tool[] = activeToolDefs.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  if (tools.length === 0) {
    // Fast path: no tools
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let model = config.model;
    let stopReason: string | null = null;

    const stream = await client.messages.stream({
      model: config.model,
      max_tokens: config.maxTokens,
      system,
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

    return { content: fullText, usage: { inputTokens, outputTokens }, model, stopReason };
  }

  return runWithTools(client, config, messages, system, tools, onDelta);
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
