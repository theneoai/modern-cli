/**
 * Plugin loader tests.
 * Tests scaffoldPlugin and the plugin module format validation.
 * File-system registry tests use the real PLUGINS_DIR (read-only assertions).
 */

import { mkdirSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { scaffoldPlugin } from "../plugins/loader.js";

const TMP = join(tmpdir(), `plugin-test-${Date.now()}`);

describe("scaffoldPlugin", () => {
  it("creates a file at the given path", () => {
    mkdirSync(TMP, { recursive: true });
    const out = join(TMP, "scaffold.mjs");
    scaffoldPlugin(out);
    expect(existsSync(out)).toBe(true);
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  it("scaffolded file exports required fields", async () => {
    mkdirSync(TMP, { recursive: true });
    const out = join(TMP, "scaffold2.mjs");
    scaffoldPlugin(out);
    const mod = await import(out) as { name?: unknown; version?: unknown; description?: unknown; register?: unknown };
    expect(typeof mod.name).toBe("string");
    expect(typeof mod.version).toBe("string");
    expect(typeof mod.description).toBe("string");
    expect(typeof mod.register).toBe("function");
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });
});

describe("plugin module format", () => {
  const validPlugin = `
export const name = "fmt-test-plugin";
export const version = "1.2.3";
export const description = "test plugin";
export function register(program) {
  program.command("fmt-test").action(() => {});
}
`;

  it("valid plugin module is importable and has correct exports", async () => {
    mkdirSync(TMP, { recursive: true });
    const p = join(TMP, "valid.mjs");
    writeFileSync(p, validPlugin, "utf-8");
    const mod = await import(p) as { name?: string; version?: string; description?: string; register?: unknown };
    expect(mod.name).toBe("fmt-test-plugin");
    expect(mod.version).toBe("1.2.3");
    expect(mod.description).toBe("test plugin");
    expect(typeof mod.register).toBe("function");
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });
});

describe("installLocalPlugin input validation", () => {
  it("throws when path does not exist", async () => {
    const { installLocalPlugin } = await import("../plugins/loader.js");
    await expect(installLocalPlugin("/no/such/file/plugin.mjs")).rejects.toThrow("File not found");
  });
});
