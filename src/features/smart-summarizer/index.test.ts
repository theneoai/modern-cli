import { describe, it, expect } from 'vitest';
import { smartsummarizer } from './index.js';

describe('smartsummarizer', () => {
  it('should initialize', async () => {
    const f = new smartsummarizer({ enabled: true });
    await f.initialize();
    expect(f.getState().isActive).toBe(true);
  });
  
  it('should execute', async () => {
    const f = new smartsummarizer({ enabled: true });
    const r = await f.execute();
    expect(r.success).toBe(true);
  });
});
