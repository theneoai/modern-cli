/**
 * upgrade-notifier.ts
 *
 * Silently checks npm for a newer version of the package once per day.
 * Results are cached in the user's config directory so the network request
 * is never on the critical path — it runs in the background and prints a
 * one-line notice at the end of the next command invocation.
 *
 * Inspired by `update-notifier` but implemented inline to stay ESM-native
 * and avoid the CommonJS compatibility shim.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { VERSION_META } from "../version.js";

const CACHE_DIR  = join(homedir(), ".modern-ai-cli");
const CACHE_FILE = join(CACHE_DIR, "update-check.json");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NPM_REGISTRY = "https://registry.npmjs.org";

interface CacheEntry {
  checkedAt: number;
  latestVersion: string;
  packageName: string;
}

function readCache(): CacheEntry | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    return JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(entry, null, 2), "utf-8");
  } catch {
    // Non-critical: ignore write errors
  }
}

/** Compare semver strings. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(/[-+]/)[0].split(".").map((n) => parseInt(n, 10) || 0);

  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

/** Fetch latest version from npm registry (non-blocking). */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
  const url = `${NPM_REGISTRY}/${packageName}/latest`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000); // 3 s timeout

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json() as { version: string };
    return data.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check for updates in the background (fire-and-forget).
 * Should be called at process startup — it never blocks.
 */
export function checkForUpdates(): void {
  // Don't check in CI or non-interactive environments
  if (process.env.CI || process.env.NO_UPDATE_CHECK || !process.stdout.isTTY) return;

  const now = Date.now();
  const cache = readCache();

  // Only check once per day
  if (cache && now - cache.checkedAt < ONE_DAY_MS) return;

  // Run the check asynchronously, detached from the main event loop
  setImmediate(() => {
    fetchLatestVersion(VERSION_META.name).then((latest) => {
      if (latest) {
        writeCache({ checkedAt: now, latestVersion: latest, packageName: VERSION_META.name });
      }
    }).catch(() => { /* ignore network errors */ });
  });
}

/**
 * If a cached update is available, print a notice to stderr.
 * Call this just before the process exits.
 */
export function printUpdateNotice(): void {
  if (process.env.CI || process.env.NO_UPDATE_CHECK || !process.stdout.isTTY) return;

  const cache = readCache();
  if (!cache) return;

  const current = VERSION_META.version;
  const latest  = cache.latestVersion;

  if (compareSemver(latest, current) <= 0) return;

  // Determine upgrade type for urgency framing
  const [curMaj] = current.split(".").map(Number);
  const [latMaj] = latest.split(".").map(Number);
  const isMajor  = latMaj > curMaj;

  const urgency = isMajor
    ? "\x1B[31m⬆ Major update\x1B[0m (may include breaking changes)"
    : "\x1B[33m⬆ Update available\x1B[0m";

  process.stderr.write(
    `\n  ${urgency}: \x1B[2mv${current}\x1B[0m → \x1B[32mv${latest}\x1B[0m\n` +
    `  Run: \x1B[36mnpm install -g ${VERSION_META.name}@${latest}\x1B[0m\n\n`
  );
}
