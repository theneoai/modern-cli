import { randomUUID } from 'crypto';
import { useState, useCallback, useMemo } from 'react';
import { layout } from '../../theme/index.js';

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt?: Date;
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Review project proposal',
      status: 'pending',
      priority: 'high',
      createdAt: new Date(),
    },
    {
      id: '2',
      title: 'Email team updates',
      status: 'in_progress',
      priority: 'medium',
      createdAt: new Date(Date.now() - 86400000),
    },
    {
      id: '3',
      title: 'Prepare presentation',
      status: 'pending',
      priority: 'high',
      createdAt: new Date(Date.now() - 172800000),
    },
  ]);

  const hasPendingTasks = useMemo(() => 
    tasks.some(t => t.status === 'pending' || t.status === 'in_progress'),
    [tasks]
  );

  const addTask = useCallback((taskData: Partial<Task>): Task => {
    const newTask: Task = {
      id: randomUUID(),
      title: taskData.title || 'New Task',
      status: taskData.status || 'pending',
      priority: taskData.priority || 'medium',
      createdAt: new Date(),
      ...taskData,
    };
    
    setTasks(prev => [newTask, ...prev]);
    return newTask;
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => 
      prev.map(task => 
        task.id === id ? { ...task, ...updates } : task
      )
    );
  }, []);

  const completeTask = useCallback((id: string) => {
    setTasks(prev => 
      prev.map(task => 
        task.id === id 
          ? { ...task, status: 'completed' as const, completedAt: new Date() } 
          : task
      )
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(task => task.id !== id));
  }, []);

  return {
    tasks,
    hasPendingTasks,
    addTask,
    updateTask,
    completeTask,
    deleteTask,
  };
}

// Input history management with size limit
export function useInputHistory() {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const addToHistory = useCallback((input: string) => {
    if (!input.trim()) return;
    
    setHistory(prev => {
      // Remove duplicates and add to end
      const filtered = prev.filter(item => item !== input);
      const newHistory = [...filtered, input];
      // Limit to max size
      if (newHistory.length > layout.maxHistorySize) {
        return newHistory.slice(newHistory.length - layout.maxHistorySize);
      }
      return newHistory;
    });
  }, []);

  const navigateHistory = useCallback((direction: 'up' | 'down', currentInput: string): { newInput: string; newIndex: number } => {
    if (history.length === 0) {
      return { newInput: currentInput, newIndex: -1 };
    }

    let newIndex: number;
    if (direction === 'up') {
      newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
    } else {
      newIndex = historyIndex > 0 ? historyIndex - 1 : -1;
    }

    setHistoryIndex(newIndex);
    
    if (newIndex === -1) {
      return { newInput: '', newIndex };
    }
    
    const historyItem = history[history.length - 1 - newIndex];
    return { newInput: historyItem || '', newIndex };
  }, [history, historyIndex]);

  const resetHistoryIndex = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  return {
    history,
    historyIndex,
    addToHistory,
    navigateHistory,
    resetHistoryIndex,
  };
}
