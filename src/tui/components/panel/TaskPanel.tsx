/**
 * TaskPanel - 重构后的任务面板
 * 使用新的 TUI 架构: useSelectable, Focusable, useToast
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, type Key } from 'ink';
import { tuiTheme as theme, icons, truncate } from '../../../theme/index.js';
import { FocusLayer } from '../../contexts/FocusContext.js';
import { Focusable } from '../ui/Focusable.js';
import { useToast } from '../../contexts/ToastContext.js';
import { SelectableItem } from '../ui/Selectable.js';
import type { Task, TaskStatus, TaskPriority } from '../../types/ui.js';

interface TaskPanelProps {
  tasks: Task[];
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onCompleteTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  height: number;
  focusId?: string;
}

export function TaskPanel({ 
  tasks, 
  onUpdateTask, 
  onCompleteTask, 
  onDeleteTask, 
  height,
  focusId = 'task-panel',
}: TaskPanelProps) {
  const { showSuccess, showInfo } = useToast();
  const [showCompleted, setShowCompleted] = useState(false);
  
  // Filter tasks
  const pendingTasks = useMemo(() => 
    tasks.filter(t => t.status !== 'completed'),
    [tasks]
  );
  
  const completedTasks = useMemo(() => 
    tasks.filter(t => t.status === 'completed'),
    [tasks]
  );
  
  const displayTasks = useMemo(() => 
    showCompleted ? tasks : pendingTasks,
    [showCompleted, tasks, pendingTasks]
  );
  
  // Selection state
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Calculate visible tasks
  const visibleCount = Math.max(2, Math.floor((height - 5) / 1.5));
  const visibleTasks = displayTasks.slice(0, visibleCount);
  const hasMoreTasks = displayTasks.length > visibleCount;
  
  // Keyboard handler
  const handleKey = useCallback((input: string, key: Key): boolean => {
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return true;
    }
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(displayTasks.length - 1, prev + 1));
      return true;
    }
    if (input === 'c' || input === 'C') {
      const task = displayTasks[selectedIndex];
      if (task && task.status !== 'completed') {
        onCompleteTask(task.id);
        showSuccess(`Completed: ${truncate(task.title, 30)}`);
        if (selectedIndex >= pendingTasks.length - 1 && !showCompleted) {
          setSelectedIndex(Math.max(0, pendingTasks.length - 2));
        }
      }
      return true;
    }
    if (input === 'd' || input === 'D') {
      const task = displayTasks[selectedIndex];
      if (task) {
        onDeleteTask(task.id);
        showInfo(`Deleted: ${truncate(task.title, 30)}`);
        setSelectedIndex(prev => Math.max(0, prev - 1));
      }
      return true;
    }
    if (input === 'v' || input === 'V') {
      setShowCompleted(prev => !prev);
      setSelectedIndex(0);
      return true;
    }
    if (input === 's' || input === 'S') {
      const task = displayTasks[selectedIndex];
      if (task) {
        const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed'];
        const currentIndex = statuses.indexOf(task.status);
        const nextStatus = statuses[(currentIndex + 1) % statuses.length];
        onUpdateTask(task.id, { status: nextStatus });
      }
      return true;
    }
    return false;
  }, [displayTasks, selectedIndex, onCompleteTask, onDeleteTask, onUpdateTask, showCompleted, pendingTasks.length, showSuccess, showInfo]);
  
  const currentTask = displayTasks[selectedIndex];
  
  return (
    <Focusable
      id={focusId}
      layer={FocusLayer.PANEL}
      showIndicator
      indicatorStyle="background"
      onKey={handleKey}
      height={height}
      flexDirection="column"
      padding={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Text color={theme.colors.primary} bold>
          {icons.check} Tasks ({pendingTasks.length} pending{showCompleted ? `, ${completedTasks.length} done` : ''})
        </Text>
        <Text color={theme.colors.muted}>
          {showCompleted ? 'V:hide done' : 'V:view all'}
        </Text>
      </Box>

      {/* Task list */}
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {visibleTasks.length === 0 ? (
          <EmptyState showCompleted={showCompleted} />
        ) : (
          visibleTasks.map((task, idx) => (
            <TaskRow
              key={task.id}
              task={task}
              isSelected={idx === selectedIndex}
            />
          ))
        )}
        {hasMoreTasks && (
          <Text color={theme.colors.muted} italic>
            +{displayTasks.length - visibleCount} more tasks...
          </Text>
        )}
      </Box>

      {/* Action hints */}
      {currentTask && <ActionHints task={currentTask} />}
    </Focusable>
  );
}

interface EmptyStateProps {
  showCompleted: boolean;
}

function EmptyState({ showCompleted }: EmptyStateProps) {
  return (
    <Text color={theme.colors.muted} italic>
      {showCompleted ? 'No tasks yet.' : 'No pending tasks. Type to create one!'}
    </Text>
  );
}

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
}

function TaskRow({ task, isSelected }: TaskRowProps) {
  const statusIcon = getStatusIcon(task.status);
  const priorityColor = getPriorityColor(task.priority);
  const statusColor = getStatusColor(task.status);
  
  return (
    <SelectableItem isSelected={isSelected} indicator="highlight">
      <Box marginY={0.5}>
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
        {isSelected && task.status === 'in_progress' && (
          <Text color={theme.colors.warning}> (in progress)</Text>
        )}
      </Box>
    </SelectableItem>
  );
}

interface ActionHintsProps {
  task: Task;
}

function ActionHints({ task }: ActionHintsProps) {
  return (
    <Box marginTop={1} borderStyle="single" borderColor={theme.colors.border} paddingX={1}>
      <Text color={theme.colors.muted}>
        {task.status !== 'completed' && (
          <><Text color={theme.colors.success} bold>C</Text>:complete </>
        )}
        <Text color={theme.colors.warning} bold>S</Text>:status 
        <Text color={theme.colors.error} bold> D</Text>:delete
      </Text>
    </Box>
  );
}

// Helper functions
function getStatusIcon(status: TaskStatus): string {
  const icons_map: Record<TaskStatus, string> = {
    pending: icons.pending,
    in_progress: icons.inProgress,
    completed: icons.checkHeavy,
  };
  return icons_map[status];
}

function getPriorityColor(priority: TaskPriority): string {
  const colors: Record<TaskPriority, string> = {
    low: theme.colors.muted,
    medium: theme.colors.text,
    high: theme.colors.warning,
  };
  return colors[priority];
}

function getStatusColor(status: TaskStatus): string {
  const colors: Record<TaskStatus, string> = {
    pending: theme.colors.muted,
    in_progress: theme.colors.warning,
    completed: theme.colors.success,
  };
  return colors[status];
}
