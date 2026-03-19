/**
 * 智能分配
 * 
 * AI 建议任务分配，基于技能和负载
 * 
 * @feature smart-assign
 * @category ai
 * @priority P1
 */

import { EventEmitter } from 'eventemitter3';

export interface TeamMember {
  id: string;
  name: string;
  skills: string[];
  currentLoad: number;
  maxCapacity: number;
  recentTasks: number;
}

export interface TaskRequirements {
  skills: string[];
  estimatedHours: number;
  priority: 'high' | 'medium' | 'low';
}

export interface Assignment {
  memberId: string;
  confidence: number;
  reason: string;
  skillMatch: number;
  loadAfter: number;
}

export class SmartAssign extends EventEmitter {
  private members: TeamMember[] = [];
  private assignments: Map<string, string> = new Map();
  
  addMember(member: TeamMember): void {
    this.members.push(member);
  }
  
  suggestAssignee(task: TaskRequirements): Assignment[] {
    const suggestions: Assignment[] = this.members.map(member => {
      // 技能匹配度
      const matchingSkills = task.skills.filter(skill => 
        member.skills.includes(skill)
      ).length;
      const skillMatch = task.skills.length > 0 
        ? matchingSkills / task.skills.length 
        : 0.5;
      
      // 负载检查
      const hasCapacity = member.currentLoad + task.estimatedHours <= member.maxCapacity;
      const loadFactor = hasCapacity ? 1 : 0.3;
      
      // 工作分布（避免一直分配给同一个人）
      const distributionScore = Math.max(0, 1 - member.recentTasks / 10);
      
      // 综合评分
      const confidence = (skillMatch * 0.5 + loadFactor * 0.3 + distributionScore * 0.2);
      
      let reason = '';
      if (skillMatch >= 0.8) reason = '技能高度匹配';
      else if (skillMatch >= 0.5) reason = '具备相关技能';
      else reason = '技能部分匹配';
      
      if (hasCapacity) reason += '，有空闲容量';
      else reason += '，负载较高';
      
      return {
        memberId: member.id,
        confidence: Math.round(confidence * 100) / 100,
        reason,
        skillMatch: Math.round(skillMatch * 100) / 100,
        loadAfter: member.currentLoad + task.estimatedHours,
      };
    });
    
    // 按置信度排序
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
  
  assign(taskId: string, memberId: string): void {
    this.assignments.set(taskId, memberId);
    
    const member = this.members.find(m => m.id === memberId);
    if (member) {
      member.recentTasks++;
    }
    
    this.emit('assigned', { taskId, memberId });
  }
  
  getMemberLoad(): Array<{ memberId: string; name: string; load: number; capacity: number; percentage: number }> {
    return this.members.map(m => ({
      memberId: m.id,
      name: m.name,
      load: m.currentLoad,
      capacity: m.maxCapacity,
      percentage: Math.round((m.currentLoad / m.maxCapacity) * 100),
    }));
  }
  
  balanceLoad(): Array<{ from: string; to: string; reason: string }> {
    const recommendations: Array<{ from: string; to: string; reason: string }> = [];
    
    const overloaded = this.members.filter(m => m.currentLoad > m.maxCapacity * 0.8);
    const underloaded = this.members.filter(m => m.currentLoad < m.maxCapacity * 0.4);
    
    overloaded.forEach(heavy => {
      underloaded.forEach(light => {
        if (heavy.skills.some(s => light.skills.includes(s))) {
          recommendations.push({
            from: heavy.name,
            to: light.name,
            reason: `${heavy.name} 负载过高 (${Math.round(heavy.currentLoad / heavy.maxCapacity * 100)}%)，建议转移部分任务给 ${light.name}`,
          });
        }
      });
    });
    
    return recommendations;
  }
}

export default SmartAssign;
