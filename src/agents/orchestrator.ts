/**
 * Multi-Agent Orchestrator
 *
 * Coordinates specialized agents to solve complex tasks:
 * 1. Planner decomposes the goal into sub-tasks
 * 2. Sub-agents run in parallel or sequentially based on dependencies
 * 3. Synthesizer produces the final coherent answer
 */

import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.js";
import {
  ROLE_SYSTEM_PROMPTS,
  AGENT_ROLE_DESCRIPTIONS,
  buildAgentMessage,
} from "./types.js";
import type {
  AgentRole,
  AgentTask,
  AgentPlan,
  AgentResult,
  OrchestrationResult,
  AgentEventHandler,
} from "./types.js";

// ---------------------------------------------------------------------------
// Planner: turn a user goal into a task graph
// ---------------------------------------------------------------------------

const PLANNER_SYSTEM = `You are a task decomposition agent. Given a user goal, produce a JSON execution plan.

Output ONLY valid JSON (no markdown, no explanation) in this exact schema:
{
  "executionMode": "sequential" | "parallel",
  "tasks": [
    {
      "id": "t1",
      "role": "researcher" | "planner" | "coder" | "reviewer" | "synthesizer",
      "prompt": "<specific instruction for this sub-task>",
      "dependsOn": ["t0"]   // optional: IDs of tasks that must finish first
    }
  ]
}

Rules:
- Use 2-4 tasks. Always end with a "synthesizer" task that depends on all others.
- "parallel" means all non-dependent tasks run at the same time.
- "sequential" means tasks run one after another in order.
- Keep prompts specific and actionable.
- Available roles and their purpose:
  ${Object.entries(AGENT_ROLE_DESCRIPTIONS).map(([r, d]) => `  ${r}: ${d}`).join("\n")}`;

async function buildPlan(client: Anthropic, goal: string): Promise<AgentPlan> {
  const config = getConfig();
  const response = await client.messages.create({
    model: config.model,
    max_tokens: 1024,
    system: PLANNER_SYSTEM,
    messages: [{ role: "user", content: `Goal: ${goal}` }],
  });

  const raw = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  // Strip markdown code fences if present
  const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  let parsed: { executionMode: string; tasks: AgentTask[] };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    // Fallback: single synthesizer task
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
  onDelta: (delta: string) => void
): Promise<AgentResult> {
  const config = getConfig();
  const startMs = Date.now();
  const messages = buildAgentMessage(task.role, task, priorResults);

  let output = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = await client.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    system: ROLE_SYSTEM_PROMPTS[task.role],
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

  return {
    taskId: task.id,
    role: task.role,
    output,
    usage: { inputTokens, outputTokens },
    durationMs: Date.now() - startMs,
  };
}

// ---------------------------------------------------------------------------
// Dependency resolver
// ---------------------------------------------------------------------------

/**
 * Return tasks that are ready to run (all dependencies completed).
 */
function getReadyTasks(
  tasks: AgentTask[],
  completed: Set<string>
): AgentTask[] {
  return tasks.filter((t) => {
    if (completed.has(t.id)) return false;
    return (t.dependsOn ?? []).every((dep) => completed.has(dep));
  });
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function orchestrate(
  goal: string,
  onEvent: AgentEventHandler
): Promise<OrchestrationResult> {
  const config = getConfig();
  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new Error(
      "API key not configured. Run: ai config set apiKey YOUR_KEY"
    );
  }
  const client = new Anthropic({ apiKey });
  const globalStart = Date.now();

  // Step 1: Build execution plan
  const plan = await buildPlan(client, goal);
  onEvent({ type: "plan_ready", plan });

  const completed = new Set<string>();
  const results: AgentResult[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0 };

  // Step 2: Execute tasks respecting dependency graph
  if (plan.executionMode === "parallel") {
    // Wave-based parallel execution
    while (completed.size < plan.tasks.length) {
      const wave = getReadyTasks(plan.tasks, completed);
      if (wave.length === 0) break; // Prevent infinite loop on bad plan

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
    // Sequential execution in order
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

  // Step 3: Extract final answer from synthesizer (last task)
  const synthResult = [...results].reverse().find((r) => r.role === "synthesizer");
  const finalAnswer = synthResult?.output ?? results.at(-1)?.output ?? "";

  const orchestrationResult: OrchestrationResult = {
    goal,
    plan,
    results,
    finalAnswer,
    totalUsage,
    totalDurationMs: Date.now() - globalStart,
  };

  onEvent({ type: "done", result: orchestrationResult });
  return orchestrationResult;
}

// ---------------------------------------------------------------------------
// Quick single-agent helper (no orchestration overhead)
// ---------------------------------------------------------------------------

export async function runSingleAgent(
  role: AgentRole,
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
