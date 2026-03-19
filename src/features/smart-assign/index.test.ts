import { describe, it, expect } from 'vitest';
import { SmartAssign } from './index.js';

describe('SmartAssign', () => {
  it('should suggest best assignee based on skills', () => {
    const sa = new SmartAssign();
    sa.addMember({ id: 'm1', name: 'Alice', skills: ['react', 'ts'], currentLoad: 20, maxCapacity: 40, recentTasks: 5 });
    sa.addMember({ id: 'm2', name: 'Bob', skills: ['python', 'ai'], currentLoad: 10, maxCapacity: 40, recentTasks: 2 });
    
    const suggestions = sa.suggestAssignee({ skills: ['react'], estimatedHours: 8, priority: 'high' });
    expect(suggestions[0].memberId).toBe('m1');
    expect(suggestions[0].skillMatch).toBe(1);
  });
  
  it('should consider load capacity', () => {
    const sa = new SmartAssign();
    sa.addMember({ id: 'm1', name: 'Alice', skills: ['js'], currentLoad: 38, maxCapacity: 40, recentTasks: 0 });
    sa.addMember({ id: 'm2', name: 'Bob', skills: ['js'], currentLoad: 10, maxCapacity: 40, recentTasks: 0 });
    
    const suggestions = sa.suggestAssignee({ skills: ['js'], estimatedHours: 10, priority: 'medium' });
    // Bob should be preferred due to capacity
    expect(suggestions[0].memberId).toBe('m2');
  });
  
  it('should provide load balancing recommendations', () => {
    const sa = new SmartAssign();
    sa.addMember({ id: 'm1', name: 'Alice', skills: ['js'], currentLoad: 40, maxCapacity: 40, recentTasks: 0 });
    sa.addMember({ id: 'm2', name: 'Bob', skills: ['js'], currentLoad: 5, maxCapacity: 40, recentTasks: 0 });
    
    const balance = sa.balanceLoad();
    expect(balance.length).toBeGreaterThan(0);
  });
});
