/**
 * 行动项提取
 * 
 * 从对话自动识别待办事项，一键创建任务
 * 
 * @feature action-extractor
 * @category ai
 * @priority P1
 */

import { EventEmitter } from 'eventemitter3';

export interface ActionItem {
  id: string;
  task: string;
  assignee?: string;
  dueDate?: Date;
  priority: 'high' | 'medium' | 'low';
  source: string;
  confidence: number;
}

export class ActionExtractor extends EventEmitter {
  private config: { enabled: boolean };
  private actionItems: ActionItem[] = [];
  
  constructor(config: { enabled: boolean }) {
    super();
    this.config = config;
  }
  
  extractFromText(text: string, source: string): ActionItem[] {
    const patterns = [
      { regex: /(\w+)\s+(?:will|need to|should|must)\s+(.+?)(?=\.|$)/gi, priority: 'high' },
      { regex: /action[:;]\s*(.+?)(?=\n|$)/gi, priority: 'high' },
      { regex: /todo[:;]\s*(.+?)(?=\n|$)/gi, priority: 'medium' },
      { regex: /(?:remind|remember)\s+(?:me|us)\s+(?:to)?\s*(.+?)(?=\.|$)/gi, priority: 'medium' },
    ];
    
    const items: ActionItem[] = [];
    patterns.forEach(({ regex, priority }) => {
      const matches = text.matchAll(regex);
      for (const match of matches) {
        const fullMatch = match[0];
        const assignee = match[1]?.match(/^\w+$/) ? match[1] : undefined;
        const task = assignee ? match[2] : fullMatch.replace(/^(action|todo|remind)[:;]\s*/i, '');
        
        items.push({
          id: `action-${Date.now()}-${items.length}`,
          task: task.trim(),
          assignee,
          priority: priority as 'high' | 'medium' | 'low',
          source,
          confidence: assignee ? 0.9 : 0.7,
        });
      }
    });
    
    this.actionItems.push(...items);
    this.emit('extracted', items);
    return items;
  }
  
  getActionItems(): ActionItem[] {
    return [...this.actionItems];
  }
  
  markAsCompleted(id: string): void {
    const idx = this.actionItems.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.actionItems.splice(idx, 1);
      this.emit('completed', id);
    }
  }
}

export default ActionExtractor;
