/**
 * Remote skill registry client.
 *
 * Fetches the skill catalog from a hosted JSON endpoint.
 * Default registry: GitHub releases of modern-ai-cli skill catalog.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { RemoteRegistry, RemoteSkillEntry } from "./types.js";

const CACHE_DIR = join(homedir(), ".config", "modern-ai-cli");
const CACHE_FILE = join(CACHE_DIR, "skill-registry-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export const DEFAULT_REGISTRY_URL =
  "https://raw.githubusercontent.com/theneoai/modern-cli/main/skill-registry.json";

interface CacheEntry {
  url: string;
  fetchedAt: string;
  data: RemoteRegistry;
}

function readCache(url: string): RemoteRegistry | null {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const entry = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as CacheEntry;
    if (entry.url !== url) return null;
    if (Date.now() - new Date(entry.fetchedAt).getTime() > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

function writeCache(url: string, data: RemoteRegistry): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    CACHE_FILE,
    JSON.stringify({ url, fetchedAt: new Date().toISOString(), data }, null, 2),
    "utf-8"
  );
}

/** Fetch the remote skill registry (with local cache). */
export async function fetchRemoteRegistry(
  url = DEFAULT_REGISTRY_URL,
  forceRefresh = false
): Promise<RemoteRegistry> {
  if (!forceRefresh) {
    const cached = readCache(url);
    if (cached) return cached;
  }

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) {
    throw new Error(`Registry fetch failed: HTTP ${resp.status} from ${url}`);
  }
  const data = (await resp.json()) as RemoteRegistry;
  writeCache(url, data);
  return data;
}

/** Search the remote registry for skills matching a query. */
export async function searchRegistry(
  query: string,
  url = DEFAULT_REGISTRY_URL
): Promise<RemoteSkillEntry[]> {
  const reg = await fetchRemoteRegistry(url);
  const q = query.toLowerCase();
  return reg.skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
  );
}
