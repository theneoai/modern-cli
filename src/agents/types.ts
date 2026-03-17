/**
 * Multi-agent system types.
 *
 * The orchestrator coordinates specialized sub-agents to complete complex tasks.
 * Each agent has a role-specific system prompt and receives targeted sub-tasks.
 */

import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

// ---------------------------------------------------------------------------
// Agent roles
// ---------------------------------------------------------------------------

export type AgentRole =
  | "researcher"   // Gather context, analyse requirements, fetch relevant info
  | "planner"      // Break a task into clear steps
  | "coder"        // Write or modify code
  | "reviewer"     // Critique output for bugs, quality, completeness
  | "synthesizer"; // Merge multiple agent outputs into a coherent final answer

export const AGENT_ROLE_DESCRIPTIONS: Record<AgentRole, string> = {
  researcher:  "Analyze requirements, gather context, identify constraints",
  planner:     "Break the task into ordered, actionable steps",
  coder:       "Write, refactor, or debug code based on the plan",
  reviewer:    "Check for bugs, edge cases, security issues, and quality",
  synthesizer: "Combine all agent outputs into a polished final response",
};

// ---------------------------------------------------------------------------
// Task graph
// ---------------------------------------------------------------------------

export type ExecutionMode = "sequential" | "parallel";

export interface AgentTask {
  id: string;
  role: AgentRole;
  /** Human-readable description of what this sub-task should accomplish */
  prompt: string;
  /** IDs of tasks that must complete before this one starts */
  dependsOn?: string[];
}

export interface AgentPlan {
  goal: string;
  tasks: AgentTask[];
  executionMode: ExecutionMode;
}

// ---------------------------------------------------------------------------
// Agent results
// ---------------------------------------------------------------------------

export interface AgentResult {
  taskId: string;
  role: AgentRole;
  output: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  error?: string;
}

export interface OrchestrationResult {
  goal: string;
  plan: AgentPlan;
  results: AgentResult[];
  finalAnswer: string;
  totalUsage: { inputTokens: number; outputTokens: number };
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Streaming events (for live progress updates)
// ---------------------------------------------------------------------------

export type AgentEvent =
  | { type: "plan_ready";    plan: AgentPlan }
  | { type: "task_start";    taskId: string; role: AgentRole }
  | { type: "task_delta";    taskId: string; role: AgentRole; delta: string }
  | { type: "task_done";     result: AgentResult }
  | { type: "final_start" }
  | { type: "final_delta";   delta: string }
  | { type: "done";          result: OrchestrationResult };

export type AgentEventHandler = (event: AgentEvent) => void;

// ---------------------------------------------------------------------------
// Role system prompts
// ---------------------------------------------------------------------------

export const ROLE_SYSTEM_PROMPTS: Record<AgentRole, string> = {
  researcher: `You are a meticulous research agent. Your job is to:
1. Carefully analyze the task and identify all relevant requirements and constraints.
2. Identify what information, context, or clarification is needed.
3. Summarize findings concisely in structured markdown.
Do NOT write code. Focus on analysis and information gathering.`,

  planner: `You are an expert planning agent. Your job is to:
1. Break the task into a clear, ordered list of actionable steps.
2. Identify which steps can be done in parallel and which must be sequential.
3. Specify the deliverable for each step.
Output a numbered plan in markdown. Be specific and concrete. Do NOT write implementation code.`,

  coder: `You are an expert software engineer. Your job is to:
1. Implement the specified task with production-quality code.
2. Follow best practices: error handling, types, edge cases.
3. Provide complete, runnable code with clear comments.
Output code in properly fenced markdown blocks with language tags.`,

  reviewer: `You are a thorough code reviewer. Your job is to:
1. Examine the provided work for bugs, security issues, and logical errors.
2. Check for missing edge cases, performance concerns, and code quality.
3. Provide specific, actionable feedback with suggested fixes.
Be critical but constructive. Point out both issues and strengths.`,

  synthesizer: `You are a synthesis agent. Your job is to:
1. Review all provided agent outputs.
2. Combine the best insights into a single, coherent, well-structured response.
3. Resolve any contradictions between agents.
4. Produce a polished final answer that directly addresses the original goal.
Output clean markdown. Include code only if necessary for the final answer.`,
};

// ---------------------------------------------------------------------------
// Conversation adapter helpers
// ---------------------------------------------------------------------------

/** Build the initial message for a sub-agent given its role and context. */
export function buildAgentMessage(
  _role: AgentRole,
  task: AgentTask,
  priorResults: AgentResult[]
): MessageParam[] {
  const messages: MessageParam[] = [];

  // Inject prior results as context for dependent tasks
  if (priorResults.length > 0) {
    const context = priorResults
      .map((r) => `### ${r.role} output (task: ${r.taskId})\n${r.output}`)
      .join("\n\n");
    messages.push({
      role: "user",
      content: `Here is context from previous agents:\n\n${context}`,
    });
    messages.push({
      role: "assistant",
      content: "Understood. I have reviewed the context from the previous agents.",
    });
  }

  messages.push({
    role: "user",
    content: task.prompt,
  });

  return messages;
}
