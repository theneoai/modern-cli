/**
 * Multi-Agent Orchestrator
 *
 * Coordinates specialized agents to solve complex tasks.
 * Supports three execution modes:
 *
 *   1. Auto-plan: planner LLM decomposes the goal into a task graph
 *   2. Workflow: user-defined fixed task graph (from ai agent workflow)
 *   3. Solo: single agent, no orchestration overhead
 *
 * Role resolution order (for system prompts):
 *   1. Built-in ROLE_SYSTEM_PROMPTS
 *   2. User-defined custom agents (agents/custom.ts)
 *   3. Fallback: generic assistant prompt
 */

import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.js";
import {
  ROLE_SYSTEM_PROMPTS,
  AGENT_ROLE_DESCRIPTIONS,
  buildAgentMessage,
} from "./types.js";
import type {
  AgentRoleName,
  AgentTask,
  AgentPlan,
  AgentResult,
  OrchestrationResult,
  AgentEventHandler,
} from "./types.js";
import { resolveCustomSystemPrompt, listCustomAgents } from "./custom.js";
import type { WorkflowDef } from "./workflow.js";
import { buildOrgPlan } from "./org.js";
import { buildMemoryContext, addMemory } from "./memory.js";

// ---------------------------------------------------------------------------
// System prompt resolution
// ---------------------------------------------------------------------------

function resolveSystemPrompt(role: AgentRoleName): string {
  // 1. Built-in roles
  if (role in ROLE_SYSTEM_PROMPTS) {
    return ROLE_SYSTEM_PROMPTS[role as keyof typeof ROLE_SYSTEM_PROMPTS];
  }
  // 2. Custom agents
  const custom = resolveCustomSystemPrompt(role);
  if (custom) return custom;
  // 3. Generic fallback
  return `You are a specialized AI agent with the role: ${role}. Complete the given task thoroughly and accurately.`;
}

// ---------------------------------------------------------------------------
// Planner: turn a user goal into a task graph
// ---------------------------------------------------------------------------

function buildPlannerPrompt(): string {
  const builtinRoles = Object.entries(AGENT_ROLE_DESCRIPTIONS)
    .map(([r, d]) => `  ${r}: ${d}`)
    .join("\n");

  const customAgents = listCustomAgents();
  const customSection = customAgents.length > 0
    ? "\nUser-defined custom agents (also available):\n" +
      customAgents.map((a) => `  ${a.name}: ${a.description}`).join("\n")
    : "";

  return `You are a task decomposition agent. Given a user goal, produce a JSON execution plan.

Output ONLY valid JSON (no markdown, no explanation) in this exact schema:
{
  "executionMode": "sequential" | "parallel",
  "tasks": [
    {
      "id": "t1",
      "role": "<role name>",
      "prompt": "<specific instruction for this sub-task>",
      "dependsOn": ["t0"]
    }
  ]
}

Rules:
- Use 2-5 tasks. Always end with a "synthesizer" task that depends on all others.
- "parallel" mode: non-dependent tasks run simultaneously in waves.
- "sequential" mode: tasks run strictly in order.
- Keep prompts specific and actionable.
- You may use any of the available roles below.

Built-in roles:
${builtinRoles}${customSection}`;
}

async function buildPlan(client: Anthropic, goal: string): Promise<AgentPlan> {
  const config = getConfig();
  const response = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    system: buildPlannerPrompt(),
    messages: [{ role: "user", content: `Goal: ${goal}` }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed: { executionMode: string; tasks: AgentTask[] };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return {
      goal,
      executionMode: "sequential",
      tasks: [{ id: "t1", role: "synthesizer", prompt: goal }],
    };
  }

  return {
    goal,
    executionMode: parsed.executionMode === "parallel" ? "parallel" : "sequential",
    tasks: parsed.tasks,
  };
}

// ---------------------------------------------------------------------------
// Individual agent runner
// ---------------------------------------------------------------------------

async function runAgent(
  client: Anthropic,
  task: AgentTask,
  priorResults: AgentResult[],
  onDelta: (delta: string) => void,
  opts: { useMemory?: boolean } = {}
): Promise<AgentResult> {
  const config = getConfig();
  const startMs = Date.now();
  const messages = buildAgentMessage(task.role, task, priorResults);

  // Build system prompt with optional memory context
  let systemPrompt = resolveSystemPrompt(task.role);
  if (opts.useMemory !== false) {
    const memCtx = buildMemoryContext(task.role, task.prompt);
    if (memCtx) systemPrompt = `${systemPrompt}\n\n${memCtx}`;
  }

  let output = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await client.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemPrompt,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const delta = event.delta.text;
      output += delta;
      onDelta(delta);
    } else if (event.type === "message_start") {
      inputTokens = event.message.usage.input_tokens;
    } else if (event.type === "message_delta") {
      outputTokens = event.usage.output_tokens;
    }
  }

  const result: AgentResult = {
    taskId: task.id,
    role: task.role,
    output,
    usage: { inputTokens, outputTokens },
    durationMs: Date.now() - startMs,
  };

  // Save task result to agent memory (episodic)
  if (opts.useMemory !== false && output.trim()) {
    addMemory(task.role, output.slice(0, 500), "episodic", {
      tags: ["task-output", task.id],
      importance: 5,
      summary: `Task ${task.id}: ${task.prompt.slice(0, 80)}`,
      sourceTask: task.id,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Dependency resolver
// ---------------------------------------------------------------------------

function getReadyTasks(tasks: AgentTask[], completed: Set<string>): AgentTask[] {
  return tasks.filter((t) => {
    if (completed.has(t.id)) return false;
    return (t.dependsOn ?? []).every((dep) => completed.has(dep));
  });
}

// ---------------------------------------------------------------------------
// Core execution engine (shared by auto-plan and workflow modes)
// ---------------------------------------------------------------------------

async function executePlan(
  client: Anthropic,
  plan: AgentPlan,
  onEvent: AgentEventHandler
): Promise<{ results: AgentResult[]; totalUsage: { inputTokens: number; outputTokens: number } }> {
  const completed = new Set<string>();
  const results: AgentResult[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };

  if (plan.executionMode === "parallel") {
    // Wave-based parallel execution
    while (completed.size < plan.tasks.length) {
      const wave = getReadyTasks(plan.tasks, completed);
      if (wave.length === 0) break;

      const wavePromises = wave.map(async (task) => {
        onEvent({ type: "task_start", taskId: task.id, role: task.role });
        const priorResults = results.filter((r) =>
          (task.dependsOn ?? []).includes(r.taskId)
        );
        const result = await runAgent(client, task, priorResults, (delta) => {
          onEvent({ type: "task_delta", taskId: task.id, role: task.role, delta });
        });
        onEvent({ type: "task_done", result });
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        return result;
      });

      const waveResults = await Promise.all(wavePromises);
      for (const r of waveResults) {
        results.push(r);
        completed.add(r.taskId);
      }
    }
  } else {
    // Sequential execution in dependency order
    for (const task of plan.tasks) {
      onEvent({ type: "task_start", taskId: task.id, role: task.role });
      const priorResults = results.filter((r) =>
        (task.dependsOn ?? []).includes(r.taskId)
      );
      const result = await runAgent(client, task, priorResults, (delta) => {
        onEvent({ type: "task_delta", taskId: task.id, role: task.role, delta });
      });
      onEvent({ type: "task_done", result });
      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;
      results.push(result);
      completed.add(task.id);
    }
  }

  return { results, totalUsage };
}

// ---------------------------------------------------------------------------
// Public API: auto-plan orchestration
// ---------------------------------------------------------------------------

export async function orchestrate(
  goal: string,
  onEvent: AgentEventHandler
): Promise<OrchestrationResult> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("API key not configured. Run: ai config set apiKey YOUR_KEY");
  }
  const client = new Anthropic({ apiKey: config.apiKey });
  const globalStart = Date.now();

  const plan = await buildPlan(client, goal);
  onEvent({ type: "plan_ready", plan });

  const { results, totalUsage } = await executePlan(client, plan, onEvent);

  const synthResult = [...results].reverse().find((r) => r.role === "synthesizer");
  const finalAnswer = synthResult?.output ?? results.at(-1)?.output ?? "";

  const result: OrchestrationResult = {
    goal,
    plan,
    results,
    finalAnswer,
    totalUsage,
    totalDurationMs: Date.now() - globalStart,
  };
  onEvent({ type: "done", result });
  return result;
}

// ---------------------------------------------------------------------------
// Public API: workflow-based orchestration
// ---------------------------------------------------------------------------

export async function runWorkflow(
  wf: WorkflowDef,
  goal: string,
  onEvent: AgentEventHandler
): Promise<OrchestrationResult> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("API key not configured. Run: ai config set apiKey YOUR_KEY");
  }
  const client = new Anthropic({ apiKey: config.apiKey });
  const globalStart = Date.now();

  // Convert workflow steps → AgentTask[], substituting {{goal}}
  const tasks: AgentTask[] = wf.steps.map((s) => ({
    id: s.id,
    role: s.role,
    prompt: s.prompt.replace(/\{\{goal\}\}/g, goal),
    dependsOn: s.dependsOn,
  }));

  const plan: AgentPlan = {
    goal,
    tasks,
    executionMode: wf.executionMode,
  };

  onEvent({ type: "plan_ready", plan });

  const { results, totalUsage } = await executePlan(client, plan, onEvent);

  const synthResult = [...results].reverse().find((r) => r.role === "synthesizer");
  const finalAnswer = synthResult?.output ?? results.at(-1)?.output ?? "";

  const result: OrchestrationResult = {
    goal,
    plan,
    results,
    finalAnswer,
    totalUsage,
    totalDurationMs: Date.now() - globalStart,
  };
  onEvent({ type: "done", result });
  return result;
}

// ---------------------------------------------------------------------------
// Public API: single agent (no orchestration)
// ---------------------------------------------------------------------------

export async function runSingleAgent(
  role: AgentRoleName,
  prompt: string,
  onDelta: (delta: string) => void
): Promise<AgentResult> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("API key not configured. Run: ai config set apiKey YOUR_KEY");
  }
  const client = new Anthropic({ apiKey: config.apiKey });
  const task: AgentTask = { id: "single", role, prompt };
  return runAgent(client, task, [], onDelta);
}

// ---------------------------------------------------------------------------
// Public API: org-level run
// ---------------------------------------------------------------------------

export async function runOrgUnit(
  company: string,
  department: string | undefined,
  goal: string,
  onEvent: AgentEventHandler
): Promise<OrchestrationResult> {
  const config = getConfig();
  if (!config.apiKey) {
    throw new Error("API key not configured. Run: ai config set apiKey YOUR_KEY");
  }
  const plan = buildOrgPlan(company, department, goal);
  if (!plan) {
    throw new Error(
      `No agents found for ${department ? `department "${department}" in ` : ""}company "${company}".`
    );
  }

  const client = new Anthropic({ apiKey: config.apiKey });
  const globalStart = Date.now();
  onEvent({ type: "plan_ready", plan });

  const { results, totalUsage } = await executePlan(client, plan, onEvent);
  const synthResult = [...results].reverse().find((r) => r.role === "synthesizer");
  const finalAnswer = synthResult?.output ?? results.at(-1)?.output ?? "";

  const result: OrchestrationResult = {
    goal,
    plan,
    results,
    finalAnswer,
    totalUsage,
    totalDurationMs: Date.now() - globalStart,
  };
  onEvent({ type: "done", result });
  return result;
}

// ---------------------------------------------------------------------------
// Public API: system prompt preview (for ai agent show)
// ---------------------------------------------------------------------------

export function previewSystemPrompt(role: AgentRoleName): string {
  return resolveSystemPrompt(role);
}
