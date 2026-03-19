/**
 * 时间块规划
 * 
 * AI自动安排深度工作时间，根据日历和任务自动规划专注时段
 * 
 * @feature time-blocking
 * @category productivity
 * @priority P1
 * @complexity medium
 * @auto-generated true
 * @generated-at 2026-03-19T09:25:00Z
 */

import { EventEmitter } from 'eventemitter3';

export interface TimeBlockingConfig {
  enabled: boolean;
  teamId?: string;
  userId?: string;
  settings?: {
    workHours?: { start: number; end: number };
    breakDuration?: number;
    blockDuration?: number;
    lunchTime?: { start: number; end: number };
  };
}

export interface TimeBlock {
  id: string;
  startTime: Date;
  endTime: Date;
  type: 'deep-work' | 'shallow-work' | 'meeting' | 'break' | 'lunch';
  title?: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TimeBlockingState {
  isActive: boolean;
  lastRun?: Date;
  todayBlocks: TimeBlock[];
  metrics: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
  };
}

export class TimeBlocking extends EventEmitter {
  private config: TimeBlockingConfig;
  private state: TimeBlockingState;
  
  constructor(config: TimeBlockingConfig) {
    super();
    this.config = config;
    this.state = {
      isActive: false,
      todayBlocks: [],
      metrics: {
        totalRuns: 0,
        successCount: 0,
        failureCount: 0,
      },
    };
  }
  
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('时间块规划已禁用');
      return;
    }
    
    this.state.isActive = true;
    console.log('✓ 时间块规划已初始化');
    this.emit('initialized', { timestamp: new Date() });
  }
  
  async generateBlocks(tasks: Array<{ title: string; priority: 'high' | 'medium' | 'low'; duration: number }>): Promise<TimeBlock[]> {
    this.state.metrics.totalRuns++;
    this.state.lastRun = new Date();
    
    try {
      const settings = this.config.settings || {
        workHours: { start: 9, end: 18 },
        breakDuration: 15,
        blockDuration: 90,
        lunchTime: { start: 12, end: 13 },
      };
      
      const blocks: TimeBlock[] = [];
      let currentTime = new Date();
      currentTime.setHours(settings.workHours.start, 0, 0, 0);
      
      // 按优先级排序任务
      const sortedTasks = [...tasks].sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      
      // 高优先级任务分配深度工作时段
      const highPriorityTasks = sortedTasks.filter(t => t.priority === 'high');
      for (const task of highPriorityTasks) {
        // 跳过午餐时间
        if (currentTime.getHours() >= settings.lunchTime.start && 
            currentTime.getHours() < settings.lunchTime.end) {
          blocks.push({
            id: `lunch-${blocks.length}`,
            startTime: new Date(currentTime),
            endTime: new Date(currentTime.setHours(settings.lunchTime.end, 0, 0, 0)),
            type: 'lunch',
            title: 'Lunch Break',
            priority: 'low',
          });
          currentTime.setHours(settings.lunchTime.end, 0, 0, 0);
        }
        
        const endTime = new Date(currentTime.getTime() + task.duration * 60000);
        
        blocks.push({
          id: `block-${blocks.length}`,
          startTime: new Date(currentTime),
          endTime,
          type: 'deep-work',
          title: task.title,
          priority: task.priority,
        });
        
        currentTime = new Date(endTime.getTime() + settings.breakDuration * 60000);
        
        // 添加休息
        blocks.push({
          id: `break-${blocks.length}`,
          startTime: new Date(endTime),
          endTime: new Date(currentTime),
          type: 'break',
          title: 'Break',
          priority: 'low',
        });
      }
      
      this.state.todayBlocks = blocks;
      this.state.metrics.successCount++;
      this.emit('blocksGenerated', { blocks, timestamp: new Date() });
      
      return blocks;
    } catch (error) {
      this.state.metrics.failureCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('error', { error: errorMessage, timestamp: new Date() });
      throw error;
    }
  }
  
  getCurrentBlock(): TimeBlock | undefined {
    const now = new Date();
    return this.state.todayBlocks.find(
      block => now >= block.startTime && now < block.endTime
    );
  }
  
  getState(): TimeBlockingState {
    return { ...this.state };
  }
  
  async shutdown(): Promise<void> {
    this.state.isActive = false;
    this.emit('shutdown', { timestamp: new Date() });
    console.log('时间块规划已停止');
  }
}

export default TimeBlocking;
