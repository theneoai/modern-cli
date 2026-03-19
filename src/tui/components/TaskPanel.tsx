import React from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../theme.js';

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
  height: number;
}

export function TaskPanel({ tasks, onUpdateTask, height }: TaskPanelProps) {
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const maxVisibleTasks = Math.max(2, Math.floor((height - 4) / 1.5));
  const recentTasks = pendingTasks.slice(0, maxVisibleTasks);

  return (
    <Box flexDirection="column" padding={1} height="100%">
      <Box justifyContent="space-between">
        <Text color={theme.colors.primary} bold>
          {icons.task} Tasks ({pendingTasks.length})
        </Text>
        <Text color={theme.colors.muted}>
          Type: "add &lt;task&gt;" or "done &lt;task&gt;"
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {recentTasks.length === 0 ? (
          <Text color={theme.colors.muted} italic>
            No pending tasks. Type to create one!
          </Text>
        ) : (
          recentTasks.map(task => (
            <TaskItem key={task.id} task={task} />
          ))
        )}
      </Box>
    </Box>
  );
}

function TaskItem({ task }: { task: Task }) {
  const statusIcon = {
    pending: icons.pending,
    in_progress: icons.inProgress,
    completed: icons.check,
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
    <Box marginY={0.5}>
      <Text color={statusColor}>{statusIcon} </Text>
      <Text color={priorityColor} strikethrough={task.status === 'completed'}>
        {task.title}
      </Text>
      {task.priority === 'high' && (
        <Text color={theme.colors.error}> !</Text>
      )}
    </Box>
  );
}
