/**
 * security.ts — 网络访问 & 数据存储安全
 *
 * 功能:
 *   - URL 验证: 协议白名单 + 域名黑名单 + 内网地址阻断
 *   - 输入净化: 防止命令注入 / path traversal
 *   - 文件权限: 敏感文件强制 0600
 *   - 速率限制: 每分钟 API 调用上限
 *   - 审计日志: 关键操作追踪 (~/.neo/audit.log)
 *   - 输出净化: 移除 ANSI 转义以防终端注入
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

/** Domains/patterns that are never allowed even for https */
const URL_DENYLIST: RegExp[] = [
  /localhost/i,
  /127\.\d+\.\d+\.\d+/,
  /^10\.\d+\.\d+\.\d+/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/,
  /^192\.168\.\d+\.\d+/,
  /^0\.0\.0\.0/,
  /^::1$/,
  /^fd[0-9a-f]{2}:/i,   // IPv6 ULA
];

/** Known AI API domains — used for the provider price monitor allowlist */
export const AI_API_DOMAINS = [
  'api.anthropic.com',
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.moonshot.cn',
  'api.deepseek.com',
  'api.mistral.ai',
  'api.groq.com',
  'api.together.xyz',
];

// ── URL Validation ─────────────────────────────────────────────────────────────

export interface UrlCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Validate a URL before making a network request */
export function checkUrl(rawUrl: string): UrlCheckResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'URL 格式无效' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { allowed: false, reason: `不支持的协议: ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase();
  for (const pattern of URL_DENYLIST) {
    if (pattern.test(host)) {
      return { allowed: false, reason: `内网/保留地址不允许: ${host}` };
    }
  }

  return { allowed: true };
}

/** Throw if URL is not allowed */
export function assertSafeUrl(rawUrl: string): void {
  const result = checkUrl(rawUrl);
  if (!result.allowed) {
    throw new Error(`[Security] 网络请求被拒绝: ${result.reason} (${rawUrl})`);
  }
}

// ── Input Sanitization ────────────────────────────────────────────────────────

const SHELL_METACHAR_RE = /[;&|`$<>(){}[\]\\!]/g;
const PATH_TRAVERSAL_RE = /\.\.[/\\]/;
const NULL_BYTE_RE       = /\x00/g;

/** Strip shell metacharacters from a string (for display/logging only) */
export function sanitizeForLog(input: string): string {
  return input
    .replace(NULL_BYTE_RE, '')
    .replace(SHELL_METACHAR_RE, '_')
    .slice(0, 2000);
}

/** Validate a filesystem path: no traversal, must be under allowed roots */
export function assertSafePath(p: string, allowedRoot?: string): void {
  if (NULL_BYTE_RE.test(p)) throw new Error('[Security] 路径含非法字符 (null byte)');
  if (PATH_TRAVERSAL_RE.test(p)) throw new Error(`[Security] 路径遍历攻击: ${p}`);
  if (allowedRoot) {
    const resolved = path.resolve(p);
    const root = path.resolve(allowedRoot);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error(`[Security] 路径超出允许范围: ${resolved}`);
    }
  }
}

// ── File Permission Enforcement ───────────────────────────────────────────────

/** Ensure a file has mode 0600 (owner read/write only) */
export function enforceFileMode(filePath: string, mode = 0o600): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, mode);
    }
  } catch {
    // Non-fatal on platforms that don't support chmod (Windows)
  }
}

/** Write sensitive data to a file and immediately enforce permissions */
export function writeSecureFile(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const tmp = filePath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(tmp, data, { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
  enforceFileMode(filePath);
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const _rateLimits = new Map<string, RateLimitEntry>();

/**
 * Check and consume a rate limit token.
 * @returns true if allowed, false if rate-limited.
 */
export function rateLimit(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const entry = _rateLimits.get(key);
  if (!entry || now - entry.windowStart >= 60_000) {
    _rateLimits.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

const AUDIT_FILE = path.join(os.homedir(), '.neo', 'audit.log');
const MAX_AUDIT_BYTES = 5 * 1024 * 1024; // 5 MB

export type AuditAction =
  | 'key_add' | 'key_remove' | 'key_read'
  | 'provider_switch' | 'model_switch'
  | 'agent_start' | 'agent_stop'
  | 'url_blocked' | 'path_blocked';

export function auditLog(action: AuditAction, detail: string): void {
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    // Rotate if too large
    if (fs.existsSync(AUDIT_FILE)) {
      const stat = fs.statSync(AUDIT_FILE);
      if (stat.size > MAX_AUDIT_BYTES) {
        fs.renameSync(AUDIT_FILE, AUDIT_FILE + '.1');
      }
    }

    const line = JSON.stringify({
      t: new Date().toISOString(),
      action,
      detail: sanitizeForLog(detail),
    }) + '\n';
    fs.appendFileSync(AUDIT_FILE, line, { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // Audit failures are non-fatal
  }
}

// ── ANSI / terminal injection guard ──────────────────────────────────────────

/** Strip ANSI escape sequences to prevent terminal injection from AI output */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[mGKHF]/g, '').replace(/\x1b[()][AB012]/g, '');
}

/** Validate that a string doesn't contain OSC/DCS sequences used for terminal exploits */
export function assertNoTerminalEscape(str: string): void {
  // eslint-disable-next-line no-control-regex
  if (/\x1b[\]P]/.test(str)) {
    throw new Error('[Security] 输出含危险终端转义序列 (OSC/DCS)');
  }
}
