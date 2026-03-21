import { Command } from "commander";
import { theme, icons } from "./ui/theme.js";
import { VERSION_META } from "./version.js";
import { registerAskCommand } from "./commands/ask.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerWhatsnewCommand } from "./commands/whatsnew.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerPluginCommand } from "./commands/plugin.js";
import { registerAgentCommand } from "./commands/agent.js";
import { loadPlugins } from "./plugins/loader.js";

/** Rich version string shown by `ai --version`. */
const VERSION_STRING =
  `${VERSION_META.version}` +
  (VERSION_META.commitHash ? ` (${VERSION_META.commitHash})` : "") +
  (VERSION_META.isDirty    ? " [dirty]" : "");

export async function createCLI(): Promise<Command> {
  const program = new Command();

  program
    .name("ai")
    .version(VERSION_STRING, "-v, --version", "Output the current version")
    .description(
      `${theme.primary(icons.sparkle + " Modern AI CLI")} — Powered by Claude\n\n` +
      `  A fast, powerful AI assistant for your terminal.\n` +
      `  Supports chat, code generation, plugins, MCP skills, and multi-agent tasks.`
    )
    .addHelpText(
      "after",
      `\n${theme.muted("Examples:")}\n` +
      `  ${theme.secondary("$")} ai ask "explain async/await in JavaScript"\n` +
      `  ${theme.secondary("$")} ai ask --mode code "write a binary search function"\n` +
      `  ${theme.secondary("$")} ai chat                    # interactive session\n` +
      `  ${theme.secondary("$")} ai generate --type function "debounce with cancel"\n` +
      `  ${theme.secondary("$")} ai agent run "build a REST API with tests"\n` +
      `  ${theme.secondary("$")} ai mcp enable shell        # activate shell skill\n` +
      `  ${theme.secondary("$")} ai plugin list             # see installed plugins\n` +
      `  ${theme.secondary("$")} ai whatsnew                # release notes\n` +
      `  ${theme.secondary("$")} ai config wizard           # first-time setup\n`
    )
    .configureHelp({ sortSubcommands: true, sortOptions: true })
    .showSuggestionAfterError(true);

  // Core commands
  registerAskCommand(program);
  registerChatCommand(program);
  registerGenerateCommand(program);
  registerConfigCommand(program);
  registerWhatsnewCommand(program);

  // New: MCP skills, plugins, multi-agent
  registerMcpCommand(program);
  registerPluginCommand(program);
  registerAgentCommand(program);

  // Dynamic: load user-installed plugins
  await loadPlugins(program);

  // Global error handler
  program.exitOverride();

  return program;
}
