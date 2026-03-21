import { describe, it, expect } from 'vitest';
import { burnoutdetector } from './index.js';

describe('burnoutdetector', () => {
  it('should initialize', async () => {
    const f = new burnoutdetector({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new burnoutdetector({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
