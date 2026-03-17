/**
 * MCP Skill commands: ai mcp <subcommand>
 *
 * Subcommands:
 *   ai mcp list               — List installed skills
 *   ai mcp enable <name>      — Enable a skill (inject its tools into AI calls)
 *   ai mcp disable <name>     — Disable a skill
 *   ai mcp install <pkg|path> — Install skill from npm or local path
 *   ai mcp remove <name>      — Remove a non-builtin skill
 *   ai mcp search [query]     — Search the remote skill registry
 *   ai mcp run <tool> [args]  — Call a skill tool directly (debug / scripting)
 */

import type { Command } from "commander";
import {
  listSkills,
  enableSkill,
  disableSkill,
  removeSkill,
  installNpmSkill,
  installLocalSkill,
  dispatchToolCall,
  seedBuiltins,
} from "../mcp/manager.js";
import { searchRegistry, DEFAULT_REGISTRY_URL } from "../mcp/registry.js";
import { theme, formatHeader, formatError, formatSuccess } from "../ui/theme.js";
import { withSpinner } from "../ui/spinner.js";

export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command("mcp")
    .description("Manage MCP skills — downloadable tools that extend Claude's capabilities");

  // ── list ──────────────────────────────────────────────────────────────────
  mcp
    .command("list")
    .alias("ls")
    .description("List all installed skills")
    .action(() => {
      seedBuiltins();
      const skills = listSkills();
      console.log(formatHeader("MCP Skills"));

      if (skills.length === 0) {
        console.log(theme.muted("  No skills installed.\n"));
        return;
      }

      for (const s of skills) {
        const status = s.enabled
          ? theme.success("● enabled ")
          : theme.muted("○ disabled");
        const source = theme.muted(`[${s.source}]`);
        const tools = theme.muted(`  tools: ${s.tools.join(", ")}`);
        console.log(`  ${status}  ${theme.bold(s.name)} ${theme.dim(`v${s.version}`)}  ${source}`);
        console.log(`           ${theme.muted(s.description)}`);
        console.log(`          ${tools}`);
        console.log();
      }

      const enabled = skills.filter((s) => s.enabled).length;
      console.log(theme.muted(`  ${enabled}/${skills.length} skills enabled.\n`));
      console.log(theme.muted("  Tip: ai mcp enable <name>  to activate a skill"));
      console.log(theme.muted("       ai mcp search         to browse available skills\n"));
    });

  // ── enable ────────────────────────────────────────────────────────────────
  mcp
    .command("enable <name>")
    .description("Enable a skill so its tools are available to Claude")
    .action((name: string) => {
      try {
        enableSkill(name);
        console.log(formatSuccess(`Skill "${name}" enabled.`));
        console.log(theme.muted(`  Claude will now have access to its tools in ai ask / ai chat.\n`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── disable ───────────────────────────────────────────────────────────────
  mcp
    .command("disable <name>")
    .description("Disable a skill without removing it")
    .action((name: string) => {
      try {
        disableSkill(name);
        console.log(formatSuccess(`Skill "${name}" disabled.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── install ───────────────────────────────────────────────────────────────
  mcp
    .command("install <packageOrPath>")
    .alias("add")
    .description("Install a skill from npm (modern-ai-cli-skill-*) or local .mjs file")
    .action(async (ref: string) => {
      const isLocal = ref.startsWith(".") || ref.startsWith("/");
      try {
        const manifest = await withSpinner(
          `Installing skill ${theme.bold(ref)}…`,
          () => isLocal ? installLocalSkill(ref) : installNpmSkill(ref)
        );
        console.log(formatSuccess(`Installed "${manifest.name}" v${manifest.version}`));
        console.log(theme.muted(`  Tools: ${manifest.tools.join(", ")}`));
        console.log(theme.muted(`  Run: ai mcp enable ${manifest.name}  to activate\n`));
      } catch (err) {
        console.error(formatError(`Install failed: ${String(err)}`));
        process.exit(1);
      }
    });

  // ── remove ────────────────────────────────────────────────────────────────
  mcp
    .command("remove <name>")
    .alias("rm")
    .description("Remove an installed skill (built-in skills cannot be removed)")
    .action((name: string) => {
      try {
        removeSkill(name);
        console.log(formatSuccess(`Skill "${name}" removed.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── search ────────────────────────────────────────────────────────────────
  mcp
    .command("search [query]")
    .description("Search the remote skill registry")
    .option("--registry <url>", "Registry URL", DEFAULT_REGISTRY_URL)
    .option("--refresh", "Bypass cache and fetch fresh data")
    .action(async (query: string | undefined, opts: { registry: string; refresh: boolean }) => {
      try {
        const results = await withSpinner(
          "Fetching skill registry…",
          () => searchRegistry(query ?? "", opts.registry)
        );

        console.log(formatHeader(query ? `Skills matching "${query}"` : "All Available Skills"));

        if (results.length === 0) {
          console.log(theme.muted("  No skills found.\n"));
          return;
        }

        const installed = new Set(listSkills().map((s) => s.name));
        for (const s of results) {
          const badge = installed.has(s.name)
            ? theme.success(" [installed]")
            : "";
          const tags = s.tags?.length ? theme.muted(` · ${s.tags.join(", ")}`) : "";
          console.log(`  ${theme.bold(s.name)} ${theme.dim(`v${s.version}`)}${badge}`);
          console.log(`  ${theme.muted(s.description)}${tags}`);
          console.log(`  ${theme.muted("tools:")} ${s.tools.join(", ")}`);
          if (s.npmPackage) {
            console.log(`  ${theme.muted("install:")} ${theme.secondary(`ai mcp install ${s.npmPackage}`)}`);
          }
          console.log();
        }
      } catch (err) {
        console.error(formatError(`Registry unavailable: ${String(err)}`));
        console.log(theme.muted("\n  Built-in skills (always available):\n"));
        console.log(theme.muted("    shell · files · http · calculator\n"));
        console.log(theme.muted("  Run: ai mcp list  to see locally installed skills\n"));
        process.exit(1);
      }
    });

  // ── run ───────────────────────────────────────────────────────────────────
  mcp
    .command("run <tool>")
    .description("Directly invoke a skill tool (for testing and scripting)")
    .option("--input <json>", "Tool input as JSON string", "{}")
    .action(async (toolName: string, opts: { input: string }) => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(opts.input) as Record<string, unknown>;
      } catch {
        console.error(formatError("--input must be valid JSON"));
        process.exit(1);
      }

      try {
        const result = await withSpinner(
          `Running tool ${theme.bold(toolName)}…`,
          () => dispatchToolCall(toolName, input)
        );
        if (result.isError) {
          console.error(formatError(result.content));
          process.exit(1);
        }
        console.log(result.content);
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── info (default help enhancement) ──────────────────────────────────────
  mcp.addHelpText(
    "after",
    `\n${theme.muted("Built-in skills (always available, enable with: ai mcp enable <name>)")}\n` +
    `  ${theme.secondary("shell")}        Run shell commands\n` +
    `  ${theme.secondary("files")}        Read/write local files\n` +
    `  ${theme.secondary("http")}         Fetch URLs / call APIs\n` +
    `  ${theme.secondary("calculator")}   Evaluate math expressions\n` +
    `\n${theme.muted("Examples:")}\n` +
    `  ${theme.secondary("$")} ai mcp enable shell          # activate shell skill\n` +
    `  ${theme.secondary("$")} ai mcp list                   # see all skills\n` +
    `  ${theme.secondary("$")} ai mcp search web             # find web-related skills\n` +
    `  ${theme.secondary("$")} ai mcp run run_command --input '{"command":"ls -la"}'\n`
  );
}
