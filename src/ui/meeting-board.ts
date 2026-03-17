/**
 * Visual Meeting Board
 *
 * Real-time ANSI terminal display for multi-agent meetings.
 * Shows a "conference room" UI with participant cards and live transcript.
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  📋 Meeting: Build a REST API for user management       │
 *  │  Mode: roundtable  │  Round 1/2  │  Participants: 3     │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  🔬 researcher   │  📐 planner   │  💻 coder            │
 *  │  ✅ done (1.2k)  │  ⚡ speaking  │  ⏳ waiting          │
 *  ├─────────────────────────────────────────────────────────┤
 *  │  💬 planner: "We should start with the data models..."  │
 *  └─────────────────────────────────────────────────────────┘
 */

import type { MeetingConfig, MeetingParticipant, MeetingEvent } from "../agents/meeting.js";

const isTTY = process.stderr.isTTY;

type ParticipantStatus = "waiting" | "speaking" | "done" | "idle";

interface ParticipantCard {
  participant: MeetingParticipant;
  status: ParticipantStatus;
  tokens: number;
  durationMs: number;
  preview: string;
}

export class MeetingBoard {
  private config: MeetingConfig;
  private cards: Map<string, ParticipantCard> = new Map();
  private currentRound = 0;
  private totalRounds = 0;
  private livePreview = "";
  private liveSpeaker = "";
  private lines = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startTime = Date.now();

  constructor(config: MeetingConfig) {
    this.config = config;
    this.totalRounds = config.rounds;
    for (const p of config.participants) {
      this.cards.set(p.name, {
        participant: p,
        status: "waiting",
        tokens: 0,
        durationMs: 0,
        preview: "",
      });
    }
  }

  init(): void {
    if (!isTTY) {
      process.stderr.write(`\n🏛️  Meeting: ${this.config.topic}\n`);
      process.stderr.write(`   Participants: ${this.config.participants.map((p) => p.name).join(", ")}\n\n`);
      return;
    }
    this.render();
    this.timer = setInterval(() => this.render(), 200);
  }

  roundStart(round: number): void {
    this.currentRound = round;
    if (!isTTY) {
      process.stderr.write(`\n--- Round ${round}/${this.totalRounds} ---\n`);
    }
    // Reset all to idle for new round
    for (const card of this.cards.values()) {
      card.status = "waiting";
      card.preview = "";
    }
  }

  turnStart(participantName: string): void {
    this.liveSpeaker = participantName;
    this.livePreview = "";
    const card = this.cards.get(participantName);
    if (card) card.status = "speaking";
    if (!isTTY) {
      const p = this.config.participants.find((x) => x.name === participantName);
      process.stderr.write(`\n${p?.icon ?? "🤖"} ${participantName}:\n`);
    }
  }

  turnDelta(_participantName: string, delta: string): void {
    this.livePreview += delta;
    if (!isTTY) process.stderr.write(delta);
  }

  turnDone(participantName: string, tokens: number, durationMs: number): void {
    const card = this.cards.get(participantName);
    if (card) {
      card.status = "done";
      card.tokens = tokens;
      card.durationMs = durationMs;
      card.preview = this.livePreview.slice(-60).replace(/\n/g, " ");
    }
    if (participantName === this.liveSpeaker) {
      this.livePreview = "";
      this.liveSpeaker = "";
    }
    if (!isTTY) process.stderr.write(`\n✅ Done (${tokens} tokens)\n`);
  }

  stop(summary?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (isTTY) {
      this.erase();
      process.stderr.write(this.renderFinal(summary) + "\n");
    } else {
      process.stderr.write("\n--- Meeting Complete ---\n");
      if (summary) process.stderr.write(`\nSummary:\n${summary}\n`);
    }
  }

  // Build an event handler compatible with MeetingEventHandler
  makeEventHandler(): (event: MeetingEvent) => void {
    return (event: MeetingEvent) => {
      switch (event.type) {
        case "meeting_start":
          this.init();
          break;
        case "round_start":
          this.roundStart(event.round);
          break;
        case "turn_start":
          this.turnStart(event.participant.name);
          break;
        case "turn_delta":
          this.turnDelta(event.participantName, event.delta);
          break;
        case "turn_done":
          this.turnDone(
            event.participant.name,
            event.turn.tokensUsed ?? 0,
            event.turn.durationMs ?? 0
          );
          break;
        case "meeting_done":
          this.stop(event.transcript.summary);
          break;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private erase(): void {
    if (this.lines > 0) {
      process.stderr.write(`\x1b[${this.lines}A\x1b[0J`);
      this.lines = 0;
    }
  }

  private render(): void {
    this.erase();
    const frame = this.buildFrame();
    process.stderr.write(frame);
    this.lines = frame.split("\n").length - 1;
  }

  private buildFrame(): string {
    const cols = process.stderr.columns ?? 80;
    const width = Math.min(cols - 2, 100);
    const lines: string[] = [];

    const topBorder = "┌" + "─".repeat(width - 2) + "┐";
    const midBorder = "├" + "─".repeat(width - 2) + "┤";
    const botBorder = "└" + "─".repeat(width - 2) + "┘";

    const pad = (s: string, w: number) => {
      const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
      return s + " ".repeat(Math.max(0, w - visible.length));
    };

    const row = (content: string) => {
      const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
      const padded = content + " ".repeat(Math.max(0, width - 4 - visible.length));
      return `│ ${padded} │`;
    };

    // Header
    lines.push(topBorder);
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const elapsedStr = elapsed > 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
    const headerText = `🏛️  ${this.config.topic.slice(0, width - 30)}`;
    lines.push(row(headerText));
    const subText = `Mode: ${this.config.mode}  │  Round ${this.currentRound}/${this.totalRounds}  │  ${elapsedStr} elapsed`;
    lines.push(row(`\x1b[90m${subText}\x1b[0m`));
    lines.push(midBorder);

    // Participant cards
    const cards = [...this.cards.values()];
    const cardWidth = Math.floor((width - 2) / cards.length) - 1;

    // Icons + names row
    const nameRow = cards
      .map((c) => {
        const icon = c.participant.icon ?? "🤖";
        const name = `${icon} ${c.participant.name}`;
        return pad(`  ${name}`, cardWidth);
      })
      .join("│");
    lines.push(`│${nameRow}│`);

    // Status row
    const statusRow = cards
      .map((c) => {
        const st = statusLabel(c);
        return pad(`  ${st}`, cardWidth);
      })
      .join("│");
    lines.push(`│${statusRow}│`);

    lines.push(midBorder);

    // Live preview of current speaker
    const preview = this.liveSpeaker
      ? `\x1b[1m${this.liveSpeaker}\x1b[0m: ${this.livePreview.replace(/\n/g, " ").slice(-width + 20)}`
      : "\x1b[90m(waiting for next speaker...)\x1b[0m";
    lines.push(row(`💬 ${preview}`));

    lines.push(botBorder);
    return lines.join("\n") + "\n";
  }

  private renderFinal(summary?: string): string {
    const cols = process.stderr.columns ?? 80;
    const width = Math.min(cols - 2, 100);
    const lines: string[] = [];

    const totalMs = Date.now() - this.startTime;
    const elapsed = Math.floor(totalMs / 1000);
    const totalTok = [...this.cards.values()].reduce((s, c) => s + c.tokens, 0);

    lines.push("┌" + "─".repeat(width - 2) + "┐");
    const row = (content: string) => {
      const visible = content.replace(/\x1b\[[0-9;]*m/g, "");
      const padded = content + " ".repeat(Math.max(0, width - 4 - visible.length));
      return `│ ${padded} │`;
    };
    lines.push(row(`✅ Meeting Complete: ${this.config.topic.slice(0, width - 25)}`));
    lines.push(row(`\x1b[90m${elapsed}s total  │  ${totalTok} tokens  │  ${this.config.rounds} rounds\x1b[0m`));

    if (summary) {
      lines.push("├" + "─".repeat(width - 2) + "┤");
      lines.push(row("\x1b[1mKey Insights:\x1b[0m"));
      const summaryLines = summary.split("\n").slice(0, 8);
      for (const l of summaryLines) {
        lines.push(row(`  ${l.slice(0, width - 6)}`));
      }
    }

    lines.push("└" + "─".repeat(width - 2) + "┘");
    return lines.join("\n");
  }
}

function statusLabel(card: ParticipantCard): string {
  switch (card.status) {
    case "speaking": return "\x1b[33m⚡ speaking\x1b[0m";
    case "done":     return `\x1b[32m✅ done (${card.tokens}t)\x1b[0m`;
    case "waiting":  return "\x1b[90m⏳ waiting\x1b[0m";
    case "idle":     return "\x1b[90m  idle\x1b[0m";
  }
}
