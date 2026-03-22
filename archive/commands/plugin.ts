/**
 * Plugin commands: ai plugin <subcommand>
 *
 * Subcommands:
 *   ai plugin list                — List installed plugins
 *   ai plugin install <pkg|path>  — Install from npm or local .mjs
 *   ai plugin remove <name>       — Remove a plugin
 *   ai plugin enable <name>       — Re-enable a disabled plugin
 *   ai plugin disable <name>      — Temporarily disable without removing
 *   ai plugin create [output]     — Scaffold a new plugin file
 *   ai plugin dir                 — Show plugin directory
 */

import type { Command } from "commander";
import { join } from "path";
import {
  listPlugins,
  installPlugin,
  installLocalPlugin,
  removePlugin,
  enablePlugin,
  disablePlugin,
  scaffoldPlugin,
  PLUGINS_DIR,
} from "../plugins/loader.js";
import { theme, formatHeader, formatError, formatSuccess } from "../ui/theme.js";
import { withSpinner } from "../ui/spinner.js";

export function registerPluginCommand(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("Manage CLI plugins — extend the CLI with custom commands");

  // ── list ──────────────────────────────────────────────────────────────────
  plugin
    .command("list")
    .alias("ls")
    .description("List all installed plugins")
    .action(() => {
      const plugins = listPlugins();
      console.log(formatHeader("Plugins"));

      if (plugins.length === 0) {
        console.log(theme.muted("  No plugins installed.\n"));
        console.log(theme.muted("  Install from npm:  ai plugin install modern-ai-cli-plugin-<name>"));
        console.log(theme.muted("  Create your own:   ai plugin create my-plugin.mjs\n"));
        return;
      }

      for (const p of plugins) {
        const status = p.enabled
          ? theme.success("● enabled ")
          : theme.muted("○ disabled");
        const source = theme.muted(`[${p.source}]`);
        console.log(`  ${status}  ${theme.bold(p.name)} ${theme.dim(`v${p.version}`)}  ${source}`);
        console.log(`           ${theme.muted(p.description)}`);
        if (p.source === "local") {
          console.log(`           ${theme.muted(p.ref)}`);
        }
        console.log();
      }

      const enabled = plugins.filter((p) => p.enabled).length;
      console.log(theme.muted(`  ${enabled}/${plugins.length} plugins enabled.\n`));
    });

  // ── install ───────────────────────────────────────────────────────────────
  plugin
    .command("install <packageOrPath>")
    .alias("add")
    .description("Install a plugin from npm (modern-ai-cli-plugin-*) or a local .mjs file")
    .action(async (ref: string) => {
      const isLocal = ref.startsWith(".") || ref.startsWith("/");
      try {
        const manifest = await withSpinner(
          `Installing plugin ${theme.bold(ref)}…`,
          () => isLocal ? installLocalPlugin(ref) : installPlugin(ref)
        );
        console.log(formatSuccess(`Plugin "${manifest.name}" v${manifest.version} installed.`));
        console.log(theme.muted("  Restart or reload the CLI to use new commands.\n"));
      } catch (err) {
        console.error(formatError(`Install failed: ${String(err)}`));
        process.exit(1);
      }
    });

  // ── remove ────────────────────────────────────────────────────────────────
  plugin
    .command("remove <name>")
    .alias("rm")
    .description("Remove a plugin")
    .action((name: string) => {
      try {
        removePlugin(name);
        console.log(formatSuccess(`Plugin "${name}" removed.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── enable ────────────────────────────────────────────────────────────────
  plugin
    .command("enable <name>")
    .description("Enable a disabled plugin")
    .action((name: string) => {
      try {
        enablePlugin(name);
        console.log(formatSuccess(`Plugin "${name}" enabled.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── disable ───────────────────────────────────────────────────────────────
  plugin
    .command("disable <name>")
    .description("Disable a plugin without removing it")
    .action((name: string) => {
      try {
        disablePlugin(name);
        console.log(formatSuccess(`Plugin "${name}" disabled.`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── create ────────────────────────────────────────────────────────────────
  plugin
    .command("create [output]")
    .description("Scaffold a new plugin file ready for customization")
    .action((output: string | undefined) => {
      const target = output ?? join(PLUGINS_DIR, "my-plugin.mjs");
      try {
        scaffoldPlugin(target);
        console.log(formatSuccess(`Plugin scaffold created: ${target}`));
        console.log(theme.muted("\n  Edit the file to add your commands, then:"));
        console.log(theme.muted(`  ai plugin install ${target}\n`));
      } catch (err) {
        console.error(formatError(String(err)));
        process.exit(1);
      }
    });

  // ── dir ───────────────────────────────────────────────────────────────────
  plugin
    .command("dir")
    .description("Print the plugin directory path")
    .action(() => {
      console.log(PLUGINS_DIR);
    });

  // Help footer
  plugin.addHelpText(
    "after",
    `\n${theme.muted("Plugin format (ESM .mjs):")}\n` +
    `  export const name = "my-plugin";\n` +
    `  export const version = "1.0.0";\n` +
    `  export const description = "...";\n` +
    `  export function register(program) { program.command("foo").action(...) }\n` +
    `\n${theme.muted("Examples:")}\n` +
    `  ${theme.secondary("$")} ai plugin create my-plugin.mjs\n` +
    `  ${theme.secondary("$")} ai plugin install ./my-plugin.mjs\n` +
    `  ${theme.secondary("$")} ai plugin install modern-ai-cli-plugin-git\n`
  );
}
