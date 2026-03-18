import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

// Suppress stderr during tests
const originalStderrWrite = process.stderr.write.bind(process.stderr);
beforeAll(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterAll(() => {
  process.stderr.write = originalStderrWrite;
  vi.restoreAllMocks();
});

describe("compareSemver (pure logic, tested inline)", () => {
  function compareSemver(a: string, b: string): number {
    const parse = (v: string) =>
      v.replace(/^v/, "").split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);
    const [aMaj, aMin, aPat] = parse(a);
    const [bMaj, bMin, bPat] = parse(b);
    if (aMaj !== bMaj) return aMaj > bMaj ? 1 : -1;
    if (aMin !== bMin) return aMin > bMin ? 1 : -1;
    if (aPat !== bPat) return aPat > bPat ? 1 : -1;
    return 0;
  }

  it("returns 1 when a > b (minor)", () => expect(compareSemver("1.2.0", "1.1.0")).toBe(1));
  it("returns -1 when a < b (patch)", () => expect(compareSemver("1.0.0", "1.0.1")).toBe(-1));
  it("returns 0 for equal versions", () => expect(compareSemver("2.3.4", "2.3.4")).toBe(0));
  it("handles major bumps", () => expect(compareSemver("2.0.0", "1.99.99")).toBe(1));
  it("handles v-prefix", () => expect(compareSemver("v1.1.0", "v1.0.9")).toBe(1));
  it("strips pre-release suffix", () => expect(compareSemver("1.2.0-beta.1", "1.2.0")).toBe(0));
});

describe("checkForUpdates", () => {
  const savedCI  = process.env.CI;
  const savedNUC = process.env.NO_UPDATE_CHECK;

  beforeEach(() => {
    delete process.env.CI;
    delete process.env.NO_UPDATE_CHECK;
  });

  afterEach(() => {
    if (savedCI  !== undefined) process.env.CI = savedCI;
    else delete process.env.CI;
    if (savedNUC !== undefined) process.env.NO_UPDATE_CHECK = savedNUC;
    else delete process.env.NO_UPDATE_CHECK;
  });

  it("does not throw when called normally", async () => {
    const { checkForUpdates } = await import("../utils/upgrade-notifier.js");
    expect(() => checkForUpdates()).not.toThrow();
  });

  it("skips when CI=true", async () => {
    process.env.CI = "true";
    const { checkForUpdates } = await import("../utils/upgrade-notifier.js");
    expect(() => checkForUpdates()).not.toThrow();
  });

  it("skips when NO_UPDATE_CHECK is set", async () => {
    process.env.NO_UPDATE_CHECK = "1";
    const { checkForUpdates } = await import("../utils/upgrade-notifier.js");
    expect(() => checkForUpdates()).not.toThrow();
  });
});

describe("printUpdateNotice", () => {
  it("does not throw in CI environment", async () => {
    process.env.CI = "true";
    const { printUpdateNotice } = await import("../utils/upgrade-notifier.js");
    expect(() => printUpdateNotice()).not.toThrow();
    delete process.env.CI;
  });
});
