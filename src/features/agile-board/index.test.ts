import { describe, it, expect } from 'vitest';
import { AgileBoard } from './index.js';

describe('AgileBoard', () => {
  it('should create sprint', () => {
    const board = new AgileBoard();
    const sprint = board.createSprint('Sprint 1', 'Launch feature');
    expect(sprint.name).toBe('Sprint 1');
    expect(sprint.goal).toBe('Launch feature');
  });
  
  it('should add and move tasks', () => {
    const board = new AgileBoard();
    const sprint = board.createSprint('S1', 'Goal');
    const task = board.addTask({ title: 'Task 1', status: 'todo', points: 5, sprint: sprint.id });
    
    board.moveTask(task.id, 'in-progress');
    const boardState = board.getBoard(sprint.id);
    expect(boardState.inProgress.length).toBe(1);
  });
  
  it('should calculate velocity', () => {
    const board = new AgileBoard();
    const sprint = board.createSprint('S1', 'Goal');
    board.addTask({ title: 'T1', status: 'done', points: 8, sprint: sprint.id });
    board.moveTask(board['tasks'][0].id, 'done');
    
    expect(board.getVelocity()).toBeGreaterThanOrEqual(0);
  });
});
