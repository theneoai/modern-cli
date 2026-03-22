import { describe, it, expect } from 'vitest';
import { codereviewai } from './index.js';

describe('codereviewai', () => {
  it('should initialize', async () => {
    const f = new codereviewai({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new codereviewai({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
