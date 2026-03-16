import { Command } from "commander";
import { createRequire } from "module";
import { theme, icons } from "./ui/theme.js";
import { registerAskCommand } from "./commands/ask.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerConfigCommand } from "./commands/config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string; description: string };

export function createCLI(): Command {
  const program = new Command();

  program
    .name("ai")
    .version(pkg.version, "-v, --version", "Output the current version")
    .description(
      `${theme.primary(icons.sparkle + " Modern AI CLI")} — Powered by Claude\n\n` +
      `  A fast, powerful AI assistant for your terminal.\n` +
      `  Supports chat, code generation, and more.`
    )
    .addHelpText(
      "after",
      `\n${theme.muted("Examples:")}\n` +
      `  ${theme.secondary("$")} ai ask "explain async/await in JavaScript"\n` +
      `  ${theme.secondary("$")} ai ask --mode code "write a binary search function"\n` +
      `  ${theme.secondary("$")} ai chat                    # interactive session\n` +
      `  ${theme.secondary("$")} ai generate --type function "debounce with cancel"\n` +
      `  ${theme.secondary("$")} ai config wizard           # first-time setup\n` +
      `  ${theme.secondary("$")} ai config set model claude-sonnet-4-6\n`
    )
    .configureHelp({
      sortSubcommands: true,
      sortOptions: true,
    })
    .showSuggestionAfterError(true);

  // Register all commands
  registerAskCommand(program);
  registerChatCommand(program);
  registerGenerateCommand(program);
  registerConfigCommand(program);

  // Global error handler
  program.exitOverride();

  return program;
}
