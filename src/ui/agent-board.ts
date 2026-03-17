/**
 * Visual Agent Board
 *
 * Shows each agent as an animated "card" in the terminal.
 * Renders a live status grid during orchestration, then streams
 * each agent's output below the board as they complete.
 *
 *   ╔══════════════════════════════════════════════════╗
 *   ║  ⚡ Multi-Agent Run  ·  parallel  ·  4 agents    ║
 *   ╠══════════════╦══════════════╦═════════════════════╣
 *   ║ 🔍 researcher║ 💻 coder    ║ ✨ synthesizer      ║
 *   ║  ⚡ running  ║  ⏳ waiting  ║  ⏳ waiting         ║
 *   ║  [████░░░░] ║             ║                     ║
 *   ╚══════════════╩══════════════╩═════════════════════╝
 */

import { theme } from "./theme.js";
import type { AgentRoleName } from "../agents/types.js";

// ---------------------------------------------------------------------------
// Agent status
// ---------------------------------------------------------------------------

export type AgentStatus = "waiting" | "running" | "done" | "error";

export interface AgentCard {
  id: string;
  role: AgentRoleName;
  icon: string;
  label: string;
  status: AgentStatus;
  /** elapsed ms */
  elapsedMs: number;
  /** token count when done */
  tokens?: number;
  /** short preview of output (last 60 chars) */
  preview?: string;
}

// ---------------------------------------------------------------------------
// Status rendering
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<AgentStatus, string> = {
  waiting: "⏳",
  running: "⚡",
  done:    "✅",
  error:   "❌",
};

const STATUS_COLORS: Record<AgentStatus, (s: string) => string> = {
  waiting: theme.muted,
  running: theme.secondary,
  done:    theme.success,
  error:   theme.error,
};

function statusLine(card: AgentCard): string {
  const icon = STATUS_ICONS[card.status];
  const label = STATUS_COLORS[card.status](`${icon} ${card.status}`);
  if (card.status === "running") {
    const elapsed = card.elapsedMs > 1000
      ? `${(card.elapsedMs / 1000).toFixed(1)}s`
      : `${card.elapsedMs}ms`;
    return `${label} ${theme.dim(elapsed)}`;
  }
  if (card.status === "done" && card.tokens) {
    const elapsed = card.elapsedMs > 1000
      ? `${(card.elapsedMs / 1000).toFixed(1)}s`
      : `${card.elapsedMs}ms`;
    return `${label} ${theme.dim(`${elapsed} · ${card.tokens}tok`)}`;
  }
  return label;
}

// ---------------------------------------------------------------------------
// Board renderer (non-interactive for CI / pipe safety)
// ---------------------------------------------------------------------------

const CARD_WIDTH = 22;
const MAX_CARDS_PER_ROW = 4;

function pad(s: string, width: number): string {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI
  const pad = Math.max(0, width - visible.length);
  return s + " ".repeat(pad);
}

function renderCard(card: AgentCard): string[] {
  const title = pad(`  ${card.icon} ${theme.bold(card.role)}`, CARD_WIDTH);
  const status = pad(`  ${statusLine(card)}`, CARD_WIDTH);
  const preview = card.preview
    ? pad(`  ${theme.dim(card.preview.slice(-18))}`, CARD_WIDTH)
    : pad("", CARD_WIDTH);
  return [title, status, preview];
}

/** Render the full board as a multi-line string (safe for any terminal). */
export function renderBoard(cards: AgentCard[], _goal: string, mode: string): string {
  const lines: string[] = [];
  const totalW = Math.min(cards.length, MAX_CARDS_PER_ROW) * (CARD_WIDTH + 1) + 1;
  const bar = "─".repeat(totalW);

  lines.push(theme.primary(`┌${bar}┐`));
  lines.push(
    theme.primary("│") +
    theme.heading(
      pad(`  ${theme.primary("⬡")} Multi-Agent  ·  ${mode}  ·  ${cards.length} agents  `, totalW)
    ) +
    theme.primary("│")
  );
  lines.push(theme.primary(`├${bar}┤`));

  // Chunk cards into rows of MAX_CARDS_PER_ROW
  for (let i = 0; i < cards.length; i += MAX_CARDS_PER_ROW) {
    const row = cards.slice(i, i + MAX_CARDS_PER_ROW);
    const rendered = row.map(renderCard);
    // 3 lines per card (title, status, preview)
    for (let lineIdx = 0; lineIdx < 3; lineIdx++) {
      const rowLine = row.map((_, ci) => rendered[ci]![lineIdx]!).join(theme.primary("│"));
      lines.push(theme.primary("│") + rowLine + theme.primary("│"));
    }
    if (i + MAX_CARDS_PER_ROW < cards.length) {
      lines.push(theme.primary(`├${bar}┤`));
    }
  }

  lines.push(theme.primary(`└${bar}┘`));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Live board manager (uses cursor movements for in-place updates)
// ---------------------------------------------------------------------------

export class AgentBoard {
  private cards: Map<string, AgentCard> = new Map();
  private startTimes: Map<string, number> = new Map();
  private mode: string;
  private boardLines = 0;
  private isTTY: boolean;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  constructor(_goal: string, mode: string) {
    this.mode = mode;
    this.isTTY = process.stdout.isTTY === true;
  }

  /** Register cards before starting */
  init(tasks: Array<{ id: string; role: AgentRoleName; icon: string }>): void {
    for (const t of tasks) {
      this.cards.set(t.id, {
        id: t.id,
        role: t.role,
        icon: t.icon,
        label: t.role,
        status: "waiting",
        elapsedMs: 0,
      });
    }
    this.render();
    // Tick every 200ms to update elapsed time on running agents
    if (this.isTTY) {
      this.tickInterval = setInterval(() => { this.tick(); }, 200);
    }
  }

  taskStart(id: string): void {
    this.startTimes.set(id, Date.now());
    const card = this.cards.get(id);
    if (card) { card.status = "running"; card.elapsedMs = 0; }
    this.render();
  }

  taskDelta(id: string, delta: string): void {
    const card = this.cards.get(id);
    if (!card) return;
    card.preview = (card.preview ?? "") + delta;
    // Keep only last 60 chars for preview
    if (card.preview.length > 60) card.preview = card.preview.slice(-60);
    if (this.isTTY) this.render();
  }

  taskDone(id: string, tokens: number, durationMs: number): void {
    const card = this.cards.get(id);
    if (card) { card.status = "done"; card.tokens = tokens; card.elapsedMs = durationMs; card.preview = undefined; }
    this.render();
  }

  taskError(id: string): void {
    const card = this.cards.get(id);
    if (card) card.status = "error";
    this.render();
  }

  stop(): void {
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.isTTY) this.clear();
    else this.render(); // final state in non-TTY
  }

  private tick(): void {
    let changed = false;
    for (const [id, card] of this.cards) {
      if (card.status === "running") {
        const start = this.startTimes.get(id) ?? Date.now();
        card.elapsedMs = Date.now() - start;
        changed = true;
      }
    }
    if (changed) this.render();
  }

  private render(): void {
    if (!this.isTTY) {
      // Non-TTY: just print a one-line status summary
      const running = [...this.cards.values()].filter((c) => c.status === "running").map((c) => c.role);
      const done = [...this.cards.values()].filter((c) => c.status === "done").length;
      if (running.length > 0) {
        process.stderr.write(
          `  [${done}/${this.cards.size}] running: ${running.join(", ")}\r`
        );
      }
      return;
    }

    // Move cursor up to overwrite previous board
    if (this.boardLines > 0) {
      process.stdout.write(`\x1b[${this.boardLines}A\x1b[0J`);
    }

    const board = renderBoard([...this.cards.values()], "", this.mode);
    process.stdout.write(board + "\n");
    this.boardLines = board.split("\n").length + 1;
  }

  private clear(): void {
    if (this.boardLines > 0 && this.isTTY) {
      process.stdout.write(`\x1b[${this.boardLines}A\x1b[0J`);
      this.boardLines = 0;
    }
  }
}
