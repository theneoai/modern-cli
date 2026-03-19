/**
 * 自动笔记
 * 
 * 会议/讨论自动记录，提取关键信息
 * 
 * @feature auto-notes
 * @category knowledge
 * @priority P1
 */

import { EventEmitter } from 'eventemitter3';

export interface AutoNotesConfig {
  enabled: boolean;
  settings?: {
    extractActionItems?: boolean;
    extractDecisions?: boolean;
    summarize?: boolean;
    language?: string;
  };
}

export interface MeetingNote {
  id: string;
  meetingId: string;
  title: string;
  summary: string;
  keyPoints: string[];
  actionItems: Array<{ task: string; assignee?: string; dueDate?: Date }>;
  decisions: string[];
  participants: string[];
  createdAt: Date;
}

export class AutoNotes extends EventEmitter {
  private config: AutoNotesConfig;
  private notes: MeetingNote[] = [];
  
  constructor(config: AutoNotesConfig) {
    super();
    this.config = config;
  }
  
  async generateNotes(meetingData: {
    meetingId: string;
    title: string;
    transcript: string;
    participants: string[];
  }): Promise<MeetingNote> {
    const settings = this.config.settings || {
      extractActionItems: true,
      extractDecisions: true,
      summarize: true,
    };
    
    // 提取行动项
    const actionItems: MeetingNote['actionItems'] = [];
    if (settings.extractActionItems) {
      const actionRegex = /(?:todo|action item|task|follow up)[;:](.+?)(?=\n|$)/gi;
      const matches = meetingData.transcript.match(actionRegex);
      if (matches) {
        matches.forEach(match => {
          actionItems.push({ task: match.replace(/^(todo|action item|task|follow up)[;:]/i, '').trim() });
        });
      }
    }
    
    // 提取决策
    const decisions: string[] = [];
    if (settings.extractDecisions) {
      const decisionRegex = /(?:decided|decision|agreed|conclusion)[;:](.+?)(?=\n|$)/gi;
      const matches = meetingData.transcript.match(decisionRegex);
      if (matches) {
        decisions.push(...matches.map(m => m.replace(/^(decided|decision|agreed|conclusion)[;:]/i, '').trim()));
      }
    }
    
    // 生成摘要
    let summary = meetingData.transcript.slice(0, 200);
    if (settings.summarize) {
      // TODO: 使用AI生成更好摘要
      summary = this.generateSimpleSummary(meetingData.transcript);
    }
    
    // 提取关键点
    const keyPoints = this.extractKeyPoints(meetingData.transcript);
    
    const note: MeetingNote = {
      id: `note-${Date.now()}`,
      meetingId: meetingData.meetingId,
      title: meetingData.title,
      summary,
      keyPoints,
      actionItems,
      decisions,
      participants: meetingData.participants,
      createdAt: new Date(),
    };
    
    this.notes.push(note);
    this.emit('notesGenerated', note);
    
    return note;
  }
  
  private generateSimpleSummary(transcript: string): string {
    // 简单摘要：取前200字符 + 关键句
    const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keySentences = sentences.slice(0, 3);
    return keySentences.join('. ') + '.';
  }
  
  private extractKeyPoints(transcript: string): string[] {
    // 提取包含关键词的句子
    const keywords = ['important', 'key', 'critical', 'must', 'need to', 'should'];
    const sentences = transcript.split(/[.!?]+/);
    return sentences
      .filter(s => keywords.some(kw => s.toLowerCase().includes(kw)))
      .slice(0, 5)
      .map(s => s.trim());
  }
  
  getNotes(): MeetingNote[] {
    return [...this.notes];
  }
  
  searchNotes(query: string): MeetingNote[] {
    return this.notes.filter(note => 
      note.title.toLowerCase().includes(query.toLowerCase()) ||
      note.summary.toLowerCase().includes(query.toLowerCase()) ||
      note.keyPoints.some(kp => kp.toLowerCase().includes(query.toLowerCase()))
    );
  }
}

export default AutoNotes;
