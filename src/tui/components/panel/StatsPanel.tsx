/**
 * StatsPanel - 统计面板组件
 * 显示任务和系统统计信息
 */


import { Box, Text } from 'ink';
import { tuiTheme, icons } from '../../../theme/index.js';
import { FocusLayer } from '../../contexts/FocusContext.js';
import { Focusable } from '../ui/Focusable.js';
import type { Task } from '../../types/ui.js';

export interface StatsPanelProps {
  tasks: Task[];
  events?: number;
  emails?: number;
  meetings?: number;
  height: number;
  width?: number;
  focusId?: string;
}

export function StatsPanel({
  tasks,
  events = 0,
  emails = 0,
  meetings = 0,
  height,
  width,
  focusId = 'stats-panel',
}: StatsPanelProps) {
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const highPriorityCount = tasks.filter(t => t.priority === 'high' && t.status !== 'completed').length;
  
  return (
    <Focusable
      id={focusId}
      layer={FocusLayer.PANEL}
      showIndicator
      indicatorStyle="border"
      height={height}
      width={width}
      flexDirection="column"
      padding={1}
    >
      <Text color={tuiTheme.colors.primary} bold>
        {icons.stats} Quick Stats
      </Text>
      
      <Box flexDirection="column" marginTop={1}>
        {/* Tasks stats */}
        <Box marginY={0.5}>
          <Text color={tuiTheme.colors.warning}>
            {icons.pending} {pendingCount} pending
          </Text>
        </Box>
        
        <Box marginY={0.5}>
          <Text color={tuiTheme.colors.info}>
            {icons.inProgress} {inProgressCount} in progress
          </Text>
        </Box>
        
        <Box marginY={0.5}>
          <Text color={tuiTheme.colors.success}>
            {icons.checkHeavy} {completedCount} done
          </Text>
        </Box>
        
        {highPriorityCount > 0 && (
          <Box marginY={0.5}>
            <Text color={tuiTheme.colors.error}>
              {icons.warning} {highPriorityCount} high priority
            </Text>
          </Box>
        )}
        
        <Box borderStyle="single" borderColor={tuiTheme.colors.border} marginY={1} />
        
        {/* Other stats */}
        <Box marginY={0.5}>
          <Text color={tuiTheme.colors.text}>
            {icons.calendar} {events} events
          </Text>
        </Box>
        
        <Box marginY={0.5}>
          <Text color={tuiTheme.colors.text}>
            {icons.email} {emails} emails
          </Text>
        </Box>
        
        <Box marginY={0.5}>
          <Text color={tuiTheme.colors.text}>
            {icons.meeting} {meetings} meetings
          </Text>
        </Box>
        
        <Box flexGrow={1} />
        
        {/* Total */}
        <Box marginTop={1} borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1}>
          <Text color={tuiTheme.colors.muted}>
            Total: {tasks.length} tasks
          </Text>
        </Box>
      </Box>
    </Focusable>
  );
}

export interface MiniStatsProps {
  tasks: Task[];
}

export function MiniStats({ tasks }: MiniStatsProps) {
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  
  return (
    <Box flexDirection="row">
      <Text color={tuiTheme.colors.warning}>
        {icons.pending} {pendingCount}
      </Text>
      <Box marginLeft={2}>
        <Text color={tuiTheme.colors.success}>
          {icons.check} {completedCount}
        </Text>
      </Box>
    </Box>
  );
}
