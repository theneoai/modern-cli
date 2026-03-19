/**
 * 情绪分析
 * 
 * 检测消息情绪，预警团队冲突
 * 
 * @feature sentiment-analyzer
 * @category communication
 * @priority P2
 */

import { EventEmitter } from 'eventemitter3';

export interface SentimentResult {
  score: number; // -1 to 1
  label: 'negative' | 'neutral' | 'positive';
  intensity: 'low' | 'medium' | 'high';
  aspects: Array<{ aspect: string; sentiment: number }>;
}

export class SentimentAnalyzer extends EventEmitter {
  private config: { enabled: boolean };
  private history: Array<{ text: string; result: SentimentResult; timestamp: Date }> = [];
  
  constructor(config: { enabled: boolean }) {
    super();
    this.config = config;
  }
  
  analyze(text: string): SentimentResult {
    const negativeWords = ['angry', 'frustrated', 'terrible', 'awful', 'hate', 'bad', 'worst'];
    const positiveWords = ['happy', 'great', 'excellent', 'love', 'good', 'best', 'awesome'];
    
    const lowerText = text.toLowerCase();
    let score = 0;
    
    negativeWords.forEach(word => {
      if (lowerText.includes(word)) score -= 0.2;
    });
    
    positiveWords.forEach(word => {
      if (lowerText.includes(word)) score += 0.2;
    });
    
    // 标点符号分析
    if (text.includes('!!!')) score -= 0.1;
    if (text.includes('???')) score -= 0.05;
    
    score = Math.max(-1, Math.min(1, score));
    
    let label: 'negative' | 'neutral' | 'positive' = 'neutral';
    if (score < -0.3) label = 'negative';
    else if (score > 0.3) label = 'positive';
    
    const intensity = Math.abs(score) > 0.7 ? 'high' : Math.abs(score) > 0.3 ? 'medium' : 'low';
    
    const result: SentimentResult = {
      score,
      label,
      intensity,
      aspects: [],
    };
    
    this.history.push({ text, result, timestamp: new Date() });
    
    // 预警检测
    if (label === 'negative' && intensity === 'high') {
      this.emit('alert', { type: 'negative_sentiment', text, score });
    }
    
    return result;
  }
  
  getTrend(): { improving: boolean; average: number } {
    if (this.history.length < 2) return { improving: true, average: 0 };
    
    const recent = this.history.slice(-10);
    const average = recent.reduce((sum, h) => sum + h.result.score, 0) / recent.length;
    const previous = this.history.slice(-20, -10);
    const prevAvg = previous.length > 0 
      ? previous.reduce((sum, h) => sum + h.result.score, 0) / previous.length 
      : 0;
    
    return { improving: average > prevAvg, average };
  }
}

export default SentimentAnalyzer;
