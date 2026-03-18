/**
 * Task Scheduler - Cron-like job scheduling with workflow integration
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';
import { executeWorkflow } from '../workflow/engine.js';

export interface ScheduledJob {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  timezone?: string;
  type: 'workflow' | 'agent' | 'skill' | 'script';
  targetId: string;
  params?: Record<string, any>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  runCount: number;
  failCount: number;
  createdAt: Date;
}

export interface JobExecution {
  id: string;
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  output?: any;
  error?: string;
}

// Parse cron expression and get next run time
export function getNextRunTime(cronExpression: string, _timezone?: string): Date | null {
  // Simple cron parser (supports: * * * * * format)
  // In production, use a proper cron parser library
  const parts = cronExpression.split(' ');
  if (parts.length !== 5) return null;

  const [minute, hour, dayOfMonth] = parts;
  const now = new Date();
  const next = new Date(now);

  // Simple implementation: add appropriate time
  if (minute === '*') {
    next.setMinutes(now.getMinutes() + 1);
  } else {
    next.setMinutes(parseInt(minute));
    if (next <= now) next.setHours(next.getHours() + 1);
  }

  if (hour !== '*') {
    next.setHours(parseInt(hour));
  }

  if (dayOfMonth !== '*') {
    next.setDate(parseInt(dayOfMonth));
  }

  return next;
}

// Create scheduled job
export function createScheduledJob(
  data: Omit<ScheduledJob, 'id' | 'createdAt' | 'runCount' | 'failCount' | 'enabled'>
): ScheduledJob {
  const job: ScheduledJob = {
    id: uuidv4(),
    ...data,
    enabled: true,
    runCount: 0,
    failCount: 0,
    nextRun: getNextRunTime(data.cronExpression, data.timezone),
    createdAt: new Date(),
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO scheduled_jobs (id, name, description, cron_expression, type, target_id, params, enabled, next_run, run_count, fail_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.name,
    job.description,
    job.cronExpression,
    job.timezone,
    job.type,
    job.targetId,
    JSON.stringify(job.params),
    job.enabled ? 1 : 0,
    job.nextRun?.toISOString(),
    job.runCount,
    job.failCount,
    job.createdAt.toISOString()
  );

  events.emit('scheduler.job.created', { jobId: job.id, name: job.name });
  return job;
}

// List scheduled jobs
export function listScheduledJobs(): ScheduledJob[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM scheduled_jobs ORDER BY created_at DESC').all() as any[];
  return rows.map(deserializeJob);
}

// Get job by ID
export function getScheduledJob(id: string): ScheduledJob | undefined {
  const db = getDB();
  const row = db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(id) as any;
  if (!row) return undefined;
  return deserializeJob(row);
}

// Enable/disable job
export function setJobEnabled(id: string, enabled: boolean): void {
  const db = getDB();
  const job = getScheduledJob(id);
  if (!job) throw new Error(`Job ${id} not found`);

  const nextRun = enabled ? getNextRunTime(job.cronExpression, job.timezone) : null;

  db.prepare('UPDATE scheduled_jobs SET enabled = ?, next_run = ? WHERE id = ?')
    .run(enabled ? 1 : 0, nextRun?.toISOString() || null, id);

  events.emit('scheduler.job.updated', { jobId: id, enabled });
}

// Delete job
export function deleteScheduledJob(id: string): boolean {
  const db = getDB();
  const result = db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Execute job immediately
export async function executeJobNow(jobId: string): Promise<JobExecution> {
  const job = getScheduledJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const execution: JobExecution = {
    id: uuidv4(),
    jobId,
    status: 'running',
    startedAt: new Date(),
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO job_executions (id, job_id, status, started_at)
    VALUES (?, ?, ?, ?)
  `).run(execution.id, jobId, execution.status, execution.startedAt.toISOString());

  events.emit('scheduler.job.started', { jobId, executionId: execution.id });

  try {
    let output: any;

    switch (job.type) {
      case 'workflow':
        const workflowResult = await executeWorkflow(job.targetId, job.params);
        output = workflowResult;
        break;

      case 'agent':
        const { executeAgent } = await import('../agents/engine/index.js');
        const agentResult = await executeAgent(job.targetId, job.params?.prompt || 'Execute scheduled task');
        output = agentResult;
        break;

      case 'skill':
        const { executeSkill } = await import('../skills/registry.js');
        const skillResult = await executeSkill(job.targetId, job.params);
        output = skillResult;
        break;

      case 'script':
        // Execute shell script
        const { spawn } = await import('child_process');
        output = await new Promise((resolve, reject) => {
          const child = spawn('sh', ['-c', job.targetId]);
          let stdout = '', stderr = '';
          child.stdout.on('data', (data) => { stdout += data; });
          child.stderr.on('data', (data) => { stderr += data; });
          child.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code });
          });
          child.on('error', reject);
        });
        break;

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    execution.status = 'completed';
    execution.output = output;
    execution.completedAt = new Date();

    // Update job stats
    db.prepare(`
      UPDATE scheduled_jobs 
      SET last_run = ?, run_count = run_count + 1, next_run = ?
      WHERE id = ?
    `).run(
      execution.completedAt.toISOString(),
      getNextRunTime(job.cronExpression, job.timezone)?.toISOString(),
      jobId
    );

    db.prepare(`
      UPDATE job_executions 
      SET status = ?, output = ?, completed_at = ?
      WHERE id = ?
    `).run(
      execution.status,
      JSON.stringify(output),
      execution.completedAt.toISOString(),
      execution.id
    );

    events.emit('scheduler.job.completed', { jobId, executionId: execution.id });

  } catch (error) {
    execution.status = 'failed';
    execution.error = error instanceof Error ? error.message : String(error);
    execution.completedAt = new Date();

    db.prepare(`
      UPDATE scheduled_jobs 
      SET fail_count = fail_count + 1
      WHERE id = ?
    `).run(jobId);

    db.prepare(`
      UPDATE job_executions 
      SET status = ?, error = ?, completed_at = ?
      WHERE id = ?
    `).run(
      execution.status,
      execution.error,
      execution.completedAt.toISOString(),
      execution.id
    );

    events.emit('scheduler.job.failed', { jobId, executionId: execution.id, error: execution.error });
  }

  return execution;
}

// Scheduler loop
let schedulerInterval: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (schedulerInterval) return;

  console.log('⏰ Scheduler started');

  schedulerInterval = setInterval(() => {
    const jobs = listScheduledJobs();
    const now = new Date();

    for (const job of jobs) {
      if (!job.enabled || !job.nextRun) continue;

      if (job.nextRun <= now) {
        console.log(`🔄 Executing scheduled job: ${job.name}`);
        executeJobNow(job.id).catch((error) => {
          console.error(`Job ${job.name} failed:`, error);
        });
      }
    }
  }, 60000); // Check every minute

  events.emit('scheduler.started');
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    events.emit('scheduler.stopped');
  }
}

// Get execution history
export function getJobExecutions(jobId: string, limit: number = 50): JobExecution[] {
  const db = getDB();
  const rows = db.prepare(`
    SELECT * FROM job_executions 
    WHERE job_id = ? 
    ORDER BY started_at DESC 
    LIMIT ?
  `).all(jobId, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    output: row.output ? JSON.parse(row.output) : undefined,
    error: row.error,
  }));
}

// Deserialize job
function deserializeJob(row: any): ScheduledJob {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    type: row.type,
    targetId: row.target_id,
    params: row.params ? JSON.parse(row.params) : undefined,
    enabled: row.enabled === 1,
    lastRun: row.last_run ? new Date(row.last_run) : undefined,
    nextRun: row.next_run ? new Date(row.next_run) : undefined,
    runCount: row.run_count,
    failCount: row.fail_count,
    createdAt: new Date(row.created_at),
  };
}

// Init tables
export function initSchedulerTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cron_expression TEXT NOT NULL,
      timezone TEXT,
      type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      params TEXT,
      enabled INTEGER DEFAULT 1,
      last_run TIMESTAMP,
      next_run TIMESTAMP,
      run_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled);
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run);

    CREATE TABLE IF NOT EXISTS job_executions (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES scheduled_jobs(id),
      status TEXT NOT NULL,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP,
      output TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_job_executions_job ON job_executions(job_id);
  `);
}

// Cron expression helpers
export const CronPresets = {
  EVERY_MINUTE: '* * * * *',
  EVERY_5_MINUTES: '*/5 * * * *',
  EVERY_15_MINUTES: '*/15 * * * *',
  EVERY_HOUR: '0 * * * *',
  DAILY: '0 0 * * *',
  WEEKLY: '0 0 * * 0',
  MONTHLY: '0 0 1 * *',
  WORKDAY_MORNING: '0 9 * * 1-5',
  WORKDAY_EVENING: '0 18 * * 1-5',
};
