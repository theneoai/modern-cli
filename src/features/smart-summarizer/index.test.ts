import { describe, it, expect } from 'vitest';
import { SmartSummarizer } from './index.js';

describe('SmartSummarizer', () => {
  it('should summarize content', async () => {
    const ss = new SmartSummarizer({ enabled: true });
    const summary = await ss.summarize(
      'This is an important meeting. We decided to launch next week. Action: Update website.',
      { sourceType: 'meeting', sourceId: 'm1' }
    );
    
    expect(summary.brief).toBeTruthy();
    expect(summary.keyPoints.length).toBeGreaterThan(0);
  });
  
  it('should extract action items', async () => {
    const ss = new SmartSummarizer({ enabled: true });
    const summary = await ss.summarize(
      'Action: Review the code. John will fix the bug.',
      { sourceType: 'meeting', sourceId: 'm2' }
    );
    
    expect(summary.actionItems.length).toBeGreaterThan(0);
  });
  
  it('should search summaries', async () => {
    const ss = new SmartSummarizer({ enabled: true });
    await ss.summarize('Product meeting about launch', { sourceType: 'meeting', sourceId: 'm3' });
    
    const results = ss.searchSummaries('product');
    expect(results.length).toBeGreaterThan(0);
  });
});
