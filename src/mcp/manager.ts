/**
 * MCP Skill Manager
 *
 * Manages the local skill registry: install, remove, enable/disable, and
 * load skill implementations (built-in + npm + local file).
 */

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
import type {
  Skill,
  SkillManifest,
  SkillRegistry,
  ToolDefinition,
  ToolHandler,
  ToolResult,
} from "./types.js";
import { BUILTIN_SKILLS } from "./builtins.js";

const SKILLS_DIR = join(homedir(), ".config", "modern-ai-cli", "skills");
const REGISTRY_FILE = join(SKILLS_DIR, "registry.json");

function ensureDir(): void {
  mkdirSync(SKILLS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Registry I/O
// ---------------------------------------------------------------------------

function loadRegistry(): SkillRegistry {
  ensureDir();
  if (!existsSync(REGISTRY_FILE)) {
    return { version: 1, skills: {}, updatedAt: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8")) as SkillRegistry;
}

function saveRegistry(reg: SkillRegistry): void {
  ensureDir();
  reg.updatedAt = new Date().toISOString();
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Built-in seed helpers
// ---------------------------------------------------------------------------

/** Ensure built-in skills appear in the registry (first run). */
export function seedBuiltins(): void {
  const reg = loadRegistry();
  let changed = false;
  for (const [name, skill] of Object.entries(BUILTIN_SKILLS)) {
    if (!reg.skills[name]) {
      reg.skills[name] = {
        name,
        version: skill.version,
        description: skill.description,
        author: skill.author,
        tags: skill.tags,
        source: "builtin",
        ref: name,
        enabled: false,          // off by default — user opts in
        installedAt: new Date().toISOString(),
        tools: skill.tools.map((t) => t.name),
      };
      changed = true;
    }
  }
  if (changed) saveRegistry(reg);
}

// ---------------------------------------------------------------------------
// Skill lifecycle
// ---------------------------------------------------------------------------

/** List all installed skills (merged built-ins + registry). */
export function listSkills(): SkillManifest[] {
  seedBuiltins();
  const reg = loadRegistry();
  return Object.values(reg.skills);
}

/** Enable a skill by name. */
export function enableSkill(name: string): void {
  const reg = loadRegistry();
  if (!reg.skills[name]) throw new Error(`Skill "${name}" is not installed.`);
  reg.skills[name]!.enabled = true;
  saveRegistry(reg);
}

/** Disable a skill by name. */
export function disableSkill(name: string): void {
  const reg = loadRegistry();
  if (!reg.skills[name]) throw new Error(`Skill "${name}" is not installed.`);
  reg.skills[name]!.enabled = false;
  saveRegistry(reg);
}

/** Remove a non-builtin skill. */
export function removeSkill(name: string): void {
  const reg = loadRegistry();
  const manifest = reg.skills[name];
  if (!manifest) throw new Error(`Skill "${name}" is not installed.`);
  if (manifest.source === "builtin") throw new Error(`Cannot remove built-in skill "${name}".`);
  if (manifest.source === "npm") {
    try {
      execSync(`npm uninstall ${manifest.ref}`, {
        cwd: SKILLS_DIR,
        stdio: "pipe",
      });
    } catch {
      // ignore uninstall errors
    }
  }
  delete reg.skills[name];
  saveRegistry(reg);
}

/** Install a skill from an npm package. */
export async function installNpmSkill(packageName: string): Promise<SkillManifest> {
  ensureDir();
  // Ensure package.json exists in skills dir
  const pkgJson = join(SKILLS_DIR, "package.json");
  if (!existsSync(pkgJson)) {
    writeFileSync(pkgJson, JSON.stringify({ name: "modern-ai-cli-skills", private: true }, null, 2));
  }
  execSync(`npm install ${packageName}`, { cwd: SKILLS_DIR, stdio: "pipe" });

  // Load the installed skill to read its metadata
  const skill = await loadNpmSkill(packageName);
  const reg = loadRegistry();
  const manifest: SkillManifest = {
    name: skill.name,
    version: skill.version,
    description: skill.description,
    author: skill.author,
    tags: skill.tags,
    source: "npm",
    ref: packageName,
    enabled: true,
    installedAt: new Date().toISOString(),
    tools: skill.tools.map((t) => t.name),
  };
  reg.skills[skill.name] = manifest;
  saveRegistry(reg);
  return manifest;
}

/** Install a skill from a local .mjs file or directory. */
export async function installLocalSkill(filePath: string): Promise<SkillManifest> {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) throw new Error(`Path not found: ${absPath}`);
  const skill = await loadLocalSkill(absPath);
  const reg = loadRegistry();
  const manifest: SkillManifest = {
    name: skill.name,
    version: skill.version,
    description: skill.description,
    author: skill.author,
    tags: skill.tags,
    source: "local",
    ref: absPath,
    enabled: true,
    installedAt: new Date().toISOString(),
    tools: skill.tools.map((t) => t.name),
  };
  reg.skills[skill.name] = manifest;
  saveRegistry(reg);
  return manifest;
}

// ---------------------------------------------------------------------------
// Skill loading (resolve implementation at runtime)
// ---------------------------------------------------------------------------

async function loadNpmSkill(packageName: string): Promise<Skill> {
  const pkgPath = join(SKILLS_DIR, "node_modules", packageName);
  const indexPath = join(pkgPath, "index.mjs");
  const fallback = join(pkgPath, "index.js");
  const path = existsSync(indexPath) ? indexPath : fallback;
  if (!existsSync(path)) throw new Error(`No index.mjs/js in ${pkgPath}`);
  const mod = await import(path) as { default?: Skill; skill?: Skill };
  const skill = mod.default ?? mod.skill;
  if (!skill) throw new Error(`Skill package "${packageName}" must export a default Skill object.`);
  return skill;
}

async function loadLocalSkill(absPath: string): Promise<Skill> {
  const mod = await import(absPath) as { default?: Skill; skill?: Skill };
  const skill = mod.default ?? mod.skill;
  if (!skill) throw new Error(`Local skill at "${absPath}" must export a default Skill object.`);
  return skill;
}

/** Load a skill's full implementation (with handlers) for tool execution. */
export async function loadSkillImpl(manifest: SkillManifest): Promise<Skill> {
  if (manifest.source === "builtin") {
    const skill = BUILTIN_SKILLS[manifest.name];
    if (!skill) throw new Error(`Built-in skill "${manifest.name}" not found.`);
    return skill;
  }
  if (manifest.source === "npm") return loadNpmSkill(manifest.ref);
  return loadLocalSkill(manifest.ref);
}

// ---------------------------------------------------------------------------
// Active tool collection (used by AI client)
// ---------------------------------------------------------------------------

/** Returns all ToolDefinitions from enabled skills. */
export async function getActiveTools(): Promise<ToolDefinition[]> {
  seedBuiltins();
  const reg = loadRegistry();
  const defs: ToolDefinition[] = [];
  for (const manifest of Object.values(reg.skills)) {
    if (!manifest.enabled) continue;
    const skill = await loadSkillImpl(manifest);
    defs.push(...skill.tools);
  }
  return defs;
}

/** Dispatch a tool call to the appropriate skill handler. */
export async function dispatchToolCall(
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  seedBuiltins();
  const reg = loadRegistry();
  // Find which skill owns this tool
  for (const manifest of Object.values(reg.skills)) {
    if (!manifest.enabled) continue;
    if (!manifest.tools.includes(toolName)) continue;
    const skill = await loadSkillImpl(manifest);
    const handler: ToolHandler | undefined = skill.handlers?.[toolName];
    if (!handler) return { content: `Tool "${toolName}" has no handler.`, isError: true };
    return handler(input);
  }
  return { content: `Unknown tool: ${toolName}`, isError: true };
}

// ---------------------------------------------------------------------------
// Scan local skill files (from ~/.config/modern-ai-cli/skills/*.mjs)
// ---------------------------------------------------------------------------

/** Auto-discover .mjs skill files dropped into the skills directory. */
export async function discoverLocalFiles(): Promise<string[]> {
  ensureDir();
  const discovered: string[] = [];
  for (const file of readdirSync(SKILLS_DIR)) {
    if (!file.endsWith(".mjs")) continue;
    const absPath = join(SKILLS_DIR, file);
    try {
      await installLocalSkill(absPath);
      discovered.push(file);
    } catch {
      // skip invalid files
    }
  }
  return discovered;
}
