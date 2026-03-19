import { describe, it, expect } from 'vitest';
import { sentimentanalyzer } from './index.js';

describe('sentimentanalyzer', () => {
  it('should initialize', async () => {
    const f = new sentimentanalyzer({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new sentimentanalyzer({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
