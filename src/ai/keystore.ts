/**
 * keystore.ts — 安全 API Key 存储
 *
 * 安全模型:
 *   - AES-256-GCM 加密，密钥由 scrypt(machineId, deviceSalt) 派生
 *   - Key 原文永不写磁盘、永不出现在日志
 *   - 三级权限隔离:
 *       read      — 使用密钥发起 AI 调用 (TUI / Agent 默认)
 *       configure — 查看/切换活跃密钥 (config 命令)
 *       admin     — 增删改查密钥 (CLI 交互)
 *   - 内存缓存: 同进程多次使用只解密一次
 *
 * 存储位置: ~/.neo/keystore.json  (权限 0600)
 * 格式:
 *   { version, deviceSalt, keys: [ { id, providerId, label, hint, iv, tag, cipher } ] }
 */

import { createCipheriv, createDecipheriv, scryptSync, randomBytes, randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { auditLog } from '../utils/security.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORE_DIR    = join(homedir(), '.neo');
const STORE_PATH   = join(STORE_DIR, 'keystore.json');
// Separate file for the device secret — random, machine-local, not derivable from hostname
const SECRET_PATH  = join(STORE_DIR, '.device-secret');
const ALGO    = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN  = 12;  // 96-bit IV for GCM

// ── Types ─────────────────────────────────────────────────────────────────────

export type Permission = 'read' | 'configure' | 'admin';

export interface KeyEntry {
  id: string;            // stable identifier e.g. "anthropic-default"
  providerId: string;    // "anthropic" | "openai" | "ollama" | ...
  label: string;         // human name e.g. "Anthropic (work)"
  hint: string;          // last 4 chars of key e.g. "...Ab3x"
  iv: string;            // hex, 12 bytes
  tag: string;           // hex, 16 bytes (GCM auth tag)
  cipher: string;        // hex, encrypted key bytes
  createdAt: number;
  lastUsed?: number;
}

interface StoreFile {
  version: 1;
  deviceSalt: string;    // hex, 32 bytes (random, generated once)
  activeKeys: Record<string, string>; // providerId → keyId
  keys: KeyEntry[];
}

// ── Device secret: random 32-byte value, stored at ~/.neo/.device-secret ─────
// Unlike hostname, this is unguessable even if the attacker knows the machine.
// Security model: to decrypt keys, attacker needs BOTH files:
//   ~/.neo/keystore.json  (ciphertext + salts)
//   ~/.neo/.device-secret (256-bit random secret)

function loadOrCreateDeviceSecret(): Buffer {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  if (existsSync(SECRET_PATH)) {
    const raw = readFileSync(SECRET_PATH, 'utf-8').trim();
    // Validate: must be exactly 64 lowercase hex chars (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error(
        `Device secret at ${SECRET_PATH} is corrupted (invalid format).\n` +
        `Delete it and restart to regenerate a new one.`
      );
    }
    const buf = Buffer.from(raw, 'hex');
    if (buf.length !== 32) {
      throw new Error(`Device secret has unexpected length: ${buf.length} bytes (expected 32)`);
    }
    return buf;
  }
  const secret = randomBytes(32);
  writeFileSync(SECRET_PATH, secret.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
  try { chmodSync(SECRET_PATH, 0o600); } catch { /* ignore on Windows */ }
  return secret;
}

// Lazily loaded, cached for process lifetime
let _deviceSecret: Buffer | null = null;
function deviceSecret(): Buffer {
  if (!_deviceSecret) _deviceSecret = loadOrCreateDeviceSecret();
  return _deviceSecret;
}

function deriveKey(deviceSalt: string): Buffer {
  // password = random device secret (not derivable from hostname)
  // salt     = per-keystore random salt (stored in keystore.json)
  return scryptSync(deviceSecret(), Buffer.from(deviceSalt, 'hex'), KEY_LEN);
}

// ── Encrypt / Decrypt ─────────────────────────────────────────────────────────

function encrypt(plaintext: string, key: Buffer): { iv: string; tag: string; cipher: string } {
  const iv = randomBytes(IV_LEN);
  const ciph = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([ciph.update(plaintext, 'utf8'), ciph.final()]);
  return {
    iv: iv.toString('hex'),
    tag: ciph.getAuthTag().toString('hex'),
    cipher: enc.toString('hex'),
  };
}

function decrypt(entry: Pick<KeyEntry, 'iv' | 'tag' | 'cipher'>, key: Buffer): string {
  const deciph = createDecipheriv(ALGO, key, Buffer.from(entry.iv, 'hex'));
  deciph.setAuthTag(Buffer.from(entry.tag, 'hex'));
  return Buffer.concat([
    deciph.update(Buffer.from(entry.cipher, 'hex')),
    deciph.final(),
  ]).toString('utf8');
}

// ── Store I/O ─────────────────────────────────────────────────────────────────

function loadStore(): StoreFile {
  if (!existsSync(STORE_PATH)) {
    return { version: 1, deviceSalt: randomBytes(32).toString('hex'), activeKeys: {}, keys: [] };
  }
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as StoreFile;
  } catch {
    // Corrupted store — return empty (keys will need to be re-added)
    return { version: 1, deviceSalt: randomBytes(32).toString('hex'), activeKeys: {}, keys: [] };
  }
}

function saveStore(store: StoreFile): void {
  if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try { chmodSync(STORE_PATH, 0o600); } catch { /* ignore on Windows */ }
}

// ── In-memory plaintext cache (cleared on process exit) ───────────────────────

const _cache = new Map<string, string>(); // keyId → plaintext key

// ── KeyStore class ────────────────────────────────────────────────────────────

export class KeyStore {
  private _store: StoreFile | null = null;
  private _encKey: Buffer | null = null;

  private get store(): StoreFile {
    if (!this._store) this._store = loadStore();
    return this._store;
  }

  private get encKey(): Buffer {
    if (!this._encKey) this._encKey = deriveKey(this.store.deviceSalt);
    return this._encKey;
  }

  // ── Admin operations ───────────────────────────────────────────────────────

  /** Add or replace a key. Returns the created entry (without plaintext). */
  addKey(
    providerId: string,
    plainKey: string,
    label?: string,
    id?: string,
  ): Omit<KeyEntry, 'iv' | 'tag' | 'cipher'> {
    const store = this.store;
    const keyId = id ?? `${providerId}-${randomUUID()}`;
    const hint = '...' + plainKey.slice(-4);
    const enc = encrypt(plainKey, this.encKey);

    const entry: KeyEntry = {
      id: keyId,
      providerId,
      label: label ?? `${providerId} key`,
      hint,
      iv: enc.iv,
      tag: enc.tag,
      cipher: enc.cipher,
      createdAt: Date.now(),
    };

    // Replace if same id exists
    const idx = store.keys.findIndex(k => k.id === keyId);
    if (idx >= 0) store.keys[idx] = entry;
    else store.keys.push(entry);

    // Auto-set as active if first key for this provider
    if (!store.activeKeys[providerId]) store.activeKeys[providerId] = keyId;

    _cache.set(keyId, plainKey);
    saveStore(store);
    this._store = store;
    auditLog('key_add', `provider=${providerId} id=${keyId} hint=${hint}`);

    const { iv: _iv, tag: _tag, cipher: _cipher, ...safe } = entry;
    void _iv; void _tag; void _cipher;
    return safe;
  }

  /** Remove a key by id */
  removeKey(id: string, perm: Permission = 'admin'): boolean {
    requirePerm(perm, 'admin');
    const store = this.store;
    const before = store.keys.length;
    store.keys = store.keys.filter(k => k.id !== id);
    _cache.delete(id);

    // Unset as active if needed
    for (const [pid, kid] of Object.entries(store.activeKeys)) {
      if (kid === id) delete store.activeKeys[pid];
    }

    if (store.keys.length !== before) {
      saveStore(store);
      this._store = store;
      auditLog('key_remove', `id=${id}`);
      return true;
    }
    return false;
  }

  /** Rotate a key: add new encrypted value, keep same id, invalidate cache */
  rotateKey(id: string, newPlainKey: string, perm: Permission = 'admin'): void {
    requirePerm(perm, 'admin');
    const store = this.store;
    const entry = store.keys.find(k => k.id === id);
    if (!entry) throw new Error(`Key '${id}' not found`);

    const enc = encrypt(newPlainKey, this.encKey);
    entry.iv = enc.iv;
    entry.tag = enc.tag;
    entry.cipher = enc.cipher;
    entry.hint = '...' + newPlainKey.slice(-4);

    _cache.set(id, newPlainKey);
    saveStore(store);
    this._store = store;
  }

  // ── Configure operations ───────────────────────────────────────────────────

  /** Set which key is active for a provider */
  setActive(providerId: string, keyId: string, perm: Permission = 'configure'): void {
    requirePerm(perm, 'configure');
    const store = this.store;
    if (!store.keys.find(k => k.id === keyId && k.providerId === providerId)) {
      throw new Error(`Key '${keyId}' not found for provider '${providerId}'`);
    }
    store.activeKeys[providerId] = keyId;
    saveStore(store);
    this._store = store;
  }

  // ── Read operations ────────────────────────────────────────────────────────

  /**
   * Get plaintext API key for a provider.
   * Permission: read (TUI / Agent default)
   */
  getKey(providerId: string, perm: Permission = 'read'): string | undefined {
    requirePerm(perm, 'read');

    // Env var override takes precedence
    const envKey = getEnvKey(providerId);
    if (envKey) return envKey;

    const store = this.store;
    const activeId = store.activeKeys[providerId];
    if (!activeId) return undefined;

    const entry = store.keys.find(k => k.id === activeId);
    if (!entry) return undefined;

    // Use cache
    if (_cache.has(activeId)) return _cache.get(activeId);

    const plain = decrypt(entry, this.encKey);
    _cache.set(activeId, plain);
    entry.lastUsed = Date.now();
    saveStore(store);

    return plain;
  }

  /**
   * List keys (without plaintext). Permission: configure.
   */
  listKeys(perm: Permission = 'configure'): Array<Omit<KeyEntry, 'iv' | 'tag' | 'cipher'> & { active: boolean }> {
    requirePerm(perm, 'configure');
    const store = this.store;
    return store.keys.map(({ iv: _iv, tag: _t, cipher: _c, ...safe }) => ({
      ...safe,
      active: store.activeKeys[safe.providerId] === safe.id,
    }));
  }

  /** Check if any key exists for a provider */
  hasKey(providerId: string): boolean {
    const envKey = getEnvKey(providerId);
    if (envKey) return true;
    const store = this.store;
    return store.activeKeys[providerId] !== undefined &&
      store.keys.some(k => k.providerId === providerId);
  }

  /** Get active key ID for a provider */
  getActiveKeyId(providerId: string): string | undefined {
    return this.store.activeKeys[providerId];
  }

  /** Export safe summary for display (no secrets) */
  summary(): { provider: string; label: string; hint: string; active: boolean }[] {
    const store = this.store;
    return store.keys.map(k => ({
      provider: k.providerId,
      label: k.label,
      hint: k.hint,
      active: store.activeKeys[k.providerId] === k.id,
    }));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERM_LEVEL: Record<Permission, number> = { read: 1, configure: 2, admin: 3 };

function requirePerm(actual: Permission, required: Permission): void {
  if (PERM_LEVEL[actual] < PERM_LEVEL[required]) {
    throw new Error(`Permission denied: '${required}' required, got '${actual}'`);
  }
}

// Map provider IDs to standard env var names
const ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai:    'OPENAI_API_KEY',
  gemini:    'GOOGLE_API_KEY',
  mistral:   'MISTRAL_API_KEY',
  deepseek:  'DEEPSEEK_API_KEY',
  groq:      'GROQ_API_KEY',
  together:  'TOGETHER_API_KEY',
};

function getEnvKey(providerId: string): string | undefined {
  const envVar = ENV_VARS[providerId];
  return envVar ? process.env[envVar] : undefined;
}

/** Global singleton */
export const keyStore = new KeyStore();
