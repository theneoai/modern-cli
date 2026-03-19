import { describe, it, expect, beforeEach } from 'vitest';
import { MeetingOptimizer } from './index.js';

describe('MeetingOptimizer', () => {
  let feature: MeetingOptimizer;
  
  beforeEach(() => {
    feature = new MeetingOptimizer({ enabled: true });
  });
  
  it('should initialize successfully', async () => {
    await expect(feature.initialize()).resolves.not.toThrow();
    expect(feature.getState().isActive).toBe(true);
  });
  
  it('should find optimal meeting slots', async () => {
    await feature.initialize();
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const members = [
      {
        id: 'user-1',
        name: 'Alice',
        timezone: 'UTC',
        availability: [{ start: new Date(tomorrow.setHours(9, 0)), end: new Date(tomorrow.setHours(17, 0)) }],
      },
      {
        id: 'user-2',
        name: 'Bob',
        timezone: 'UTC',
        availability: [{ start: new Date(tomorrow.setHours(9, 0)), end: new Date(tomorrow.setHours(17, 0)) }],
      },
    ];
    
    const slots = await feature.findOptimalSlots(members, 30, 1);
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].score).toBeGreaterThan(0);
  });
  
  it('should score slots based on availability', async () => {
    await feature.initialize();
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const members = [
      {
        id: 'user-1',
        name: 'Alice',
        timezone: 'UTC',
        availability: [{ start: new Date(tomorrow.setHours(10, 0)), end: new Date(tomorrow.setHours(11, 0)) }],
      },
      {
        id: 'user-2',
        name: 'Bob',
        timezone: 'UTC',
        availability: [{ start: new Date(tomorrow.setHours(9, 0)), end: new Date(tomorrow.setHours(17, 0)) }],
      },
    ];
    
    const slots = await feature.findOptimalSlots(members, 30, 1);
    const bestSlot = slots[0];
    expect(bestSlot.availableMembers.length + bestSlot.unavailableMembers.length).toBe(2);
  });
  
  it('should track metrics', async () => {
    await feature.initialize();
    const members = [{
      id: 'user-1',
      name: 'Alice',
      timezone: 'UTC',
      availability: [],
    }];
    
    await feature.findOptimalSlots(members, 30, 1);
    const state = feature.getState();
    expect(state.metrics.totalRuns).toBe(1);
  });
});
