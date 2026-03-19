import { describe, it, expect } from 'vitest';
import { agileboard } from './index.js';

describe('agileboard', () => {
  it('should initialize', async () => {
    const f = new agileboard({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new agileboard({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
