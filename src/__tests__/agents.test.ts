// Vitest globals are provided
import {
  AGENT_ROLE_DESCRIPTIONS,
  ROLE_SYSTEM_PROMPTS,
  buildAgentMessage,
} from "../agents/types.js";
import type { AgentRole, AgentTask, AgentResult } from "../agents/types.js";

const ALL_ROLES: AgentRole[] = [
  "researcher",
  "planner",
  "coder",
  "reviewer",
  "synthesizer",
];

describe("Agent role definitions", () => {
  it("has descriptions for all 5 roles", () => {
    for (const role of ALL_ROLES) {
      expect(AGENT_ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });

  it("has system prompts for all 5 roles", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_SYSTEM_PROMPTS[role]).toBeTruthy();
    }
  });

  it("role descriptions are non-empty strings", () => {
    for (const role of ALL_ROLES) {
      expect(typeof AGENT_ROLE_DESCRIPTIONS[role]).toBe("string");
      expect(AGENT_ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(10);
    }
  });
});

describe("buildAgentMessage", () => {
  const task: AgentTask = { id: "t1", role: "coder", prompt: "Write a hello world function" };

  it("produces a user message with the task prompt", () => {
    const msgs = buildAgentMessage("coder", task, []);
    const last = msgs[msgs.length - 1];
    expect(last?.role).toBe("user");
    expect(last?.content).toContain("hello world");
  });

  it("with no priorResults returns exactly 1 message", () => {
    const msgs = buildAgentMessage("coder", task, []);
    expect(msgs).toHaveLength(1);
  });

  it("with priorResults injects context as first exchange", () => {
    const prior: AgentResult[] = [
      {
        taskId: "t0",
        role: "researcher",
        output: "Context: the project uses Node.js",
        usage: { inputTokens: 10, outputTokens: 20 },
        durationMs: 100,
      },
    ];
    const msgs = buildAgentMessage("coder", task, prior);
    // user(context) + assistant(ack) + user(task) = 3
    expect(msgs).toHaveLength(3);
    expect(msgs[0]?.role).toBe("user");
    expect(String(msgs[0]?.content)).toContain("Context: the project uses Node.js");
    expect(msgs[1]?.role).toBe("assistant");
    expect(msgs[2]?.role).toBe("user");
    expect(String(msgs[2]?.content)).toContain("hello world");
  });

  it("multiple prior results are all included in context", () => {
    const prior: AgentResult[] = [
      { taskId: "t0", role: "researcher", output: "Research output", usage: { inputTokens: 5, outputTokens: 5 }, durationMs: 50 },
      { taskId: "t1", role: "planner", output: "Plan output", usage: { inputTokens: 5, outputTokens: 5 }, durationMs: 50 },
    ];
    const msgs = buildAgentMessage("coder", task, prior);
    const context = String(msgs[0]?.content);
    expect(context).toContain("Research output");
    expect(context).toContain("Plan output");
  });
});
