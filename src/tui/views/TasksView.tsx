/**
 * TasksView.tsx - Vim 风格任务管理器
 *
 * 键盘操作:
 *   j/k  ↑/↓     移动光标
 *   Space/Enter  切换完成状态
 *   n            新建任务 (在输入栏提示)
 *   d            删除选中
 *   p            切换优先级 (low → normal → high)
 *   s            切换状态 (pending → in_progress → done)
 *   /            过滤搜索
 *   gg/G         顶部/底部
 *   v            切换已完成显示
 */

import { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { Task } from '../FlowApp.js';

interface TasksViewProps {
  tasks: Task[];
  height: number;
  width: number;
  isFocused: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onSetStatus: (id: string, status: Task['status']) => void;
  onUpdatePriority?: (id: string, priority: Task['priority']) => void;
  onAddTask: (title: string) => void;
}

export function TasksView({
  tasks, height, width, isFocused,
  onToggle, onDelete, onSetStatus, onUpdatePriority,
}: TasksViewProps) {
  const [cursor, setCursor] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [lastKey, setLastKey] = useState('');
  const [notification, setNotification] = useState('');

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 2000);
  }, []);

  // Filter and sort tasks
  const displayTasks = useMemo(() => {
    let list = showDone ? tasks : tasks.filter(t => t.status !== 'done');
    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q));
    }
    // Sort: high priority first, then by status
    return [...list].sort((a, b) => {
      const pa = { high: 0, normal: 1, low: 2 }[a.priority];
      const pb = { high: 0, normal: 1, low: 2 }[b.priority];
      if (pa !== pb) return pa - pb;
      const sa = { in_progress: 0, pending: 1, done: 2 }[a.status];
      const sb = { in_progress: 0, pending: 1, done: 2 }[b.status];
      return sa - sb;
    });
  }, [tasks, showDone, filterQuery]);

  const safeIdx = Math.min(cursor, Math.max(0, displayTasks.length - 1));

  // Visible window
  const listAreaHeight = height - 5; // header + footer hints
  const scrollStart = Math.max(0, safeIdx - Math.floor(listAreaHeight / 2));
  const visibleTasks = displayTasks.slice(scrollStart, scrollStart + listAreaHeight);

  useInput((ch, key) => {
    // Filter mode
    if (isFiltering) {
      if (key.escape || key.return) {
        setIsFiltering(false);
        return;
      }
      if (key.backspace || ch === '\x7f') {
        setFilterQuery(prev => prev.slice(0, -1));
        return;
      }
      if (ch && !key.ctrl && !key.meta && ch !== '\x7f' && ch !== '\b') {
        setFilterQuery(prev => prev + ch);
      }
      return;
    }

    // Normal mode shortcuts
    if (key.upArrow || ch === 'k') {
      setCursor(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || ch === 'j') {
      setCursor(prev => Math.min(displayTasks.length - 1, prev + 1));
      return;
    }

    // gg (double g) → top
    if (ch === 'g') {
      if (lastKey === 'g') {
        setCursor(0);
        setLastKey('');
      } else {
        setLastKey('g');
        setTimeout(() => setLastKey(''), 500);
      }
      return;
    }

    // G → bottom
    if (ch === 'G') {
      setCursor(Math.max(0, displayTasks.length - 1));
      return;
    }

    // Space / Enter → toggle done
    if ((ch === ' ' || key.return) && displayTasks[safeIdx]) {
      onToggle(displayTasks[safeIdx].id);
      notify(displayTasks[safeIdx].status === 'done' ? '↩ 恢复待处理' : '✓ 标记完成');
      return;
    }

    // d → delete
    if (ch === 'd' && displayTasks[safeIdx]) {
      const title = displayTasks[safeIdx].title;
      onDelete(displayTasks[safeIdx].id);
      setCursor(prev => Math.max(0, prev - 1));
      notify(`🗑 已删除: ${title.slice(0, 20)}`);
      return;
    }

    // p → cycle priority
    if (ch === 'p' && displayTasks[safeIdx]) {
      const task = displayTasks[safeIdx];
      const priorities: Task['priority'][] = ['low', 'normal', 'high'];
      const next = priorities[(priorities.indexOf(task.priority) + 1) % priorities.length] ?? 'normal';
      onUpdatePriority?.(task.id, next);
      notify(`优先级: ${next}`);
      return;
    }

    // s → cycle status
    if (ch === 's' && displayTasks[safeIdx]) {
      const task = displayTasks[safeIdx];
      const statuses: Task['status'][] = ['pending', 'in_progress', 'done'];
      const next = statuses[(statuses.indexOf(task.status) + 1) % 3];
      onSetStatus(task.id, next);
      notify(`状态: ${statusLabel(next)}`);
      return;
    }

    // / → filter mode
    if (ch === '/') {
      setIsFiltering(true);
      setFilterQuery('');
      return;
    }

    // v → toggle show done
    if (ch === 'v') {
      setShowDone(prev => !prev);
      setCursor(0);
      notify(showDone ? '隐藏已完成' : '显示已完成');
      return;
    }
  }, { isActive: isFocused });

  const stats = {
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
  };

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      borderStyle="single"
      borderColor={isFocused ? theme.colors.primary : theme.colors.border}
    >
      {/* Header */}
      <Box height={1} flexShrink={0} paddingX={1} alignItems="center">
        <Text color={isFocused ? theme.colors.accent : theme.colors.muted} bold>
          {isFocused ? '● ' : '○ '}任务管理
        </Text>
        <Text color={theme.colors.muted}>
          {' '}待处理:{stats.pending} 进行中:{stats.inProgress} 完成:{stats.done}
        </Text>
        {filterQuery && (
          <Text color={theme.colors.warning}> 过滤: "{filterQuery}"</Text>
        )}
        {notification && (
          <Text color={theme.colors.success}>  {notification}</Text>
        )}
      </Box>

      {/* Filter input */}
      {isFiltering && (
        <Box height={1} flexShrink={0} paddingX={1}>
          <Text color={theme.colors.primary}>/ </Text>
          <Text color={theme.colors.text}>{filterQuery}</Text>
          <Text color={theme.colors.primary} backgroundColor={theme.colors.primary}> </Text>
          <Text color={theme.colors.muted}> Enter/ESC 确认</Text>
        </Box>
      )}

      {/* Task list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {displayTasks.length === 0 ? (
          <Box marginTop={2} flexDirection="column">
            <Text color={theme.colors.muted}>
              {filterQuery ? `  无匹配任务 "${filterQuery}"` : '  暂无任务'}{'\n'}
              {'\n'}
              {' '}在输入栏输入: todo 任务标题{'\n'}
              {' '}或使用命令: /task 任务标题
            </Text>
          </Box>
        ) : (
          visibleTasks.map((task, idx) => {
            const actualIdx = scrollStart + idx;
            const isSelected = isFocused && actualIdx === safeIdx;
            return (
              <TaskRow
                key={task.id}
                task={task}
                isSelected={isSelected}
                width={width - 4}
              />
            );
          })
        )}
        {displayTasks.length > listAreaHeight && (
          <Box>
            <Text color={theme.colors.muted}>
              {scrollStart + listAreaHeight < displayTasks.length
                ? `  ▼ 还有 ${displayTasks.length - scrollStart - listAreaHeight} 项`
                : scrollStart > 0
                ? `  ▲ 上方有 ${scrollStart} 项`
                : ''}
            </Text>
          </Box>
        )}
      </Box>

      {/* Footer shortcuts */}
      <Box height={1} flexShrink={0} paddingX={1}>
        {isFocused ? (
          <Text color={theme.colors.muted}>
            j/k:移动 Space:完成 s:状态 d:删除 /:搜索 v:显示已完成 gg/G:顶/底
          </Text>
        ) : (
          <Text color={theme.colors.muted}>Tab:聚焦任务面板</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Row Component ─────────────────────────────────────────────────────────

function TaskRow({ task, isSelected, width }: { task: Task; isSelected: boolean; width: number }) {
  const priorityIcon = { high: '!', normal: '·', low: ' ' }[task.priority];
  const priorityColor = {
    high: theme.colors.error,
    normal: theme.colors.text,
    low: theme.colors.muted,
  }[task.priority];

  const statusIcon = {
    pending: '○',
    in_progress: '◐',
    done: '●',
  }[task.status];

  const statusColor = {
    pending: theme.colors.muted,
    in_progress: theme.colors.warning,
    done: theme.colors.success,
  }[task.status];

  const maxTitle = width - 12;
  const title = task.title.length > maxTitle
    ? task.title.slice(0, maxTitle - 1) + '…'
    : task.title;

  return (
    <Box
      paddingX={isSelected ? 1 : 0}
      backgroundColor={isSelected ? theme.colors.surfaceLight : undefined}
    >
      {/* Selection indicator */}
      <Text color={isSelected ? theme.colors.primary : 'transparent'}>
        {isSelected ? '❯ ' : '  '}
      </Text>

      {/* Status */}
      <Text color={statusColor}>{statusIcon} </Text>

      {/* Priority */}
      <Text color={priorityColor} bold={task.priority === 'high'}>
        {priorityIcon}{' '}
      </Text>

      {/* Title */}
      <Text
        color={task.status === 'done' ? theme.colors.muted : theme.colors.text}
        strikethrough={task.status === 'done'}
        bold={isSelected && task.status !== 'done'}
      >
        {title}
      </Text>

      {/* In progress badge */}
      {task.status === 'in_progress' && (
        <Text color={theme.colors.warning}> [进行中]</Text>
      )}
    </Box>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: Task['status']): string {
  return { pending: '待处理', in_progress: '进行中', done: '已完成' }[s];
}
