import { useState, useCallback } from 'react';

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

  const addTask = useCallback((taskData: Partial<Task>): Task => {
    const newTask: Task = {
      id: Date.now().toString(),
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
    addTask,
    updateTask,
    completeTask,
    deleteTask,
  };
}
