import { jest } from "@jest/globals";

// Mock the upgrade notifier so tests don't trigger network calls
jest.mock("../utils/upgrade-notifier.js", () => ({
  checkForUpdates: jest.fn(),
  printUpdateNotice: jest.fn(),
}));

import { createCLI } from "../cli.js";

const SAMPLE_CHANGELOG = `# Changelog

## [1.2.0] - 2026-03-15

### ✨ Features

- add dark mode support
- add streaming responses

### 🐛 Bug Fixes

- fix config not persisting on Windows

## [1.1.0] - 2026-02-01

### ✨ Features

- add generate command

## [1.0.0] - 2026-01-01

Initial release.
`;

describe("whatsnew command registration", () => {
  let program: ReturnType<typeof createCLI>;

  beforeEach(() => {
    program = createCLI();
  });

  it("registers the 'whatsnew' command", () => {
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("whatsnew");
  });

  it("has aliases 'changelog' and 'relnotes'", () => {
    const cmd = program.commands.find((c) => c.name() === "whatsnew");
    expect(cmd?.aliases()).toContain("changelog");
    expect(cmd?.aliases()).toContain("relnotes");
  });

  it("has --count, --current, --raw, --version-info options", () => {
    const cmd = program.commands.find((c) => c.name() === "whatsnew");
    const optionNames = cmd?.options.map((o) => o.long) ?? [];
    expect(optionNames).toContain("--count");
    expect(optionNames).toContain("--current");
    expect(optionNames).toContain("--raw");
    expect(optionNames).toContain("--version-info");
  });
});

describe("changelog parser", () => {
  function parseChangelog(content: string, count: number) {
    const releases: Array<{ version: string; date: string; body: string }> = [];
    const sections = content.split(/\n(?=##\s+[\[\d])/);
    for (const section of sections) {
      const m = section.match(/^##\s+\[?([\d.]+(?:-[\w.]+)?)\]?(?:\s+[-–]\s+(\d{4}-\d{2}-\d{2}))?/);
      if (!m) continue;
      releases.push({
        version: m[1],
        date: m[2] ?? "",
        body: section.replace(/^##[^\n]*\n/, "").trim(),
      });
      if (releases.length >= count) break;
    }
    return releases;
  }

  it("parses all releases from a changelog", () => {
    expect(parseChangelog(SAMPLE_CHANGELOG, 10)).toHaveLength(3);
  });

  it("respects the count limit", () => {
    const releases = parseChangelog(SAMPLE_CHANGELOG, 2);
    expect(releases).toHaveLength(2);
    expect(releases[0].version).toBe("1.2.0");
    expect(releases[1].version).toBe("1.1.0");
  });

  it("extracts version and date correctly", () => {
    const [latest] = parseChangelog(SAMPLE_CHANGELOG, 1);
    expect(latest.version).toBe("1.2.0");
    expect(latest.date).toBe("2026-03-15");
  });

  it("extracts body content", () => {
    const [latest] = parseChangelog(SAMPLE_CHANGELOG, 1);
    expect(latest.body).toContain("dark mode support");
    expect(latest.body).toContain("Bug Fixes");
  });

  it("returns empty array for empty changelog", () => {
    expect(parseChangelog("", 5)).toHaveLength(0);
    expect(parseChangelog("# Changelog\n\nSome intro text.\n", 5)).toHaveLength(0);
  });
});

describe("VERSION_META", () => {
  it("has required fields", async () => {
    const { VERSION_META } = await import("../version.js");
    expect(typeof VERSION_META.version).toBe("string");
    expect(VERSION_META.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof VERSION_META.buildTime).toBe("string");
    expect(typeof VERSION_META.name).toBe("string");
  });
});
