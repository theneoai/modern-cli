/**
 * 智能摘要
 * 
 * 自动生成会议/讨论摘要，提取行动项
 * 
 * @feature smart-summarizer
 * @category ai
 * @priority P1
 */

import { EventEmitter } from 'eventemitter3';

export interface SmartSummarizerConfig {
  enabled: boolean;
  apiKey?: string;
  settings?: {
    maxLength?: number;
    format?: 'bullet' | 'paragraph' | 'structured';
    extractActions?: boolean;
    extractDecisions?: boolean;
    language?: string;
  };
}

export interface Summary {
  id: string;
  sourceId: string;
  sourceType: 'meeting' | 'discussion' | 'document';
  brief: string;
  detailed: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; assignee?: string }>;
  decisions: string[];
  participants?: string[];
  duration?: number;
  createdAt: Date;
}

export class SmartSummarizer extends EventEmitter {
  private config: SmartSummarizerConfig;
  private summaries: Summary[] = [];
  
  constructor(config: SmartSummarizerConfig) {
    super();
    this.config = config;
  }
  
  async summarize(content: string, options: {
    sourceType: 'meeting' | 'discussion' | 'document';
    sourceId: string;
    participants?: string[];
    duration?: number;
  }): Promise<Summary> {
    const settings = this.config.settings || {
      maxLength: 500,
      format: 'structured',
      extractActions: true,
      extractDecisions: true,
    };
    
    // 模拟AI摘要生成
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const importantSentences = sentences.slice(0, Math.min(5, sentences.length));
    
    const brief = importantSentences.join('. ') + '.';
    const detailed = this.generateDetailedSummary(content, settings.format!);
    const keyPoints = this.extractKeyPoints(content);
    const actionItems = settings.extractActions ? this.extractActionItems(content) : [];
    const decisions = settings.extractDecisions ? this.extractDecisions(content) : [];
    
    const summary: Summary = {
      id: `summary-${Date.now()}`,
      sourceId: options.sourceId,
      sourceType: options.sourceType,
      brief: brief.slice(0, settings.maxLength),
      detailed,
      keyPoints,
      actionItems,
      decisions,
      participants: options.participants,
      duration: options.duration,
      createdAt: new Date(),
    };
    
    this.summaries.push(summary);
    this.emit('summaryGenerated', summary);
    
    return summary;
  }
  
  private generateDetailedSummary(content: string, format: string): string {
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    
    if (format === 'bullet') {
      return paragraphs.map(p => `• ${p.slice(0, 100)}...`).join('\n');
    } else if (format === 'structured') {
      return `## Overview\n${paragraphs[0]?.slice(0, 200) || 'N/A'}\n\n## Details\n${paragraphs.slice(1).map(p => p.slice(0, 150)).join('\n\n')}`;
    }
    return content.slice(0, 1000);
  }
  
  private extractKeyPoints(content: string): string[] {
    const indicators = ['important', 'key', 'main', 'critical', 'essential'];
    const sentences = content.split(/[.!?]+/);
    return sentences
      .filter(s => indicators.some(i => s.toLowerCase().includes(i)))
      .slice(0, 5)
      .map(s => s.trim());
  }
  
  private extractActionItems(content: string): Summary['actionItems'] {
    const patterns = [
      /(\w+)\s+(?:will|to|should)\s+(.+?)(?=\.|$)/gi,
      /action[:;]\s*(.+?)(?=\n|$)/gi,
      /todo[:;]\s*(.+?)(?=\n|$)/gi,
    ];
    
    const items: Summary['actionItems'] = [];
    patterns.forEach(pattern => {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        items.push({ task: match[0].trim() });
      }
    });
    
    return items.slice(0, 10);
  }
  
  private extractDecisions(content: string): string[] {
    const patterns = [
      /(?:decided|decision)[:;]\s*(.+?)(?=\.|$)/gi,
      /(?:agreed|agreement)[:;]\s*(.+?)(?=\.|$)/gi,
      /(?:concluded|conclusion)[:;]\s*(.+?)(?=\.|$)/gi,
    ];
    
    const decisions: string[] = [];
    patterns.forEach(pattern => {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        decisions.push(match[1]?.trim() || match[0].trim());
      }
    });
    
    return decisions;
  }
  
  getSummaries(): Summary[] {
    return [...this.summaries];
  }
  
  searchSummaries(query: string): Summary[] {
    return this.summaries.filter(s =>
      s.brief.toLowerCase().includes(query.toLowerCase()) ||
      s.detailed.toLowerCase().includes(query.toLowerCase()) ||
      s.keyPoints.some(kp => kp.toLowerCase().includes(query.toLowerCase()))
    );
  }
}

export default SmartSummarizer;
