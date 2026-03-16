import { renderMarkdown, wrapText } from "../ui/output.js";

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, "");

describe("renderMarkdown", () => {
  it("renders inline code", () => {
    const input = "Use `console.log()` for debugging";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("console.log()");
  });

  it("renders bold text", () => {
    const input = "This is **important** text";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("important");
  });

  it("renders bullet lists", () => {
    const input = "- Item one\n- Item two\n- Item three";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("Item one");
    expect(result).toContain("Item two");
  });

  it("renders level-2 headers", () => {
    const input = "## Section Title";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("Section Title");
  });

  it("renders code blocks", () => {
    const input = "```typescript\nconst x = 1;\n```";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toContain("const x = 1;");
  });

  it("passes through plain text unchanged", () => {
    const input = "Just plain text here.";
    const result = stripAnsi(renderMarkdown(input));
    expect(result).toBe(input);
  });
});

describe("wrapText", () => {
  it("wraps text at specified width", () => {
    const input = "word ".repeat(30).trim();
    const result = wrapText(input, 20);
    const lines = result.split("\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it("preserves short text", () => {
    const input = "short text";
    expect(wrapText(input, 80)).toBe(input);
  });

  it("handles empty string", () => {
    expect(wrapText("", 80)).toBe("");
  });
});
