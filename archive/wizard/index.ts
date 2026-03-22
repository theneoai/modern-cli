/**
 * Setup Wizard - Interactive configuration for HyperTerminal
 */

import { text, select, confirm, intro, outro, spinner, note } from '@clack/prompts';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

export interface WizardConfig {
  user: {
    name: string;
    email: string;
  };
  ai: {
    defaultProvider: 'anthropic' | 'openai';
    anthropicApiKey?: string;
    openaiApiKey?: string;
  };
  features: {
    enableVoice: boolean;
    enableNotifications: boolean;
    enableMonitoring: boolean;
    enableAudit: boolean;
  };
  paths: {
    dataDir: string;
    backupDir: string;
  };
}

// Run setup wizard
export async function runWizard(): Promise<WizardConfig> {
  intro('🚀 HyperTerminal Setup Wizard');
  
  note('Welcome! This wizard will help you configure HyperTerminal for first use.', 'Getting Started');
  
  // User info
  const userName = await text({
    message: 'What is your name?',
    placeholder: 'John Doe',
    validate: (value) => value.length === 0 ? 'Name is required' : undefined,
  });
  
  if (typeof userName !== 'string') {
    outro('Setup cancelled');
    process.exit(0);
  }
  
  const userEmail = await text({
    message: 'What is your email?',
    placeholder: 'john@example.com',
  });
  
  // AI Provider
  const provider = await select({
    message: 'Choose your default AI provider:',
    options: [
      { value: 'anthropic', label: 'Anthropic (Claude)', hint: 'recommended' },
      { value: 'openai', label: 'OpenAI (GPT-4)' },
    ],
  });
  
  if (typeof provider !== 'string') {
    outro('Setup cancelled');
    process.exit(0);
  }
  
  // API Keys
  let anthropicKey: string | undefined;
  let openaiKey: string | undefined;
  
  if (provider === 'anthropic' || provider === 'openai') {
    const key = await text({
      message: `Enter your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key:`,
      placeholder: 'sk-...',
      validate: (value) => {
        if (value.length === 0) return 'API key is required';
        if (provider === 'anthropic' && !value.startsWith('sk-ant-')) return 'Invalid Anthropic key format';
        if (provider === 'openai' && !value.startsWith('sk-')) return 'Invalid OpenAI key format';
        return undefined;
      },
    });
    
    if (typeof key !== 'string') {
      outro('Setup cancelled');
      process.exit(0);
    }
    
    if (provider === 'anthropic') anthropicKey = key;
    else openaiKey = key;
  }
  
  // Features
  note('Configure features (you can change these later)', 'Features');
  
  const enableVoice = await confirm({
    message: 'Enable voice commands?',
    initialValue: false,
  });
  
  if (typeof enableVoice !== 'boolean') {
    outro('Setup cancelled');
    process.exit(0);
  }
  
  const enableNotifications = await confirm({
    message: 'Enable desktop notifications?',
    initialValue: true,
  });
  
  if (typeof enableNotifications !== 'boolean') {
    outro('Setup cancelled');
    process.exit(0);
  }
  
  const enableMonitoring = await confirm({
    message: 'Enable system monitoring?',
    initialValue: true,
  });
  
  if (typeof enableMonitoring !== 'boolean') {
    outro('Setup cancelled');
    process.exit(0);
  }
  
  const enableAudit = await confirm({
    message: 'Enable audit logging?',
    initialValue: true,
  });
  
  if (typeof enableAudit !== 'boolean') {
    outro('Setup cancelled');
    process.exit(0);
  }
  
  // Paths
  const dataDir = join(homedir(), '.hyperterminal');
  const backupDir = join(dataDir, 'backups');
  
  // Create config
  const config: WizardConfig = {
    user: {
      name: userName,
      email: typeof userEmail === 'string' ? userEmail : '',
    },
    ai: {
      defaultProvider: provider as 'anthropic' | 'openai',
      anthropicApiKey: anthropicKey,
      openaiApiKey: openaiKey,
    },
    features: {
      enableVoice,
      enableNotifications,
      enableMonitoring,
      enableAudit,
    },
    paths: {
      dataDir,
      backupDir,
    },
  };
  
  // Save configuration
  const s = spinner();
  s.start('Saving configuration...');
  
  try {
    await mkdir(dataDir, { recursive: true });
    await mkdir(backupDir, { recursive: true });
    
    await writeFile(
      join(dataDir, 'config.json'),
      JSON.stringify(config, null, 2)
    );
    
    // Save API keys to environment file
    const envLines: string[] = ['# HyperTerminal Environment'];
    if (anthropicKey) envLines.push(`ANTHROPIC_API_KEY=${anthropicKey}`);
    if (openaiKey) envLines.push(`OPENAI_API_KEY=${openaiKey}`);
    
    await writeFile(
      join(dataDir, '.env'),
      envLines.join('\n')
    );
    
    s.stop('Configuration saved!');
  } catch (error) {
    s.stop('Failed to save configuration');
    throw error;
  }
  
  // Initialize database
  s.start('Initializing database...');
  try {
    const { getDB } = await import('../core/db/index.js');
    getDB();
    s.stop('Database initialized!');
  } catch (error) {
    s.stop('Database initialization failed');
    throw error;
  }
  
  // Add default models
  s.start('Setting up AI models...');
  try {
    const { initModelTables, addDefaultModels } = await import('../models/manager.js');
    initModelTables();
    addDefaultModels();
    s.stop('AI models configured!');
  } catch (error) {
    s.stop('AI model setup failed');
    throw error;
  }
  
  outro('✨ Setup complete! Run "hyper --help" to get started.');
  
  return config;
}

// Check if first run
export async function isFirstRun(): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises');
    const configPath = join(homedir(), '.hyperterminal', 'config.json');
    await stat(configPath);
    return false;
  } catch {
    return true;
  }
}

// Load config
export async function loadConfig(): Promise<WizardConfig | null> {
  try {
    const { readFile } = await import('fs/promises');
    const configPath = join(homedir(), '.hyperterminal', 'config.json');
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content) as WizardConfig;
  } catch {
    return null;
  }
}
