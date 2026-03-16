import { SYSTEM_PROMPTS, PROMPT_DESCRIPTIONS, buildGeneratePrompt } from "../ai/prompts.js";

describe("SYSTEM_PROMPTS", () => {
  it("contains all expected modes", () => {
    const expectedModes = ["default", "code", "explain", "refactor", "debug", "creative", "shell"];
    for (const mode of expectedModes) {
      expect(SYSTEM_PROMPTS).toHaveProperty(mode);
      expect(typeof SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS]).toBe("string");
      expect(SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS].length).toBeGreaterThan(20);
    }
  });

  it("every mode has a description", () => {
    for (const mode of Object.keys(SYSTEM_PROMPTS)) {
      expect(PROMPT_DESCRIPTIONS).toHaveProperty(mode);
      expect(typeof PROMPT_DESCRIPTIONS[mode as keyof typeof PROMPT_DESCRIPTIONS]).toBe("string");
    }
  });
});

describe("buildGeneratePrompt", () => {
  it("builds prompt for function type", () => {
    const prompt = buildGeneratePrompt("function", "debounce utility", "TypeScript");
    expect(prompt).toContain("debounce utility");
    expect(prompt).toContain("TypeScript");
  });

  it("builds prompt for test type", () => {
    const prompt = buildGeneratePrompt("test", "user authentication");
    expect(prompt).toContain("user authentication");
    expect(prompt).toContain("test");
  });

  it("builds prompt without language", () => {
    const prompt = buildGeneratePrompt("component", "modal dialog");
    expect(prompt).toContain("modal dialog");
    // Should not have a language in the " in X" pattern
    expect(prompt).not.toContain(" in undefined");
  });

  it("builds prompts for all types", () => {
    const types = ["component", "function", "test", "docs", "script"] as const;
    for (const type of types) {
      const prompt = buildGeneratePrompt(type, "test description");
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(10);
    }
  });
});
