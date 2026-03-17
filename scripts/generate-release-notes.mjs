#!/usr/bin/env node
/**
 * generate-release-notes.mjs
 *
 * Called by semantic-release's @semantic-release/exec plugin.
 * Receives the raw release notes (conventional-changelog format) via stdin,
 * then uses Claude to rewrite them as a polished, human-friendly release body.
 *
 * Usage (from .releaserc.json):
 *   "generateNotesCmd": "node scripts/generate-release-notes.mjs"
 *
 * The script writes the final markdown to stdout so semantic-release can
 * capture it as the GitHub Release body.
 *
 * Falls back to the raw notes if ANTHROPIC_API_KEY is not set.
 */

import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

const version = process.env.NEXT_RELEASE_VERSION ?? "?.?.?";
const rawNotes = (() => {
  try {
    // When called by exec plugin the notes are passed via RELEASE_NOTES env var
    if (process.env.RELEASE_NOTES) return process.env.RELEASE_NOTES;
    // Fallback: read stdin
    return readFileSync("/dev/stdin", "utf-8");
  } catch {
    return "";
  }
})();

if (!rawNotes.trim()) {
  process.stderr.write("No release notes provided — skipping AI enhancement.\n");
  process.exit(0);
}

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  process.stderr.write("ANTHROPIC_API_KEY not set — using raw conventional changelog notes.\n");
  process.stdout.write(rawNotes);
  process.exit(0);
}

const client = new Anthropic({ apiKey });

const systemPrompt = `You are a technical writer who specialises in clear, developer-friendly release notes.
Your task is to rewrite conventional-changelog output into polished, readable GitHub Release notes.

Guidelines:
- Keep all factual information — do NOT invent features or fixes
- Group items into the same categories as the input (Features, Bug Fixes, etc.)
- Rewrite each bullet to be action-oriented and user-focused ("You can now…", "Fixed a crash when…")
- Add a 2–3 sentence TL;DR at the very top summarising the release
- Preserve code references, PR numbers, and commit hashes if present
- Output pure GitHub-flavored Markdown — no preamble, no "Here are the notes:" wrapper
- Be concise: quality over quantity`;

const userMessage = `Rewrite these release notes for version ${version} of modern-ai-cli:

---
${rawNotes}
---`;

process.stderr.write(`Generating AI-enhanced release notes for v${version}…\n`);

try {
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  process.stdout.write(text);
  process.stderr.write("\nDone.\n");
} catch (err) {
  process.stderr.write(`AI generation failed (${err.message}) — using raw notes.\n`);
  process.stdout.write(rawNotes);
  process.exit(0);
}
