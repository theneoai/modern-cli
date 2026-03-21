import { homedir } from 'os';
import { join } from 'path';

export function getConfigDir(): string {
  return process.env.HYPER_CONFIG_DIR || join(homedir(), '.hyper');
}

export function getDataDir(): string {
  return join(getConfigDir(), 'data');
}

export function getPluginsDir(): string {
  return join(getConfigDir(), 'plugins');
}

export function getWorkflowsDir(): string {
  return join(getConfigDir(), 'workflows');
}

export function getAgentsDir(): string {
  return join(getConfigDir(), 'agents');
}
