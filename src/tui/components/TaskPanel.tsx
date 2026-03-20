import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme, icons, truncate } from '../../theme/index.js';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  completedAt?: Date;
}

interface TaskPanelProps {
  tasks: Task[];
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onCompleteTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  height: number;
  showToast?: (type: 'success' | 'error' | 'warning' | 'info', content: string) => void;
  isFocused?: boolean;
}

export function TaskPanel({ tasks, onUpdateTask, onCompleteTask, onDeleteTask, height, showToast, isFocused = false }: TaskPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const displayTasks = showCompleted ? tasks : pendingTasks;
  
  const maxVisibleTasks = Math.max(2, Math.floor((height - 5) / 1.5));
  const visibleTasks = displayTasks.slice(0, maxVisibleTasks);
  const hasMoreTasks = displayTasks.length > maxVisibleTasks;

  useInput((input, key) => {
    if (!isFocused) return;
    
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(displayTasks.length - 1, prev + 1));
    }
    if (input === 'c' || input === 'C') {
      const task = displayTasks[selectedIndex];
      if (task && task.status !== 'completed') {
        onCompleteTask(task.id);
        showToast?.('success', `Completed: ${truncate(task.title, 30)}`);
        // Adjust index if needed
        if (selectedIndex >= pendingTasks.length - 1 && !showCompleted) {
          setSelectedIndex(Math.max(0, pendingTasks.length - 2));
        }
      }
    }
    if (input === 'd' || input === 'D') {
      const task = displayTasks[selectedIndex];
      if (task) {
        onDeleteTask(task.id);
        showToast?.('info', `Deleted: ${truncate(task.title, 30)}`);
        setSelectedIndex(prev => Math.max(0, prev - 1));
      }
    }
    if (input === 'v' || input === 'V') {
      setShowCompleted(prev => !prev);
      setSelectedIndex(0);
    }
    if (input === 's' || input === 'S') {
      const task = displayTasks[selectedIndex];
      if (task) {
        const statuses: ('pending' | 'in_progress' | 'completed')[] = ['pending', 'in_progress', 'completed'];
        const currentIndex = statuses.indexOf(task.status);
        const nextStatus = statuses[(currentIndex + 1) % statuses.length];
        onUpdateTask(task.id, { status: nextStatus });
      }
    }
  });

  const currentTask = displayTasks[selectedIndex];

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box justifyContent="space-between">
        <Text color={theme.colors.primary} bold>
          {icons.check} Tasks ({pendingTasks.length} pending{showCompleted ? `, ${completedTasks.length} done` : ''})
        </Text>
        <Text color={theme.colors.muted}>
          {showCompleted ? 'V:hide done' : 'V:view all'}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {visibleTasks.length === 0 ? (
          <Text color={theme.colors.muted} italic>
            {showCompleted ? 'No tasks yet.' : 'No pending tasks. Type to create one!'}
          </Text>
        ) : (
          visibleTasks.map((task, idx) => (
            <TaskItem 
              key={task.id} 
              task={task} 
              isSelected={idx === selectedIndex}
              showHints={idx === selectedIndex}
            />
          ))
        )}
        {hasMoreTasks && (
          <Text color={theme.colors.muted} italic>
            +{displayTasks.length - maxVisibleTasks} more tasks...
          </Text>
        )}
      </Box>

      {/* Action hints */}
      {currentTask && (
        <Box marginTop={1} borderStyle="single" borderColor={theme.colors.border} paddingX={1}>
          <Text color={theme.colors.muted}>
            {currentTask.status !== 'completed' && (
              <><Text color={theme.colors.success} bold>C</Text>:complete </>
            )}
            <Text color={theme.colors.warning} bold>S</Text>:status 
            <Text color={theme.colors.error} bold> D</Text>:delete
          </Text>
        </Box>
      )}
    </Box>
  );
}

interface TaskItemProps {
  task: Task;
  isSelected: boolean;
  showHints: boolean;
}

function TaskItem({ task, isSelected, showHints }: TaskItemProps) {
  const statusIcon = {
    pending: icons.pending,
    in_progress: icons.inProgress,
    completed: icons.checkHeavy,
  }[task.status];

  const priorityColor = {
    low: theme.colors.muted,
    medium: theme.colors.text,
    high: theme.colors.warning,
  }[task.priority];

  const statusColor = {
    pending: theme.colors.muted,
    in_progress: theme.colors.warning,
    completed: theme.colors.success,
  }[task.status];

  return (
    <Box 
      marginY={0.5}
      backgroundColor={isSelected ? theme.colors.surfaceLight : undefined}
      paddingX={isSelected ? 1 : 0}
    >
      <Text color={statusColor}>{statusIcon} </Text>
      <Text 
        color={priorityColor} 
        strikethrough={task.status === 'completed'}
        bold={isSelected}
      >
        {truncate(task.title, 35)}
      </Text>
      {task.priority === 'high' && task.status !== 'completed' && (
        <Text color={theme.colors.error}> !</Text>
      )}
      {showHints && task.status === 'in_progress' && (
        <Text color={theme.colors.warning}> (in progress)</Text>
      )}
    </Box>
  );
}
