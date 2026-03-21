/**
 * AutonomousEngine.ts — 自主 Agent 执行引擎
 *
 * 特性:
 *   - 24×7 持续运行, 低 token 消耗 (上下文压缩)
 *   - 计划式执行: 间隔/每日/单次触发
 *   - 终止条件: 轮次/时间/关键词/手动
 *   - 上下文压缩: 每 5 轮自动摘要, 节省 ~70% token
 *   - 自由漫游: 无固定目标, 持续发现和执行子任务
 *
 * 使用:
 *   const engine = new AutonomousEngine();
 *   engine.init(sendMessageStream, onUpdate);
 *   engine.createTask({ goal: '持续监控 GitHub PR...', role: 'Reviewer', freeRoam: true });
 */

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { AIResponse } from '../../ai/client.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = 'idle' | 'planning' | 'running' | 'paused' | 'done' | 'error' | 'waiting';

export interface StopCondition {
  type: 'rounds' | 'duration_min' | 'keyword' | 'success_phrase' | 'manual';
  /** 轮次上限 | 分钟数 | 关键词 | 完成短语 */
  value: string | number;
}

export interface Schedule {
  type: 'once' | 'interval' | 'daily' | 'cron';
  /** interval: ms; daily: "HH:MM"; cron: "*/30m" */
  value?: string | number;
  runAt?: Date;
}

export interface AutonomousTask {
  id: string;
  goal: string;
  role: string;
  status: TaskStatus;
  freeRoam: boolean;
  schedule?: Schedule;
  stopConditions: StopCondition[];
  maxRounds: number;
  currentRound: number;
  /** Compressed conversation: summary + last 3 exchanges */
  contextSummary: string;
  recentMessages: MessageParam[];
  /** Human-readable milestone log */
  milestones: string[];
  startedAt?: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  result?: string;
  tokensUsed: number;
  tokensBudget: number;   // 0 = unlimited
  error?: string;
  progress: number;       // 0-100
}

export type AICallFn = (
  messages: MessageParam[],
  onDelta: (delta: string) => void,
  systemOverride?: string,
) => Promise<AIResponse>;

export type EngineUpdateFn = (tasks: AutonomousTask[]) => void;

// ── System Prompts ───────────────────────────────────────────────────────────

function buildSystemPrompt(task: AutonomousTask): string {
  const roamMode = task.freeRoam
    ? `你处于【自由漫游模式】: 持续探索、研究和执行任务。当完成一个子目标后，主动发现下一个有价值的子任务并继续。`
    : `你是一个自主执行 Agent，专注完成目标直到满足终止条件。`;

  const stopInfo = task.stopConditions.map(c => {
    if (c.type === 'rounds') return `最多 ${c.value} 轮`;
    if (c.type === 'duration_min') return `最多 ${c.value} 分钟`;
    if (c.type === 'keyword') return `检测到关键词 "${c.value}" 时停止`;
    if (c.type === 'success_phrase') return `输出 DONE: <摘要> 表示完成`;
    return '';
  }).filter(Boolean).join('; ');

  return `你是一个自主运行的 AI Agent，角色: ${task.role}。
${roamMode}

目标: ${task.goal}
当前进度: 第 ${task.currentRound + 1} / ${task.maxRounds} 轮
终止条件: ${stopInfo}
${task.contextSummary ? `\n上下文摘要:\n${task.contextSummary}` : ''}

执行规则:
1. 每轮给出清晰的行动和结果
2. 重要发现以 [MILESTONE] 标记 (用于摘要记录)
3. 完成目标时输出: DONE: <一句话总结>
4. 需要用户输入时输出: WAIT: <问题>
5. 遇到阻塞时输出: BLOCKED: <原因>
6. 低 token 优先: 简洁输出, 避免重复已知信息`;
}

// ── Context Compression ──────────────────────────────────────────────────────

const COMPRESS_EVERY = 5;  // 每 5 轮压缩一次
const KEEP_RECENT = 3;     // 保留最近 3 轮原文

function shouldCompress(task: AutonomousTask): boolean {
  return task.currentRound > 0 &&
    task.currentRound % COMPRESS_EVERY === 0 &&
    task.recentMessages.length > KEEP_RECENT * 2;
}

async function compressContext(task: AutonomousTask, aiCall: AICallFn): Promise<void> {
  const toCompress = task.recentMessages.slice(0, -KEEP_RECENT * 2);
  if (toCompress.length === 0) return;

  const summary = await aiCall(
    [
      {
        role: 'user',
        content: `请用 3-5 句话压缩总结以下对话的关键信息和进展，保留重要发现和待续事项:\n\n${
          toCompress.map(m => `${m.role}: ${String(m.content).slice(0, 500)}`).join('\n')
        }`,
      },
    ],
    () => {},
    '你是一个信息压缩助手。给出简洁、完整的上下文摘要。',
  );

  task.contextSummary = task.contextSummary
    ? `${task.contextSummary}\n[轮${task.currentRound}更新] ${summary.content}`
    : `[截止第${task.currentRound}轮] ${summary.content}`;

  task.recentMessages = task.recentMessages.slice(-KEEP_RECENT * 2);
}

// ── Engine ───────────────────────────────────────────────────────────────────

export class AutonomousEngine {
  private tasks: Map<string, AutonomousTask> = new Map();
  private aiCall: AICallFn | null = null;
  private onUpdate: EngineUpdateFn | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private activeRuns: Set<string> = new Set();

  init(aiCall: AICallFn, onUpdate: EngineUpdateFn): void {
    this.aiCall = aiCall;
    this.onUpdate = onUpdate;
    this.tickInterval = setInterval(() => { void this.tick(); }, 5000);
  }

  destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  // ── Task CRUD ──────────────────────────────────────────────────────────────

  createTask(config: {
    goal: string;
    role?: string;
    freeRoam?: boolean;
    schedule?: Schedule;
    stopConditions?: StopCondition[];
    maxRounds?: number;
    tokensBudget?: number;
  }): AutonomousTask {
    const task: AutonomousTask = {
      id: `auto-${Date.now()}`,
      goal: config.goal,
      role: config.role || 'Assistant',
      status: 'idle',
      freeRoam: config.freeRoam ?? false,
      schedule: config.schedule,
      stopConditions: config.stopConditions ?? [{ type: 'rounds', value: 10 }],
      maxRounds: config.maxRounds ?? 10,
      currentRound: 0,
      contextSummary: '',
      recentMessages: [],
      milestones: [],
      tokensUsed: 0,
      tokensBudget: config.tokensBudget ?? 0,
      progress: 0,
    };

    // Schedule first run
    if (config.schedule) {
      task.nextRunAt = calcNextRun(config.schedule);
      task.status = 'waiting';
    }

    this.tasks.set(task.id, task);
    this.notify();
    return task;
  }

  getTask(id: string): AutonomousTask | undefined {
    return this.tasks.get(id);
  }

  list(): AutonomousTask[] {
    return [...this.tasks.values()];
  }

  // ── Controls ───────────────────────────────────────────────────────────────

  start(id: string): void {
    const t = this.tasks.get(id);
    if (!t || t.status === 'running') return;
    t.status = 'idle';
    t.startedAt = t.startedAt ?? new Date();
    this.notify();
    void this.runTask(id);
  }

  pause(id: string): void {
    const t = this.tasks.get(id);
    if (!t) return;
    t.status = 'paused';
    this.notify();
  }

  resume(id: string): void {
    const t = this.tasks.get(id);
    if (!t || t.status !== 'paused') return;
    t.status = 'idle';
    this.notify();
    void this.runTask(id);
  }

  stop(id: string): void {
    const t = this.tasks.get(id);
    if (!t) return;
    t.status = 'done';
    t.result = '手动停止';
    this.notify();
  }

  remove(id: string): void {
    this.tasks.delete(id);
    this.notify();
  }

  // ── Tick (scheduler) ──────────────────────────────────────────────────────

  private async tick(): Promise<void> {
    for (const task of this.tasks.values()) {
      if (task.status === 'waiting' && task.nextRunAt && new Date() >= task.nextRunAt) {
        task.status = 'idle';
        void this.runTask(task.id);
      }
    }
  }

  // ── Core Agentic Loop ──────────────────────────────────────────────────────

  private async runTask(id: string): Promise<void> {
    if (this.activeRuns.has(id) || !this.aiCall) return;
    const task = this.tasks.get(id);
    if (!task || task.status === 'paused' || task.status === 'done') return;

    this.activeRuns.add(id);
    task.status = 'running';
    task.lastRunAt = new Date();
    this.notify();

    try {
      while (task.status === 'running' && task.currentRound < task.maxRounds) {
        // Budget check
        if (task.tokensBudget > 0 && task.tokensUsed >= task.tokensBudget) {
          task.status = 'done';
          task.result = `Token 预算已用完 (${task.tokensUsed} tokens)`;
          break;
        }

        // Context compression
        if (shouldCompress(task)) {
          await compressContext(task, this.aiCall);
        }

        // Build prompt
        const prompt = buildRoundPrompt(task);
        const messages: MessageParam[] = [
          ...task.recentMessages,
          { role: 'user', content: prompt },
        ];

        let response = '';
        const systemPrompt = buildSystemPrompt(task);

        try {
          const result = await this.aiCall(
            messages,
            (delta) => { response += delta; },
            systemPrompt,
          );
          response = result.content || response;
          task.tokensUsed += result.usage.inputTokens + result.usage.outputTokens;
          task.progress = Math.floor((task.currentRound / task.maxRounds) * 100);
        } catch (err) {
          task.error = err instanceof Error ? err.message : String(err);
          task.status = 'error';
          break;
        }

        // Store in context
        task.recentMessages.push(
          { role: 'user', content: prompt },
          { role: 'assistant', content: response },
        );
        task.currentRound++;

        // Extract milestones
        const milestoneMatch = response.match(/\[MILESTONE\]\s*(.+)/g);
        if (milestoneMatch) {
          task.milestones.push(...milestoneMatch.map(m => m.replace('[MILESTONE]', '').trim()));
        }

        // Check stop conditions
        const stopResult = checkStopConditions(task, response);
        if (stopResult) {
          task.status = 'done';
          task.result = stopResult;
          task.progress = 100;
          break;
        }

        // Handle WAIT
        if (response.includes('WAIT:')) {
          task.status = 'paused';
          const waitMsg = response.match(/WAIT:\s*(.+)/)?.[1] ?? '需要用户输入';
          task.milestones.push(`⏸ 等待: ${waitMsg}`);
          break;
        }

        // Handle BLOCKED
        if (response.includes('BLOCKED:')) {
          const reason = response.match(/BLOCKED:\s*(.+)/)?.[1] ?? '未知';
          task.milestones.push(`⚠ 阻塞: ${reason}`);
          task.status = 'paused';
          break;
        }

        this.notify();

        // Brief yield to avoid blocking
        await new Promise(r => setTimeout(r, 100));
      }

      // Max rounds reached
      if (task.currentRound >= task.maxRounds && task.status === 'running') {
        task.status = 'done';
        task.result = `已完成 ${task.maxRounds} 轮执行`;
        task.progress = 100;
      }

      // Reschedule if recurring
      if (task.schedule && task.schedule.type !== 'once') {
        task.nextRunAt = calcNextRun(task.schedule);
        task.currentRound = 0;
        task.status = 'waiting';
      }

    } finally {
      this.activeRuns.delete(id);
      this.notify();
    }
  }

  private notify(): void {
    this.onUpdate?.(this.list());
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildRoundPrompt(task: AutonomousTask): string {
  if (task.currentRound === 0) {
    return task.freeRoam
      ? `开始自由漫游任务。初始目标: ${task.goal}\n\n请开始探索，制定初步计划并执行第一步。`
      : `开始执行任务: ${task.goal}\n\n请制定执行计划并完成第一步。`;
  }
  return task.freeRoam
    ? `继续执行 (第 ${task.currentRound + 1} 轮)。回顾上一步成果，决定下一个最有价值的行动。`
    : `继续执行 (第 ${task.currentRound + 1} 轮)。基于上一步结果推进目标。`;
}

function checkStopConditions(task: AutonomousTask, response: string): string | null {
  for (const cond of task.stopConditions) {
    if (cond.type === 'rounds' && task.currentRound >= Number(cond.value)) {
      return `已达到轮次上限 (${cond.value} 轮)`;
    }
    if (cond.type === 'keyword' && response.toLowerCase().includes(String(cond.value).toLowerCase())) {
      return `检测到终止关键词: ${cond.value}`;
    }
    if (cond.type === 'success_phrase' && response.includes('DONE:')) {
      const msg = response.match(/DONE:\s*(.+)/)?.[1] ?? '任务完成';
      return msg;
    }
    if (cond.type === 'duration_min' && task.startedAt) {
      const elapsed = (Date.now() - task.startedAt.getTime()) / 60000;
      if (elapsed >= Number(cond.value)) {
        return `已达到时间上限 (${cond.value} 分钟)`;
      }
    }
  }
  return null;
}

function calcNextRun(schedule: Schedule): Date {
  const now = new Date();
  if (schedule.type === 'interval' && typeof schedule.value === 'number') {
    return new Date(now.getTime() + schedule.value);
  }
  if (schedule.type === 'daily' && typeof schedule.value === 'string') {
    const [hStr, mStr] = schedule.value.split(':');
    const next = new Date(now);
    next.setHours(parseInt(hStr ?? '9'), parseInt(mStr ?? '0'), 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  }
  if (schedule.type === 'cron' && typeof schedule.value === 'string') {
    // Simple: "*/30m" = every 30 minutes
    const match = schedule.value.match(/\*\/(\d+)m/);
    if (match) return new Date(now.getTime() + parseInt(match[1]) * 60000);
  }
  return new Date(now.getTime() + 3600000); // default 1h
}

/** 全局单例 */
export const autonomousEngine = new AutonomousEngine();
