/**
 * Multi-agent commands: ai agent <subcommand>
 *
 * Built-in:
 *   ai agent run [task]          — Auto-plan: LLM decomposes and executes
 *   ai agent roles               — List all roles (built-in + custom)
 *   ai agent solo <role> [task]  — Run a single agent directly
 *
 * Custom agent management:
 *   ai agent create [name]       — Define a custom agent role
 *   ai agent edit <name>         — Edit an existing custom agent
 *   ai agent show <name>         — Print system prompt + metadata
 *   ai agent remove <name>       — Delete a custom agent
 *   ai agent export <name>       — Print portable JSON
 *   ai agent import <file>       — Import from JSON file
 *
 * Workflow management:
 *   ai agent workflow list              — List saved workflows
 *   ai agent workflow run <name|file>   — Execute a saved workflow
 *   ai agent workflow save <file>       — Save a workflow JSON file
 *   ai agent workflow remove <name>     — Delete a saved workflow
 *   ai agent workflow template [name]   — Show / scaffold a built-in template
 */

import type { Command } from "commander";
import { text, confirm } from "@clack/prompts";
import { readFileSync } from "fs";
import { orchestrate, runSingleAgent, runWorkflow, runOrgUnit } from "../agents/orchestrator.js";
import { AGENT_ROLE_DESCRIPTIONS, ROLE_SYSTEM_PROMPTS } from "../agents/types.js";
import type { AgentRoleName, AgentEvent, AgentPlan } from "../agents/types.js";
import {
  listCustomAgents,
  getCustomAgent,
  createCustomAgent,
  updateCustomAgent,
  removeCustomAgent,
  exportCustomAgent,
  importCustomAgent,
  allRoleNames,
} from "../agents/custom.js";
import {
  listWorkflows,
  getWorkflow,
  saveWorkflow,
  removeWorkflow,
  loadWorkflowFile,
  instantiateWorkflow,
  listWorkflowTemplates,
  getWorkflowTemplate,
} from "../agents/workflow.js";
import {
  renderOrgChart,
  listAllCompanies,
  listDepartments,
  getOrgStats,
} from "../agents/org.js";
import { theme, formatHeader, formatError, formatSuccess } from "../theme/index.js";
import { renderMarkdown } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";
import { AgentBoard } from "../ui/agent-board.js";
import {
  addMemory,
  getMemories,
  clearMemories,
  distillMemories,
  getAllMemoryStats,
  getMemoryStats,
  listAgentsWithMemory,
  addSharedMemory,
  getSharedMemories,
  clearSharedMemory,
  MEMORY_TYPE_DESCRIPTIONS,
} from "../agents/memory.js";
import type { MemoryType } from "../agents/memory.js";
import {
  conductMeeting,
  createMeetingConfig,
  listMeetings,
  removeMeeting,
  MEETING_MODE_DESCRIPTIONS,
} from "../agents/meeting.js";
import type { MeetingMode, MeetingParticipant } from "../agents/meeting.js";
import { MeetingBoard } from "../ui/meeting-board.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BUILTIN_ROLE_ICONS: Record<string, string> = {
  researcher:  "🔍",
  planner:     "📋",
  coder:       "💻",
  reviewer:    "🔎",
  synthesizer: "✨",
};

function roleIcon(role: AgentRoleName): string {
  return BUILTIN_ROLE_ICONS[role] ?? "🤖";
}

function roleLabel(role: AgentRoleName): string {
  return `${roleIcon(role)} ${theme.bold(role)}`;
}

/**
 * Create a visual event handler using AgentBoard for live status display.
 * Falls back to plain text when not in a TTY.
 */
function makeVisualHandler(goal: string, plan: AgentPlan): {
  board: AgentBoard;
  handler: (event: AgentEvent) => void;
} {
  const board = new AgentBoard(goal, plan.executionMode);
  const startTimes = new Map<string, number>();

  // Prime the board with all tasks
  board.init(plan.tasks.map((t) => ({
    id: t.id,
    role: t.role,
    icon: roleIcon(t.role),
  })));

  const handler = (event: AgentEvent): void => {
    switch (event.type) {
      case "task_start":
        startTimes.set(event.taskId, Date.now());
        board.taskStart(event.taskId);
        break;
      case "task_delta":
        board.taskDelta(event.taskId, event.delta);
        break;
      case "task_done": {
        const r = event.result;
        board.taskDone(r.taskId, r.usage.inputTokens + r.usage.outputTokens, r.durationMs);
        break;
      }
      case "done": {
        board.stop();
        // Print each agent's full output sequentially
        const r = event.result;
        for (const res of r.results) {
          console.log(
            `\n${"─".repeat(50)}\n` +
            `  ${roleLabel(res.role)}  ${theme.dim(`[${res.taskId}]`)}\n` +
            `${"─".repeat(50)}\n`
          );
          process.stdout.write(res.output);
          const ms = res.durationMs > 1000
            ? `${(res.durationMs / 1000).toFixed(1)}s`
            : `${res.durationMs}ms`;
          console.log(`\n${theme.muted(`  ✔ ${ms} · ${res.usage.inputTokens}→${res.usage.outputTokens} tokens`)}\n`);
        }
        const totalSec = (r.totalDurationMs / 1000).toFixed(1);
        const total = r.totalUsage.inputTokens + r.totalUsage.outputTokens;
        console.log(`\n${theme.muted(`  Completed in ${totalSec}s · ${r.results.length} agents · ${total} tokens`)}\n`);
        break;
      }
    }
  };

  return { board, handler };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerAgentCommand(program: Command): void {
  const agent = program
    .command("agent")
    .description("Multi-agent coordination — specialized AI agents working together");

  // ── run ───────────────────────────────────────────────────────────────────
  agent
    .command("run [task...]")
    .description("Auto-plan and execute a complex task using multiple specialized agents")
    .option("--no-stream", "Buffer all output instead of streaming")
    .action(async (taskWords: string[]) => {
      let goal = taskWords.join(" ").trim();
      if (!goal) {
        const input = await text({
          message: "Describe the task for the agents:",
          placeholder: "e.g. build a REST API with rate limiting and write tests",
        });
        if (!input || typeof input !== "string") { console.log(theme.muted("Cancelled.\n")); return; }
        goal = input;
      }

      console.log(formatHeader("Multi-Agent Run"));
      console.log(`  ${theme.muted("Goal:")} ${goal}\n`);

      const spinner = createSpinner("Planning task decomposition…");
      spinner.start();

      let board: AgentBoard | null = null;
      let visualHandler: ((event: AgentEvent) => void) | null = null;

      try {
        await orchestrate(goal, (event) => {
          if (event.type === "plan_ready") {
            spinner.stop();
            const v = makeVisualHandler(goal, event.plan);
            board = v.board;
            visualHandler = v.handler;
            // Show plan summary before board
            console.log(
              `  ${theme.muted("Mode:")} ${theme.secondary(event.plan.executionMode)}  ` +
              `${theme.muted("Tasks:")} ${event.plan.tasks.length}\n`
            );
            return;
          }
          if (visualHandler) visualHandler(event);
        });
      } catch (err) {
        if (board) (board as AgentBoard).stop();
        spinner.stop();
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── roles ─────────────────────────────────────────────────────────────────
  agent
    .command("roles")
    .description("List all available agent roles (built-in + custom)")
    .action(() => {
      console.log(formatHeader("Agent Roles"));

      console.log(`  ${theme.heading("Built-in roles")}\n`);
      for (const [role, desc] of Object.entries(AGENT_ROLE_DESCRIPTIONS)) {
        console.log(`  ${roleIcon(role)} ${theme.bold(role)}`);
        console.log(`     ${theme.muted(desc)}\n`);
      }

      const custom = listCustomAgents();
      if (custom.length > 0) {
        console.log(`  ${theme.heading("Custom agents")}\n`);
        for (const a of custom) {
          const tags = a.tags.length ? theme.muted(` [${a.tags.join(", ")}]`) : "";
          console.log(`  ${a.icon} ${theme.bold(a.name)}${tags}`);
          console.log(`     ${theme.muted(a.description)}\n`);
        }
      } else {
        console.log(theme.muted("  No custom agents defined yet."));
        console.log(theme.muted("  Run: ai agent create  to define one.\n"));
      }
    });

  // ── solo ──────────────────────────────────────────────────────────────────
  agent
    .command("solo <role> [task...]")
    .description("Run a single agent (built-in or custom) without orchestration")
    .action(async (roleArg: string, taskWords: string[], _opts: unknown) => {
      const validRoles = allRoleNames(Object.keys(AGENT_ROLE_DESCRIPTIONS));
      if (!validRoles.includes(roleArg)) {
        console.error(formatError(`Unknown role "${roleArg}". Run: ai agent roles`));
        process.exit(1);
      }
      let prompt = taskWords.join(" ").trim();
      if (!prompt) {
        const placeholder = ROLE_SYSTEM_PROMPTS[roleArg as keyof typeof ROLE_SYSTEM_PROMPTS]
          ?? getCustomAgent(roleArg)?.description ?? "";
        const input = await text({ message: `Task for the ${roleArg} agent:`, placeholder });
        if (!input || typeof input !== "string") { console.log(theme.muted("Cancelled.\n")); return; }
        prompt = input;
      }

      const desc = AGENT_ROLE_DESCRIPTIONS[roleArg as keyof typeof AGENT_ROLE_DESCRIPTIONS]
        ?? getCustomAgent(roleArg)?.description ?? "";
      console.log(`\n  ${roleLabel(roleArg)}\n  ${theme.muted(desc)}\n${"─".repeat(50)}\n`);

      const spinner = createSpinner(`${roleArg} agent thinking…`);
      spinner.start();
      let started = false;

      try {
        const result = await runSingleAgent(roleArg, prompt, (delta) => {
          if (!started) { spinner.stop(); started = true; }
          process.stdout.write(delta);
        });
        if (!started) { spinner.stop(); process.stdout.write(renderMarkdown(result.output)); }
        const ms = result.durationMs > 1000
          ? `${(result.durationMs / 1000).toFixed(1)}s`
          : `${result.durationMs}ms`;
        console.log(`\n${theme.muted(`  ✔ ${ms} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`)}\n`);
      } catch (err) {
        spinner.stop();
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── create ────────────────────────────────────────────────────────────────
  agent
    .command("create [name]")
    .description("Define a new custom agent role with a custom system prompt")
    .action(async (nameArg: string | undefined) => {
      const name = nameArg ?? String(await text({
        message: "Agent name (lowercase, hyphens OK):",
        placeholder: "data-analyst",
      }));
      if (!name) { console.log(theme.muted("Cancelled.\n")); return; }

      const description = String(await text({
        message: "Short description:",
        placeholder: "Analyzes data and finds trends",
      }));

      const icon = String(await text({
        message: "Icon (single emoji, optional):",
        placeholder: "📊",
      })) || "🤖";

      const tagsRaw = String(await text({
        message: "Tags (comma-separated, optional):",
        placeholder: "data, analytics",
      }));
      const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

      console.log(theme.muted("\n  Now write the system prompt for this agent."));
      console.log(theme.muted("  Describe its role, expertise, and output format.\n"));
      const systemPrompt = String(await text({
        message: "System prompt:",
        placeholder: "You are an expert data analyst...",
      }));
      if (!systemPrompt) { console.log(theme.muted("Cancelled.\n")); return; }

      try {
        const agent = createCustomAgent({ name, description, icon, tags, systemPrompt, mcpSkills: [] });
        console.log(formatSuccess(`Custom agent "${agent.name}" created.`));
        console.log(theme.muted(`  Use: ai agent solo ${agent.name} "<task>"`));
        console.log(theme.muted(`  The planner will also consider this agent for ai agent run.\n`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── edit ──────────────────────────────────────────────────────────────────
  agent
    .command("edit <name>")
    .description("Edit an existing custom agent's description or system prompt")
    .option("--description <text>", "New description")
    .option("--prompt <text>", "New system prompt")
    .option("--icon <emoji>", "New icon")
    .option("--tags <csv>", "New tags (comma-separated)")
    .action(async (name: string, opts: { description?: string; prompt?: string; icon?: string; tags?: string }) => {
      const existing = getCustomAgent(name);
      if (!existing) {
        console.error(formatError(`Custom agent "${name}" not found. Run: ai agent roles`));
        process.exit(1);
      }

      // If no flags given, run interactive wizard
      const fields: Parameters<typeof updateCustomAgent>[1] = {};

      if (opts.description) {
        fields.description = opts.description;
      } else {
        const v = String(await text({ message: "Description:", initialValue: existing.description }));
        if (v && v !== existing.description) fields.description = v;
      }

      if (opts.prompt) {
        fields.systemPrompt = opts.prompt;
      } else {
        console.log(theme.muted(`\n  Current system prompt:\n${theme.dim(existing.systemPrompt.slice(0, 200))}…\n`));
        const edit = await confirm({ message: "Edit the system prompt?" });
        if (edit) {
          const v = String(await text({ message: "New system prompt:", initialValue: existing.systemPrompt }));
          if (v) fields.systemPrompt = v;
        }
      }

      if (opts.icon) fields.icon = opts.icon;
      if (opts.tags) fields.tags = opts.tags.split(",").map((t) => t.trim()).filter(Boolean);

      try {
        const updated = updateCustomAgent(name, fields);
        console.log(formatSuccess(`Agent "${updated.name}" updated.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── show ──────────────────────────────────────────────────────────────────
  agent
    .command("show <name>")
    .description("Print a custom agent's full metadata and system prompt")
    .action((name: string) => {
      const a = getCustomAgent(name);
      if (!a) {
        // Try built-in
        if (name in ROLE_SYSTEM_PROMPTS) {
          const role = name as keyof typeof ROLE_SYSTEM_PROMPTS;
          console.log(formatHeader(`Agent: ${name}`));
          console.log(`  ${theme.muted("type:")}         built-in`);
          console.log(`  ${theme.muted("description:")}  ${AGENT_ROLE_DESCRIPTIONS[role]}\n`);
          console.log(theme.muted("System prompt:\n"));
          console.log(ROLE_SYSTEM_PROMPTS[role]);
          return;
        }
        console.error(formatError(`Agent "${name}" not found.`));
        process.exit(1);
      }
      console.log(formatHeader(`Agent: ${a.icon} ${a.name}`));
      console.log(`  ${theme.muted("description:")}  ${a.description}`);
      console.log(`  ${theme.muted("tags:")}         ${a.tags.join(", ") || "(none)"}`);
      console.log(`  ${theme.muted("model:")}        ${a.model ?? "(global config)"}`);
      console.log(`  ${theme.muted("created:")}      ${a.createdAt.slice(0, 10)}`);
      console.log(`  ${theme.muted("updated:")}      ${a.updatedAt.slice(0, 10)}\n`);
      console.log(theme.muted("System prompt:\n"));
      console.log(a.systemPrompt);
      console.log();
    });

  // ── remove ────────────────────────────────────────────────────────────────
  agent
    .command("remove <name>")
    .alias("rm")
    .description("Delete a custom agent")
    .action(async (name: string) => {
      const existing = getCustomAgent(name);
      if (!existing) {
        console.error(formatError(`Custom agent "${name}" not found.`));
        process.exit(1);
      }
      const ok = await confirm({ message: `Delete custom agent "${name}"?` });
      if (!ok) { console.log(theme.muted("Cancelled.\n")); return; }
      try {
        removeCustomAgent(name);
        console.log(formatSuccess(`Custom agent "${name}" removed.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── export ────────────────────────────────────────────────────────────────
  agent
    .command("export <name>")
    .description("Print a custom agent as portable JSON (pipe to a file to save)")
    .action((name: string) => {
      try {
        console.log(exportCustomAgent(name));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── import ────────────────────────────────────────────────────────────────
  agent
    .command("import <file>")
    .description("Import a custom agent from a JSON file")
    .action((file: string) => {
      try {
        const json = readFileSync(file, "utf-8");
        const agent = importCustomAgent(json);
        console.log(formatSuccess(`Imported agent "${agent.name}" v${agent.createdAt.slice(0, 10)}.`));
        console.log(theme.muted(`  Use: ai agent solo ${agent.name} "<task>"\n`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── workflow subcommand group ─────────────────────────────────────────────
  const workflow = agent
    .command("workflow")
    .description("Manage and run reusable agent workflows (parallel / sequential pipelines)");

  workflow
    .command("list")
    .alias("ls")
    .description("List saved workflows")
    .action(() => {
      const workflows = listWorkflows();
      console.log(formatHeader("Saved Workflows"));
      if (workflows.length === 0) {
        console.log(theme.muted("  No workflows saved yet.\n"));
        console.log(theme.muted("  Templates: " + listWorkflowTemplates().join(", ")));
        console.log(theme.muted("  Run: ai agent workflow template <name>  to create one\n"));
        return;
      }
      for (const wf of workflows) {
        const mode = wf.executionMode === "parallel"
          ? theme.secondary("⚡ parallel")
          : theme.muted("→ sequential");
        console.log(`  ${theme.bold(wf.name)}  ${mode}  ${theme.dim(`${wf.steps.length} steps`)}`);
        console.log(`     ${theme.muted(wf.description)}\n`);
      }
    });

  workflow
    .command("run <nameOrFile> [goal...]")
    .description("Execute a saved workflow (or a .json file) with a given goal")
    .action(async (nameOrFile: string, goalWords: string[]) => {
      let wf = getWorkflow(nameOrFile);
      if (!wf) {
        try { wf = loadWorkflowFile(nameOrFile); } catch {
          console.error(formatError(`Workflow "${nameOrFile}" not found. Run: ai agent workflow list`));
          process.exit(1);
        }
      }

      let goal = goalWords.join(" ").trim();
      if (!goal) {
        const input = await text({ message: "Goal for this workflow:", placeholder: "Describe what to accomplish" });
        if (!input || typeof input !== "string") { console.log(theme.muted("Cancelled.\n")); return; }
        goal = input;
      }

      const instantiated = instantiateWorkflow(wf, goal);
      console.log(formatHeader(`Workflow: ${wf.name}`));
      console.log(`  ${theme.muted(wf.description)}`);
      console.log(`  ${theme.muted("Goal:")} ${goal}\n`);

      let board: AgentBoard | null = null;
      let visualHandler: ((event: AgentEvent) => void) | null = null;

      try {
        await runWorkflow(instantiated, goal, (event) => {
          if (event.type === "plan_ready") {
            const v = makeVisualHandler(goal, event.plan);
            board = v.board;
            visualHandler = v.handler;
            return;
          }
          if (visualHandler) visualHandler(event);
        });
      } catch (err) {
        if (board) (board as AgentBoard).stop();
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  workflow
    .command("save <file>")
    .description("Register a workflow from a JSON file into the local workflow library")
    .action((file: string) => {
      try {
        const wf = loadWorkflowFile(file);
        const saved = saveWorkflow(wf);
        console.log(formatSuccess(`Workflow "${saved.name}" saved.`));
        console.log(theme.muted(`  Run: ai agent workflow run ${saved.name}\n`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  workflow
    .command("remove <name>")
    .alias("rm")
    .description("Delete a saved workflow")
    .action(async (name: string) => {
      const ok = await confirm({ message: `Delete workflow "${name}"?` });
      if (!ok) { console.log(theme.muted("Cancelled.\n")); return; }
      try {
        removeWorkflow(name);
        console.log(formatSuccess(`Workflow "${name}" removed.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  workflow
    .command("template [name]")
    .description("List built-in workflow templates, or print one as JSON to customize")
    .action((name: string | undefined) => {
      if (!name) {
        console.log(formatHeader("Workflow Templates"));
        for (const tmpl of listWorkflowTemplates()) {
          const t = getWorkflowTemplate(tmpl)!;
          console.log(`  ${theme.bold(tmpl)}`);
          console.log(`     ${theme.muted(t.description)}`);
          console.log(`     ${theme.muted(`${t.steps.length} steps · ${t.executionMode}`)}\n`);
        }
        console.log(theme.muted("  Scaffold: ai agent workflow template <name> > my-workflow.json\n"));
        return;
      }
      const tmpl = getWorkflowTemplate(name);
      if (!tmpl) {
        console.error(formatError(`Template "${name}" not found. Options: ${listWorkflowTemplates().join(", ")}`));
        process.exit(1);
      }
      const wf = { ...tmpl, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      console.log(JSON.stringify(wf, null, 2));
    });

  // ── org subcommand group ──────────────────────────────────────────────────
  const org = agent
    .command("org")
    .description("Manage organizational structure — companies, departments, and reporting lines");

  org
    .command("show [company]")
    .description("Display the org chart (all companies, or a specific one)")
    .option("--desc", "Show agent descriptions")
    .action((company: string | undefined, opts: { desc: boolean }) => {
      const companies = company ? [company] : listAllCompanies();
      if (companies.length === 0) {
        console.log(theme.muted("  No organizations defined yet.\n"));
        console.log(theme.muted("  Run: ai agent create  and set --company/--department\n"));
        return;
      }
      console.log(formatHeader("Organizations"));
      for (const co of companies) {
        const chart = renderOrgChart(co, { showDescription: opts.desc });
        console.log(chart);
        const stats = getOrgStats(co);
        console.log(
          theme.muted(
            `  ${stats.totalAgents} agents · ${stats.departments} depts · ` +
            (stats.hasHierarchy ? "hierarchical" : "flat") + "\n"
          )
        );
      }
    });

  org
    .command("run <company> [goal...]")
    .description("Run all agents in a company (or department with --dept) as a coordinated team")
    .option("--dept <department>", "Scope to a specific department")
    .action(async (company: string, goalWords: string[], opts: { dept?: string }) => {
      let goal = goalWords.join(" ").trim();
      if (!goal) {
        const input = await text({ message: "Goal for the team:", placeholder: "What should the organization accomplish?" });
        if (!input || typeof input !== "string") { console.log(theme.muted("Cancelled.\n")); return; }
        goal = input;
      }

      const scope = opts.dept ? `${company} / ${opts.dept}` : company;
      console.log(formatHeader(`Org Run: ${scope}`));
      console.log(`  ${theme.muted("Goal:")} ${goal}\n`);

      let board: AgentBoard | null = null;
      let visualHandler: ((event: AgentEvent) => void) | null = null;

      try {
        await runOrgUnit(company, opts.dept, goal, (event) => {
          if (event.type === "plan_ready") {
            const v = makeVisualHandler(goal, event.plan);
            board = v.board;
            visualHandler = v.handler;
            return;
          }
          if (visualHandler) visualHandler(event);
        });
      } catch (err) {
        if (board) (board as AgentBoard).stop();
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  org
    .command("list")
    .description("List all companies with agents defined")
    .action(() => {
      const companies = listAllCompanies();
      if (companies.length === 0) {
        console.log(theme.muted("  No organizations defined.\n"));
        return;
      }
      console.log(formatHeader("Organizations"));
      for (const co of companies) {
        const depts = listDepartments(co);
        const stats = getOrgStats(co);
        console.log(`  🏢 ${theme.bold(co)}`);
        if (depts.length) {
          console.log(`     ${theme.muted("Departments:")} ${depts.join(", ")}`);
        }
        console.log(`     ${theme.muted(`${stats.totalAgents} agents · ${stats.hasHierarchy ? "hierarchical" : "flat"}`)}\n`);
      }
    });

  // ── memory ────────────────────────────────────────────────────────────────
  const memory = agent
    .command("memory")
    .description("Manage per-agent and shared memory");

  memory
    .command("list [agent]")
    .description("List memories for an agent (or all agents if no name given)")
    .option("--type <type>", "Filter by type: episodic|semantic|procedural|working")
    .option("--min-importance <n>", "Minimum importance score (0-10)", "0")
    .option("--limit <n>", "Max entries to show", "20")
    .action((agentName: string | undefined, opts: { type?: string; minImportance: string; limit: string }) => {
      const agents = agentName ? [agentName] : listAgentsWithMemory();
      if (agents.length === 0) {
        console.log(theme.muted("  No agent memories found.\n"));
        return;
      }
      for (const name of agents) {
        const entries = getMemories(name, {
          type: opts.type as MemoryType | undefined,
          minImportance: parseInt(opts.minImportance, 10),
          limit: parseInt(opts.limit, 10),
        });
        const stats = getMemoryStats(name);
        const header = name === "shared" ? "🧠 Shared Memory" : `🧠 ${name} Memory`;
        console.log(formatHeader(header));
        console.log(`  ${theme.muted(`${stats.total} total · avg importance ${stats.avgImportance.toFixed(1)}`)}${stats.lastDistilledAt ? ` · distilled ${new Date(stats.lastDistilledAt).toLocaleDateString()}` : ""}\n`);
        if (entries.length === 0) {
          console.log(theme.muted("  No memories match the filter.\n"));
          continue;
        }
        for (const e of entries) {
          const typeTag = `[${e.type}]`;
          const imp = `★${e.importance}`;
          console.log(`  ${theme.dim(typeTag)} ${theme.dim(imp)}  ${e.summary ?? e.content.slice(0, 80)}`);
          if (e.tags.length) console.log(`    ${theme.muted(e.tags.map((t) => `#${t}`).join(" "))}`);
        }
        console.log();
      }
    });

  memory
    .command("add <agent> <content>")
    .description("Manually add a memory entry for an agent")
    .option("--type <type>", "Memory type: episodic|semantic|procedural|working", "episodic")
    .option("--importance <n>", "Importance score 0-10", "5")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--summary <summary>", "Short one-line summary")
    .action((agentName: string, content: string, opts: { type: string; importance: string; tags?: string; summary?: string }) => {
      const entry = addMemory(agentName, content, opts.type as MemoryType, {
        importance: parseInt(opts.importance, 10),
        tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [],
        summary: opts.summary,
      });
      console.log(formatSuccess(`Memory added to ${agentName} [${entry.id.slice(0, 8)}]`));
    });

  memory
    .command("search <query> [agent]")
    .description("Search memories by keyword (all agents or specific agent)")
    .option("--limit <n>", "Max results", "10")
    .action((query: string, agentName: string | undefined, opts: { limit: string }) => {
      const agents = agentName ? [agentName] : ["shared", ...listAgentsWithMemory()];
      let found = 0;
      for (const name of agents) {
        const results = getMemories(name, { query, limit: parseInt(opts.limit, 10) });
        if (results.length === 0) continue;
        console.log(formatHeader(name === "shared" ? "🧠 Shared Memory" : `🧠 ${name}`));
        for (const e of results) {
          console.log(`  ${theme.dim(`[${e.type}]`)} ${e.summary ?? e.content.slice(0, 100)}`);
          if (e.tags.length) console.log(`    ${theme.muted(e.tags.map((t) => `#${t}`).join(" "))}`);
        }
        console.log();
        found += results.length;
      }
      if (found === 0) console.log(theme.muted(`  No memories matching "${query}"\n`));
    });

  memory
    .command("distill [agent]")
    .description("Use AI to compress and distill memories (removes working memories, summarizes old ones)")
    .action(async (agentName: string | undefined) => {
      const agents = agentName ? [agentName] : listAgentsWithMemory();
      if (agents.length === 0) {
        console.log(theme.muted("  No agents with memories found.\n"));
        return;
      }
      for (const name of agents) {
        const spinner = createSpinner(`Distilling memories for ${name}...`);
        spinner.start();
        try {
          const result = await distillMemories(name);
          spinner.succeed(formatSuccess(`${name}: ${result.summary}`));
        } catch (err) {
          spinner.fail(formatError(String(err)));
        }
      }
    });

  memory
    .command("clear [agent]")
    .description("Clear all memories for an agent (or all agents)")
    .option("--shared", "Clear the shared memory pool instead")
    .action(async (agentName: string | undefined, opts: { shared?: boolean }) => {
      if (opts.shared) {
        const confirmed = await confirm({ message: "Clear ALL shared memories? This cannot be undone." });
        if (!confirmed) { console.log(theme.muted("Cancelled.\n")); return; }
        const n = clearSharedMemory();
        console.log(formatSuccess(`Cleared ${n} shared memories.`));
        return;
      }
      const agents = agentName ? [agentName] : listAgentsWithMemory();
      if (agents.length === 0) { console.log(theme.muted("  No agent memories found.\n")); return; }
      const confirmed = await confirm({
        message: agentName
          ? `Clear all memories for "${agentName}"?`
          : `Clear memories for ALL ${agents.length} agents?`,
      });
      if (!confirmed) { console.log(theme.muted("Cancelled.\n")); return; }
      let total = 0;
      for (const name of agents) total += clearMemories(name);
      console.log(formatSuccess(`Cleared ${total} memories.`));
    });

  memory
    .command("shared")
    .description("Show the shared memory pool accessible to all agents")
    .option("--query <q>", "Filter by keyword")
    .option("--limit <n>", "Max entries", "20")
    .action((opts: { query?: string; limit: string }) => {
      const entries = getSharedMemories({ query: opts.query, limit: parseInt(opts.limit, 10) });
      const stats = getMemoryStats("shared");
      console.log(formatHeader("🧠 Shared Memory Pool"));
      console.log(`  ${theme.muted(`${stats.total} entries · avg importance ${stats.avgImportance.toFixed(1)}`)}\n`);
      if (entries.length === 0) {
        console.log(theme.muted("  Shared memory is empty.\n"));
        return;
      }
      for (const e of entries) {
        const from = e.tags.find((t) => t.startsWith("from:"))?.slice(5) ?? "";
        console.log(`  ${from ? theme.dim(`[${from}]`) : theme.dim("[shared]")} ${e.summary ?? e.content.slice(0, 100)}`);
        if (e.tags.filter((t) => !t.startsWith("from:")).length) {
          console.log(`    ${theme.muted(e.tags.filter((t) => !t.startsWith("from:")).map((t) => `#${t}`).join(" "))}`);
        }
      }
      console.log();
    });

  memory
    .command("add-shared <content>")
    .description("Manually add an entry to the shared memory pool")
    .option("--importance <n>", "Importance score 0-10", "5")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--contributor <name>", "Attribute this memory to an agent")
    .action((content: string, opts: { importance: string; tags?: string; contributor?: string }) => {
      const entry = addSharedMemory(content, {
        importance: parseInt(opts.importance, 10),
        tags: opts.tags ? opts.tags.split(",").map((t) => t.trim()) : [],
        contributor: opts.contributor,
      });
      console.log(formatSuccess(`Added to shared memory [${entry.id.slice(0, 8)}]`));
    });

  memory
    .command("stats")
    .description("Show memory statistics across all agents")
    .action(() => {
      const allStats = getAllMemoryStats();
      if (allStats.length === 0) {
        console.log(theme.muted("  No memories stored.\n"));
        return;
      }
      console.log(formatHeader("🧠 Memory Statistics"));
      const typeKeys = Object.keys(MEMORY_TYPE_DESCRIPTIONS) as MemoryType[];
      // Header row
      const col = (s: string, w: number) => s.slice(0, w).padEnd(w);
      console.log(`  ${col("Agent", 20)} ${col("Total", 6)} ${typeKeys.map((t) => col(t.slice(0, 7), 8)).join(" ")} Avg★`);
      console.log(`  ${"─".repeat(20)} ${"─".repeat(6)} ${typeKeys.map(() => "─".repeat(8)).join(" ")} ──────`);
      for (const s of allStats) {
        console.log(
          `  ${col(s.agentName, 20)} ${col(String(s.total), 6)} ${typeKeys.map((t) => col(String(s.byType[t]), 8)).join(" ")} ${s.avgImportance.toFixed(1)}`
        );
      }
      console.log();
    });

  // ── meet ──────────────────────────────────────────────────────────────────
  const meet = agent
    .command("meet")
    .description("Conduct structured multi-agent meetings and dialogues");

  meet
    .command("start [topic...]")
    .description("Start a new meeting between agents")
    .option("--participants <names>", "Comma-separated agent names/roles (default: researcher,planner,synthesizer)")
    .option("--mode <mode>", "Meeting mode: roundtable|debate|brainstorm|review", "roundtable")
    .option("--rounds <n>", "Number of discussion rounds", "2")
    .option("--no-memory", "Disable memory injection")
    .option("--no-save-memory", "Don't save insights to shared memory after meeting")
    .action(async (
      topicWords: string[],
      opts: { participants?: string; mode: string; rounds: string; memory: boolean; saveMemory: boolean }
    ) => {
      let topic = topicWords.join(" ").trim();
      if (!topic) {
        const input = await text({ message: "Meeting topic:", placeholder: "What should the agents discuss?" });
        if (!input || typeof input !== "string") { console.log(theme.muted("Cancelled.\n")); return; }
        topic = input;
      }

      const participantNames = opts.participants
        ? opts.participants.split(",").map((n) => n.trim())
        : ["researcher", "planner", "synthesizer"];

      const participants: MeetingParticipant[] = participantNames.map((name) => {
        const customNames = allRoleNames(Object.keys(BUILTIN_ROLE_ICONS));
        const custom = customNames.includes(name)
          ? { icon: "🤖" }
          : { icon: BUILTIN_ROLE_ICONS[name] ?? "🤖" };
        return { name, role: name, icon: custom.icon };
      });

      const config = createMeetingConfig({
        topic,
        participants,
        mode: opts.mode as MeetingMode,
        rounds: parseInt(opts.rounds, 10),
        useMemory: opts.memory,
        saveToSharedMemory: opts.saveMemory,
      });

      const board = new MeetingBoard(config);
      const handler = board.makeEventHandler();

      try {
        await conductMeeting(config, handler);
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  meet
    .command("list")
    .description("List past meeting transcripts")
    .option("--limit <n>", "Max entries to show", "10")
    .action((opts: { limit: string }) => {
      const meetings = listMeetings(parseInt(opts.limit, 10));
      if (meetings.length === 0) {
        console.log(theme.muted("  No past meetings found.\n"));
        return;
      }
      console.log(formatHeader("Past Meetings"));
      for (const m of meetings) {
        const date = new Date(m.startedAt).toLocaleString();
        const dur = m.endedAt
          ? `${Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 1000)}s`
          : "in-progress";
        const parts = m.config.participants.map((p) => p.name).join(", ");
        console.log(`  ${theme.dim(m.config.id.slice(0, 8))}  ${theme.bold(m.config.topic.slice(0, 50))}`);
        console.log(`    ${theme.muted(`${date} · ${m.config.mode} · ${dur} · ${m.totalTokens} tokens`)}`);
        console.log(`    ${theme.muted(`Participants: ${parts}`)}\n`);
      }
    });

  meet
    .command("show <id>")
    .description("Show the full transcript of a meeting")
    .option("--summary", "Show summary only")
    .action((id: string, opts: { summary?: boolean }) => {
      // allow short prefix match
      const all = listMeetings(100);
      const found = all.find((m) => m.config.id === id || m.config.id.startsWith(id));
      if (!found) {
        console.log(formatError(`No meeting found with ID "${id}"`));
        return;
      }
      console.log(formatHeader(`Meeting: ${found.config.topic}`));
      console.log(`  ${theme.muted(`${found.config.mode} · ${found.config.rounds} rounds · ${found.totalTokens} tokens`)}`);
      console.log(`  ${theme.muted(`Participants: ${found.config.participants.map((p) => `${p.icon ?? "🤖"} ${p.name}`).join("  ")}\n`)}`);

      if (opts.summary) {
        if (found.summary) {
          console.log(theme.bold("Summary:"));
          renderMarkdown(found.summary);
        } else {
          console.log(theme.muted("  No summary available.\n"));
        }
        return;
      }

      // Full transcript
      for (const turn of found.turns) {
        const p = found.config.participants.find((x) => x.name === turn.participantName);
        const icon = p?.icon ?? "🤖";
        const ts = new Date(turn.timestamp).toLocaleTimeString();
        console.log(`\n${icon} ${theme.bold(turn.participantName)} ${theme.muted(ts)}`);
        console.log("─".repeat(50));
        process.stdout.write(turn.content + "\n");
        if (turn.tokensUsed) {
          console.log(theme.muted(`  ${turn.tokensUsed} tokens · ${(turn.durationMs ?? 0) > 1000 ? `${((turn.durationMs ?? 0) / 1000).toFixed(1)}s` : `${turn.durationMs ?? 0}ms`}`));
        }
      }

      if (found.summary) {
        console.log(`\n${"═".repeat(50)}`);
        console.log(theme.bold("Meeting Summary:"));
        renderMarkdown(found.summary);
      }
    });

  meet
    .command("remove <id>")
    .description("Delete a meeting transcript")
    .action(async (id: string) => {
      const all = listMeetings(100);
      const found = all.find((m) => m.config.id === id || m.config.id.startsWith(id));
      if (!found) {
        console.log(formatError(`No meeting found with ID "${id}"`));
        return;
      }
      const confirmed = await confirm({ message: `Delete meeting "${found.config.topic.slice(0, 50)}"?` });
      if (!confirmed) { console.log(theme.muted("Cancelled.\n")); return; }
      removeMeeting(found.config.id);
      console.log(formatSuccess("Meeting transcript deleted."));
    });

  meet
    .command("modes")
    .description("List available meeting modes")
    .action(() => {
      console.log(formatHeader("Meeting Modes"));
      for (const [mode, desc] of Object.entries(MEETING_MODE_DESCRIPTIONS)) {
        console.log(`  ${theme.bold(mode.padEnd(12))}  ${desc}`);
      }
      console.log();
    });

  // ── help footer ───────────────────────────────────────────────────────────
  agent.addHelpText(
    "after",
    `\n${theme.muted("Quick start:")}\n` +
    `  ${theme.secondary("$")} ai agent run "build a REST API with tests"             # auto-plan\n` +
    `  ${theme.secondary("$")} ai agent solo coder "implement LRU cache"              # single agent\n` +
    `  ${theme.secondary("$")} ai agent create data-analyst                           # custom agent\n` +
    `  ${theme.secondary("$")} ai agent meet start "design a microservices arch"      # meeting\n` +
    `  ${theme.secondary("$")} ai agent meet start --participants "cto,cfo" --mode debate\n` +
    `  ${theme.secondary("$")} ai agent memory list                                   # all memories\n` +
    `  ${theme.secondary("$")} ai agent memory distill researcher                     # compress memories\n` +
    `  ${theme.secondary("$")} ai agent memory shared                                 # shared pool\n` +
    `  ${theme.secondary("$")} ai agent org show                                      # org chart\n` +
    `  ${theme.secondary("$")} ai agent workflow run research-code-review "my task"   # workflow\n` +
    `  ${theme.secondary("$")} ai agent roles                                         # see all agents\n`
  );
}
