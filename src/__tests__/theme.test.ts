import { formatHeader, formatError, formatSuccess, formatWarning } from "../ui/theme.js";

describe("theme helpers", () => {
  it("formatHeader returns a string containing the title", () => {
    const result = formatHeader("Test Title");
    // Strip ANSI codes for assertion
    const stripped = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(stripped).toContain("Test Title");
  });

  it("formatError contains the message", () => {
    const result = formatError("Something went wrong");
    const stripped = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(stripped).toContain("Something went wrong");
  });

  it("formatSuccess contains the message", () => {
    const result = formatSuccess("Done!");
    const stripped = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(stripped).toContain("Done!");
  });

  it("formatWarning contains the message", () => {
    const result = formatWarning("Be careful");
    const stripped = result.replace(/\x1B\[[0-9;]*m/g, "");
    expect(stripped).toContain("Be careful");
  });
});
