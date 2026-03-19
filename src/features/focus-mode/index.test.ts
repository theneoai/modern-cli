import { describe, it, expect } from 'vitest';
import { focusmode } from './index.js';

describe('focusmode', () => {
  it('should initialize', async () => {
    const f = new focusmode({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new focusmode({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
