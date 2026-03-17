/**
 * Multi-agent commands: ai agent <subcommand>
 *
 * Subcommands:
 *   ai agent run <task>     — Orchestrate multiple agents to complete a complex task
 *   ai agent roles          — List available agent roles and their descriptions
 *   ai agent solo <role>    — Run a single agent with a specific role
 */

import type { Command } from "commander";
import { text } from "@clack/prompts";
import { orchestrate, runSingleAgent } from "../agents/orchestrator.js";
import { AGENT_ROLE_DESCRIPTIONS, ROLE_SYSTEM_PROMPTS } from "../agents/types.js";
import type { AgentRole, AgentEvent } from "../agents/types.js";
import { theme, icons, formatHeader, formatError } from "../ui/theme.js";
import { renderMarkdown } from "../ui/output.js";
import { createSpinner } from "../ui/spinner.js";

const ROLE_ICONS: Record<AgentRole, string> = {
  researcher:  "🔍",
  planner:     "📋",
  coder:       "💻",
  reviewer:    "🔎",
  synthesizer: "✨",
};

function roleLabel(role: AgentRole): string {
  return `${ROLE_ICONS[role]} ${theme.bold(role)}`;
}

export function registerAgentCommand(program: Command): void {
  const agent = program
    .command("agent")
    .description("Multi-agent coordination — complex tasks solved by specialized AI agents");

  // ── run ───────────────────────────────────────────────────────────────────
  agent
    .command("run [task...]")
    .description("Decompose and solve a complex task using multiple specialized agents")
    .option("--no-stream", "Buffer all output (don't stream in real time)")
    .option("--show-plan", "Print the execution plan before starting")
    .action(async (taskWords: string[], opts: { stream: boolean; showPlan: boolean }) => {
      let goal = taskWords.join(" ").trim();

      // Interactive prompt if no task given
      if (!goal) {
        const input = await text({
          message: "Describe the task for the agents:",
          placeholder: "e.g. build a REST API with rate limiting and write tests for it",
        });
        if (!input || typeof input !== "string") {
          console.log(theme.muted("Cancelled.\n"));
          return;
        }
        goal = input;
      }

      console.log(formatHeader("Multi-Agent Run"));
      console.log(
        `  ${theme.muted("Goal:")} ${goal}\n` +
        `  ${theme.muted("Agents will collaborate to research, plan, implement, review, and synthesize.\n")}`
      );

      const spinner = createSpinner("Planning task decomposition…");
      spinner.start();

      const activeTask = { id: "", role: "" as AgentRole };
      let planShown = false;

      const handler = (event: AgentEvent): void => {
        switch (event.type) {
          case "plan_ready": {
            spinner.stop();
            const plan = event.plan;
            if (opts.showPlan || true) { // always show plan for transparency
              console.log(`  ${theme.muted("Execution mode:")} ${theme.secondary(plan.executionMode)}`);
              console.log(`  ${theme.muted("Tasks:")} ${plan.tasks.length}\n`);
              for (const t of plan.tasks) {
                const deps = t.dependsOn?.length
                  ? theme.muted(` ← depends on: ${t.dependsOn.join(", ")}`)
                  : "";
                console.log(`    ${theme.dim(t.id)}  ${roleLabel(t.role)}${deps}`);
                console.log(`         ${theme.muted(t.prompt.slice(0, 80))}${t.prompt.length > 80 ? "…" : ""}`);
              }
              console.log();
              planShown = true;
            }
            break;
          }

          case "task_start": {
            if (!planShown) spinner.stop();
            activeTask.id = event.taskId;
            activeTask.role = event.role;
            const header =
              `\n${"─".repeat(50)}\n` +
              `  ${roleLabel(event.role)}  ${theme.dim(`[${event.taskId}]`)}\n` +
              `${"─".repeat(50)}\n`;
            process.stdout.write(theme.muted(header));
            break;
          }

          case "task_delta": {
            if (opts.stream) {
              process.stdout.write(event.delta);
            }
            break;
          }

          case "task_done": {
            const r = event.result;
            if (!opts.stream) {
              // Print buffered output now
              process.stdout.write(r.output);
            }
            const ms = r.durationMs > 1000
              ? `${(r.durationMs / 1000).toFixed(1)}s`
              : `${r.durationMs}ms`;
            console.log(
              `\n${theme.muted(`  ✔ done in ${ms}  ` +
              `(${r.usage.inputTokens}→${r.usage.outputTokens} tokens)`)}\n`
            );
            break;
          }

          case "final_start": {
            const sep =
              `\n${"═".repeat(50)}\n` +
              `  ${icons.sparkle} ${theme.heading("Final Answer")}\n` +
              `${"═".repeat(50)}\n`;
            process.stdout.write(sep);
            break;
          }

          case "final_delta": {
            process.stdout.write(event.delta);
            break;
          }

          case "done": {
            const r = event.result;
            const totalSec = (r.totalDurationMs / 1000).toFixed(1);
            const totalTokens = r.totalUsage.inputTokens + r.totalUsage.outputTokens;
            console.log(
              `\n${theme.muted(`  Completed in ${totalSec}s · ${r.results.length} agents · ${totalTokens} tokens total`)}\n`
            );
            break;
          }
        }
      };

      try {
        await orchestrate(goal, handler);
      } catch (err) {
        spinner.stop();
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── roles ─────────────────────────────────────────────────────────────────
  agent
    .command("roles")
    .description("List available agent roles and their responsibilities")
    .action(() => {
      console.log(formatHeader("Agent Roles"));
      for (const [role, desc] of Object.entries(AGENT_ROLE_DESCRIPTIONS)) {
        const icon = ROLE_ICONS[role as AgentRole];
        console.log(`  ${icon} ${theme.bold(role)}`);
        console.log(`     ${theme.muted(desc)}`);
        console.log();
      }
      console.log(
        theme.muted("  Roles are assigned automatically by the planner.\n") +
        theme.muted("  Use: ai agent solo <role> to run a single agent.\n")
      );
    });

  // ── solo ──────────────────────────────────────────────────────────────────
  agent
    .command("solo <role> [task...]")
    .description("Run a single agent with a specific role (no orchestration overhead)")
    .action(async (roleArg: string, taskWords: string[]) => {
      const validRoles = Object.keys(AGENT_ROLE_DESCRIPTIONS) as AgentRole[];
      if (!validRoles.includes(roleArg as AgentRole)) {
        console.error(formatError(`Unknown role "${roleArg}". Valid roles: ${validRoles.join(", ")}`));
        process.exit(1);
      }
      const role = roleArg as AgentRole;
      let prompt = taskWords.join(" ").trim();

      if (!prompt) {
        const input = await text({
          message: `Task for the ${role} agent:`,
          placeholder: ROLE_SYSTEM_PROMPTS[role].split("\n")[0],
        });
        if (!input || typeof input !== "string") {
          console.log(theme.muted("Cancelled.\n"));
          return;
        }
        prompt = input;
      }

      console.log(
        `\n  ${roleLabel(role)}\n` +
        `  ${theme.muted(AGENT_ROLE_DESCRIPTIONS[role])}\n` +
        `${"─".repeat(50)}\n`
      );

      const spinner = createSpinner(`${role} agent thinking…`);
      spinner.start();
      let started = false;

      try {
        const result = await runSingleAgent(role, prompt, (delta) => {
          if (!started) {
            spinner.stop();
            started = true;
          }
          process.stdout.write(delta);
        });

        if (!started) {
          spinner.stop();
          process.stdout.write(renderMarkdown(result.output));
        }

        const ms = result.durationMs > 1000
          ? `${(result.durationMs / 1000).toFixed(1)}s`
          : `${result.durationMs}ms`;
        console.log(
          `\n${theme.muted(`  ✔ ${ms} · ${result.usage.inputTokens}→${result.usage.outputTokens} tokens`)}\n`
        );
      } catch (err) {
        spinner.stop();
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // Help footer
  agent.addHelpText(
    "after",
    `\n${theme.muted("How it works:")}\n` +
    `  1. Planner decomposes your goal into specialized sub-tasks\n` +
    `  2. Agents run in parallel or sequentially based on dependencies\n` +
    `  3. Synthesizer combines all outputs into a final answer\n` +
    `\n${theme.muted("Examples:")}\n` +
    `  ${theme.secondary("$")} ai agent run "build a REST API with rate limiting and tests"\n` +
    `  ${theme.secondary("$")} ai agent run "review my PR and suggest improvements"\n` +
    `  ${theme.secondary("$")} ai agent solo coder "implement a LRU cache in TypeScript"\n` +
    `  ${theme.secondary("$")} ai agent roles\n`
  );
}
