import { describe, it, expect } from 'vitest';
import { autonotes } from './index.js';

describe('autonotes', () => {
  it('should initialize', async () => {
    const f = new autonotes({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new autonotes({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
