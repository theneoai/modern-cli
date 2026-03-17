/**
 * Tests for MCP built-in skill handlers (pure unit tests, no file-system mocking).
 */
import { describe, it, expect } from "@jest/globals";
import { BUILTIN_SKILLS } from "../mcp/builtins.js";

describe("Built-in skill catalog", () => {
  it("exports all 4 expected skills", () => {
    expect(Object.keys(BUILTIN_SKILLS).sort()).toEqual(
      ["calculator", "files", "http", "shell"].sort()
    );
  });

  it("each skill has name, version, description, tools and handlers", () => {
    for (const [name, skill] of Object.entries(BUILTIN_SKILLS)) {
      expect(skill.name).toBe(name);
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(skill.description.length).toBeGreaterThan(5);
      expect(skill.tools.length).toBeGreaterThan(0);
      expect(skill.handlers).toBeDefined();
    }
  });

  it("every tool definition has required input_schema fields", () => {
    for (const skill of Object.values(BUILTIN_SKILLS)) {
      for (const tool of skill.tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.input_schema.type).toBe("object");
        expect(typeof tool.input_schema.properties).toBe("object");
      }
    }
  });
});

describe("calculator skill handler", () => {
  const handler = BUILTIN_SKILLS["calculator"]!.handlers!["evaluate"]!;

  it("evaluates 2**10", async () => {
    const result = await handler({ expression: "2**10" });
    expect(result.content).toBe("1024");
    expect(result.isError).toBeFalsy();
  });

  it("evaluates sqrt(144)", async () => {
    const result = await handler({ expression: "Math.sqrt(144)" });
    expect(result.content).toBe("12");
    expect(result.isError).toBeFalsy();
  });

  it("evaluates compound expression", async () => {
    const result = await handler({ expression: "2**10 + Math.sqrt(144)" });
    expect(result.content).toBe("1036");
  });

  it("rejects expressions with semicolons", async () => {
    const result = await handler({ expression: "1; process" });
    expect(result.isError).toBe(true);
  });

  it("returns error for empty expression", async () => {
    const result = await handler({ expression: "" });
    expect(result.isError).toBe(true);
  });

  it("returns error for division by zero without crashing", async () => {
    const result = await handler({ expression: "1/0" });
    // Infinity is a valid JS result — should not error
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe("Infinity");
  });
});

describe("files skill handlers", () => {
  const readHandler = BUILTIN_SKILLS["files"]!.handlers!["read_file"]!;
  const writeHandler = BUILTIN_SKILLS["files"]!.handlers!["write_file"]!;
  const tmpPath = `/tmp/mcp-test-${Date.now()}.txt`;

  it("write_file creates a file", async () => {
    const result = await writeHandler({ path: tmpPath, content: "hello mcp" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("Written");
  });

  it("read_file reads back the written content", async () => {
    await writeHandler({ path: tmpPath, content: "hello mcp" });
    const result = await readHandler({ path: tmpPath });
    expect(result.isError).toBeFalsy();
    expect(result.content).toBe("hello mcp");
  });

  it("read_file errors on missing file", async () => {
    const result = await readHandler({ path: "/nonexistent/path/xyz.txt" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });

  it("write_file with append=true appends content", async () => {
    await writeHandler({ path: tmpPath, content: "line1\n" });
    await writeHandler({ path: tmpPath, content: "line2\n", append: true });
    const read = await readHandler({ path: tmpPath });
    expect(read.content).toBe("line1\nline2\n");
  });
});

describe("shell skill handler", () => {
  const handler = BUILTIN_SKILLS["shell"]!.handlers!["run_command"]!;

  it("runs echo and returns stdout", async () => {
    const result = await handler({ command: "echo hello-world" });
    expect(result.isError).toBeFalsy();
    expect(result.content.trim()).toBe("hello-world");
  });

  it("returns error result on nonzero exit", async () => {
    const result = await handler({ command: "exit 1" });
    expect(result.isError).toBe(true);
  });

  it("returns error for empty command", async () => {
    const result = await handler({ command: "" });
    expect(result.isError).toBe(true);
  });
});
