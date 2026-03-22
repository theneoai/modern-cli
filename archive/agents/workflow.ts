/**
 * Workflow definition and serialization.
 *
 * A workflow is a named, reusable task graph that wires specific agents
 * together in a fixed topology. Users can save, share, and replay workflows.
 *
 * Execution model:
 *   - Tasks with no dependsOn (or empty array) start immediately.
 *   - Tasks whose dependsOn list is fully satisfied start as soon as deps complete.
 *   - Tasks in the same "wave" (all deps done at the same time) run in PARALLEL.
 *   - Sequential order is enforced only by the dependsOn graph.
 *
 * Example workflow JSON:
 * {
 *   "name": "code-review-pipeline",
 *   "description": "Research → Code → Review → Synthesize",
 *   "executionMode": "parallel",
 *   "steps": [
 *     { "id": "s1", "role": "researcher",  "prompt": "Analyze requirements and context" },
 *     { "id": "s2", "role": "coder",       "prompt": "Implement solution", "dependsOn": ["s1"] },
 *     { "id": "s3", "role": "reviewer",    "prompt": "Review the code",    "dependsOn": ["s2"] },
 *     { "id": "s4", "role": "synthesizer", "prompt": "Write final summary", "dependsOn": ["s3"] }
 *   ]
 * }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join, resolve, extname } from "path";
import { homedir } from "os";
import type { ExecutionMode } from "./types.js";

const WORKFLOWS_DIR = join(homedir(), ".config", "modern-ai-cli", "workflows");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  /** Built-in role name OR custom agent name */
  role: string;
  /** Task prompt — may include {{goal}} placeholder which is substituted at runtime */
  prompt: string;
  dependsOn?: string[];
}

export interface WorkflowDef {
  name: string;
  description: string;
  executionMode: ExecutionMode;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function ensureDir(): void {
  mkdirSync(WORKFLOWS_DIR, { recursive: true });
}

function workflowPath(name: string): string {
  return join(WORKFLOWS_DIR, `${name}.json`);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export function listWorkflows(): WorkflowDef[] {
  ensureDir();
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => extname(f) === ".json");
  return files.flatMap((f) => {
    try {
      return [JSON.parse(readFileSync(join(WORKFLOWS_DIR, f), "utf-8")) as WorkflowDef];
    } catch {
      return [];
    }
  });
}

export function getWorkflow(name: string): WorkflowDef | undefined {
  const p = workflowPath(name);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf-8")) as WorkflowDef;
}

export function saveWorkflow(def: Omit<WorkflowDef, "createdAt" | "updatedAt">): WorkflowDef {
  ensureDir();
  validateWorkflow(def);
  const existing = getWorkflow(def.name);
  const now = new Date().toISOString();
  const wf: WorkflowDef = {
    ...def,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeFileSync(workflowPath(def.name), JSON.stringify(wf, null, 2), "utf-8");
  return wf;
}

export function removeWorkflow(name: string): void {
  const p = workflowPath(name);
  if (!existsSync(p)) throw new Error(`Workflow "${name}" not found.`);
  unlinkSync(p);
}

/** Load a workflow from an arbitrary file path. */
export function loadWorkflowFile(filePath: string): WorkflowDef {
  const abs = resolve(filePath);
  if (!existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const def = JSON.parse(readFileSync(abs, "utf-8")) as WorkflowDef;
  validateWorkflow(def);
  return def;
}

// ---------------------------------------------------------------------------
// Runtime: substitute {{goal}} in step prompts
// ---------------------------------------------------------------------------

export function instantiateWorkflow(wf: WorkflowDef, goal: string): WorkflowDef {
  return {
    ...wf,
    steps: wf.steps.map((s) => ({
      ...s,
      prompt: s.prompt.replace(/\{\{goal\}\}/g, goal),
    })),
  };
}

// ---------------------------------------------------------------------------
// Scaffold helpers
// ---------------------------------------------------------------------------

const BUILTIN_WORKFLOW_TEMPLATES: Record<string, Omit<WorkflowDef, "createdAt" | "updatedAt">> = {
  "research-code-review": {
    name: "research-code-review",
    description: "Research requirements → code solution → review → synthesize",
    executionMode: "parallel",
    steps: [
      { id: "s1", role: "researcher",  prompt: "Analyze the goal and identify requirements: {{goal}}" },
      { id: "s2", role: "coder",       prompt: "Implement: {{goal}}", dependsOn: ["s1"] },
      { id: "s3", role: "reviewer",    prompt: "Review the implementation for bugs and quality", dependsOn: ["s2"] },
      { id: "s4", role: "synthesizer", prompt: "Produce the final answer", dependsOn: ["s3"] },
    ],
  },
  "parallel-research": {
    name: "parallel-research",
    description: "Multiple researchers work in parallel, then a synthesizer combines results",
    executionMode: "parallel",
    steps: [
      { id: "s1", role: "researcher", prompt: "Research the technical aspects of: {{goal}}" },
      { id: "s2", role: "researcher", prompt: "Research the practical/business aspects of: {{goal}}" },
      { id: "s3", role: "synthesizer", prompt: "Combine both research threads into a complete answer", dependsOn: ["s1", "s2"] },
    ],
  },
  "plan-then-code": {
    name: "plan-then-code",
    description: "Planner breaks down task, coder implements each part, reviewer checks",
    executionMode: "sequential",
    steps: [
      { id: "s1", role: "planner",     prompt: "Create a step-by-step implementation plan for: {{goal}}" },
      { id: "s2", role: "coder",       prompt: "Implement following the plan", dependsOn: ["s1"] },
      { id: "s3", role: "reviewer",    prompt: "Review the implementation", dependsOn: ["s2"] },
      { id: "s4", role: "synthesizer", prompt: "Write the final polished answer", dependsOn: ["s3"] },
    ],
  },
};

export function getWorkflowTemplate(templateName: string): Omit<WorkflowDef, "createdAt" | "updatedAt"> | undefined {
  return BUILTIN_WORKFLOW_TEMPLATES[templateName];
}

export function listWorkflowTemplates(): string[] {
  return Object.keys(BUILTIN_WORKFLOW_TEMPLATES);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateWorkflow(def: Partial<WorkflowDef>): void {
  if (!def.name) throw new Error("Workflow must have a name.");
  if (!/^[a-z][a-z0-9-]{1,50}$/.test(def.name)) {
    throw new Error(`Invalid workflow name "${def.name}". Use lowercase letters, digits, and hyphens.`);
  }
  if (!def.steps?.length) throw new Error("Workflow must have at least one step.");
  const ids = new Set(def.steps.map((s) => s.id));
  for (const step of def.steps) {
    for (const dep of step.dependsOn ?? []) {
      if (!ids.has(dep)) {
        throw new Error(`Step "${step.id}" depends on unknown step "${dep}".`);
      }
    }
  }
}

export { WORKFLOWS_DIR };
