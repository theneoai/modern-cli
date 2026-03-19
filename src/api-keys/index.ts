/**
 * API Key Manager - Secure API key storage and rotation
 */

import { randomBytes, createHash, randomUUID } from 'crypto';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string; // First 8 chars of key
  scopes: string[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  metadata?: {
    description?: string;
    allowedIps?: string[];
    rateLimit?: number;
  };
}

// Generate new API key
export function generateApiKey(
  name: string,
  options: {
    scopes?: string[];
    expiresInDays?: number;
    metadata?: ApiKey['metadata'];
  } = {}
): { key: string; apiKey: ApiKey } {
  const db = getDB();
  const id = `key-${randomUUID().slice(0, 8)}`;
  
  // Generate secure key
  const keyBuffer = randomBytes(32);
  const key = `ht_${keyBuffer.toString('base64url')}`;
  const keyHash = hashKey(key);
  
  const now = new Date();
  const expiresAt = options.expiresInDays 
    ? new Date(now.getTime() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const apiKey: ApiKey = {
    id,
    name,
    keyPrefix: key.slice(0, 12),
    scopes: options.scopes || ['read'],
    expiresAt,
    isActive: true,
    createdAt: now,
    metadata: options.metadata,
  };

  db.prepare(`
    INSERT INTO api_keys (id, name, key_hash, key_prefix, scopes, expires_at, is_active, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    keyHash,
    apiKey.keyPrefix,
    JSON.stringify(apiKey.scopes),
    expiresAt?.toISOString() ?? null,
    1,
    options.metadata ? JSON.stringify(options.metadata) : null,
    now.toISOString()
  );

  events.emit('apikey.created', { keyId: id, name });

  return { key, apiKey };
}

// Hash key for storage
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Validate API key
export function validateApiKey(key: string): { valid: boolean; key?: ApiKey } {
  const db = getDB();
  const keyHash = hashKey(key);
  
  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1').get(keyHash) as any;
  if (!row) return { valid: false };

  // Check expiration
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { valid: false };
  }

  // Update last used
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
    .run(new Date().toISOString(), row.id);

  return { valid: true, key: rowToApiKey(row) };
}

// List API keys (without sensitive data)
export function listApiKeys(): ApiKey[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as any[];
  return rows.map(rowToApiKey);
}

// Get API key by ID
export function getApiKey(id: string): ApiKey | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToApiKey(row);
}

// Revoke API key
export function revokeApiKey(id: string): boolean {
  const db = getDB();
  const result = db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
  events.emit('apikey.revoked', { keyId: id });
  return result.changes > 0;
}

// Delete API key permanently
export function deleteApiKey(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  events.emit('apikey.deleted', { keyId: id });
  return result.changes > 0;
}

// Update API key
export function updateApiKey(
  id: string,
  updates: Partial<Pick<ApiKey, 'name' | 'scopes' | 'metadata'>>
): ApiKey | null {
  const db = getDB();
  const key = getApiKey(id);
  if (!key) return null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.scopes !== undefined) {
    sets.push('scopes = ?');
    params.push(JSON.stringify(updates.scopes));
  }
  if (updates.metadata !== undefined) {
    sets.push('metadata = ?');
    params.push(JSON.stringify(updates.metadata));
  }

  if (sets.length === 0) return key;

  params.push(id);
  db.prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  return getApiKey(id);
}

// Rotate API key (create new, revoke old)
export function rotateApiKey(id: string): { key: string; apiKey: ApiKey } | null {
  const oldKey = getApiKey(id);
  if (!oldKey) return null;

  // Revoke old key
  revokeApiKey(id);

  // Create new key with same settings
  const { key, apiKey } = generateApiKey(`${oldKey.name} (Rotated)`, {
    scopes: oldKey.scopes,
    metadata: oldKey.metadata,
  });

  events.emit('apikey.rotated', { oldKeyId: id, newKeyId: apiKey.id });
  return { key, apiKey };
}

// Check scope
export function hasScope(keyId: string, scope: string): boolean {
  const key = getApiKey(keyId);
  if (!key?.isActive) return false;
  return key.scopes.includes(scope) || key.scopes.includes('admin');
}

// Get usage statistics
export function getApiKeyStats(): {
  total: number;
  active: number;
  expired: number;
  byScope: Record<string, number>;
} {
  const db = getDB();
  const now = new Date().toISOString();

  const total = (db.prepare('SELECT COUNT(*) as count FROM api_keys').get() as any).count;
  const active = (db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get() as any).count;
  const expired = (db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE expires_at < ?').get(now) as any).count;

  const rows = db.prepare('SELECT scopes FROM api_keys').all() as any[];
  const byScope: Record<string, number> = {};
  
  for (const row of rows) {
    const scopes = JSON.parse(row.scopes);
    for (const scope of scopes) {
      byScope[scope] = (byScope[scope] || 0) + 1;
    }
  }

  return { total, active, expired, byScope };
}

// Cleanup expired keys
export function cleanupExpiredKeys(): number {
  const db = getDB();
  const result = db.prepare('DELETE FROM api_keys WHERE expires_at < ? AND is_active = 0')
    .run(new Date().toISOString());
  return result.changes;
}

// Initialize tables
export function initApiKeyTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      scopes TEXT NOT NULL,
      last_used_at TIMESTAMP,
      expires_at TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
  `);
}

// Helper
function rowToApiKey(row: any): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: JSON.parse(row.scopes),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at),
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
