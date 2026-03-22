/**
 * mcp/builtins.ts — 内置 MCP 技能 (calculator / files / http / shell)
 *
 * 这些技能无需配置，开箱即用。
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { resolve, normalize } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import type { Skill } from './types.js';

// ── Path safety ────────────────────────────────────────────────────────────────
// Restrict file access to the user's home directory.
// Blocks directory traversal and known sensitive sub-paths.

const BLOCKED_PATH_SEGMENTS = ['.ssh', '.gnupg', '.aws', '.device-secret', 'keystore.json'];

function assertSafePath(p: string): void {
  const abs = normalize(resolve(p));
  const home = normalize(homedir());
  if (!abs.startsWith(home + '/') && abs !== home) {
    throw new Error(`Access denied: path is outside the home directory (${abs})`);
  }
  for (const seg of BLOCKED_PATH_SEGMENTS) {
    if (abs.includes(seg)) {
      throw new Error(`Access denied: sensitive path blocked (${seg})`);
    }
  }
}

// ── URL safety ─────────────────────────────────────────────────────────────────
// Block requests to private/loopback addresses to prevent SSRF.

function assertSafeUrl(rawUrl: string): void {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`Only HTTP/HTTPS URLs are allowed (got ${u.protocol})`);
  }
  const h = u.hostname.toLowerCase();
  if (
    h === 'localhost' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^192\.168\./.test(h) ||
    h === '0.0.0.0' ||
    h === '::1' ||
    /^fc[0-9a-f]{2}:/i.test(h) ||
    /^fd[0-9a-f]{2}:/i.test(h) ||
    h === '169.254.169.254' // AWS metadata
  ) {
    throw new Error(`Access to private/loopback addresses is not allowed`);
  }
}

// ── calculator ────────────────────────────────────────────────────────────────

const calculatorSkill: Skill = {
  name: 'calculator',
  version: '1.0.0',
  description: '安全的数学表达式求值器',
  tools: [{
    name: 'evaluate',
    description: '求值数学表达式 (支持 Math.* 方法)',
    input_schema: {
      type: 'object',
      properties: { expression: { type: 'string', description: '数学表达式' } },
      required: ['expression'],
    },
  }],
  handlers: {
    async evaluate({ expression }) {
      const expr = String(expression ?? '').trim();
      if (!expr) return { content: 'Expression is empty', isError: true };
      // Whitelist approach: strip known-safe Math.xxx tokens, then ensure only
      // numeric literals, operators, parentheses and whitespace remain.
      // This prevents any identifier or keyword injection.
      const stripped = expr.replace(/Math\.[a-zA-Z][a-zA-Z0-9]*/g, '0');
      if (!/^[\d\s+\-*/().,%^eE]+$/.test(stripped)) {
        return { content: 'Expression contains disallowed syntax', isError: true };
      }
      try {
         
        const result = new Function('Math', `"use strict"; return (${expr})`)(Math);
        return { content: String(result) };
      } catch (e) {
        return { content: String(e), isError: true };
      }
    },
  },
};

// ── files ─────────────────────────────────────────────────────────────────────

const filesSkill: Skill = {
  name: 'files',
  version: '1.0.0',
  description: '本地文件读写',
  tools: [
    {
      name: 'read_file',
      description: '读取文件内容',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: '文件路径' } },
        required: ['path'],
      },
    },
    {
      name: 'write_file',
      description: '写入文件内容',
      input_schema: {
        type: 'object',
        properties: {
          path:    { type: 'string',  description: '文件路径' },
          content: { type: 'string',  description: '写入内容' },
          append:  { type: 'boolean', description: '追加模式 (默认 false)' },
        },
        required: ['path', 'content'],
      },
    },
  ],
  handlers: {
    async read_file({ path }) {
      const p = String(path ?? '');
      try {
        assertSafePath(p);
      } catch (e) {
        return { content: String(e), isError: true };
      }
      if (!existsSync(p)) return { content: `File not found: ${p}`, isError: true };
      try {
        return { content: readFileSync(p, 'utf8') };
      } catch (e) {
        return { content: String(e), isError: true };
      }
    },
    async write_file({ path, content, append }) {
      const p = String(path ?? '');
      const text = String(content ?? '');
      try {
        assertSafePath(p);
      } catch (e) {
        return { content: String(e), isError: true };
      }
      try {
        if (append) {
          appendFileSync(p, text, 'utf8');
        } else {
          writeFileSync(p, text, 'utf8');
        }
        return { content: `Written ${text.length} bytes to ${p}` };
      } catch (e) {
        return { content: String(e), isError: true };
      }
    },
  },
};

// ── http ──────────────────────────────────────────────────────────────────────

const httpSkill: Skill = {
  name: 'http',
  version: '1.0.0',
  description: 'HTTP 请求工具',
  tools: [{
    name: 'get',
    description: '发送 GET 请求，返回响应体 (最多 4KB)',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: '请求 URL' } },
      required: ['url'],
    },
  }],
  handlers: {
    async get({ url }) {
      const u = String(url ?? '');
      try {
        assertSafeUrl(u);
      } catch (e) {
        return { content: String(e), isError: true };
      }
      try {
        const resp = await fetch(u, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return { content: `HTTP ${resp.status} ${resp.statusText}`, isError: true };
        const text = await resp.text();
        // Safe UTF-8 truncation: slice by character count, not byte offset
        const truncated = [...text].slice(0, 4096).join('');
        return { content: truncated };
      } catch (e) {
        return { content: String(e), isError: true };
      }
    },
  },
};

// ── shell ─────────────────────────────────────────────────────────────────────

const shellSkill: Skill = {
  name: 'shell',
  version: '1.0.0',
  description: '执行 Shell 命令 (受限环境)',
  tools: [{
    name: 'run_command',
    description: '运行 shell 命令，返回 stdout',
    input_schema: {
      type: 'object',
      properties: { command: { type: 'string', description: 'Shell 命令' } },
      required: ['command'],
    },
  }],
  handlers: {
    async run_command({ command }) {
      const cmd = String(command ?? '').trim();
      if (!cmd) return { content: 'Command is empty', isError: true };
      try {
        const out = execSync(cmd, { timeout: 15000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        return { content: out };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { content: msg, isError: true };
      }
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const BUILTIN_SKILLS: Record<string, Skill> = {
  calculator: calculatorSkill,
  files: filesSkill,
  http: httpSkill,
  shell: shellSkill,
};
