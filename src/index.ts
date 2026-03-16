import process from "process";
import { createCLI } from "./cli.js";
import { theme, icons } from "./ui/theme.js";

async function main(): Promise<void> {
  const program = createCLI();

  // Handle no arguments — show interactive prompt hint
  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
  }

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    // Commander's exitOverride throws on --help, --version (exit code 0)
    if (error instanceof Error && "code" in error) {
      const cmdError = error as Error & { code: string; exitCode: number };
      if (cmdError.exitCode === 0) {
        process.exit(0);
      }
      if (cmdError.code === "commander.unknownCommand") {
        console.error(
          theme.error(`\n${icons.error} Unknown command: ${process.argv[2]}`) +
          theme.muted("\n  Run: ai --help\n")
        );
        process.exit(1);
      }
      if (cmdError.code === "commander.missingArgument") {
        console.error(theme.error(`\n${icons.error} ${error.message}\n`));
        process.exit(1);
      }
    }
    // Re-throw unexpected errors
    const msg = error instanceof Error ? error.message : String(error);
    console.error(theme.error(`\n${icons.error} Unexpected error: ${msg}\n`));
    process.exit(1);
  }
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(theme.error(`\n${icons.error} Fatal: ${msg}\n`));
  process.exit(1);
});
