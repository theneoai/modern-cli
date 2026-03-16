import { Command } from "commander";
import * as clack from "@clack/prompts";
import { writeFileSync, existsSync } from "fs";
import { theme, icons, formatHeader } from "../ui/theme.js";
import { thinkingSpinner } from "../ui/spinner.js";
import { sendMessageStream } from "../ai/client.js";
import { buildGeneratePrompt, SYSTEM_PROMPTS } from "../ai/prompts.js";

type GenerateType = "component" | "function" | "test" | "docs" | "script";

const TYPE_DESCRIPTIONS: Record<GenerateType, string> = {
  component: "UI Component (React, Vue, etc.)",
  function: "Function or utility",
  test: "Test suite (unit/integration)",
  docs: "Documentation or README",
  script: "Shell or automation script",
};

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .alias("gen")
    .alias("g")
    .description("AI-powered code and content generation")
    .argument("[description]", "What to generate (prompted if omitted)")
    .option("-t, --type <type>", "Type: component|function|test|docs|script")
    .option("-l, --language <lang>", "Target language (e.g. TypeScript, Python, Go)")
    .option("-o, --output <file>", "Write output to file")
    .option("--no-explain", "Skip explanation, output code only")
    .action(async (
      descriptionArg: string | undefined,
      opts: {
        type?: string;
        language?: string;
        output?: string;
        explain: boolean;
      }
    ) => {
      console.log(formatHeader("AI Code Generator"));

      // Interactive prompts if args not provided
      let description = descriptionArg;
      let type = opts.type as GenerateType | undefined;

      if (!type) {
        const selected = await clack.select({
          message: "What do you want to generate?",
          options: (Object.keys(TYPE_DESCRIPTIONS) as GenerateType[]).map((k) => ({
            value: k,
            label: TYPE_DESCRIPTIONS[k],
            hint: k,
          })),
        });
        if (clack.isCancel(selected)) {
          console.log(theme.muted("  Cancelled."));
          return;
        }
        type = selected as GenerateType;
      }

      if (!description) {
        const answer = await clack.text({
          message: `Describe the ${type} to generate:`,
          placeholder: `e.g. "a debounce hook that supports cancellation"`,
          validate: (v) => (!v.trim() ? "Please provide a description" : undefined),
        });
        if (clack.isCancel(answer)) {
          console.log(theme.muted("  Cancelled."));
          return;
        }
        description = String(answer).trim();
      }

      let language = opts.language;
      if (!language) {
        const defaultLang = type === "script" ? "bash" : "TypeScript";
        const answer = await clack.text({
          message: "Language or framework?",
          placeholder: defaultLang,
          initialValue: defaultLang,
        });
        if (!clack.isCancel(answer) && String(answer).trim()) {
          language = String(answer).trim();
        }
      }

      console.log(
        `\n  ${theme.muted("Generating:")} ${theme.secondary(type)} — ${description}` +
        (language ? ` ${theme.muted("(" + language + ")")}` : "") + "\n"
      );

      const generatePrompt = buildGeneratePrompt(type, description, language);
      const system = opts.explain
        ? SYSTEM_PROMPTS.code
        : SYSTEM_PROMPTS.code + "\n\nOutput ONLY the code with minimal explanation.";

      const spinner = thinkingSpinner();
      spinner.start();
      let firstChunk = true;
      let fullOutput = "";

      try {
        await sendMessageStream(
          [{ role: "user", content: generatePrompt }],
          (delta) => {
            if (firstChunk) {
              spinner.stop();
              process.stdout.clearLine(0);
              process.stdout.cursorTo(0);
              firstChunk = false;
            }
            process.stdout.write(delta);
            fullOutput += delta;
          },
          system
        );

        if (firstChunk) spinner.stop();
        console.log("\n");

        // Optionally write to file
        if (opts.output) {
          const outputPath = opts.output;

          if (existsSync(outputPath)) {
            const overwrite = await clack.confirm({
              message: `File "${outputPath}" exists. Overwrite?`,
              initialValue: false,
            });
            if (clack.isCancel(overwrite) || !overwrite) {
              console.log(theme.muted("  File not written."));
              return;
            }
          }

          // Extract code blocks from output
          const codeBlockMatch = fullOutput.match(/```(?:\w+)?\n([\s\S]+?)```/);
          const contentToWrite = codeBlockMatch ? codeBlockMatch[1] : fullOutput;

          writeFileSync(outputPath, contentToWrite, "utf-8");
          console.log(theme.success(`  ${icons.success} Written to: ${outputPath}`));
        }

        // Show summary
        console.log(
          theme.muted(
            `  ${icons.bullet} Generated ${type}: ${theme.secondary(description.slice(0, 50))}`
          )
        );
      } catch (error) {
        if (firstChunk) spinner.stop();
        const msg = error instanceof Error ? error.message : String(error);
        console.error(theme.error(`\n${icons.error} Error: ${msg}\n`));
        process.exit(1);
      }
    });
}
