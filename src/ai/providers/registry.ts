/**
 * providers/registry.ts — Provider 注册中心
 *
 * 内置 Provider:
 *   anthropic   Claude (Opus / Sonnet / Haiku)
 *   openai      GPT-4o / GPT-4-turbo / o1 / o3
 *   gemini      Gemini Pro / Flash (OpenAI compat endpoint)
 *   ollama      本地模型 (Llama / Qwen / Mistral etc.)
 *   mistral     Mistral Large / Small / Nemo
 *   deepseek    DeepSeek-V3 / DeepSeek-Coder
 *   moonshot    Kimi (moonshot-v1-128k)
 *   groq        Llama / Mixtral (超快推理)
 *   together    Together AI (开源模型池)
 *   opencode    OpenCode 编程专用模型
 *   custom      自定义 OpenAI-兼容端点
 *
 * 架构:
 *   - ProviderDef: 静态元数据 (名称/端点/模型列表)
 *   - ProviderAdapter: 运行时适配器 (实际 AI 调用)
 *   - createAdapter(id): 工厂函数，按 provider 返回对应 adapter
 */

import type { AIResponse, StreamCallback } from '../client.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

// ── Unified Interfaces ────────────────────────────────────────────────────────

export interface ProviderDef {
  id: string;
  name: string;
  description: string;
  baseURL: string;
  apiKeyEnvVar?: string;     // env var name for auto-discovery
  requiresKey: boolean;
  models: ModelDef[];
  defaultModel: string;
  compatible: 'anthropic' | 'openai' | 'gemini';
  customizable: boolean;     // can user add custom baseURL?
}

export interface ModelDef {
  id: string;
  name: string;
  contextWindow: number;     // tokens
  inputPrice?: number;       // USD per 1M tokens
  outputPrice?: number;
  capabilities: ('text' | 'vision' | 'code' | 'reasoning' | 'fast')[];
  recommended?: boolean;
}

export interface SendOptions {
  model: string;
  maxTokens: number;
  system?: string;
  apiKey: string;
  baseURL?: string;
  temperature?: number;
}

export interface ProviderAdapter {
  readonly providerId: string;
  sendMessage(
    messages: MessageParam[],
    opts: SendOptions,
  ): Promise<AIResponse>;
  sendMessageStream(
    messages: MessageParam[],
    opts: SendOptions,
    onDelta: StreamCallback,
  ): Promise<AIResponse>;
}

// ── Built-in Provider Definitions ────────────────────────────────────────────

export const PROVIDERS: Record<string, ProviderDef> = {

  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    description: '最强推理能力，支持 200k 上下文，工具调用',
    baseURL: 'https://api.anthropic.com',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    requiresKey: true,
    compatible: 'anthropic',
    customizable: false,
    defaultModel: 'claude-sonnet-4-6',
    models: [
      { id: 'claude-opus-4-6',    name: 'Claude Opus 4.6',    contextWindow: 200000, inputPrice: 15,  outputPrice: 75,  capabilities: ['text','vision','code','reasoning'], recommended: false },
      { id: 'claude-sonnet-4-6',  name: 'Claude Sonnet 4.6',  contextWindow: 200000, inputPrice: 3,   outputPrice: 15,  capabilities: ['text','vision','code','reasoning'], recommended: true },
      { id: 'claude-haiku-4-5',   name: 'Claude Haiku 4.5',   contextWindow: 200000, inputPrice: 0.8, outputPrice: 4,   capabilities: ['text','code','fast'] },
    ],
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o / o1 / o3，支持视觉和工具调用',
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o',            name: 'GPT-4o',            contextWindow: 128000, inputPrice: 2.5,  outputPrice: 10,  capabilities: ['text','vision','code'] },
      { id: 'gpt-4o-mini',       name: 'GPT-4o mini',       contextWindow: 128000, inputPrice: 0.15, outputPrice: 0.6, capabilities: ['text','code','fast'], recommended: true },
      { id: 'o1',                name: 'o1',                contextWindow: 200000, inputPrice: 15,   outputPrice: 60,  capabilities: ['text','code','reasoning'] },
      { id: 'o3-mini',           name: 'o3-mini',           contextWindow: 200000, inputPrice: 1.1,  outputPrice: 4.4, capabilities: ['text','code','reasoning'] },
      { id: 'gpt-4-turbo',       name: 'GPT-4 Turbo',       contextWindow: 128000, inputPrice: 10,   outputPrice: 30,  capabilities: ['text','vision','code'] },
    ],
  },

  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    description: '超长上下文，免费额度慷慨',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'gemini-2.0-flash',
    models: [
      { id: 'gemini-2.0-flash',      name: 'Gemini 2.0 Flash',     contextWindow: 1000000, inputPrice: 0,    outputPrice: 0,   capabilities: ['text','vision','code','fast'], recommended: true },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', contextWindow: 1000000, inputPrice: 0,    outputPrice: 0,   capabilities: ['text','fast'] },
      { id: 'gemini-1.5-pro',        name: 'Gemini 1.5 Pro',        contextWindow: 2000000, inputPrice: 3.5,  outputPrice: 10.5,capabilities: ['text','vision','code'] },
    ],
  },

  moonshot: {
    id: 'moonshot',
    name: 'Moonshot Kimi',
    description: 'Kimi — 超长上下文，中文优化，月之暗面',
    baseURL: 'https://api.moonshot.cn/v1',
    apiKeyEnvVar: 'MOONSHOT_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'moonshot-v1-32k',
    models: [
      { id: 'moonshot-v1-8k',   name: 'Kimi 8k',   contextWindow: 8000,   inputPrice: 1.0, outputPrice: 1.0, capabilities: ['text','code','fast'] },
      { id: 'moonshot-v1-32k',  name: 'Kimi 32k',  contextWindow: 32000,  inputPrice: 2.0, outputPrice: 2.0, capabilities: ['text','code'], recommended: true },
      { id: 'moonshot-v1-128k', name: 'Kimi 128k', contextWindow: 128000, inputPrice: 4.0, outputPrice: 4.0, capabilities: ['text','code'] },
    ],
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '极低成本，编程能力强，性价比冠军',
    baseURL: 'https://api.deepseek.com/v1',
    apiKeyEnvVar: 'DEEPSEEK_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat',   name: 'DeepSeek V3',    contextWindow: 64000,  inputPrice: 0.07, outputPrice: 1.1, capabilities: ['text','code'], recommended: true },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1',  contextWindow: 64000,  inputPrice: 0.55, outputPrice: 2.19,capabilities: ['text','code','reasoning'] },
    ],
  },

  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    description: '欧洲开源之光，Pixtral 多模态',
    baseURL: 'https://api.mistral.ai/v1',
    apiKeyEnvVar: 'MISTRAL_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'mistral-large-latest',
    models: [
      { id: 'mistral-large-latest',  name: 'Mistral Large',  contextWindow: 128000, inputPrice: 2,    outputPrice: 6, capabilities: ['text','code'] },
      { id: 'mistral-small-latest',  name: 'Mistral Small',  contextWindow: 128000, inputPrice: 0.1,  outputPrice: 0.3,capabilities: ['text','code','fast'], recommended: true },
      { id: 'codestral-latest',      name: 'Codestral',      contextWindow: 256000, inputPrice: 0.3,  outputPrice: 0.9,capabilities: ['code'] },
    ],
  },

  groq: {
    id: 'groq',
    name: 'Groq',
    description: '最快推理速度 (LPU)，Llama / Mixtral',
    baseURL: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile',  name: 'Llama 3.3 70B',     contextWindow: 128000, inputPrice: 0.59, outputPrice: 0.79, capabilities: ['text','code'], recommended: true },
      { id: 'llama-3.1-8b-instant',     name: 'Llama 3.1 8B',      contextWindow: 128000, inputPrice: 0.05, outputPrice: 0.08, capabilities: ['text','fast'] },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B', contextWindow: 128000, inputPrice: 0.75, outputPrice: 0.99, capabilities: ['text','reasoning'] },
    ],
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama (本地)',
    description: '本地运行，无需 API Key，完全隐私',
    baseURL: 'http://localhost:11434/v1',
    requiresKey: false,
    compatible: 'openai',
    customizable: true,
    defaultModel: 'llama3.2',
    models: [
      { id: 'llama3.2',     name: 'Llama 3.2 3B',    contextWindow: 128000, capabilities: ['text','fast'] },
      { id: 'llama3.1:8b',  name: 'Llama 3.1 8B',    contextWindow: 128000, capabilities: ['text','code'] },
      { id: 'llama3.1:70b', name: 'Llama 3.1 70B',   contextWindow: 128000, capabilities: ['text','code','reasoning'] },
      { id: 'qwen2.5',      name: 'Qwen 2.5 7B',     contextWindow: 128000, capabilities: ['text','code'] },
      { id: 'qwen2.5:14b',  name: 'Qwen 2.5 14B',    contextWindow: 128000, capabilities: ['text','code'] },
      { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', contextWindow: 128000, capabilities: ['code'] },
      { id: 'gemma2',       name: 'Gemma 2 9B',      contextWindow: 8192,  capabilities: ['text'] },
      { id: 'mistral',      name: 'Mistral 7B',      contextWindow: 32000, capabilities: ['text','code'] },
      { id: 'phi3.5',       name: 'Phi 3.5 mini',    contextWindow: 128000, capabilities: ['text','fast'] },
      { id: 'custom',       name: '(自定义模型名)',   contextWindow: 128000, capabilities: ['text'] },
    ],
  },

  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    description: '编程专用 AI，代码理解和生成最优化',
    baseURL: 'https://opencode.ai/v1',
    apiKeyEnvVar: 'OPENCODE_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: true,
    defaultModel: 'opencode-1',
    models: [
      { id: 'opencode-1', name: 'OpenCode 1', contextWindow: 128000, capabilities: ['code'], recommended: true },
    ],
  },

  together: {
    id: 'together',
    name: 'Together AI',
    description: '开源模型聚合，按需选择最佳模型',
    baseURL: 'https://api.together.xyz/v1',
    apiKeyEnvVar: 'TOGETHER_API_KEY',
    requiresKey: true,
    compatible: 'openai',
    customizable: false,
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    models: [
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', contextWindow: 131072, inputPrice: 0.88, outputPrice: 0.88, capabilities: ['text','code'], recommended: true },
      { id: 'deepseek-ai/DeepSeek-V3',                       name: 'DeepSeek V3',          contextWindow: 65536,  inputPrice: 1.25, outputPrice: 1.25, capabilities: ['text','code'] },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo',              name: 'Qwen 2.5 72B Turbo',   contextWindow: 32768,  inputPrice: 1.2,  outputPrice: 1.2,  capabilities: ['text','code'] },
    ],
  },

  custom: {
    id: 'custom',
    name: '自定义',
    description: '任何 OpenAI 兼容端点 (LM Studio / vLLM / FastChat...)',
    baseURL: 'http://localhost:8080/v1',
    requiresKey: false,
    compatible: 'openai',
    customizable: true,
    defaultModel: 'local-model',
    models: [
      { id: 'local-model', name: '(自定义)', contextWindow: 128000, capabilities: ['text'] },
    ],
  },
};

// ── Provider Helpers ──────────────────────────────────────────────────────────

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS[id];
}

export function listProviders(): ProviderDef[] {
  return Object.values(PROVIDERS);
}

export function getModel(providerId: string, modelId: string): ModelDef | undefined {
  return PROVIDERS[providerId]?.models.find(m => m.id === modelId);
}

export function formatModelLabel(providerId: string, modelId: string): string {
  const p = PROVIDERS[providerId];
  const m = p?.models.find(mm => mm.id === modelId);
  return m ? `${p?.name ?? providerId}: ${m.name}` : `${providerId}/${modelId}`;
}

export function estimateCost(
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const m = getModel(providerId, modelId);
  if (!m || !m.inputPrice) return 0;
  return (inputTokens / 1_000_000) * m.inputPrice + (outputTokens / 1_000_000) * (m.outputPrice ?? m.inputPrice);
}
