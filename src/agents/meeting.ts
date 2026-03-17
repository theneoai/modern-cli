/**
 * Multi-Agent Meeting & Dialogue System
 *
 * Enables structured conversations between multiple agents:
 *   - roundtable: each agent speaks in turn, sees all prior turns
 *   - debate:     agents argue positions, others can rebut
 *   - brainstorm: free-association, agents build on each other's ideas
 *   - review:     one "author" presents, others review & critique
 *
 * Meetings are persisted to ~/.config/modern-ai-cli/meetings/
 * Key insights are optionally saved to shared memory after the meeting.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../utils/config.js";
import { resolveCustomSystemPrompt } from "./custom.js";
import { ROLE_SYSTEM_PROMPTS } from "./types.js";
import type { AgentRoleName } from "./types.js";
import { buildMemoryContext, addSharedMemory } from "./memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeetingMode = "roundtable" | "debate" | "brainstorm" | "review";

export const MEETING_MODE_DESCRIPTIONS: Record<MeetingMode, string> = {
  roundtable: "Each agent speaks in turn, seeing all prior contributions",
  debate:     "Agents argue positions and may rebut each other",
  brainstorm: "Agents build freely on each other's ideas without judgment",
  review:     "One presenter, others provide structured critique and feedback",
};

export interface MeetingParticipant {
  name: string;       // agent name or built-in role
  role: AgentRoleName;
  icon?: string;      // emoji icon for display
}

export interface MeetingTurn {
  id: string;
  participantName: string;
  content: string;
  timestamp: string;
  tokensUsed?: number;
  durationMs?: number;
}

export interface MeetingConfig {
  id: string;
  topic: string;
  participants: MeetingParticipant[];
  mode: MeetingMode;
  rounds: number;
  useMemory: boolean;
  saveToSharedMemory: boolean;
  createdAt: string;
}

export interface MeetingTranscript {
  config: MeetingConfig;
  turns: MeetingTurn[];
  summary?: string;
  conclusions?: string[];
  startedAt: string;
  endedAt?: string;
  totalTokens: number;
}

export type MeetingEvent =
  | { type: "meeting_start"; config: MeetingConfig }
  | { type: "round_start"; round: number; total: number }
  | { type: "turn_start"; participant: MeetingParticipant; round: number }
  | { type: "turn_delta"; participantName: string; delta: string }
  | { type: "turn_done"; turn: MeetingTurn; participant: MeetingParticipant }
  | { type: "meeting_done"; transcript: MeetingTranscript };

export type MeetingEventHandler = (event: MeetingEvent) => void;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const MEETINGS_DIR = join(homedir(), ".config", "modern-ai-cli", "meetings");

function ensureDir(): void {
  if (!existsSync(MEETINGS_DIR)) mkdirSync(MEETINGS_DIR, { recursive: true });
}

function meetingPath(id: string): string {
  return join(MEETINGS_DIR, `${id}.json`);
}

export function saveMeeting(transcript: MeetingTranscript): void {
  ensureDir();
  writeFileSync(meetingPath(transcript.config.id), JSON.stringify(transcript, null, 2));
}

export function loadMeeting(id: string): MeetingTranscript | null {
  const path = meetingPath(id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as MeetingTranscript;
}

export function listMeetings(limit = 20): MeetingTranscript[] {
  if (!existsSync(MEETINGS_DIR)) return [];
  return readdirSync(MEETINGS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(MEETINGS_DIR, f), "utf8")) as MeetingTranscript;
      } catch {
        return null;
      }
    })
    .filter((t): t is MeetingTranscript => t !== null)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, limit);
}

export function removeMeeting(id: string): boolean {
  const path = meetingPath(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

// ---------------------------------------------------------------------------
// System prompt resolution
// ---------------------------------------------------------------------------

function resolveSystemPrompt(participant: MeetingParticipant, mode: MeetingMode): string {
  const base = (() => {
    if (participant.role in ROLE_SYSTEM_PROMPTS)
      return ROLE_SYSTEM_PROMPTS[participant.role as keyof typeof ROLE_SYSTEM_PROMPTS];
    const custom = resolveCustomSystemPrompt(participant.role);
    if (custom) return custom;
    return `You are ${participant.name}, an AI agent.`;
  })();

  const modeInstructions: Record<MeetingMode, string> = {
    roundtable: "In this meeting, you will take turns discussing the topic. Be concise and build on what others have said.",
    debate: "In this debate, argue your position clearly and rebut opposing views with logic and evidence.",
    brainstorm: "In this brainstorm, freely share ideas without judgment. Build on others' ideas and be creative.",
    review: "In this review session, provide honest, constructive, and specific feedback.",
  };

  return `${base}\n\n${modeInstructions[mode]}\n\nKeep your responses focused and under 300 words unless depth is required.`;
}

// ---------------------------------------------------------------------------
// Meeting prompt builder
// ---------------------------------------------------------------------------

function buildTurnPrompt(
  config: MeetingConfig,
  participant: MeetingParticipant,
  priorTurns: MeetingTurn[],
  round: number,
  isLastRound: boolean,
  memoryContext: string
): string {
  const header = `# Meeting: ${config.topic}\nMode: ${config.mode} | Round ${round}/${config.rounds}`;

  const history =
    priorTurns.length > 0
      ? "\n## Conversation so far:\n" +
        priorTurns
          .map((t) => {
            const p = config.participants.find((p) => p.name === t.participantName);
            const icon = p?.icon ?? "🤖";
            return `**${icon} ${t.participantName}**: ${t.content}`;
          })
          .join("\n\n")
      : "";

  const memSection = memoryContext ? `\n## Relevant Memory:\n${memoryContext}\n` : "";

  const instruction = (() => {
    if (isLastRound) {
      return `\nThis is the FINAL round. As **${participant.icon ?? "🤖"} ${participant.name}**, provide your concluding thoughts, synthesis, or final position on the topic.`;
    }
    if (config.mode === "debate" && priorTurns.length > 0) {
      return `\nAs **${participant.icon ?? "🤖"} ${participant.name}**, respond to the previous points. Defend your position or acknowledge valid counterarguments.`;
    }
    if (config.mode === "brainstorm") {
      return `\nAs **${participant.icon ?? "🤖"} ${participant.name}**, contribute new ideas or build on existing ones. Be creative and expansive.`;
    }
    return `\nAs **${participant.icon ?? "🤖"} ${participant.name}**, share your perspective on the topic. Be specific and substantive.`;
  })();

  return [header, memSection, history, instruction].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Core meeting runner
// ---------------------------------------------------------------------------

export async function conductMeeting(
  config: MeetingConfig,
  onEvent?: MeetingEventHandler
): Promise<MeetingTranscript> {
  const aiConfig = await getConfig();
  const client = new Anthropic({ apiKey: aiConfig.apiKey });
  const emit = onEvent ?? (() => undefined);

  emit({ type: "meeting_start", config });

  const transcript: MeetingTranscript = {
    config,
    turns: [],
    startedAt: new Date().toISOString(),
    totalTokens: 0,
  };

  // Run rounds
  for (let round = 1; round <= config.rounds; round++) {
    emit({ type: "round_start", round, total: config.rounds });
    const isLastRound = round === config.rounds;

    for (const participant of config.participants) {
      emit({ type: "turn_start", participant, round });

      // Build memory context for this participant
      const memCtx = config.useMemory
        ? buildMemoryContext(participant.name, config.topic)
        : "";

      const systemPrompt = resolveSystemPrompt(participant, config.mode);
      const userPrompt = buildTurnPrompt(
        config,
        participant,
        transcript.turns,
        round,
        isLastRound,
        memCtx
      );

      const model = aiConfig.model ?? "claude-sonnet-4-6";
      const startMs = Date.now();
      let content = "";
      let inputTokens = 0;
      let outputTokens = 0;

      // Stream response
      const stream = client.messages.stream({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const delta = event.delta.text;
          content += delta;
          emit({ type: "turn_delta", participantName: participant.name, delta });
        } else if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
        }
      }

      const durationMs = Date.now() - startMs;
      const tokensUsed = inputTokens + outputTokens;

      const turn: MeetingTurn = {
        id: randomUUID(),
        participantName: participant.name,
        content,
        timestamp: new Date().toISOString(),
        tokensUsed,
        durationMs,
      };

      transcript.turns.push(turn);
      transcript.totalTokens += tokensUsed;

      emit({ type: "turn_done", turn, participant });
    }
  }

  // Generate meeting summary
  transcript.summary = await generateMeetingSummary(client, aiConfig.model ?? "claude-sonnet-4-6", transcript);
  transcript.conclusions = extractConclusions(transcript.summary);
  transcript.endedAt = new Date().toISOString();

  // Save to shared memory if configured
  if (config.saveToSharedMemory && transcript.summary) {
    addSharedMemory(transcript.summary, {
      tags: ["meeting", config.mode, config.topic.slice(0, 30)],
      importance: 7,
      summary: `Meeting: ${config.topic}`,
    });
  }

  saveMeeting(transcript);
  emit({ type: "meeting_done", transcript });

  return transcript;
}

// ---------------------------------------------------------------------------
// Summary generation
// ---------------------------------------------------------------------------

async function generateMeetingSummary(
  client: Anthropic,
  model: string,
  transcript: MeetingTranscript
): Promise<string> {
  const discussion = transcript.turns
    .map((t) => `**${t.participantName}**: ${t.content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: "You are a meeting facilitator. Summarize the key points and conclusions from this multi-agent discussion.",
    messages: [
      {
        role: "user",
        content: `Meeting topic: "${transcript.config.topic}"\nMode: ${transcript.config.mode}\n\n${discussion}\n\nProvide a concise summary (3-5 bullet points) of the main insights and any conclusions reached.`,
      },
    ],
  });

  return response.content[0]?.type === "text" ? response.content[0].text : "";
}

function extractConclusions(summary: string): string[] {
  return summary
    .split("\n")
    .filter((line) => line.match(/^[-•*]\s+/))
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Quick single-topic discussion factory
// ---------------------------------------------------------------------------

export function createMeetingConfig(opts: {
  topic: string;
  participants: MeetingParticipant[];
  mode?: MeetingMode;
  rounds?: number;
  useMemory?: boolean;
  saveToSharedMemory?: boolean;
}): MeetingConfig {
  return {
    id: randomUUID(),
    topic: opts.topic,
    participants: opts.participants,
    mode: opts.mode ?? "roundtable",
    rounds: opts.rounds ?? 2,
    useMemory: opts.useMemory ?? true,
    saveToSharedMemory: opts.saveToSharedMemory ?? true,
    createdAt: new Date().toISOString(),
  };
}
