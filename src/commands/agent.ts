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
import { theme, formatHeader, formatError, formatSuccess } from "../ui/theme.js";
import { renderMarkdown } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";
import { AgentBoard } from "../ui/agent-board.js";

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

  // ── help footer ───────────────────────────────────────────────────────────
  agent.addHelpText(
    "after",
    `\n${theme.muted("Quick start:")}\n` +
    `  ${theme.secondary("$")} ai agent run "build a REST API with tests"             # auto-plan\n` +
    `  ${theme.secondary("$")} ai agent solo coder "implement LRU cache"              # single agent\n` +
    `  ${theme.secondary("$")} ai agent create data-analyst                           # custom agent\n` +
    `  ${theme.secondary("$")} ai agent org show                                      # org chart\n` +
    `  ${theme.secondary("$")} ai agent org run TechCorp "analyze sales data"         # team run\n` +
    `  ${theme.secondary("$")} ai agent workflow template research-code-review > wf.json\n` +
    `  ${theme.secondary("$")} ai agent workflow run research-code-review "my task"   # workflow\n` +
    `  ${theme.secondary("$")} ai agent roles                                         # see all agents\n`
  );
}
