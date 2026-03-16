import { createCLI } from "../cli.js";

describe("CLI structure", () => {
  let program: ReturnType<typeof createCLI>;

  beforeEach(() => {
    program = createCLI();
  });

  it("registers the 'ask' command", () => {
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("ask");
  });

  it("registers the 'chat' command", () => {
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("chat");
  });

  it("registers the 'generate' command", () => {
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("generate");
  });

  it("registers the 'config' command", () => {
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("config");
  });

  it("has version set", () => {
    expect(program.version()).toBeDefined();
    expect(program.version()).toBeTruthy();
  });

  it("ask has an alias 'a'", () => {
    const askCmd = program.commands.find((c) => c.name() === "ask");
    expect(askCmd?.aliases()).toContain("a");
  });

  it("chat has an alias 'c'", () => {
    const chatCmd = program.commands.find((c) => c.name() === "chat");
    expect(chatCmd?.aliases()).toContain("c");
  });

  it("generate has alias 'gen' and 'g'", () => {
    const genCmd = program.commands.find((c) => c.name() === "generate");
    expect(genCmd?.aliases()).toContain("gen");
    expect(genCmd?.aliases()).toContain("g");
  });
});
