import Conf from "conf";

export interface CliConfig {
  apiKey?: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  streamingEnabled: boolean;
  historyEnabled: boolean;
  historyMaxMessages: number;
  theme: "dark" | "light";
}

const DEFAULT_CONFIG: CliConfig = {
  model: "claude-opus-4-6",
  maxTokens: 4096,
  systemPrompt:
    "You are a helpful, knowledgeable AI assistant running in a terminal. " +
    "Be concise but thorough. Use markdown formatting where appropriate. " +
    "When showing code, always specify the language for syntax highlighting.",
  streamingEnabled: true,
  historyEnabled: true,
  historyMaxMessages: 20,
  theme: "dark",
};

export const conf = new Conf<CliConfig>({
  projectName: "modern-ai-cli",
  defaults: DEFAULT_CONFIG,
  schema: {
    apiKey: { type: "string" },
    model: {
      type: "string",
      enum: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
    },
    maxTokens: { type: "number", minimum: 256, maximum: 128000 },
    systemPrompt: { type: "string", minLength: 1 },
    streamingEnabled: { type: "boolean" },
    historyEnabled: { type: "boolean" },
    historyMaxMessages: { type: "number", minimum: 1, maximum: 100 },
    theme: { type: "string", enum: ["dark", "light"] },
  },
});

export function getConfig(): CliConfig {
  return {
    apiKey: conf.get("apiKey") ?? process.env.ANTHROPIC_API_KEY,
    model: conf.get("model"),
    maxTokens: conf.get("maxTokens"),
    systemPrompt: conf.get("systemPrompt"),
    streamingEnabled: conf.get("streamingEnabled"),
    historyEnabled: conf.get("historyEnabled"),
    historyMaxMessages: conf.get("historyMaxMessages"),
    theme: conf.get("theme"),
  };
}

export function setConfig<K extends keyof CliConfig>(
  key: K,
  value: CliConfig[K]
): void {
  conf.set(key, value);
}

export function resetConfig(): void {
  conf.clear();
}

export function getConfigPath(): string {
  return conf.path;
}
