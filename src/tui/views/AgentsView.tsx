/**
 * AgentsView.tsx - AI Agent 编排 + 自主 Agent 管理
 *
 * 两个面板:
 *   左: 内置 Agent 网格 (6 种角色)
 *   右: 自主任务列表 (24×7 持续运行)
 *
 * 键盘操作:
 *   j/k    导航
 *   Enter  运行 / 启动 / 恢复
 *   i      输入自定义目标
 *   p      暂停/恢复选中任务
 *   s      停止选中任务
 *   d      删除已完成任务
 *   n      创建新自主任务
 *   Tab    切换左右面板
 *   f      切换自由漫游模式
 */

import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import {
  autonomousEngine,
  type AutonomousTask,
  type StopCondition,
} from '../agents/AutonomousEngine.js';
import { agentManager } from '../agents/AgentManager.js';
import type { AgentDef } from '../agents/AgentDef.js';

// ── Component ─────────────────────────────────────────────────────────────────

interface AgentsViewProps {
  height: number;
  width: number;
  isFocused: boolean;
  onRunAgent: (agentName: string, goal: string) => void;
  onAutoTask?: (task: AutonomousTask) => void;
}

export function AgentsView({ height, width, isFocused, onRunAgent, onAutoTask }: AgentsViewProps) {
  const [pane, setPane] = useState<'agents' | 'tasks'>('agents');
  const [agentCursor, setAgentCursor] = useState(0);
  const [taskCursor, setTaskCursor] = useState(0);
  const [goalInput, setGoalInput] = useState('');
  const [inputMode, setInputMode] = useState<'none' | 'goal' | 'newtask'>('none');
  const [freeRoam, setFreeRoam] = useState(false);
  const [autoTasks, setAutoTasks] = useState<AutonomousTask[]>([]);
  const [notification, setNotification] = useState('');

  // Load task agents from registry (excludes companion)
  const taskAgents = agentManager.listAgents('task').filter(a => a.enabled);

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 2000);
  }, []);

  // Subscribe to engine updates
  useEffect(() => {
    autonomousEngine.init(
      async () => { throw new Error('AI not initialized'); },
      (tasks) => setAutoTasks([...tasks]),
    );
    setAutoTasks(autonomousEngine.list());
  }, []);

  const selectedAgent = taskAgents[agentCursor];
  const selectedTask = autoTasks[taskCursor];

  useInput((ch, key) => {
    // Text input mode
    if (inputMode !== 'none') {
      if (key.escape) { setInputMode('none'); setGoalInput(''); return; }
      if (key.return) {
        if (!goalInput.trim()) { setInputMode('none'); return; }
        if (inputMode === 'goal' && selectedAgent) {
          onRunAgent(selectedAgent.persona.role, goalInput.trim());
          notify(`▶ 启动 ${selectedAgent.persona.name}`);
        } else if (inputMode === 'newtask') {
          const task = autonomousEngine.createTask({
            goal: goalInput.trim(),
            role: selectedAgent?.persona.role ?? 'Assistant',
            agentDefId: selectedAgent?.id,
            freeRoam,
            stopConditions: [
              { type: 'rounds', value: 10 } as StopCondition,
              { type: 'success_phrase', value: 'DONE' } as StopCondition,
            ],
            maxRounds: 20,
          });
          autonomousEngine.start(task.id);
          setAutoTasks(autonomousEngine.list());
          setPane('tasks');
          notify(`🤖 自主任务已启动`);
          onAutoTask?.(task);
        }
        setInputMode('none');
        setGoalInput('');
        return;
      }
      if (key.backspace || key.delete || ch === '\x7f') { setGoalInput(prev => prev.slice(0, -1)); return; }
      if (ch && !key.ctrl && !key.meta && ch !== '\x7f' && ch !== '\b') { setGoalInput(prev => prev + ch); }
      return;
    }

    // Tab: switch panes
    if (key.tab) { setPane(p => p === 'agents' ? 'tasks' : 'agents'); return; }

    if (pane === 'agents') {
      if (taskAgents.length === 0) return;
      if (key.upArrow || ch === 'k') setAgentCursor(p => Math.max(0, p - 1));
      else if (key.downArrow || ch === 'j') setAgentCursor(p => Math.min(taskAgents.length - 1, p + 1));
      else if (key.return || ch === ' ') {
        if (selectedAgent) {
          onRunAgent(selectedAgent.persona.role, selectedAgent.persona.description);
          notify(`▶ ${selectedAgent.persona.name} 已启动`);
        }
      }
      else if (ch === 'i') { setInputMode('goal'); setGoalInput(''); }
      else if (ch === 'n') { setInputMode('newtask'); setGoalInput(''); }
      else if (ch === 'f') { setFreeRoam(p => !p); notify(freeRoam ? '自由漫游: 关' : '自由漫游: 开'); }
    } else {
      if (key.upArrow || ch === 'k') setTaskCursor(p => Math.max(0, p - 1));
      else if (key.downArrow || ch === 'j') setTaskCursor(p => Math.min(autoTasks.length - 1, p + 1));
      else if (key.return && selectedTask) {
        if (selectedTask.status === 'idle') autonomousEngine.start(selectedTask.id);
        else if (selectedTask.status === 'paused') autonomousEngine.resume(selectedTask.id);
        setAutoTasks(autonomousEngine.list());
        notify('▶ 已启动');
      }
      else if (ch === 'p' && selectedTask) {
        if (selectedTask.status === 'running') autonomousEngine.pause(selectedTask.id);
        else if (selectedTask.status === 'paused') autonomousEngine.resume(selectedTask.id);
        setAutoTasks(autonomousEngine.list());
      }
      else if (ch === 's' && selectedTask) {
        autonomousEngine.stop(selectedTask.id);
        setAutoTasks(autonomousEngine.list());
        notify('⏹ 已停止');
      }
      else if (ch === 'd' && selectedTask) {
        autonomousEngine.remove(selectedTask.id);
        setAutoTasks(autonomousEngine.list());
        setTaskCursor(p => Math.max(0, p - 1));
        notify('🗑 已删除');
      }
      else if (ch === 'n') { setPane('agents'); setInputMode('newtask'); setGoalInput(''); }
    }
  }, { isActive: isFocused });

  const leftWidth = Math.floor(width * 0.40);
  const rightWidth = width - leftWidth - 3;
  const listHeight = height - 6;

  return (
    <Box flexDirection="column" height={height} width={width}
      borderStyle="single"
      borderColor={isFocused ? theme.colors.primary : theme.colors.border}
    >
      {/* Header */}
      <Box height={1} flexShrink={0} paddingX={1}>
        <Text color={isFocused ? theme.colors.accent : theme.colors.muted} bold>
          {isFocused ? '● ' : '○ '}Agents
        </Text>
        <Text color={pane === 'agents' && isFocused ? theme.colors.primary : theme.colors.muted} bold>
          {' '}[角色]
        </Text>
        <Text color={pane === 'tasks' && isFocused ? theme.colors.primary : theme.colors.muted} bold>
          {' '}[自主任务({autoTasks.filter(t => t.status === 'running').length}▶)]
        </Text>
        {freeRoam && <Text color={theme.colors.warning}> 漫游</Text>}
        {notification && <Text color={theme.colors.success}>  {notification}</Text>}
      </Box>

      {/* Input bar */}
      {inputMode !== 'none' && (
        <Box height={1} flexShrink={0} paddingX={2}>
          <Text color={theme.colors.primary} bold>
            {inputMode === 'goal' ? `${selectedAgent?.persona.avatar ?? '🤖'} 目标: ` : '🤖 自主任务: '}
          </Text>
          <Text color={theme.colors.text}>{goalInput}</Text>
          <Text color={theme.colors.primary} backgroundColor={theme.colors.primary}> </Text>
          <Text color={theme.colors.muted}> Enter确认 ESC取消</Text>
        </Box>
      )}

      {/* Main split */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Left: Agent grid */}
        <Box
          flexDirection="column" width={leftWidth}
          borderStyle="single"
          borderColor={pane === 'agents' && isFocused ? theme.colors.primary : theme.colors.border}
          paddingX={1}
        >
          <Box height={1} flexShrink={0}>
            <Text color={theme.colors.muted} bold>Agent 角色 (Enter:运行 i:输入目标)</Text>
          </Box>
          {taskAgents.slice(0, listHeight).map((agent: AgentDef, idx: number) => {
            const sel = pane === 'agents' && isFocused && idx === agentCursor;
            return (
              <Box key={agent.id} paddingX={sel ? 1 : 0}
                backgroundColor={sel ? theme.colors.surfaceLight : undefined}
                marginBottom={0}
              >
                <Text color={sel ? theme.colors.primary : theme.colors.muted} bold={sel}>
                  {agent.persona.avatar} {agent.persona.name}
                </Text>
                {sel && <Text color={theme.colors.muted}> — {agent.persona.description.slice(0, leftWidth - 12)}</Text>}
              </Box>
            );
          })}
        </Box>

        {/* Right: Autonomous tasks */}
        <Box
          flexDirection="column" flexGrow={1}
          borderStyle="single"
          borderColor={pane === 'tasks' && isFocused ? theme.colors.primary : theme.colors.border}
          paddingX={1}
        >
          <Box height={1} flexShrink={0}>
            <Text color={theme.colors.muted} bold>自主任务 (n:新建 p:暂停 s:停止 d:删除)</Text>
          </Box>
          {autoTasks.length === 0 ? (
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>暂无自主任务  n:创建新任务</Text>
            </Box>
          ) : (
            autoTasks.slice(0, listHeight).map((t, idx) => {
              const sel = pane === 'tasks' && isFocused && idx === taskCursor;
              return (
                <Box key={t.id} flexDirection="column"
                  paddingX={sel ? 1 : 0}
                  backgroundColor={sel ? theme.colors.surfaceLight : undefined}
                  marginBottom={sel ? 1 : 0}
                >
                  <Box>
                    <Text color={statusColor(t.status)}>
                      {statusIcon(t.status)}{' '}
                    </Text>
                    <Text color={sel ? theme.colors.text : theme.colors.muted} bold={sel}>
                      {t.goal.slice(0, rightWidth - 12)}
                    </Text>
                    <Text color={theme.colors.muted}>
                      {' '}[{t.currentRound}/{t.maxRounds}]
                    </Text>
                  </Box>
                  {sel && t.milestones.length > 0 && (
                    <Text color={theme.colors.muted}>
                      └ {t.milestones[t.milestones.length - 1]?.slice(0, rightWidth - 6)}
                    </Text>
                  )}
                  {sel && t.result && (
                    <Text color={theme.colors.success}>✓ {t.result.slice(0, rightWidth - 6)}</Text>
                  )}
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box height={1} flexShrink={0} paddingX={1}>
        {isFocused ? (
          <Text color={theme.colors.muted}>
            j/k:选择  Tab:切换面板  Enter:运行  n:新自主任务  f:漫游{freeRoam ? '✓' : ''}
          </Text>
        ) : (
          <Text color={theme.colors.muted}>Tab:聚焦</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusIcon(s: AutonomousTask['status']): string {
  switch (s) {
    case 'running':  return '▶';
    case 'paused':   return '⏸';
    case 'done':     return '✓';
    case 'error':    return '✗';
    case 'waiting':  return '⏰';
    case 'planning': return '…';
    default:         return '○';
  }
}

function statusColor(s: AutonomousTask['status']): string {
  switch (s) {
    case 'running':  return theme.colors.success;
    case 'paused':   return theme.colors.warning;
    case 'done':     return theme.colors.muted;
    case 'error':    return theme.colors.error;
    case 'waiting':  return theme.colors.info;
    default:         return theme.colors.muted;
  }
}
