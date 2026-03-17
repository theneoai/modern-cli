/**
 * Plugin Loader
 *
 * Plugins extend the CLI with new commands. A plugin is an ESM module that exports:
 *   export const name = "my-plugin";
 *   export const description = "Does something useful";
 *   export const version = "1.0.0";
 *   export function register(program: Command): void { ... }
 *
 * Plugins can be installed from npm (package name: "modern-ai-cli-plugin-*")
 * or as local .mjs files dropped into ~/.config/modern-ai-cli/plugins/.
 */

import type { Command } from "commander";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

export const PLUGINS_DIR = join(homedir(), ".config", "modern-ai-cli", "plugins");
const REGISTRY_FILE = join(PLUGINS_DIR, "registry.json");

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  source: "npm" | "local";
  ref: string;          // npm package name or absolute path
  enabled: boolean;
  installedAt: string;
}

export interface PluginRegistry {
  version: 1;
  plugins: Record<string, PluginManifest>;
  updatedAt: string;
}

export interface PluginModule {
  name: string;
  version: string;
  description: string;
  register: (program: Command) => void;
}

// ---------------------------------------------------------------------------
// Registry I/O
// ---------------------------------------------------------------------------

function ensureDir(): void {
  mkdirSync(PLUGINS_DIR, { recursive: true });
}

function loadRegistry(): PluginRegistry {
  ensureDir();
  if (!existsSync(REGISTRY_FILE)) {
    return { version: 1, plugins: {}, updatedAt: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8")) as PluginRegistry;
}

function saveRegistry(reg: PluginRegistry): void {
  ensureDir();
  reg.updatedAt = new Date().toISOString();
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Plugin lifecycle
// ---------------------------------------------------------------------------

export function listPlugins(): PluginManifest[] {
  return Object.values(loadRegistry().plugins);
}

/** Install a plugin from npm. Package name must be "modern-ai-cli-plugin-*". */
export async function installPlugin(packageName: string): Promise<PluginManifest> {
  ensureDir();
  const pkgJson = join(PLUGINS_DIR, "package.json");
  if (!existsSync(pkgJson)) {
    writeFileSync(pkgJson, JSON.stringify({ name: "modern-ai-cli-plugins", private: true }, null, 2));
  }
  execSync(`npm install ${packageName}`, { cwd: PLUGINS_DIR, stdio: "pipe" });

  const mod = await loadNpmPlugin(packageName);
  const reg = loadRegistry();
  const manifest: PluginManifest = {
    name: mod.name,
    version: mod.version,
    description: mod.description,
    source: "npm",
    ref: packageName,
    enabled: true,
    installedAt: new Date().toISOString(),
  };
  reg.plugins[mod.name] = manifest;
  saveRegistry(reg);
  return manifest;
}

/** Install a plugin from a local .mjs file. */
export async function installLocalPlugin(filePath: string): Promise<PluginManifest> {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
  const mod = await loadLocalPlugin(absPath);
  const reg = loadRegistry();
  const manifest: PluginManifest = {
    name: mod.name,
    version: mod.version,
    description: mod.description,
    source: "local",
    ref: absPath,
    enabled: true,
    installedAt: new Date().toISOString(),
  };
  reg.plugins[mod.name] = manifest;
  saveRegistry(reg);
  return manifest;
}

export function removePlugin(name: string): void {
  const reg = loadRegistry();
  const manifest = reg.plugins[name];
  if (!manifest) throw new Error(`Plugin "${name}" is not installed.`);
  if (manifest.source === "npm") {
    try {
      execSync(`npm uninstall ${manifest.ref}`, { cwd: PLUGINS_DIR, stdio: "pipe" });
    } catch { /* ignore */ }
  }
  delete reg.plugins[name];
  saveRegistry(reg);
}

export function enablePlugin(name: string): void {
  const reg = loadRegistry();
  if (!reg.plugins[name]) throw new Error(`Plugin "${name}" is not installed.`);
  reg.plugins[name]!.enabled = true;
  saveRegistry(reg);
}

export function disablePlugin(name: string): void {
  const reg = loadRegistry();
  if (!reg.plugins[name]) throw new Error(`Plugin "${name}" is not installed.`);
  reg.plugins[name]!.enabled = false;
  saveRegistry(reg);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadNpmPlugin(packageName: string): Promise<PluginModule> {
  const path = join(PLUGINS_DIR, "node_modules", packageName, "index.mjs");
  const fallback = join(PLUGINS_DIR, "node_modules", packageName, "index.js");
  const resolved = existsSync(path) ? path : fallback;
  if (!existsSync(resolved)) throw new Error(`No index.mjs/js in ${packageName}`);
  const mod = await import(resolved) as Partial<PluginModule>;
  assertPluginModule(mod, packageName);
  return mod as PluginModule;
}

async function loadLocalPlugin(absPath: string): Promise<PluginModule> {
  const mod = await import(absPath) as Partial<PluginModule>;
  assertPluginModule(mod, absPath);
  return mod as PluginModule;
}

function assertPluginModule(mod: Partial<PluginModule>, ref: string): void {
  if (typeof mod.register !== "function") {
    throw new Error(`Plugin "${ref}" must export a register(program) function.`);
  }
  if (!mod.name) throw new Error(`Plugin "${ref}" must export a name string.`);
}

/** Load all enabled plugins and register them with the Commander program. */
export async function loadPlugins(program: Command): Promise<string[]> {
  const loaded: string[] = [];
  const reg = loadRegistry();

  for (const manifest of Object.values(reg.plugins)) {
    if (!manifest.enabled) continue;
    try {
      let mod: PluginModule;
      if (manifest.source === "npm") {
        mod = await loadNpmPlugin(manifest.ref);
      } else {
        mod = await loadLocalPlugin(manifest.ref);
      }
      mod.register(program);
      loaded.push(manifest.name);
    } catch (err) {
      // Log but don't crash — a broken plugin shouldn't kill the CLI
      process.stderr.write(
        `[warn] Plugin "${manifest.name}" failed to load: ${String(err)}\n`
      );
    }
  }

  // Also scan for local .mjs files auto-dropped into the plugins dir
  for (const file of readdirSync(PLUGINS_DIR)) {
    if (!file.endsWith(".mjs")) continue;
    const absPath = join(PLUGINS_DIR, file);
    // Skip if already registered via registry
    if (Object.values(reg.plugins).some((p) => p.ref === absPath)) continue;
    try {
      const mod = await loadLocalPlugin(absPath);
      mod.register(program);
      loaded.push(`${mod.name} (auto-discovered)`);
    } catch { /* skip broken files */ }
  }

  return loaded;
}

// ---------------------------------------------------------------------------
// Scaffold helper
// ---------------------------------------------------------------------------

const PLUGIN_TEMPLATE = `/**
 * modern-ai-cli plugin template
 * Drop this file into ~/.config/modern-ai-cli/plugins/ to auto-load it.
 */

export const name = "my-plugin";
export const version = "1.0.0";
export const description = "A custom CLI plugin";

/** @param {import("commander").Command} program */
export function register(program) {
  program
    .command("my-cmd")
    .description("My custom command")
    .argument("[input]", "Optional input")
    .action((input) => {
      console.log(\`Hello from my-plugin! Input: \${input ?? "(none)"}\`);
    });
}
`;

export function scaffoldPlugin(outputPath: string): void {
  const absPath = resolve(outputPath);
  writeFileSync(absPath, PLUGIN_TEMPLATE, "utf-8");
}
