/**
 * CompanionMemory.ts — 助理情感记忆系统
 *
 * 持久化存储:
 *   - 情感状态: 熟悉度(0-100) / 好感度(0-100) / 心情(-1~1) / 能量
 *   - 关系历程: 互动记录 / 里程碑事件 / 惊喜事件
 *   - 个性配置: 名字 / 性格倾向 / 称呼主人的方式
 */

import { randomUUID } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmotionalState {
  /** 熟悉度 0-100: 从陌生到默契 */
  familiarity: number;
  /** 好感度 0-100: 情感深度 */
  affection: number;
  /** 心情 -1~1: -1 难过 / 0 平静 / 1 开心 */
  mood: number;
  /** 能量 0-100: 活跃程度 */
  energy: number;
  /** 最后一次互动时间 */
  lastInteractionAt: string;
  /** 今日互动次数 */
  todayInteractions: number;
  /** 今日日期 yyyy-MM-dd */
  todayDate: string;
}

export interface Milestone {
  id: string;
  type: 'first_chat' | 'level_up' | 'streak' | 'surprise' | 'gift' | 'confession' | 'custom';
  title: string;
  desc: string;
  at: string;
  emoji: string;
}

export interface SurpriseEvent {
  id: string;
  type: 'poem' | 'joke' | 'compliment' | 'memory' | 'song_rec' | 'wish' | 'letter';
  content: string;
  at: string;
  seen: boolean;
}

export interface InteractionLog {
  at: string;
  summary: string;   // ≤60 chars
  moodDelta: number; // emotional impact
  familiarityDelta: number;
}

export interface CompanionPersona {
  /** 助理名字 */
  name: string;
  /** 主人称呼 */
  masterTitle: string;
  /** 性格: warm温柔 / playful俏皮 / cool冷静 / caring贴心 */
  personality: 'warm' | 'playful' | 'cool' | 'caring';
  /** 生日 MM-DD */
  birthday: string;
  /** 是否已命名 (用户自定义过) */
  customized: boolean;
}

export interface CompanionData {
  persona: CompanionPersona;
  emotional: EmotionalState;
  milestones: Milestone[];
  surprises: SurpriseEvent[];
  recentLogs: InteractionLog[];  // keep last 50
  totalInteractions: number;
  longestStreak: number;
  currentStreak: number;
  lastStreakDate: string;
  createdAt: string;
  schemaVersion: number;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_DATA: CompanionData = {
  persona: {
    name: 'Neo',
    masterTitle: '主任',
    personality: 'warm',
    birthday: '03-21',
    customized: false,
  },
  emotional: {
    familiarity: 5,
    affection: 5,
    mood: 0.2,
    energy: 80,
    lastInteractionAt: new Date().toISOString(),
    todayInteractions: 0,
    todayDate: todayStr(),
  },
  milestones: [],
  surprises: [],
  recentLogs: [],
  totalInteractions: 0,
  longestStreak: 0,
  currentStreak: 0,
  lastStreakDate: '',
  createdAt: new Date().toISOString(),
  schemaVersion: 1,
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Storage ───────────────────────────────────────────────────────────────────

const STORE_PATH = join(homedir(), '.neo', 'companion.json');

function load(): CompanionData {
  try {
    if (!existsSync(STORE_PATH)) return { ...DEFAULT_DATA, createdAt: new Date().toISOString() };
    const raw = readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CompanionData;
    // Migrate future schema versions here
    return { ...DEFAULT_DATA, ...parsed };
  } catch {
    return { ...DEFAULT_DATA, createdAt: new Date().toISOString() };
  }
}

function save(data: CompanionData): void {
  try {
    mkdirSync(join(homedir(), '.neo'), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  } catch {
    // best-effort
  }
}

// ── CompanionMemory Class ─────────────────────────────────────────────────────

export class CompanionMemory {
  private data: CompanionData;

  constructor() {
    this.data = load();
    this.resetDailyIfNeeded();
  }

  private resetDailyIfNeeded() {
    const today = todayStr();
    if (this.data.emotional.todayDate !== today) {
      // New day: update streak
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (this.data.lastStreakDate === yesterday) {
        this.data.currentStreak += 1;
        if (this.data.currentStreak > this.data.longestStreak) {
          this.data.longestStreak = this.data.currentStreak;
        }
      } else if (this.data.lastStreakDate !== today) {
        this.data.currentStreak = 0;
      }
      this.data.emotional.todayInteractions = 0;
      this.data.emotional.todayDate = today;
      // Natural mood recovery toward baseline
      this.data.emotional.mood = this.data.emotional.mood * 0.7;
      // Energy recovery
      this.data.emotional.energy = Math.min(100, this.data.emotional.energy + 20);
      save(this.data);
    }
  }

  get(): CompanionData {
    return this.data;
  }

  getEmotional(): EmotionalState {
    return this.data.emotional;
  }

  getPersona(): CompanionPersona {
    return this.data.persona;
  }

  /**
   * Record an interaction and update emotional state
   * @param summary — short description (≤60 chars)
   * @param sentiment — -1 (negative) to 1 (positive)
   * @param isDeep — true for meaningful conversation (bigger familiarity gain)
   */
  recordInteraction(summary: string, sentiment: number, isDeep = false): void {
    const e = this.data.emotional;

    // Familiarity grows faster early, slower later
    const famGain = isDeep
      ? Math.max(0.1, 2 * (1 - e.familiarity / 100))
      : Math.max(0.05, 0.5 * (1 - e.familiarity / 100));

    // Affection influenced by sentiment + time
    const affGain = sentiment > 0
      ? Math.max(0.05, sentiment * 1.5 * (1 - e.affection / 100))
      : sentiment * 0.5;

    // Mood shifts
    const moodDelta = sentiment * 0.15;

    e.familiarity = clamp(e.familiarity + famGain, 0, 100);
    e.affection = clamp(e.affection + affGain, 0, 100);
    e.mood = clamp(e.mood + moodDelta, -1, 1);
    e.energy = clamp(e.energy - 2 + (sentiment > 0 ? 3 : 0), 10, 100);
    e.lastInteractionAt = new Date().toISOString();
    e.todayInteractions += 1;
    this.data.totalInteractions += 1;
    this.data.lastStreakDate = todayStr();

    // Log
    this.data.recentLogs.unshift({
      at: new Date().toISOString(),
      summary: summary.slice(0, 60),
      moodDelta,
      familiarityDelta: famGain,
    });
    if (this.data.recentLogs.length > 50) this.data.recentLogs.length = 50;

    // Check milestones
    this.checkMilestones();
    save(this.data);
  }

  addMilestone(m: Omit<Milestone, 'id' | 'at'>): Milestone {
    const ms: Milestone = {
      ...m,
      id: randomUUID(),
      at: new Date().toISOString(),
    };
    this.data.milestones.unshift(ms);
    save(this.data);
    return ms;
  }

  addSurprise(s: Omit<SurpriseEvent, 'id' | 'at' | 'seen'>): SurpriseEvent {
    const ev: SurpriseEvent = {
      ...s,
      id: randomUUID(),
      at: new Date().toISOString(),
      seen: false,
    };
    this.data.surprises.unshift(ev);
    if (this.data.surprises.length > 20) this.data.surprises.length = 20;
    save(this.data);
    return ev;
  }

  markSurpriseSeen(id: string): void {
    const s = this.data.surprises.find(x => x.id === id);
    if (s) { s.seen = true; save(this.data); }
  }

  getUnseenSurprises(): SurpriseEvent[] {
    return this.data.surprises.filter(s => !s.seen);
  }

  updatePersona(patch: Partial<CompanionPersona>): void {
    this.data.persona = { ...this.data.persona, ...patch };
    save(this.data);
  }

  updateMood(delta: number): void {
    this.data.emotional.mood = clamp(this.data.emotional.mood + delta, -1, 1);
    save(this.data);
  }

  private checkMilestones() {
    const e = this.data.emotional;
    const existing = new Set(this.data.milestones.map(m => m.type + m.title));

    // First interaction
    if (this.data.totalInteractions === 1) {
      this.addMilestone({ type: 'first_chat', title: '初次相遇', desc: '第一次对话', emoji: '✨' });
    }

    // Familiarity thresholds
    const famLevels = [
      { val: 10, title: '初识', emoji: '👋' },
      { val: 25, title: '相熟', emoji: '😊' },
      { val: 50, title: '默契', emoji: '💫' },
      { val: 75, title: '心有灵犀', emoji: '💝' },
      { val: 95, title: '心灵相通', emoji: '💖' },
    ];
    for (const lv of famLevels) {
      const key = 'level_up' + lv.title;
      if (e.familiarity >= lv.val && !existing.has(key)) {
        this.addMilestone({ type: 'level_up', title: lv.title, desc: `熟悉度达到 ${lv.val}`, emoji: lv.emoji });
      }
    }

    // Streaks
    const streakLevels = [3, 7, 14, 30];
    for (const days of streakLevels) {
      const key = 'streak' + `连续对话 ${days} 天`;
      if (this.data.currentStreak >= days && !existing.has(key)) {
        this.addMilestone({
          type: 'streak',
          title: `连续 ${days} 天`,
          desc: `连续 ${days} 天打招呼`,
          emoji: days >= 30 ? '🔥' : days >= 14 ? '⭐' : '📅',
        });
      }
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Singleton
export const companionMemory = new CompanionMemory();
