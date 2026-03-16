import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: MessageParam[];
}

const HISTORY_DIR = join(homedir(), ".modern-ai-cli", "history");

function ensureHistoryDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true });
  }
}

function sessionPath(id: string): string {
  return join(HISTORY_DIR, `${id}.json`);
}

export function saveSession(session: ChatSession): void {
  ensureHistoryDir();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), "utf-8");
}

export function loadSession(id: string): ChatSession | null {
  const path = sessionPath(id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ChatSession;
  } catch {
    return null;
  }
}

export function listSessions(): ChatSession[] {
  ensureHistoryDir();
  try {
    const files = readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(HISTORY_DIR, f), "utf-8")) as ChatSession;
        } catch {
          return null;
        }
      })
      .filter((s): s is ChatSession => s !== null)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  } catch {
    return [];
  }
}

export function deleteSession(id: string): boolean {
  const path = sessionPath(id);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

export function createSession(firstMessage?: string): ChatSession {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = new Date().toISOString();
  return {
    id,
    title: firstMessage
      ? firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "…" : "")
      : "New conversation",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
