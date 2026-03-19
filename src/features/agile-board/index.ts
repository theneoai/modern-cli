/**
 * 敏捷看板
 * 
 * Sprint 规划、燃尽图、速度追踪
 * 
 * @feature agile-board
 * @category project
 * @priority P1
 */

import { EventEmitter } from 'eventemitter3';

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'review' | 'done';
  assignee?: string;
  points: number;
  sprint?: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: Date;
  endDate: Date;
  tasks: Task[];
  totalPoints: number;
  completedPoints: number;
}

export class AgileBoard extends EventEmitter {
  private sprints: Sprint[] = [];
  private tasks: Task[] = [];
  
  createSprint(name: string, goal: string, durationDays: number = 14): Sprint {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);
    
    const sprint: Sprint = {
      id: `sprint-${Date.now()}`,
      name,
      goal,
      startDate,
      endDate,
      tasks: [],
      totalPoints: 0,
      completedPoints: 0,
    };
    
    this.sprints.push(sprint);
    this.emit('sprintCreated', sprint);
    return sprint;
  }
  
  addTask(task: Omit<Task, 'id'>): Task {
    const newTask: Task = { ...task, id: `task-${Date.now()}` };
    this.tasks.push(newTask);
    
    if (task.sprint) {
      const sprint = this.sprints.find(s => s.id === task.sprint);
      if (sprint) {
        sprint.tasks.push(newTask);
        sprint.totalPoints += task.points;
      }
    }
    
    this.emit('taskAdded', newTask);
    return newTask;
  }
  
  moveTask(taskId: string, status: Task['status']): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      const oldStatus = task.status;
      task.status = status;
      
      if (status === 'done') {
        const sprint = this.sprints.find(s => s.id === task.sprint);
        if (sprint) {
          sprint.completedPoints += task.points;
        }
      }
      
      this.emit('taskMoved', { task, from: oldStatus, to: status });
    }
  }
  
  getBurndown(sprintId: string): Array<{ date: Date; remaining: number }> {
    const sprint = this.sprints.find(s => s.id === sprintId);
    if (!sprint) return [];
    
    // 模拟燃尽数据
    const data: Array<{ date: Date; remaining: number }> = [];
    let remaining = sprint.totalPoints;
    
    for (let i = 0; i <= 14; i++) {
      const date = new Date(sprint.startDate);
      date.setDate(date.getDate() + i);
      
      // 模拟每天完成一些点数
      const completed = Math.random() * (sprint.totalPoints / 10);
      remaining = Math.max(0, remaining - completed);
      
      data.push({ date, remaining: Math.round(remaining) });
    }
    
    return data;
  }
  
  getVelocity(): number {
    const completedSprints = this.sprints.filter(s => s.completedPoints > 0);
    if (completedSprints.length === 0) return 0;
    
    return completedSprints.reduce((sum, s) => sum + s.completedPoints, 0) / completedSprints.length;
  }
  
  getBoard(sprintId?: string): { todo: Task[]; inProgress: Task[]; review: Task[]; done: Task[] } {
    const tasks = sprintId 
      ? this.tasks.filter(t => t.sprint === sprintId)
      : this.tasks;
    
    return {
      todo: tasks.filter(t => t.status === 'todo'),
      inProgress: tasks.filter(t => t.status === 'in-progress'),
      review: tasks.filter(t => t.status === 'review'),
      done: tasks.filter(t => t.status === 'done'),
    };
  }
}

export default AgileBoard;
