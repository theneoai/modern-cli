import { describe, it, expect } from 'vitest';
import { actionextractor } from './index.js';

describe('actionextractor', () => {
  it('should initialize', async () => {
    const f = new actionextractor({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new actionextractor({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
