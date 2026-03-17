/**
 * Custom Agent Registry
 *
 * Each agent can define:
 *   - Core expertise (systemPrompt)
 *   - Personality / persona (tone, style, language)
 *   - Bound MCP skills (tools available only to this agent)
 *   - Org position: company, department, title, reportsTo, directReports
 *   - Default workflow binding
 *   - Model override
 *
 * Stored at ~/.config/modern-ai-cli/agents/registry.json.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const AGENTS_DIR = join(homedir(), ".config", "modern-ai-cli", "agents");
const REGISTRY_FILE = join(AGENTS_DIR, "registry.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentPersona {
  /** Personality description — e.g. "detail-oriented and concise" */
  description: string;
  /** Communication tone */
  tone: "formal" | "casual" | "technical" | "creative";
  /** Output style hints */
  style?: string;
  /** Preferred language for output */
  language?: string;
}

export interface AgentOrgPosition {
  /** Company or organization name */
  company: string;
  /** Department within the company */
  department: string;
  /** Job title */
  title: string;
  /**
   * Name of the manager agent (reportsTo).
   * Orchestrator will route output to this agent for review/approval.
   */
  reportsTo?: string;
  /**
   * Names of direct-report agents.
   * Used in org-based orchestration to delegate sub-tasks down the hierarchy.
   */
  directReports?: string[];
}

export interface CustomAgentDef {
  name: string;
  description: string;
  /** Core expertise prompt */
  systemPrompt: string;
  /** Personality layer injected before the system prompt */
  persona?: AgentPersona;
  /** Org chart position (company / department / reporting line) */
  org?: AgentOrgPosition;
  /** MCP skill names activated for this agent (empty = use global settings) */
  mcpSkills: string[];
  /** Default workflow name to use when running this agent */
  boundWorkflow?: string;
  /** Optional model override */
  model?: string;
  icon: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomAgentRegistry {
  version: 1;
  agents: Record<string, CustomAgentDef>;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function ensureDir(): void {
  mkdirSync(AGENTS_DIR, { recursive: true });
}

function loadRegistry(): CustomAgentRegistry {
  ensureDir();
  if (!existsSync(REGISTRY_FILE)) {
    return { version: 1, agents: {}, updatedAt: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8")) as CustomAgentRegistry;
}

function saveRegistry(reg: CustomAgentRegistry): void {
  ensureDir();
  reg.updatedAt = new Date().toISOString();
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listCustomAgents(): CustomAgentDef[] {
  return Object.values(loadRegistry().agents);
}

export function getCustomAgent(name: string): CustomAgentDef | undefined {
  return loadRegistry().agents[name];
}

export function createCustomAgent(
  def: Omit<CustomAgentDef, "createdAt" | "updatedAt">
): CustomAgentDef {
  const reg = loadRegistry();
  if (reg.agents[def.name]) {
    throw new Error(`Agent "${def.name}" already exists. Use: ai agent edit ${def.name}`);
  }
  validateName(def.name);
  const now = new Date().toISOString();
  const agent: CustomAgentDef = { ...def, createdAt: now, updatedAt: now };
  reg.agents[def.name] = agent;
  saveRegistry(reg);
  return agent;
}

export function updateCustomAgent(
  name: string,
  fields: Partial<Omit<CustomAgentDef, "name" | "createdAt" | "updatedAt">>
): CustomAgentDef {
  const reg = loadRegistry();
  const existing = reg.agents[name];
  if (!existing) throw new Error(`Agent "${name}" not found.`);
  const updated: CustomAgentDef = {
    ...existing,
    ...fields,
    name,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  reg.agents[name] = updated;
  saveRegistry(reg);
  return updated;
}

export function removeCustomAgent(name: string): void {
  const reg = loadRegistry();
  if (!reg.agents[name]) throw new Error(`Agent "${name}" not found.`);
  delete reg.agents[name];
  saveRegistry(reg);
}

export function exportCustomAgent(name: string): string {
  const agent = getCustomAgent(name);
  if (!agent) throw new Error(`Agent "${name}" not found.`);
  return JSON.stringify(agent, null, 2);
}

export function importCustomAgent(json: string): CustomAgentDef {
  let def: Partial<CustomAgentDef>;
  try { def = JSON.parse(json) as Partial<CustomAgentDef>; }
  catch { throw new Error("Invalid JSON for agent definition."); }
  if (!def.name || !def.systemPrompt || !def.description) {
    throw new Error("Agent definition must have name, description, and systemPrompt.");
  }
  return createCustomAgent({
    name: def.name,
    description: def.description,
    systemPrompt: def.systemPrompt,
    persona: def.persona,
    org: def.org,
    mcpSkills: def.mcpSkills ?? [],
    boundWorkflow: def.boundWorkflow,
    model: def.model,
    icon: def.icon ?? "🤖",
    tags: def.tags ?? [],
  });
}

// ---------------------------------------------------------------------------
// System prompt composition
// ---------------------------------------------------------------------------

export function buildCustomSystemPrompt(agent: CustomAgentDef): string {
  const parts: string[] = [];

  if (agent.persona) {
    const { description, tone, style, language } = agent.persona;
    parts.push(
      `[Persona]\n` +
      `Personality: ${description}\n` +
      `Tone: ${tone}` +
      (style ? `\nStyle: ${style}` : "") +
      (language ? `\nRespond in: ${language}` : "")
    );
  }

  if (agent.org) {
    const { company, department, title, reportsTo } = agent.org;
    parts.push(
      `[Organizational Context]\n` +
      `You are the ${title} at ${company}, working in the ${department} department.` +
      (reportsTo
        ? ` Your work will be reviewed by ${reportsTo}.`
        : "")
    );
  }

  parts.push(agent.systemPrompt);

  if (agent.mcpSkills.length > 0) {
    parts.push(
      `[Available Tools]\nYou have access to: ${agent.mcpSkills.join(", ")}.\n` +
      `Use them proactively when they help complete the task.`
    );
  }

  return parts.join("\n\n");
}

export function resolveCustomSystemPrompt(roleName: string): string | undefined {
  const agent = loadRegistry().agents[roleName];
  if (!agent) return undefined;
  return buildCustomSystemPrompt(agent);
}

export function getAgentMcpSkills(roleName: string): string[] | null {
  const agent = loadRegistry().agents[roleName];
  if (!agent) return null;
  return agent.mcpSkills.length > 0 ? agent.mcpSkills : null;
}

// ---------------------------------------------------------------------------
// Org chart queries
// ---------------------------------------------------------------------------

/** Get all agents in a given company. */
export function getAgentsByCompany(company: string): CustomAgentDef[] {
  return listCustomAgents().filter(
    (a) => a.org?.company.toLowerCase() === company.toLowerCase()
  );
}

/** Get all agents in a given department (within a company). */
export function getAgentsByDepartment(company: string, department: string): CustomAgentDef[] {
  return listCustomAgents().filter(
    (a) =>
      a.org?.company.toLowerCase() === company.toLowerCase() &&
      a.org?.department.toLowerCase() === department.toLowerCase()
  );
}

/** Get all direct reports for a given agent. */
export function getDirectReports(managerName: string): CustomAgentDef[] {
  return listCustomAgents().filter(
    (a) => a.org?.reportsTo === managerName
  );
}

/** Get all companies with agents defined. */
export function listCompanies(): string[] {
  const seen = new Set<string>();
  for (const a of listCustomAgents()) {
    if (a.org?.company) seen.add(a.org.company);
  }
  return [...seen];
}

/** Get all departments within a company. */
export function listDepartments(company: string): string[] {
  const seen = new Set<string>();
  for (const a of getAgentsByCompany(company)) {
    if (a.org?.department) seen.add(a.org.department);
  }
  return [...seen];
}

/**
 * Build a hierarchical reporting tree starting from a root agent.
 * Returns a nested structure for display.
 */
export interface OrgNode {
  agent: CustomAgentDef;
  reports: OrgNode[];
}

export function buildOrgTree(rootName: string): OrgNode | undefined {
  const agent = getCustomAgent(rootName);
  if (!agent) return undefined;
  const reports = getDirectReports(rootName).map((r) => buildOrgTree(r.name)!).filter(Boolean);
  return { agent, reports };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateName(name: string): void {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(name)) {
    throw new Error(
      `Invalid agent name "${name}". Use lowercase letters, digits, hyphens (max 31 chars).`
    );
  }
}

export function allRoleNames(builtinRoles: string[]): string[] {
  return [...builtinRoles, ...listCustomAgents().map((a) => a.name)];
}

export { AGENTS_DIR };
