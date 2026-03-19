/**
 * Analytics - Advanced data analysis and insights
 */

import { getDB } from '../core/db/index.js';

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface TrendAnalysis {
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  average: number;
  min: number;
  max: number;
  forecast?: number;
}

// Get time series data
export function getTimeSeries(
  metric: string,
  timeRange: { hours?: number; days?: number }
): TimeSeriesData[] {
  const db = getDB();
  const hours = timeRange.hours ?? (timeRange.days ?? 1) * 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Try different tables based on metric
  const queries: Record<string, { table: string; valueCol: string; timeCol: string }> = {
    'agent-executions': { table: 'agent_executions', valueCol: '1', timeCol: 'executed_at' },
    'workflow-executions': { table: 'workflow_executions', valueCol: '1', timeCol: 'executed_at' },
    'api-calls': { table: 'performance_profiles', valueCol: 'duration', timeCol: 'created_at' },
    'memory-usage': { table: 'system_metrics', valueCol: 'memory_used', timeCol: 'timestamp' },
    'cpu-usage': { table: 'system_metrics', valueCol: 'cpu_usage', timeCol: 'timestamp' },
  };

  const query = queries[metric];
  if (!query) return [];

  try {
    const rows = db.prepare(`
      SELECT ${query.timeCol} as timestamp, ${query.valueCol} as value
      FROM ${query.table}
      WHERE ${query.timeCol} > ?
      ORDER BY ${query.timeCol} ASC
    `).all(cutoff) as any[];

    return rows.map(r => ({
      timestamp: new Date(r.timestamp),
      value: Number(r.value),
    }));
  } catch {
    return [];
  }
}

// Analyze trend
export function analyzeTrend(data: TimeSeriesData[]): TrendAnalysis {
  if (data.length < 2) {
    return { direction: 'stable', changePercent: 0, average: 0, min: 0, max: 0 };
  }

  const values = data.map(d => d.value);
  const first = values[0];
  const last = values[values.length - 1];
  const change = ((last - first) / first) * 100;

  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Simple linear regression for forecast
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = avg;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const forecast = last + slope;

  return {
    direction: change > 5 ? 'up' : change < -5 ? 'down' : 'stable',
    changePercent: change,
    average: avg,
    min,
    max,
    forecast,
  };
}

// Get system health score
export function getHealthScore(): {
  overall: number;
  components: Record<string, { score: number; status: 'healthy' | 'warning' | 'critical' }>;
} {
  const db = getDB();
  const components: Record<string, { score: number; status: 'healthy' | 'warning' | 'critical' }> = {};

  // Agent health
  try {
    const agentCount = (db.prepare('SELECT COUNT(*) as count FROM agents').get() as any).count;
    const agentHealth = agentCount > 0 ? 100 : 50;
    components.agents = { score: agentHealth, status: agentCount > 0 ? 'healthy' : 'warning' };
  } catch {
    components.agents = { score: 0, status: 'critical' };
  }

  // Workflow health
  try {
    const workflowRows = db.prepare(`
      SELECT status, COUNT(*) as count FROM workflow_executions 
      WHERE executed_at > datetime('now', '-1 day')
      GROUP BY status
    `).all() as any[];
    
    const total = workflowRows.reduce((sum, r) => sum + r.count, 0);
    const success = workflowRows.find(r => r.status === 'success')?.count || 0;
    const score = total > 0 ? (success / total) * 100 : 100;
    
    components.workflows = {
      score,
      status: score > 90 ? 'healthy' : score > 70 ? 'warning' : 'critical',
    };
  } catch {
    components.workflows = { score: 100, status: 'healthy' };
  }

  // Memory health
  try {
    const memoryRows = db.prepare(`
      SELECT AVG(memory_used) as avg FROM system_metrics 
      WHERE timestamp > datetime('now', '-1 hour')
    `).get() as any;
    
    const avgMemory = memoryRows?.avg || 0;
    const score = Math.max(0, 100 - (avgMemory / 1024 / 1024 / 1024) * 10); // Assume 10GB = 0 score
    
    components.memory = {
      score,
      status: score > 80 ? 'healthy' : score > 50 ? 'warning' : 'critical',
    };
  } catch {
    components.memory = { score: 100, status: 'healthy' };
  }

  // Calculate overall
  const scores = Object.values(components).map(c => c.score);
  const overall = scores.reduce((a, b) => a + b, 0) / scores.length;

  return { overall, components };
}

// Generate insights
export function generateInsights(): string[] {
  const insights: string[] = [];
  const db = getDB();

  // Most active agent
  try {
    const mostActive = db.prepare(`
      SELECT agent_id, COUNT(*) as count FROM agent_executions
      WHERE executed_at > datetime('now', '-7 days')
      GROUP BY agent_id ORDER BY count DESC LIMIT 1
    `).get() as any;
    
    if (mostActive) {
      insights.push(`Most active agent executed ${mostActive.count} times this week`);
    }
  } catch { /* ignore */ }

  // Workflow success rate
  try {
    const wfStats = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        COUNT(*) as total
      FROM workflow_executions
      WHERE executed_at > datetime('now', '-7 days')
    `).get() as any;
    
    if (wfStats?.total > 0) {
      const rate = ((wfStats.success / wfStats.total) * 100).toFixed(1);
      insights.push(`Workflow success rate: ${rate}% (${wfStats.success}/${wfStats.total})`);
    }
  } catch { /* ignore */ }

  // Growing knowledge base
  try {
    const entityCount = (db.prepare('SELECT COUNT(*) as count FROM knowledge_entities').get() as any)?.count || 0;
    if (entityCount > 0) {
      insights.push(`Knowledge base contains ${entityCount} entities`);
    }
  } catch { /* ignore */ }

  // System uptime estimation (based on metrics)
  try {
    const firstMetric = db.prepare('SELECT MIN(timestamp) as first FROM system_metrics').get() as any;
    if (firstMetric?.first) {
      const uptime = new Date().getTime() - new Date(firstMetric.first).getTime();
      const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
      if (days > 0) {
        insights.push(`System metrics tracked for ${days} days`);
      }
    }
  } catch { /* ignore */ }

  return insights;
}

// Export analytics data
export function exportAnalytics(format: 'json' | 'csv' = 'json'): string {
  const health = getHealthScore();
  const insights = generateInsights();
  
  const data = {
    exportedAt: new Date().toISOString(),
    health,
    insights,
    trends: {
      'agent-executions': analyzeTrend(getTimeSeries('agent-executions', { days: 7 })),
      'workflow-executions': analyzeTrend(getTimeSeries('workflow-executions', { days: 7 })),
    },
  };

  if (format === 'csv') {
    // Simple CSV export
    const rows = [
      'Metric,Score,Status',
      ...Object.entries(health.components).map(([name, comp]) => 
        `${name},${comp.score.toFixed(2)},${comp.status}`
      ),
    ];
    return rows.join('\n');
  }

  return JSON.stringify(data, null, 2);
}
