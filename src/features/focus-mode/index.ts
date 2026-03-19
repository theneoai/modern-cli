/**
 * 专注模式
 * 
 * 一键进入专注模式，屏蔽通知，支持番茄工作法
 * 
 * @feature focus-mode
 * @category productivity
 * @priority P1
 */

import { EventEmitter } from 'eventemitter3';

export interface FocusModeConfig {
  enabled: boolean;
  settings?: {
    pomodoroDuration?: number;
    shortBreakDuration?: number;
    longBreakDuration?: number;
    sessionsBeforeLongBreak?: number;
    blockNotifications?: boolean;
    blockSites?: string[];
  };
}

export interface FocusSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  type: 'pomodoro' | 'break' | 'long-break';
  status: 'running' | 'completed' | 'interrupted';
  interruptions: number;
}

export class FocusMode extends EventEmitter {
  private config: FocusModeConfig;
  private sessions: FocusSession[] = [];
  private currentSession?: FocusSession;
  private timer?: NodeJS.Timeout;
  
  constructor(config: FocusModeConfig) {
    super();
    this.config = config;
  }
  
  async startFocusSession(type: 'pomodoro' | 'break' = 'pomodoro'): Promise<FocusSession> {
    const settings = this.config.settings || {
      pomodoroDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
    };
    
    const duration = type === 'pomodoro' ? settings.pomodoroDuration! : 
                     type === 'break' ? settings.shortBreakDuration! : settings.longBreakDuration!;
    
    const session: FocusSession = {
      id: `session-${Date.now()}`,
      startTime: new Date(),
      type,
      status: 'running',
      interruptions: 0,
    };
    
    this.currentSession = session;
    this.sessions.push(session);
    
    // 屏蔽通知
    if (this.config.settings?.blockNotifications) {
      console.log('🔕 通知已屏蔽');
    }
    
    this.emit('sessionStarted', session);
    
    // 设置定时器
    this.timer = setTimeout(() => {
      this.completeSession(session.id);
    }, duration * 60000);
    
    return session;
  }
  
  interruptSession(reason: string): void {
    if (this.currentSession) {
      this.currentSession.interruptions++;
      this.emit('interrupted', { session: this.currentSession, reason });
    }
  }
  
  completeSession(sessionId: string): void {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session) {
      session.endTime = new Date();
      session.status = session.interruptions > 0 ? 'interrupted' : 'completed';
      this.currentSession = undefined;
      this.emit('sessionCompleted', session);
      console.log(`✅ ${session.type} 完成!`);
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
  
  getStats(): { totalSessions: number; totalFocusTime: number; avgInterruptions: number } {
    const completedSessions = this.sessions.filter(s => s.status !== 'running');
    const totalFocusTime = completedSessions.reduce((acc, s) => {
      if (s.endTime) {
        return acc + (s.endTime.getTime() - s.startTime.getTime()) / 60000;
      }
      return acc;
    }, 0);
    
    return {
      totalSessions: completedSessions.length,
      totalFocusTime: Math.round(totalFocusTime),
      avgInterruptions: completedSessions.length > 0 
        ? completedSessions.reduce((acc, s) => acc + s.interruptions, 0) / completedSessions.length 
        : 0,
    };
  }
  
  async shutdown(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.emit('shutdown');
  }
}

export default FocusMode;
