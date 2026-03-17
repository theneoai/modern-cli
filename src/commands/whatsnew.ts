import { Command } from "commander";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { VERSION_META } from "../version.js";
import { theme, icons, formatHeader } from "../ui/theme.js";
import { renderMarkdown, divider } from "../ui/output.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Locate CHANGELOG.md by walking up from the dist/ directory. */
function findChangelog(): string | null {
  const candidates = [
    join(__dirname, "..", "CHANGELOG.md"),          // dist/../CHANGELOG.md  (installed)
    join(__dirname, "..", "..", "CHANGELOG.md"),     // repo root (dev)
    join(process.cwd(), "CHANGELOG.md"),
  ];
  return candidates.find(existsSync) ?? null;
}

/**
 * Parse CHANGELOG.md and extract the N most-recent releases.
 * Assumes standard `## [x.y.z]` or `## x.y.z` headings.
 */
function parseChangelog(content: string, count: number): Array<{ version: string; date: string; body: string }> {
  const releases: Array<{ version: string; date: string; body: string }> = [];
  // Split on lines that start a new version heading
  const sections = content.split(/\n(?=##\s+[\[\d])/);

  for (const section of sections) {
    const headerMatch = section.match(/^##\s+\[?([\d.]+(?:-[\w.]+)?)\]?(?:\s+[-–]\s+(\d{4}-\d{2}-\d{2}))?/);
    if (!headerMatch) continue;

    const version = headerMatch[1];
    const date    = headerMatch[2] ?? "";
    const body    = section
      .replace(/^##[^\n]*\n/, "")   // remove the heading line
      .trim();

    releases.push({ version, date, body });
    if (releases.length >= count) break;
  }

  return releases;
}

export function registerWhatsnewCommand(program: Command): void {
  program
    .command("whatsnew")
    .aliases(["changelog", "relnotes"])
    .description("Show release notes and version information")
    .option("-n, --count <n>", "Number of releases to show", "3")
    .option("--current", "Show only the latest release")
    .option("--raw", "Print raw CHANGELOG markdown without rendering")
    .option("--version-info", "Print detailed build metadata and exit")
    .action((opts: { count: string; current: boolean; raw: boolean; versionInfo: boolean }) => {

      // ── Version info mode ──────────────────────────────────────────────
      if (opts.versionInfo) {
        console.log(formatHeader("Build Information"));
        const rows: [string, string][] = [
          ["version",   VERSION_META.version],
          ["commit",    VERSION_META.commitHash || "unknown"],
          ["branch",    VERSION_META.branch     || "unknown"],
          ["built at",  VERSION_META.buildTime],
          ["node",      VERSION_META.nodeVersion],
          ["dirty",     VERSION_META.isDirty ? theme.warning("yes (uncommitted changes)") : theme.success("no")],
        ];
        for (const [label, value] of rows) {
          console.log(`  ${theme.muted(label.padEnd(12))} ${theme.secondary(value)}`);
        }
        console.log();
        return;
      }

      // ── Release notes mode ─────────────────────────────────────────────
      const changelogPath = findChangelog();

      if (!changelogPath) {
        console.log(formatHeader(`What's New — v${VERSION_META.version}`));
        console.log(theme.muted("  No CHANGELOG.md found. Run a release to generate one.\n"));

        // Show version metadata as fallback
        console.log(
          `  ${theme.secondary(icons.sparkle)} Current version: ${theme.bold(VERSION_META.version)}\n` +
          `  ${theme.muted("commit:")} ${theme.dim(VERSION_META.commitHash || "unknown")}\n` +
          `  ${theme.muted("built:")}  ${theme.dim(VERSION_META.buildTime)}\n`
        );
        return;
      }

      const rawContent = readFileSync(changelogPath, "utf-8");

      if (opts.raw) {
        process.stdout.write(rawContent);
        return;
      }

      const count   = opts.current ? 1 : Math.max(1, parseInt(opts.count, 10) || 3);
      const releases = parseChangelog(rawContent, count);

      if (releases.length === 0) {
        console.log(theme.muted("\n  No releases found in CHANGELOG.md.\n"));
        return;
      }

      console.log(formatHeader(`What's New`));
      console.log(
        `  ${theme.muted("Current:")} ${theme.bold(VERSION_META.version)}` +
        (VERSION_META.commitHash ? theme.dim(`  (${VERSION_META.commitHash})`) : "") +
        "\n"
      );

      for (const { version, date, body } of releases) {
        const isLatest = version === releases[0].version;
        const badge = isLatest ? theme.success(" ← current ") : "";

        console.log(
          `${theme.heading(`  v${version}`)}${badge}` +
          (date ? theme.muted(`  ${date}`) : "")
        );
        divider();

        if (body) {
          // Indent each line for visual hierarchy
          const indented = renderMarkdown(body)
            .split("\n")
            .map((l) => "  " + l)
            .join("\n");
          console.log(indented);
        } else {
          console.log(theme.muted("  (no details)"));
        }

        console.log();
      }

      if (releases.length < count) {
        console.log(theme.muted(`  Showing all ${releases.length} release(s) in CHANGELOG.md\n`));
      } else {
        console.log(
          theme.muted(`  Showing last ${count} release(s). `) +
          theme.dim("Run with --count N for more, or --raw for full log.\n")
        );
      }
    });
}
