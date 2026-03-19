import { describe, it, expect } from 'vitest';
import { TerminalCopilot } from './index.js';

describe('TerminalCopilot', () => {
  it('should provide suggestions', async () => {
    const tc = new TerminalCopilot({ enabled: true });
    const suggestions = await tc.suggest('for loop');
    expect(suggestions.length).toBeGreaterThan(0);
  });
  
  it('should track context', () => {
    const tc = new TerminalCopilot({ enabled: true });
    tc.addContext('const x = 1;');
    expect(tc['context'].length).toBe(1);
  });
});
