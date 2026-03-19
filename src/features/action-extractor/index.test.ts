import { describe, it, expect } from 'vitest';
import { ActionExtractor } from './index.js';

describe('ActionExtractor', () => {
  it('should extract actions from text', () => {
    const ae = new ActionExtractor({ enabled: true });
    const text = 'John will review the PR. TODO: Update documentation.';
    const actions = ae.extractFromText(text, 'meeting');
    
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].task).toContain('review');
  });
  
  it('should identify assignees', () => {
    const ae = new ActionExtractor({ enabled: true });
    const text = 'Alice should fix the bug.';
    const actions = ae.extractFromText(text, 'chat');
    
    expect(actions[0].assignee).toBe('Alice');
  });
});
