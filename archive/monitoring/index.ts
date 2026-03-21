/**
 * System Monitoring - Performance metrics and health checks
 */

import { execSync } from 'child_process';
import { writeFile } from 'fs/promises';
// path import removed
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
    temperature?: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
  processes: {
    total: number;
    running: number;
  };
}

export interface HealthCheck {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  responseTime: number;
  lastChecked: Date;
  message?: string;
}

export interface PerformanceAlert {
  id: string;
  metric: string;
  threshold: number;
  actualValue: number;
  severity: 'warning' | 'critical';
  timestamp: Date;
  acknowledged: boolean;
}

// Collect system metrics
export async function collectMetrics(): Promise<SystemMetrics> {
  const metrics: SystemMetrics = {
    timestamp: new Date(),
    cpu: await getCPUMetrics(),
    memory: getMemoryMetrics(),
    disk: getDiskMetrics(),
    network: await getNetworkMetrics(),
    processes: getProcessMetrics(),
  };

  // Save to database
  const db = getDB();
  db.prepare(`
    INSERT INTO system_metrics (timestamp, cpu_usage, memory_used, memory_total, disk_used, disk_total, network_in, network_out)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    metrics.timestamp.toISOString(),
    metrics.cpu.usage,
    metrics.memory.used,
    metrics.memory.total,
    metrics.disk.used,
    metrics.disk.total,
    metrics.network.bytesIn,
    metrics.network.bytesOut
  );

  // Check thresholds
  checkThresholds(metrics);

  events.emit('metrics.collected', { timestamp: metrics.timestamp });
  return metrics;
}

async function getCPUMetrics(): Promise<SystemMetrics['cpu']> {
  try {
    // Get CPU usage
    const usageOutput = execSync('top -l 1 | grep "CPU usage"', { encoding: 'utf-8' });
    const usageMatch = usageOutput.match(/(\d+\.?\d*)% user/);
    const usage = usageMatch ? parseFloat(usageMatch[1]) : 0;

    // Get load average
    const loadOutput = execSync('uptime', { encoding: 'utf-8' });
    const loadMatch = loadOutput.match(/load averages?:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    const loadAverage = loadMatch 
      ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
      : [0, 0, 0];

    return { usage, loadAverage };
  } catch {
    return { usage: 0, loadAverage: [0, 0, 0] };
  }
}

function getMemoryMetrics(): SystemMetrics['memory'] {
  try {
    const output = execSync('vm_stat', { encoding: 'utf-8' });
    const pageSize = 4096; // Default page size on macOS

    const freeMatch = output.match(/Pages free:\s+(\d+)/);
    const activeMatch = output.match(/Pages active:\s+(\d+)/);
    const inactiveMatch = output.match(/Pages inactive:\s+(\d+)/);
    const wiredMatch = output.match(/Pages wired down:\s+(\d+)/);

    const free = parseInt(freeMatch?.[1] || '0') * pageSize;
    const active = parseInt(activeMatch?.[1] || '0') * pageSize;
    const inactive = parseInt(inactiveMatch?.[1] || '0') * pageSize;
    const wired = parseInt(wiredMatch?.[1] || '0') * pageSize;

    const used = active + inactive + wired;
    const total = free + used;

    return {
      total,
      used,
      free,
      percentage: total > 0 ? (used / total) * 100 : 0,
    };
  } catch {
    return { total: 0, used: 0, free: 0, percentage: 0 };
  }
}

function getDiskMetrics(): SystemMetrics['disk'] {
  try {
    const output = execSync('df -k /', { encoding: 'utf-8' });
    const lines = output.split('\n');
    const dataLine = lines[1];
    const parts = dataLine.split(/\s+/).filter(Boolean);

    const total = parseInt(parts[1]) * 1024;
    const used = parseInt(parts[2]) * 1024;
    const free = parseInt(parts[3]) * 1024;

    return {
      total,
      used,
      free,
      percentage: total > 0 ? (used / total) * 100 : 0,
    };
  } catch {
    return { total: 0, used: 0, free: 0, percentage: 0 };
  }
}

async function getNetworkMetrics(): Promise<SystemMetrics['network']> {
  try {
    const output = execSync('netstat -ib', { encoding: 'utf-8' });
    const lines = output.split('\n');
    
    let bytesIn = 0;
    let bytesOut = 0;

    for (const line of lines.slice(1)) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length > 9 && parts[0] !== 'Name') {
        bytesIn += parseInt(parts[6]) || 0;
        bytesOut += parseInt(parts[9]) || 0;
      }
    }

    // Get connection count
    const connOutput = execSync('netstat -an | grep ESTABLISHED | wc -l', { encoding: 'utf-8' });
    const connections = parseInt(connOutput.trim()) || 0;

    return { bytesIn, bytesOut, connections };
  } catch {
    return { bytesIn: 0, bytesOut: 0, connections: 0 };
  }
}

function getProcessMetrics(): SystemMetrics['processes'] {
  try {
    const output = execSync('ps aux | wc -l', { encoding: 'utf-8' });
    const total = parseInt(output.trim()) - 1; // Subtract header

    const runningOutput = execSync('ps aux | grep " R " | wc -l', { encoding: 'utf-8' });
    const running = parseInt(runningOutput.trim());

    return { total, running };
  } catch {
    return { total: 0, running: 0 };
  }
}

// Check thresholds and generate alerts
function checkThresholds(metrics: SystemMetrics): void {
  const alerts: PerformanceAlert[] = [];

  if (metrics.cpu.usage > 90) {
    alerts.push(createAlert('cpu', 90, metrics.cpu.usage, 'critical'));
  } else if (metrics.cpu.usage > 70) {
    alerts.push(createAlert('cpu', 70, metrics.cpu.usage, 'warning'));
  }

  if (metrics.memory.percentage > 90) {
    alerts.push(createAlert('memory', 90, metrics.memory.percentage, 'critical'));
  } else if (metrics.memory.percentage > 80) {
    alerts.push(createAlert('memory', 80, metrics.memory.percentage, 'warning'));
  }

  if (metrics.disk.percentage > 90) {
    alerts.push(createAlert('disk', 90, metrics.disk.percentage, 'critical'));
  } else if (metrics.disk.percentage > 80) {
    alerts.push(createAlert('disk', 80, metrics.disk.percentage, 'warning'));
  }

  for (const alert of alerts) {
    saveAlert(alert);
    events.emit('monitoring.alert', alert);
  }
}

function createAlert(metric: string, threshold: number, actual: number, severity: PerformanceAlert['severity']): PerformanceAlert {
  return {
    id: `${metric}-${Date.now()}`,
    metric,
    threshold,
    actualValue: actual,
    severity,
    timestamp: new Date(),
    acknowledged: false,
  };
}

function saveAlert(alert: PerformanceAlert): void {
  const db = getDB();
  db.prepare(`
    INSERT INTO performance_alerts (id, metric, threshold, actual_value, severity, timestamp, acknowledged)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    alert.id,
    alert.metric,
    alert.threshold,
    alert.actualValue,
    alert.severity,
    alert.timestamp.toISOString(),
    alert.acknowledged ? 1 : 0
  );
}

// Get historical metrics
export function getMetricsHistory(hours: number = 24): SystemMetrics[] {
  const db = getDB();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const rows = db.prepare(`
    SELECT * FROM system_metrics 
    WHERE timestamp > ? 
    ORDER BY timestamp DESC
  `).all(cutoff) as any[];

  return rows.map(row => ({
    timestamp: new Date(row.timestamp),
    cpu: { usage: row.cpu_usage, loadAverage: [0, 0, 0] },
    memory: { used: row.memory_used, total: row.memory_total, free: row.memory_total - row.memory_used, percentage: (row.memory_used / row.memory_total) * 100 },
    disk: { used: row.disk_used, total: row.disk_total, free: row.disk_total - row.disk_used, percentage: (row.disk_used / row.disk_total) * 100 },
    network: { bytesIn: row.network_in, bytesOut: row.network_out, connections: 0 },
    processes: { total: 0, running: 0 },
  }));
}

// Health checks
export async function runHealthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Check database
  checks.push(await checkDatabase());

  // Check disk space
  checks.push(checkDiskSpace());

  // Check memory
  checks.push(checkMemory());

  return checks;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const db = getDB();
    db.prepare('SELECT 1').get();
    return {
      name: 'Database',
      status: 'healthy',
      responseTime: Date.now() - start,
      lastChecked: new Date(),
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'critical',
      responseTime: Date.now() - start,
      lastChecked: new Date(),
      message: error instanceof Error ? error.message : 'Database error',
    };
  }
}

function checkDiskSpace(): HealthCheck {
  const metrics = getDiskMetrics();
  return {
    name: 'Disk Space',
    status: metrics.percentage > 90 ? 'critical' : metrics.percentage > 80 ? 'warning' : 'healthy',
    responseTime: 0,
    lastChecked: new Date(),
    message: `${metrics.percentage.toFixed(1)}% used`,
  };
}

function checkMemory(): HealthCheck {
  const metrics = getMemoryMetrics();
  return {
    name: 'Memory',
    status: metrics.percentage > 90 ? 'critical' : metrics.percentage > 80 ? 'warning' : 'healthy',
    responseTime: 0,
    lastChecked: new Date(),
    message: `${metrics.percentage.toFixed(1)}% used`,
  };
}

// Start monitoring loop
let monitorInterval: NodeJS.Timeout | null = null;

export function startMonitoring(intervalMinutes: number = 5): void {
  if (monitorInterval) return;

  console.log(`📊 Monitoring started (${intervalMinutes}min interval)`);

  monitorInterval = setInterval(() => {
    void collectMetrics();
    void runHealthChecks();
  }, intervalMinutes * 60 * 1000);

  // Collect immediately
  void collectMetrics();
}

export function stopMonitoring(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('📊 Monitoring stopped');
  }
}

// Generate monitoring report
export async function generateReport(outputPath: string): Promise<void> {
  const metrics = getMetricsHistory(24);
  const avgCpu = metrics.reduce((sum, m) => sum + m.cpu.usage, 0) / metrics.length || 0;
  const avgMemory = metrics.reduce((sum, m) => sum + m.memory.percentage, 0) / metrics.length || 0;

  const report = `
# System Monitoring Report

Generated: ${new Date().toISOString()}

## Summary

- Average CPU: ${avgCpu.toFixed(1)}%
- Average Memory: ${avgMemory.toFixed(1)}%
- Data Points: ${metrics.length}

## Current Status

${(await runHealthChecks()).map(c => `- ${c.name}: ${c.status} ${c.message || ''}`).join('\n')}

## Recommendations

${avgCpu > 70 ? '- ⚠️ CPU usage is high, consider scaling or optimization' : '- ✅ CPU usage is normal'}
${avgMemory > 80 ? '- ⚠️ Memory usage is high, check for memory leaks' : '- ✅ Memory usage is normal'}
`;

  await writeFile(outputPath, report);
}

// Initialize tables
export function initMonitoringTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      cpu_usage REAL,
      memory_used INTEGER,
      memory_total INTEGER,
      disk_used INTEGER,
      disk_total INTEGER,
      network_in INTEGER,
      network_out INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp);

    CREATE TABLE IF NOT EXISTS performance_alerts (
      id TEXT PRIMARY KEY,
      metric TEXT NOT NULL,
      threshold REAL,
      actual_value REAL,
      severity TEXT,
      timestamp TIMESTAMP,
      acknowledged INTEGER DEFAULT 0
    );
  `);
}
