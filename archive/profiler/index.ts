/**
 * Performance Profiler - Track and analyze system performance
 */

import { performance } from 'perf_hooks';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface PerformanceProfile {
  id: string;
  name: string;
  category: 'agent' | 'workflow' | 'skill' | 'query' | 'render' | 'api';
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryBefore?: number;
  memoryAfter?: number;
  memoryDelta?: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
  category: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
}

const activeProfiles = new Map<string, PerformanceProfile>();

// Start profiling
export function startProfile(
  name: string,
  category: PerformanceProfile['category'],
  metadata?: Record<string, unknown>
): string {
  const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  
  const profile: PerformanceProfile = {
    id,
    name,
    category,
    startTime: performance.now(),
    memoryBefore: process.memoryUsage().heapUsed,
    metadata,
  };
  
  activeProfiles.set(id, profile);
  return id;
}

// End profiling
export function endProfile(id: string): PerformanceProfile | null {
  const profile = activeProfiles.get(id);
  if (!profile) return null;

  profile.endTime = performance.now();
  profile.duration = profile.endTime - profile.startTime;
  profile.memoryAfter = process.memoryUsage().heapUsed;
  profile.memoryDelta = profile.memoryAfter - (profile.memoryBefore || 0);

  // Save to database
  saveProfile(profile);

  activeProfiles.delete(id);
  
  events.emit('profile.completed', { 
    name: profile.name, 
    category: profile.category, 
    duration: profile.duration 
  });

  return profile;
}

// Save profile to DB
function saveProfile(profile: PerformanceProfile): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO performance_profiles (id, name, category, start_time, end_time, duration, 
      memory_before, memory_after, memory_delta, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    profile.id,
    profile.name,
    profile.category,
    profile.startTime,
    profile.endTime ?? null,
    profile.duration ?? null,
    profile.memoryBefore ?? null,
    profile.memoryAfter ?? null,
    profile.memoryDelta ?? null,
    profile.metadata ? JSON.stringify(profile.metadata) : null,
    new Date().toISOString()
  );
}

// Get profile by ID
export function getProfile(id: string): PerformanceProfile | null {
  const db = getDB();
  const row = db.prepare('SELECT * FROM performance_profiles WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToProfile(row);
}

// Query profiles
export function queryProfiles(options: {
  category?: string;
  name?: string;
  startTime?: Date;
  endTime?: Date;
  minDuration?: number;
  limit?: number;
} = {}): PerformanceProfile[] {
  const db = getDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }
  if (options.name) {
    conditions.push('name LIKE ?');
    params.push(`%${options.name}%`);
  }
  if (options.startTime) {
    conditions.push('created_at >= ?');
    params.push(options.startTime.toISOString());
  }
  if (options.endTime) {
    conditions.push('created_at <= ?');
    params.push(options.endTime.toISOString());
  }
  if (options.minDuration) {
    conditions.push('duration >= ?');
    params.push(options.minDuration);
  }

  let sql = 'SELECT * FROM performance_profiles';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';
  if (options.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(rowToProfile);
}

// Get statistics
export function getPerformanceStats(timeRange?: { hours?: number; days?: number }): {
  byCategory: PerformanceStats[];
  slowestOperations: PerformanceProfile[];
  totalOperations: number;
  avgDuration: number;
} {
  const db = getDB();
  let whereClause = '';
  const params: unknown[] = [];

  if (timeRange) {
    const hours = timeRange.hours ?? (timeRange.days ?? 0) * 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    whereClause = 'WHERE created_at > ?';
    params.push(cutoff);
  }

  // Stats by category
  const categoryRows = db.prepare(`
    SELECT 
      category,
      COUNT(*) as count,
      AVG(duration) as avg_duration,
      MIN(duration) as min_duration,
      MAX(duration) as max_duration
    FROM performance_profiles
    ${whereClause}
    GROUP BY category
  `).all(...params) as any[];

  const byCategory: PerformanceStats[] = categoryRows.map(row => ({
    category: row.category,
    count: row.count,
    totalDuration: row.count * row.avg_duration,
    avgDuration: row.avg_duration,
    minDuration: row.min_duration,
    maxDuration: row.max_duration,
    p95Duration: 0, // Would need percentile calculation
  }));

  // Slowest operations
  const slowestRows = db.prepare(`
    SELECT * FROM performance_profiles
    ${whereClause}
    ORDER BY duration DESC
    LIMIT 10
  `).all(...params) as any[];

  const totalOps = (db.prepare(`
    SELECT COUNT(*) as count FROM performance_profiles ${whereClause}
  `).get(...params) as any).count;

  const avgDur = (db.prepare(`
    SELECT AVG(duration) as avg FROM performance_profiles ${whereClause}
  `).get(...params) as any)?.avg || 0;

  return {
    byCategory,
    slowestOperations: slowestRows.map(rowToProfile),
    totalOperations: totalOps,
    avgDuration: avgDur,
  };
}

// Profile decorator for async functions
export function Profile(category: PerformanceProfile['category'], name?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;
    const profileName = name || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const id = startProfile(profileName, category, { args: args.map((a: any) => typeof a) });
      try {
        const result = await original.apply(this, args);
        return result;
      } finally {
        endProfile(id);
      }
    };

    return descriptor;
  };
}

// Benchmark function
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T>,
  iterations: number = 10
): Promise<{ avg: number; min: number; max: number; results: T[] }> {
  const durations: number[] = [];
  const results: T[] = [];

  for (let i = 0; i < iterations; i++) {
    const id = startProfile(`${name}-iter-${i}`, 'query');
    const start = performance.now();
    
    const result = await fn();
    results.push(result);
    
    const end = performance.now();
    durations.push(end - start);
    endProfile(id);
  }

  return {
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    min: Math.min(...durations),
    max: Math.max(...durations),
    results,
  };
}

// Clean old profiles
export function cleanOldProfiles(olderThanDays: number): number {
  const db = getDB();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare('DELETE FROM performance_profiles WHERE created_at < ?').run(cutoff);
  return result.changes;
}

// Initialize tables
export function initProfilerTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS performance_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL,
      duration REAL,
      memory_before INTEGER,
      memory_after INTEGER,
      memory_delta INTEGER,
      metadata TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_perf_category ON performance_profiles(category);
    CREATE INDEX IF NOT EXISTS idx_perf_name ON performance_profiles(name);
    CREATE INDEX IF NOT EXISTS idx_perf_created ON performance_profiles(created_at);
  `);
}

// Helper
function rowToProfile(row: any): PerformanceProfile {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    duration: row.duration ?? undefined,
    memoryBefore: row.memory_before ?? undefined,
    memoryAfter: row.memory_after ?? undefined,
    memoryDelta: row.memory_delta ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}
