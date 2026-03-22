import { Command } from "commander";
import chalk from "chalk";
import { thinkingSpinner } from "../ui/spinner.js";
import { printMessage, printUsage, divider } from "../ui/output.js";
import { theme, icons } from "../ui/theme.js";
import { sendMessage, sendMessageStream } from "../ai/client.js";
import { getConfig } from "../utils/config.js";
import { SYSTEM_PROMPTS, type PromptMode } from "../ai/prompts.js";

export function registerAskCommand(program: Command): void {
  program
    .command("ask")
    .alias("a")
    .description("Ask Claude a single question")
    .argument("<question...>", "Your question (supports multi-word)")
    .option("-m, --mode <mode>", "Prompt mode: default|code|explain|debug|shell|refactor", "default")
    .option("-s, --system <prompt>", "Custom system prompt override")
    .option("--no-stream", "Disable streaming (wait for full response)")
    .option("--no-usage", "Hide token usage stats")
    .action(async (questionWords: string[], opts: {
      mode: string;
      system?: string;
      stream: boolean;
      usage: boolean;
    }) => {
      const question = questionWords.join(" ");
      const config = getConfig();

      const mode = opts.mode as PromptMode;
      const systemPrompt = opts.system ?? (SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.default);

      console.log();
      printMessage("user", question);
      console.log();

      const messages = [{ role: "user" as const, content: question }];

      try {
        if (opts.stream && config.streamingEnabled) {
          // Streaming response
          process.stdout.write(`${theme.assistant(icons.ai + " Claude")}\n`);
          const spinner = thinkingSpinner();
          spinner.start();
          let firstChunk = true;

          const response = await sendMessageStream(
            messages,
            (delta) => {
              if (firstChunk) {
                spinner.stop();
                process.stdout.clearLine(0);
                process.stdout.cursorTo(0);
                firstChunk = false;
              }
              process.stdout.write(delta);
            },
            systemPrompt
          );

          if (firstChunk) spinner.stop();
          console.log("\n");

          if (opts.usage) {
            printUsage(response.usage.inputTokens, response.usage.outputTokens);
          }

          divider();
          console.log(
            theme.muted(`  model: ${response.model}  ·  stop: ${response.stopReason}`)
          );
        } else {
          // Non-streaming response
          const spinner = thinkingSpinner();
          spinner.start();

          const response = await sendMessage(messages, systemPrompt);
          spinner.stop();

          printMessage("assistant", response.content);

          if (opts.usage) {
            printUsage(response.usage.inputTokens, response.usage.outputTokens);
          }

          divider();
          console.log(
            theme.muted(`  model: ${response.model}  ·  stop: ${response.stopReason}`)
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("\n" + chalk.red(`${icons.error} Error: ${msg}`));
        process.exit(1);
      }
    });
}
