import { Command } from "commander";
import * as clack from "@clack/prompts";
import { theme, icons, formatHeader } from "../ui/theme.js";
import {
  getConfig,
  setConfig,
  resetConfig,
  getConfigPath,
  type CliConfig,
} from "../utils/config.js";
import { resetClient, MODELS, type ModelId } from "../ai/client.js";

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage CLI configuration");

  // config show
  config
    .command("show")
    .alias("list")
    .description("Show current configuration")
    .action(() => {
      const cfg = getConfig();
      console.log(formatHeader("Configuration"));
      console.log(theme.muted(`  Config file: ${getConfigPath()}\n`));

      const rows: [string, string][] = [
        ["model", cfg.model],
        ["maxTokens", String(cfg.maxTokens)],
        ["streaming", String(cfg.streamingEnabled)],
        ["history", String(cfg.historyEnabled)],
        ["historyMax", String(cfg.historyMaxMessages) + " messages"],
        ["theme", cfg.theme],
        ["apiKey", cfg.apiKey ? "***" + cfg.apiKey.slice(-4) : theme.warning("not set")],
        ["systemPrompt", cfg.systemPrompt.slice(0, 60) + "…"],
      ];

      for (const [key, value] of rows) {
        console.log(`  ${theme.muted(key.padEnd(14))} ${theme.secondary(value)}`);
      }
      console.log();
    });

  // config set <key> <value>
  config
    .command("set")
    .description("Set a configuration value")
    .argument("<key>", "Config key")
    .argument("<value>", "Config value")
    .action((key: string, value: string) => {
      const validKeys: (keyof CliConfig)[] = [
        "apiKey", "model", "maxTokens", "systemPrompt",
        "streamingEnabled", "historyEnabled", "historyMaxMessages", "theme",
      ];

      if (!validKeys.includes(key as keyof CliConfig)) {
        console.error(
          theme.error(`${icons.error} Unknown key: ${key}\n`) +
          theme.muted(`  Valid keys: ${validKeys.join(", ")}`)
        );
        process.exit(1);
      }

      const typedKey = key as keyof CliConfig;

      // Type coercion
      let typedValue: CliConfig[typeof typedKey];
      if (typedKey === "maxTokens" || typedKey === "historyMaxMessages") {
        const num = parseInt(value, 10);
        if (isNaN(num)) {
          console.error(theme.error(`${key} must be a number`));
          process.exit(1);
        }
        typedValue = num as CliConfig[typeof typedKey];
      } else if (typedKey === "streamingEnabled" || typedKey === "historyEnabled") {
        typedValue = (value === "true" || value === "1" || value === "yes") as CliConfig[typeof typedKey];
      } else {
        typedValue = value as CliConfig[typeof typedKey];
      }

      setConfig(typedKey, typedValue);

      // Reset AI client if API key changed
      if (typedKey === "apiKey") {
        resetClient();
      }

      console.log(theme.success(`  ${icons.success} Set ${key} = ${typedKey === "apiKey" ? "***" : value}`));
    });

  // config wizard (interactive setup)
  config
    .command("wizard")
    .alias("setup")
    .description("Interactive configuration wizard")
    .action(async () => {
      console.log(formatHeader("Configuration Wizard"));

      clack.intro(theme.primary("Let's set up your AI CLI"));

      // API Key
      const currentKey = getConfig().apiKey;
      const apiKeyAnswer = await clack.password({
        message: "Anthropic API key" + (currentKey ? " (leave blank to keep current)" : ""),
        validate: (v) => {
          if (!currentKey && !v.trim()) return "API key is required";
          if (v && !v.startsWith("sk-ant-")) return "Key should start with sk-ant-";
          return undefined;
        },
      });

      if (clack.isCancel(apiKeyAnswer)) {
        clack.cancel("Setup cancelled.");
        return;
      }

      if (apiKeyAnswer) {
        setConfig("apiKey", apiKeyAnswer);
        resetClient();
      }

      // Model selection
      const modelAnswer = await clack.select({
        message: "Default model:",
        options: (Object.keys(MODELS) as ModelId[]).map((id) => ({
          value: id,
          label: id,
          hint: MODELS[id],
        })),
        initialValue: getConfig().model as ModelId,
      });

      if (!clack.isCancel(modelAnswer)) {
        setConfig("model", modelAnswer as string);
      }

      // Max tokens
      const maxTokensAnswer = await clack.text({
        message: "Max output tokens:",
        initialValue: String(getConfig().maxTokens),
        validate: (v) => {
          const n = parseInt(v, 10);
          return isNaN(n) || n < 256 ? "Must be a number >= 256" : undefined;
        },
      });

      if (!clack.isCancel(maxTokensAnswer)) {
        setConfig("maxTokens", parseInt(String(maxTokensAnswer), 10));
      }

      // Streaming
      const streamingAnswer = await clack.confirm({
        message: "Enable streaming responses?",
        initialValue: getConfig().streamingEnabled,
      });
      if (!clack.isCancel(streamingAnswer)) {
        setConfig("streamingEnabled", streamingAnswer);
      }

      // History
      const historyAnswer = await clack.confirm({
        message: "Enable chat history?",
        initialValue: getConfig().historyEnabled,
      });
      if (!clack.isCancel(historyAnswer)) {
        setConfig("historyEnabled", historyAnswer);
      }

      clack.outro(theme.success(`  Configuration saved to: ${getConfigPath()}`));
    });

  // config reset
  config
    .command("reset")
    .description("Reset all configuration to defaults")
    .option("-f, --force", "Skip confirmation")
    .action(async (opts: { force: boolean }) => {
      if (!opts.force) {
        const confirmed = await clack.confirm({
          message: "Reset all configuration to defaults?",
          initialValue: false,
        });
        if (clack.isCancel(confirmed) || !confirmed) {
          console.log(theme.muted("  Reset cancelled."));
          return;
        }
      }
      resetConfig();
      resetClient();
      console.log(theme.success(`  ${icons.success} Configuration reset to defaults.`));
    });

  // config path
  config
    .command("path")
    .description("Show config file path")
    .action(() => {
      console.log(getConfigPath());
    });
}
