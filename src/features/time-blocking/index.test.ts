import { describe, it, expect, beforeEach } from 'vitest';
import { TimeBlocking } from './index.js';

describe('TimeBlocking', () => {
  let feature: TimeBlocking;
  
  beforeEach(() => {
    feature = new TimeBlocking({ enabled: true });
  });
  
  it('should initialize successfully', async () => {
    await expect(feature.initialize()).resolves.not.toThrow();
    expect(feature.getState().isActive).toBe(true);
  });
  
  it('should generate time blocks for tasks', async () => {
    await feature.initialize();
    const tasks = [
      { title: 'Deep work task', priority: 'high' as const, duration: 90 },
      { title: 'Normal task', priority: 'medium' as const, duration: 60 },
    ];
    
    const blocks = await feature.generateBlocks(tasks);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some(b => b.type === 'deep-work')).toBe(true);
  });
  
  it('should prioritize high priority tasks', async () => {
    await feature.initialize();
    const tasks = [
      { title: 'Low priority', priority: 'low' as const, duration: 60 },
      { title: 'High priority', priority: 'high' as const, duration: 60 },
    ];
    
    const blocks = await feature.generateBlocks(tasks);
    const workBlocks = blocks.filter(b => b.type === 'deep-work');
    expect(workBlocks[0].title).toBe('High priority');
  });
  
  it('should track metrics', async () => {
    await feature.initialize();
    await feature.generateBlocks([{ title: 'Task', priority: 'medium', duration: 60 }]);
    
    const state = feature.getState();
    expect(state.metrics.totalRuns).toBe(1);
    expect(state.metrics.successCount).toBe(1);
  });
});
