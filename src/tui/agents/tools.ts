/**
 * tools.ts — Agent 实际工具集
 *
 * 工具让 Agent 真正能做事，而不只是和自己对话。
 *
 * 工具设计原则:
 *   1. 每个工具返回 string — 直接嵌入 AI 上下文
 *   2. 有明确的字节/行数上限 — 防止 context 爆炸
 *   3. 沙箱优先 — run_shell 默认超时 10s，无网络权限
 *   4. 失败返回描述性错误字符串，不抛异常
 */

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { assertSafeUrl, assertSafePath, rateLimit } from '../../utils/security.js';

const execAsync = promisify(exec);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentTool {
  name: string;
  description: string;
  /** Parameters the AI should provide (for system prompt documentation) */
  params: string;
  run(args: Record<string, string>, agentId: string): Promise<string>;
}

// ── Tool: web_search (via Hacker News as a proxy for tech content) ────────────

const webSearchTool: AgentTool = {
  name: 'web_search',
  description: '搜索网络信息。返回摘要结果。',
  params: 'query: 搜索关键词',
  async run(args, agentId) {
    if (!rateLimit(`web_search:${agentId}`, 10)) {
      return '[工具限流] web_search: 每分钟最多 10 次';
    }
    const q = (args['query'] ?? '').trim();
    if (!q) return '[工具错误] query 参数不能为空';

    const encoded = encodeURIComponent(q);
    const url = `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=5`;
    try {
      assertSafeUrl(url);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return `[工具错误] HTTP ${res.status}`;

      interface HNHit { title: string; url?: string; points: number; author: string }
      interface HNResult { hits: HNHit[] }
      const data = await res.json() as HNResult;
      if (!data.hits?.length) return `[web_search] "${q}": 无结果`;

      const lines = data.hits.map((h, i) =>
        `${i + 1}. ${h.title}\n   URL: ${h.url ?? 'N/A'}  ↑${h.points}`
      );
      return `[web_search 结果: "${q}"]\n${lines.join('\n')}`;
    } catch (e) {
      return `[工具错误] web_search: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

// ── Tool: http_get — Fetch a specific URL ────────────────────────────────────

const httpGetTool: AgentTool = {
  name: 'http_get',
  description: '获取指定 URL 的内容 (最多 8KB)。只支持 https。',
  params: 'url: 目标 URL',
  async run(args, agentId) {
    if (!rateLimit(`http_get:${agentId}`, 5)) {
      return '[工具限流] http_get: 每分钟最多 5 次';
    }
    const url = (args['url'] ?? '').trim();
    try {
      assertSafeUrl(url);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'NEO-Agent/0.4 (research bot)' },
      });
      if (!res.ok) return `[工具错误] HTTP ${res.status}: ${url}`;
      const text = await res.text();
      // Strip HTML tags and truncate
      const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const snippet = clean.slice(0, 6000);
      return `[http_get: ${url}]\n${snippet}${clean.length > 6000 ? '\n... (已截断)' : ''}`;
    } catch (e) {
      return `[工具错误] http_get: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

// ── Tool: read_file — Read local file ────────────────────────────────────────

const readFileTool: AgentTool = {
  name: 'read_file',
  description: '读取本地文件内容 (最多 200 行 / 16KB)。',
  params: 'path: 文件路径',
  async run(args) {
    const p = (args['path'] ?? '').trim();
    try {
      assertSafePath(p);
      if (!existsSync(p)) return `[工具错误] 文件不存在: ${p}`;
      const stat = statSync(p);
      if (!stat.isFile()) return `[工具错误] 不是文件: ${p}`;
      if (stat.size > 100 * 1024) return `[工具错误] 文件过大 (${Math.round(stat.size/1024)}KB > 100KB)`;
      const content = readFileSync(p, 'utf-8');
      const lines = content.split('\n');
      const preview = lines.slice(0, 200).join('\n');
      return `[read_file: ${p}] (${lines.length} 行)\n\`\`\`\n${preview}${lines.length > 200 ? '\n... (已截断)' : ''}\n\`\`\``;
    } catch (e) {
      return `[工具错误] read_file: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

// ── Tool: write_file — Write local file ──────────────────────────────────────

const writeFileTool: AgentTool = {
  name: 'write_file',
  description: '将内容写入本地文件。若文件已存在会覆盖。',
  params: 'path: 文件路径  content: 要写入的内容',
  async run(args) {
    const p       = (args['path'] ?? '').trim();
    const content = args['content'] ?? '';
    try {
      assertSafePath(p);
      if (content.length > 200 * 1024) return '[工具错误] 内容过大 (> 200KB)';
      writeFileSync(p, content, { encoding: 'utf-8' });
      return `[write_file] ✓ 已写入 ${p} (${content.length} 字节)`;
    } catch (e) {
      return `[工具错误] write_file: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

// ── Tool: run_shell — Execute a shell command (sandboxed) ─────────────────────

// Note: node -e, python -c, and curl are intentionally excluded — they allow
// arbitrary code execution or SSRF that bypasses security controls.
// Use http_get tool for network access (which enforces assertSafeUrl).
const SHELL_ALLOWLIST = [
  /^ls(\s|$)/, /^cat\s/, /^echo\s/, /^pwd$/, /^date$/,
  /^grep\s/, /^find\s/, /^wc\s/, /^head\s/, /^tail\s/,
  /^git\s(status|log|diff|show|branch|stash list)/,
  /^npm\s(list|ls|outdated|run\s+[\w:-]+)$/,
  /^jq\s/,
];

const runShellTool: AgentTool = {
  name: 'run_shell',
  description: '执行安全的 shell 命令 (只读/只允许白名单命令，超时 10s)。',
  params: 'cmd: 要执行的命令',
  async run(args, agentId) {
    if (!rateLimit(`run_shell:${agentId}`, 8)) {
      return '[工具限流] run_shell: 每分钟最多 8 次';
    }
    const cmd = (args['cmd'] ?? '').trim();
    if (!cmd) return '[工具错误] cmd 参数不能为空';

    // Allowlist check
    const allowed = SHELL_ALLOWLIST.some(r => r.test(cmd));
    if (!allowed) {
      return `[工具拒绝] 命令未在白名单中: "${cmd}"\n允许: ls, cat, grep, find, git status/log/diff, npm list, node -e, python -c, curl -s https://`;
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 10000,
        maxBuffer: 64 * 1024,
      });
      const out = (stdout + (stderr ? `\n[stderr]: ${stderr}` : '')).trim();
      return `[run_shell: ${cmd}]\n${out.slice(0, 4000)}${out.length > 4000 ? '\n... (截断)' : ''}`;
    } catch (e) {
      return `[工具错误] run_shell: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
};

// ── Tool Registry ─────────────────────────────────────────────────────────────

export const AGENT_TOOLS: Record<string, AgentTool> = {
  web_search: webSearchTool,
  http_get:   httpGetTool,
  read_file:  readFileTool,
  write_file: writeFileTool,
  run_shell:  runShellTool,
};

/**
 * Parse tool calls from AI output.
 * Format the AI should use:
 *   [TOOL: web_search] query=关键词
 *   [TOOL: read_file] path=/tmp/foo.txt
 *   [TOOL: run_shell] cmd=git status
 */
export function parseToolCalls(text: string): Array<{ tool: string; args: Record<string, string> }> {
  const calls: Array<{ tool: string; args: Record<string, string> }> = [];
  // Match [TOOL: <name>] <key>=<value> pairs on same line (or next lines until blank)
  const pattern = /\[TOOL:\s*([\w_]+)\]\s*([^\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const toolName = m[1]!;
    const argStr   = m[2]!;
    const args: Record<string, string> = {};
    // Parse key=value pairs, value may be quoted or run to end
    const argPattern = /([\w]+)=(?:"([^"]*)"|(\S.*))/g;
    let a: RegExpExecArray | null;
    while ((a = argPattern.exec(argStr)) !== null) {
      args[a[1]!] = (a[2] ?? a[3] ?? '').trim();
    }
    calls.push({ tool: toolName, args });
  }
  return calls;
}

/** Build tool usage documentation for agent system prompt */
export function buildToolDocs(enabledTools: string[] = Object.keys(AGENT_TOOLS)): string {
  const lines = ['## 可用工具', '使用格式: [TOOL: <工具名>] <参数>=<值>', ''];
  for (const name of enabledTools) {
    const t = AGENT_TOOLS[name];
    if (!t) continue;
    lines.push(`### ${name}`);
    lines.push(`${t.description}`);
    lines.push(`参数: ${t.params}`);
    lines.push('');
  }
  lines.push('示例:');
  lines.push('  [TOOL: web_search] query=React 19 新特性');
  lines.push('  [TOOL: read_file] path=/tmp/report.md');
  lines.push('  [TOOL: run_shell] cmd=git log --oneline -10');
  return lines.join('\n');
}
