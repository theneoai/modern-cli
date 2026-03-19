import { Command } from "commander";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { printMessage, printUsage, divider } from "../ui/output.js";
import { theme, icons, formatHeader } from "../theme/index.js";
import { thinkingSpinner } from "../ui/spinner.js";
import { sendMessageStream } from "../ai/client.js";
import { getConfig } from "../utils/config.js";
import { SYSTEM_PROMPTS, PROMPT_DESCRIPTIONS, type PromptMode } from "../ai/prompts.js";
import {
  createSession,
  saveSession,
  listSessions,
  loadSession,
  type ChatSession,
} from "../utils/history.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

const SLASH_COMMANDS = `
${theme.muted("Commands:")}
  ${theme.secondary("/clear")}       Clear conversation history
  ${theme.secondary("/mode")}        Switch AI mode
  ${theme.secondary("/history")}     Show conversation history
  ${theme.secondary("/save")}        Save current session
  ${theme.secondary("/load")}        Load a saved session
  ${theme.secondary("/usage")}       Toggle token usage display
  ${theme.secondary("/model")}       Show current model
  ${theme.secondary("/help")}        Show this help
  ${theme.secondary("/exit")}        Exit the chat
`.trim();

async function handleSlashCommand(
  cmd: string,
  args: string[],
  state: {
    messages: MessageParam[];
    session: ChatSession;
    mode: PromptMode;
    systemPrompt: string;
    showUsage: boolean;
    config: ReturnType<typeof getConfig>;
  }
): Promise<{ shouldExit: boolean; shouldContinue: boolean }> {
  const arg = args.join(" ");
  void arg;

  switch (cmd.toLowerCase()) {
    case "exit":
    case "quit":
      return { shouldExit: true, shouldContinue: false };

    case "clear":
      state.messages.length = 0;
      state.session.messages = [];
      console.log(theme.success("  Conversation cleared."));
      return { shouldExit: false, shouldContinue: true };

    case "mode": {
      const modes = Object.keys(SYSTEM_PROMPTS) as PromptMode[];
      const selected = await clack.select({
        message: "Select AI mode:",
        options: modes.map((m) => ({
          value: m,
          label: m,
          hint: PROMPT_DESCRIPTIONS[m],
        })),
      });
      if (!clack.isCancel(selected)) {
        state.mode = selected as PromptMode;
        state.systemPrompt = SYSTEM_PROMPTS[state.mode];
        console.log(theme.success(`  Mode: ${state.mode} — ${PROMPT_DESCRIPTIONS[state.mode]}`));
      }
      return { shouldExit: false, shouldContinue: true };
    }

    case "model":
      console.log(theme.muted(`  Current model: ${state.config.model}`));
      return { shouldExit: false, shouldContinue: true };

    case "history":
      if (state.messages.length === 0) {
        console.log(theme.muted("  No messages yet."));
      } else {
        console.log(theme.muted(`  ${state.messages.length} messages in current session:`));
        state.messages.forEach((m, i) => {
          const content = typeof m.content === "string" ? m.content : "[complex content]";
          console.log(theme.muted(`    ${i + 1}. [${m.role}] ${content.slice(0, 60)}…`));
        });
      }
      return { shouldExit: false, shouldContinue: true };

    case "usage":
      state.showUsage = !state.showUsage;
      console.log(theme.muted(`  Token usage: ${state.showUsage ? "on" : "off"}`));
      return { shouldExit: false, shouldContinue: true };

    case "save":
      state.session.messages = [...state.messages];
      state.session.updatedAt = new Date().toISOString();
      if (state.messages.length > 0 && state.session.title === "New conversation") {
        const first = typeof state.messages[0].content === "string"
          ? state.messages[0].content
          : "Conversation";
        state.session.title = first.slice(0, 50);
      }
      saveSession(state.session);
      console.log(theme.success(`  Saved session: ${state.session.id}`));
      return { shouldExit: false, shouldContinue: true };

    case "load": {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log(theme.muted("  No saved sessions."));
        return { shouldExit: false, shouldContinue: true };
      }
      const selected = await clack.select({
        message: "Load session:",
        options: sessions.slice(0, 10).map((s) => ({
          value: s.id,
          label: s.title,
          hint: `${s.messages.length} msgs · ${s.updatedAt.slice(0, 10)}`,
        })),
      });
      if (!clack.isCancel(selected)) {
        const loaded = loadSession(selected as string);
        if (loaded) {
          state.messages.length = 0;
          state.messages.push(...loaded.messages);
          Object.assign(state.session, loaded);
          console.log(theme.success(`  Loaded: "${loaded.title}"`));
        }
      }
      return { shouldExit: false, shouldContinue: true };
    }

    case "help":
      console.log("\n" + SLASH_COMMANDS + "\n");
      return { shouldExit: false, shouldContinue: true };

    default:
      console.log(theme.warning(`  Unknown command: /${cmd}. Type /help for commands.`));
      return { shouldExit: false, shouldContinue: true };
  }
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .alias("c")
    .description("Start an interactive AI chat session")
    .option("-m, --mode <mode>", "Initial prompt mode", "default")
    .option("-s, --system <prompt>", "Custom system prompt")
    .option("--session <id>", "Resume a saved session by ID")
    .action(async (opts: { mode: string; system?: string; session?: string }) => {
      console.log(formatHeader("AI Chat"));
      console.log(
        theme.muted(
          `  ${icons.bullet} Type your message and press Enter\n` +
          `  ${icons.bullet} Use ${chalk.white("/help")} for slash commands\n` +
          `  ${icons.bullet} Press ${chalk.white("Ctrl+C")} or type ${chalk.white("/exit")} to quit\n`
        )
      );

      const config = getConfig();

      const state = {
        messages: [] as MessageParam[],
        session: {} as ChatSession,
        mode: (opts.mode as PromptMode) || "default",
        systemPrompt: opts.system ?? (SYSTEM_PROMPTS[opts.mode as PromptMode] ?? SYSTEM_PROMPTS.default),
        showUsage: false,
        config,
      };

      // Resume or create session
      if (opts.session) {
        const loaded = loadSession(opts.session);
        if (!loaded) {
          console.error(theme.error(`Session "${opts.session}" not found.`));
          process.exit(1);
        }
        state.session = loaded;
        state.messages = [...loaded.messages];
        console.log(theme.success(`  Resumed: "${state.session.title}"`));
        // Show recent context
        const recent = state.messages.slice(-4);
        if (recent.length > 0) {
          console.log(theme.muted("\n  --- Recent context ---"));
          for (const msg of recent) {
            const content = typeof msg.content === "string"
              ? msg.content
              : "[complex content]";
            printMessage(msg.role as "user" | "assistant", content.slice(0, 200));
          }
          console.log(theme.muted("  --- End context ---\n"));
        }
      } else {
        state.session = createSession();
      }

      let turnCount = 0;
      console.log(theme.muted(`  Mode: ${theme.secondary(state.mode)} · ${PROMPT_DESCRIPTIONS[state.mode]}\n`));
      divider();

      // Chat loop
      while (true) {
        let input: string;
        try {
          const answer = await clack.text({
            message: `${theme.user(icons.user)} You`,
            placeholder: "Type your message…",
            validate: (v) => (!v.trim() ? "Please enter a message" : undefined),
          });

          if (clack.isCancel(answer)) break;
          input = String(answer).trim();
        } catch {
          break;
        }

        // Handle slash commands
        if (input.startsWith("/")) {
          const [cmd, ...args] = input.slice(1).split(" ");
          if (!cmd) continue;

          const result = await handleSlashCommand(cmd, args, state);
          if (result.shouldExit) break;
          if (result.shouldContinue) continue;
          break;
        }

        // Regular message
        state.messages.push({ role: "user", content: input });
        turnCount++;

        console.log();
        process.stdout.write(`${theme.assistant(icons.ai + " Claude")}\n`);

        const spinner = thinkingSpinner();
        spinner.start();
        let firstChunk = true;

        try {
          const response = await sendMessageStream(
            state.messages,
            (delta) => {
              if (firstChunk) {
                spinner.stop();
                process.stdout.clearLine(0);
                process.stdout.cursorTo(0);
                firstChunk = false;
              }
              process.stdout.write(delta);
            },
            state.systemPrompt
          );

          if (firstChunk) spinner.stop();
          console.log("\n");

          if (state.showUsage) {
            printUsage(response.usage.inputTokens, response.usage.outputTokens);
          }

          state.messages.push({ role: "assistant", content: response.content });

          // Trim context to avoid overflow
          const maxHistory = config.historyMaxMessages;
          if (state.messages.length > maxHistory * 2) {
            state.messages.splice(0, state.messages.length - maxHistory * 2);
          }

          // Auto-save every 5 turns
          if (config.historyEnabled && turnCount % 5 === 0) {
            state.session.messages = [...state.messages];
            state.session.updatedAt = new Date().toISOString();
            saveSession(state.session);
          }

          divider();
        } catch (error) {
          if (firstChunk) spinner.stop();
          const msg = error instanceof Error ? error.message : String(error);
          console.error("\n" + theme.error(`${icons.error} Error: ${msg}\n`));
          state.messages.pop();
        }
      }

      // Final save on exit
      if (config.historyEnabled && state.messages.length > 0) {
        state.session.messages = [...state.messages];
        state.session.updatedAt = new Date().toISOString();
        if (state.session.title === "New conversation" && state.messages.length > 0) {
          const first = typeof state.messages[0].content === "string"
            ? state.messages[0].content : "Conversation";
          state.session.title = first.slice(0, 50);
        }
        saveSession(state.session);
        console.log("\n" + theme.muted(`  Session saved: ${state.session.id}`));
      }

      console.log("\n" + theme.secondary("  Goodbye! 👋") + "\n");
    });
}
