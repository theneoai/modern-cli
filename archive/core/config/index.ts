/**
 * Configuration Management
 */

import Conf from 'conf';

// Default configuration
const defaultConfig = {
  version: '0.2.0',
  llm: {
    defaultProvider: 'anthropic',
    providers: {
      anthropic: {
        name: 'Anthropic',
        defaultModel: 'claude-opus-4-6',
        models: [
          { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', contextWindow: 200000, supportsTools: true, supportsVision: true },
          { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000, supportsTools: true, supportsVision: true },
          { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', contextWindow: 200000, supportsTools: true, supportsVision: false },
        ],
      },
      openai: {
        name: 'OpenAI',
        defaultModel: 'gpt-4o',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsTools: true, supportsVision: true },
          { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsTools: true, supportsVision: true },
        ],
      },
    },
    defaultModel: 'claude-opus-4-6',
    temperature: 0.7,
    maxTokens: 4096,
    streamingEnabled: true,
  },
  ui: {
    theme: 'dark',
    font: 'monospace',
    fontSize: 14,
    animationsEnabled: true,
    showTokenUsage: true,
    timestampFormat: 'HH:mm:ss',
  },
  agent: {
    defaultModel: 'claude-sonnet-4-6',
    autoSaveInterval: 5,
    maxConcurrentTasks: 10,
    memoryEnabled: true,
    memoryMaxTokens: 8000,
  },
  workflow: {
    timeout: 300000,
    maxRetries: 3,
    parallelLimit: 5,
  },
  security: {
    sandboxEnabled: true,
    allowedPaths: [],
    blockedCommands: ['rm -rf /', 'dd if=/dev/zero'],
    requireConfirmation: true,
  },
  features: {
    socialSimulation: true,
    economyEnabled: false,
    autoUpdate: true,
    telemetry: false,
  },
  shortcuts: {
    'Ctrl+C': 'interrupt',
    'Ctrl+D': 'exit',
    'Ctrl+L': 'clear',
    'Tab': 'complete',
    'Ctrl+T': 'new_tab',
    'Ctrl+W': 'close_tab',
    'Ctrl+Shift+F': 'search',
    'Ctrl+Shift+A': 'agent_panel',
    'Ctrl+Shift+O': 'org_panel',
    'Ctrl+Shift+W': 'workflow_panel',
  },
};

// Initialize config store
const configStore = new Conf({
  projectName: 'hyperterminal',
  defaults: defaultConfig,
});

// Export accessors
export function getConfig() {
  return configStore.store;
}

export function get(key: string) {
  return configStore.get(key);
}

export function set(key: string, value: any) {
  configStore.set(key, value);
}

export function setPath(path: string, value: any) {
  configStore.set(path, value);
}

export function reset() {
  configStore.clear();
  configStore.set(defaultConfig);
}

export function getConfigPath() {
  return configStore.path;
}

// Helper to safely get API key
export function getApiKey(provider: string): string | undefined {
  const config = getConfig();
  const keyFromEnv = process.env[`${provider.toUpperCase()}_API_KEY`];
  if (keyFromEnv) return keyFromEnv;
  return (config.llm?.providers as any)?.[provider]?.apiKey;
}
