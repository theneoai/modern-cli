import { describe, it, expect } from 'vitest';
import { terminalcopilot } from './index.js';

describe('terminalcopilot', () => {
  it('should initialize', async () => {
    const f = new terminalcopilot({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new terminalcopilot({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
