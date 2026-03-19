/**
 * 会议优化器
 * 
 * 分析团队成员日历，自动找出最佳会议时间
 * 
 * @feature meeting-optimizer
 * @category productivity
 * @priority P1
 * @complexity medium
 * @auto-generated true
 * @generated-at 2026-03-19T09:30:00Z
 */

import { EventEmitter } from 'eventemitter3';

export interface MeetingOptimizerConfig {
  enabled: boolean;
  teamId?: string;
  settings?: {
    workHours?: { start: number; end: number };
    minDuration?: number;
    maxDuration?: number;
    bufferMinutes?: number;
    preferFocusTime?: boolean;
  };
}

export interface TeamMember {
  id: string;
  name: string;
  timezone: string;
  availability: Array<{ start: Date; end: Date }>;
  focusTime?: Array<{ start: Date; end: Date }>;
}

export interface MeetingSlot {
  startTime: Date;
  endTime: Date;
  availableMembers: string[];
  unavailableMembers: string[];
  score: number;
  reason: string;
}

export interface MeetingOptimizerState {
  isActive: boolean;
  lastRun?: Date;
  metrics: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
  };
}

export class MeetingOptimizer extends EventEmitter {
  private config: MeetingOptimizerConfig;
  private state: MeetingOptimizerState;
  
  constructor(config: MeetingOptimizerConfig) {
    super();
    this.config = config;
    this.state = {
      isActive: false,
      metrics: {
        totalRuns: 0,
        successCount: 0,
        failureCount: 0,
      },
    };
  }
  
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('会议优化器已禁用');
      return;
    }
    
    this.state.isActive = true;
    console.log('✓ 会议优化器已初始化');
    this.emit('initialized', { timestamp: new Date() });
  }
  
  async findOptimalSlots(
    members: TeamMember[],
    duration: number,
    withinDays: number = 7
  ): Promise<MeetingSlot[]> {
    this.state.metrics.totalRuns++;
    this.state.lastRun = new Date();
    
    try {
      const settings = this.config.settings || {
        workHours: { start: 9, end: 18 },
        minDuration: 15,
        maxDuration: 120,
        bufferMinutes: 15,
        preferFocusTime: false,
      };
      
      const slots: MeetingSlot[] = [];
      const now = new Date();
      
      // 检查每一天
      for (let day = 0; day < withinDays; day++) {
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + day);
        
        // 检查每个小时段
        for (let hour = settings.workHours.start; hour < settings.workHours.end; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const slotStart = new Date(checkDate);
            slotStart.setHours(hour, minute, 0, 0);
            
            const slotEnd = new Date(slotStart);
            slotEnd.setMinutes(slotEnd.getMinutes() + duration);
            
            // 跳过过去的时段
            if (slotStart < now) continue;
            
            // 检查每个成员的可用性
            const availableMembers: string[] = [];
            const unavailableMembers: string[] = [];
            
            for (const member of members) {
              const isAvailable = this.checkAvailability(member, slotStart, slotEnd);
              if (isAvailable) {
                availableMembers.push(member.id);
              } else {
                unavailableMembers.push(member.id);
              }
            }
            
            // 计算分数
            let score = 0;
            let reason = '';
            
            const availabilityRate = availableMembers.length / members.length;
            
            if (availabilityRate === 1) {
              score = 100;
              reason = '所有成员可用';
            } else if (availabilityRate >= 0.8) {
              score = 80;
              reason = `${Math.round(availabilityRate * 100)}% 成员可用`;
            } else if (availabilityRate >= 0.5) {
              score = 50;
              reason = '半数以上成员可用';
            } else {
              score = 20;
              reason = '少于半数成员可用';
            }
            
            // 优先避免深度工作时间
            if (settings.preferFocusTime) {
              for (const member of members) {
                if (member.focusTime) {
                  const conflictsFocus = member.focusTime.some(
                    focus => slotStart < focus.end && slotEnd > focus.start
                  );
                  if (conflictsFocus) {
                    score -= 20;
                    reason += ' (与专注时间冲突)';
                  }
                }
              }
            }
            
            slots.push({
              startTime: slotStart,
              endTime: slotEnd,
              availableMembers,
              unavailableMembers,
              score: Math.max(0, score),
              reason,
            });
          }
        }
      }
      
      // 按分数排序
      const sortedSlots = slots.sort((a, b) => b.score - a.score);
      
      this.state.metrics.successCount++;
      this.emit('slotsFound', { slots: sortedSlots, timestamp: new Date() });
      
      return sortedSlots.slice(0, 10); // 返回前10个最佳时段
    } catch (error) {
      this.state.metrics.failureCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { error: errorMessage, timestamp: new Date() });
      throw error;
    }
  }
  
  private checkAvailability(member: TeamMember, start: Date, end: Date): boolean {
    return member.availability.some(slot => 
      start >= slot.start && end <= slot.end
    );
  }
  
  getState(): MeetingOptimizerState {
    return { ...this.state };
  }
  
  async shutdown(): Promise<void> {
    this.state.isActive = false;
    this.emit('shutdown', { timestamp: new Date() });
    console.log('会议优化器已停止');
  }
}

export default MeetingOptimizer;
