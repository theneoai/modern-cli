import { Command } from "commander";
import { theme, icons } from "./ui/theme.js";
import { VERSION_META } from "./version.js";
import { registerAskCommand } from "./commands/ask.js";
import { registerChatCommand } from "./commands/chat.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerWhatsnewCommand } from "./commands/whatsnew.js";

/** Rich version string shown by `ai --version`. */
const VERSION_STRING =
  `${VERSION_META.version}` +
  (VERSION_META.commitHash ? ` (${VERSION_META.commitHash})` : "") +
  (VERSION_META.isDirty    ? " [dirty]" : "");

export function createCLI(): Command {
  const program = new Command();

  program
    .name("ai")
    .version(VERSION_STRING, "-v, --version", "Output the current version")
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
      `  ${theme.secondary("$")} ai whatsnew                # release notes\n` +
      `  ${theme.secondary("$")} ai config wizard           # first-time setup\n`
    )
    .configureHelp({ sortSubcommands: true, sortOptions: true })
    .showSuggestionAfterError(true);

  // Register all commands
  registerAskCommand(program);
  registerChatCommand(program);
  registerGenerateCommand(program);
  registerConfigCommand(program);
  registerWhatsnewCommand(program);

  // Global error handler
  program.exitOverride();

  return program;
}
