/**
 * Built-in MCP skills bundled with the CLI.
 *
 * These are always available and don't require installation.
 * Users can enable/disable them via `ai mcp enable/disable <skill>`.
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Skill, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// shell skill
// ---------------------------------------------------------------------------

const shellSkill: Skill = {
  name: "shell",
  version: "1.0.0",
  description: "Run shell commands in the current directory",
  author: "builtin",
  tags: ["system", "terminal"],
  tools: [
    {
      name: "run_command",
      description:
        "Execute a shell command and return stdout/stderr. " +
        "Use for file listing, git operations, running scripts, etc. " +
        "Commands run in the current working directory.",
      input_schema: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds (default: 10000, max: 60000)",
          },
        },
        required: ["command"],
      },
    },
  ],
  handlers: {
    run_command: async (input): Promise<ToolResult> => {
      const command = String(input["command"] ?? "");
      const timeout = Math.min(Number(input["timeout_ms"] ?? 10000), 60000);
      if (!command.trim()) {
        return { content: "Error: empty command", isError: true };
      }
      try {
        const output = execSync(command, {
          timeout,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return { content: output || "(no output)" };
      } catch (err) {
        const e = err as Error & { stderr?: string; stdout?: string };
        const msg = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n");
        return { content: msg || "Command failed", isError: true };
      }
    },
  },
};

// ---------------------------------------------------------------------------
// files skill
// ---------------------------------------------------------------------------

const filesSkill: Skill = {
  name: "files",
  version: "1.0.0",
  description: "Read and write files on the local filesystem",
  author: "builtin",
  tags: ["filesystem", "io"],
  tools: [
    {
      name: "read_file",
      description: "Read the contents of a file",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write content to a file (creates directories as needed)",
      input_schema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Absolute or relative file path" },
          content: { type: "string", description: "Content to write" },
          append: {
            type: "boolean",
            description: "If true, append instead of overwrite (default: false)",
          },
        },
        required: ["path", "content"],
      },
    },
  ],
  handlers: {
    read_file: async (input): Promise<ToolResult> => {
      const p = String(input["path"] ?? "");
      if (!p) return { content: "Error: path required", isError: true };
      if (!existsSync(p)) return { content: `File not found: ${p}`, isError: true };
      try {
        return { content: readFileSync(p, "utf-8") };
      } catch (err) {
        return { content: String(err), isError: true };
      }
    },
    write_file: async (input): Promise<ToolResult> => {
      const p = String(input["path"] ?? "");
      const content = String(input["content"] ?? "");
      const append = Boolean(input["append"]);
      if (!p) return { content: "Error: path required", isError: true };
      try {
        mkdirSync(dirname(p), { recursive: true });
        if (append) {
          writeFileSync(p, content, { flag: "a", encoding: "utf-8" });
        } else {
          writeFileSync(p, content, "utf-8");
        }
        return { content: `Written ${content.length} bytes to ${p}` };
      } catch (err) {
        return { content: String(err), isError: true };
      }
    },
  },
};

// ---------------------------------------------------------------------------
// http skill
// ---------------------------------------------------------------------------

const httpSkill: Skill = {
  name: "http",
  version: "1.0.0",
  description: "Make HTTP requests to fetch web content or call APIs",
  author: "builtin",
  tags: ["network", "web", "api"],
  tools: [
    {
      name: "fetch_url",
      description:
        "Fetch a URL via HTTP GET and return the response body (up to 32KB). " +
        "Useful for checking documentation, APIs, or web pages.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          headers: {
            type: "string",
            description: 'JSON object of request headers, e.g. {"Authorization":"Bearer token"}',
          },
        },
        required: ["url"],
      },
    },
  ],
  handlers: {
    fetch_url: async (input): Promise<ToolResult> => {
      const url = String(input["url"] ?? "");
      if (!url) return { content: "Error: url required", isError: true };
      try {
        let headers: Record<string, string> = {};
        if (input["headers"]) {
          headers = JSON.parse(String(input["headers"])) as Record<string, string>;
        }
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
        const text = await resp.text();
        const truncated = text.length > 32768 ? text.slice(0, 32768) + "\n...[truncated]" : text;
        return { content: `HTTP ${resp.status}\n\n${truncated}` };
      } catch (err) {
        return { content: String(err), isError: true };
      }
    },
  },
};

// ---------------------------------------------------------------------------
// calculator skill
// ---------------------------------------------------------------------------

const calculatorSkill: Skill = {
  name: "calculator",
  version: "1.0.0",
  description: "Evaluate mathematical expressions accurately",
  author: "builtin",
  tags: ["math", "utility"],
  tools: [
    {
      name: "evaluate",
      description:
        "Safely evaluate a mathematical expression. " +
        "Supports: +, -, *, /, **, %, Math.* functions, parentheses. " +
        "Returns the numeric result.",
      input_schema: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: 'Math expression, e.g. "2 ** 10 + Math.sqrt(144)"',
          },
        },
        required: ["expression"],
      },
    },
  ],
  handlers: {
    evaluate: async (input): Promise<ToolResult> => {
      const expr = String(input["expression"] ?? "").trim();
      if (!expr) return { content: "Error: expression required", isError: true };
      // Restrict to safe math operations only
      if (/[^0-9+\-*/.()%\s,a-zA-Z_]/.test(expr)) {
        return { content: "Error: invalid characters in expression", isError: true };
      }
      try {
        const result = new Function("Math", `"use strict"; return (${expr})`)(Math) as number;
        return { content: String(result) };
      } catch (err) {
        return { content: `Error: ${String(err)}`, isError: true };
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const BUILTIN_SKILLS: Record<string, Skill> = {
  shell: shellSkill,
  files: filesSkill,
  http: httpSkill,
  calculator: calculatorSkill,
};
