import { describe, it, expect } from 'vitest';
import { smartassign } from './index.js';

describe('smartassign', () => {
  it('should initialize', async () => {
    const f = new smartassign({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new smartassign({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
