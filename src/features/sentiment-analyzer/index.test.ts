import { describe, it, expect } from 'vitest';
import { SentimentAnalyzer } from './index.js';

describe('SentimentAnalyzer', () => {
  it('should detect positive sentiment', () => {
    const sa = new SentimentAnalyzer({ enabled: true });
    const result = sa.analyze('This is great! Love it.');
    expect(result.label).toBe('positive');
  });
  
  it('should detect negative sentiment', () => {
    const sa = new SentimentAnalyzer({ enabled: true });
    const result = sa.analyze('This is terrible. Hate it!!!');
    expect(result.label).toBe('negative');
  });
  
  it('should track trend', () => {
    const sa = new SentimentAnalyzer({ enabled: true });
    sa.analyze('Good');
    sa.analyze('Great');
    const trend = sa.getTrend();
    expect(trend.average).toBeGreaterThan(0);
  });
});
