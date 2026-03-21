#!/usr/bin/env node
/**
 * NEO — AI 原生超级终端  v0.4.0
 *
 * 默认行为: `neo` → 直接启动 TUI
 * 管理命令: `neo config | neo version | neo key`
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// Read version from package.json at runtime
let VERSION = '0.4.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string };
  VERSION = pkg.version;
} catch { /* ignore */ }

const program = new Command();
program
  .name('neo')
  .description('NEO — AI 原生超级终端  键盘优先·心流体验')
  .version(VERSION, '-v, --version');

// ── `neo config` — 查看/设置配置 ──────────────────────────────────────────

program
  .command('config [key] [value]')
  .description('查看或修改配置  (无参数 = 列出全部)')
  .action(async (key?: string, value?: string) => {
    const { getConfig, setConfig, getConfigPath } = await import('./utils/config.js');
    const cfg = getConfig();

    if (!key) {
      console.log(chalk.cyan('◆ NEO 配置') + chalk.gray(` (${getConfigPath()})`));
      for (const [k, v] of Object.entries(cfg)) {
        if (k === 'apiKey' || k === 'providerModels' || k === 'contextSummaries') continue;
        console.log(`  ${chalk.gray(k.padEnd(22))} ${chalk.white(JSON.stringify(v))}`);
      }
      return;
    }

    if (value === undefined) {
      const v = cfg[key as keyof typeof cfg];
      console.log(JSON.stringify(v, null, 2));
      return;
    }

    // Parse value
    let parsed: unknown = value;
    try { parsed = JSON.parse(value); } catch { /* keep as string */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConfig(key as any, parsed as any);
    console.log(chalk.green(`✓ ${key} = ${JSON.stringify(parsed)}`));
  });

// ── `neo key` — API Key 管理 (no TUI needed) ─────────────────────────────

const keyCmd = program.command('key').description('管理 API Key');

keyCmd
  .command('list')
  .alias('ls')
  .description('列出已配置的 Key')
  .action(async () => {
    const { keyStore } = await import('./ai/keystore.js');
    const keys = keyStore.listKeys('configure');
    if (keys.length === 0) {
      console.log(chalk.gray('暂无配置。用 neo key add <provider> <key>'));
      return;
    }
    console.log(chalk.cyan('◆ 已配置的 API Key:'));
    for (const k of keys) {
      const mark = k.active ? chalk.green('●') : chalk.gray('○');
      console.log(`  ${mark} ${k.providerId.padEnd(12)} ${k.label.padEnd(18)} ${chalk.gray(k.hint)}`);
    }
  });

keyCmd
  .command('add <provider> <apikey>')
  .description('添加 API Key  (e.g. neo key add openai sk-...)')
  .action(async (provider: string, apikey: string) => {
    const { keyStore } = await import('./ai/keystore.js');
    const { resetClient } = await import('./ai/client.js');
    keyStore.addKey(provider, apikey);
    resetClient();
    console.log(chalk.green(`✓ Key 已添加: ${provider}`));
  });

keyCmd
  .command('rm <provider>')
  .description('删除 API Key')
  .action(async (provider: string) => {
    const { keyStore } = await import('./ai/keystore.js');
    const removed = keyStore.removeKey(provider, 'admin');
    console.log(removed ? chalk.green(`✓ 已删除: ${provider}`) : chalk.yellow(`未找到: ${provider}`));
  });

// ── `neo providers` — 列出可用 Provider ──────────────────────────────────

program
  .command('providers')
  .description('列出可用的 AI Provider 和模型')
  .action(async () => {
    const { PROVIDERS } = await import('./ai/providers/registry.js');
    const { keyStore } = await import('./ai/keystore.js');
    console.log(chalk.cyan('◆ 可用 Provider:'));
    for (const [id, def] of Object.entries(PROVIDERS)) {
      const hasKey = !def.requiresKey || keyStore.hasKey(id) || process.env[def.apiKeyEnvVar ?? ''];
      const mark = hasKey ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${mark} ${id.padEnd(12)} ${def.name.padEnd(20)} ${chalk.gray(def.models.length + ' 模型')}`);
    }
    console.log(chalk.gray('\n  neo key add <provider> <key>  — 配置 Key'));
    console.log(chalk.gray('  Ctrl+M (TUI)                  — 切换模型'));
  });

// ── `neo version` — 详细版本信息 ─────────────────────────────────────────

program
  .command('version')
  .description('显示详细版本信息')
  .action(() => {
    console.log(`NEO ${VERSION}`);
    console.log(`Node ${process.version}  Platform: ${process.platform}`);
  });

// ── Default: launch TUI ───────────────────────────────────────────────────

async function main() {
  const firstArg = process.argv[2];

  // No subcommand → TUI directly. Also handle explicit 'tui'/'ui' aliases.
  if (!firstArg || firstArg === 'tui' || firstArg === 'ui') {
    const { startTUI } = await import('./tui/entry.js');
    startTUI();
    return;
  }

  await program.parseAsync();
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`✗ ${msg}`));
  process.exit(1);
});
