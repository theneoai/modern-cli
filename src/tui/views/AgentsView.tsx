/**
 * AgentsView.tsx - AI Agent 编排视图
 *
 * 键盘操作:
 *   j/k  ↑/↓    选择 agent
 *   Enter        运行选中 agent (跳到 chat 模式)
 *   i            输入自定义 goal
 *   r            刷新状态
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';

interface AgentDef {
  id: string;
  name: string;
  icon: string;
  role: string;
  description: string;
  skills: string[];
  color: string;
}

const BUILTIN_AGENTS: AgentDef[] = [
  {
    id: 'researcher',
    name: '研究员',
    icon: '🔍',
    role: 'Researcher',
    description: '深度分析、需求调研、信息收集与综合',
    skills: ['web搜索', '文档分析', '知识总结'],
    color: 'blue',
  },
  {
    id: 'planner',
    name: '规划师',
    icon: '📋',
    role: 'Planner',
    description: '任务分解、项目规划、优先级排序',
    skills: ['任务拆分', '里程碑制定', '依赖分析'],
    color: 'cyan',
  },
  {
    id: 'coder',
    name: '工程师',
    icon: '⚙',
    role: 'Coder',
    description: '代码实现、调试修复、技术方案设计',
    skills: ['代码生成', 'Bug修复', '重构优化'],
    color: 'green',
  },
  {
    id: 'reviewer',
    name: '审查员',
    icon: '✓',
    role: 'Reviewer',
    description: '代码审查、质量保证、风险识别',
    skills: ['代码审查', '安全扫描', '最佳实践'],
    color: 'yellow',
  },
  {
    id: 'writer',
    name: '作家',
    icon: '✍',
    role: 'Writer',
    description: '文档撰写、内容创作、报告生成',
    skills: ['文档写作', '内容生成', '格式化'],
    color: 'magenta',
  },
  {
    id: 'analyst',
    name: '分析师',
    icon: '📊',
    role: 'Analyst',
    description: '数据分析、洞察挖掘、趋势判断',
    skills: ['数据分析', '图表解读', '预测建议'],
    color: 'blue',
  },
];

interface AgentsViewProps {
  height: number;
  width: number;
  isFocused: boolean;
  onRunAgent: (agentName: string, goal: string) => void;
}

export function AgentsView({ height, width, isFocused, onRunAgent }: AgentsViewProps) {
  const [cursor, setCursor] = useState(0);
  const [goalInput, setGoalInput] = useState('');
  const [isEnteringGoal, setIsEnteringGoal] = useState(false);
  const [notification, setNotification] = useState('');

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 2000);
  }, []);

  const selectedAgent = BUILTIN_AGENTS[cursor];

  useInput((ch, key) => {
    if (!isFocused) return;

    if (isEnteringGoal) {
      if (key.escape) {
        setIsEnteringGoal(false);
        setGoalInput('');
        return;
      }
      if (key.return) {
        if (goalInput.trim()) {
          onRunAgent(selectedAgent.role, goalInput.trim());
          setIsEnteringGoal(false);
          setGoalInput('');
          notify(`▶ 启动 ${selectedAgent.name}`);
        }
        return;
      }
      if (key.backspace) {
        setGoalInput(prev => prev.slice(0, -1));
        return;
      }
      if (ch && !key.ctrl && !key.meta) {
        setGoalInput(prev => prev + ch);
      }
      return;
    }

    if (key.upArrow || ch === 'k') {
      setCursor(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || ch === 'j') {
      setCursor(prev => Math.min(BUILTIN_AGENTS.length - 1, prev + 1));
    } else if (key.return || ch === ' ') {
      // Quick run with default goal
      onRunAgent(selectedAgent.role, `分析并完成相关任务`);
      notify(`▶ 启动 ${selectedAgent.name}`);
    } else if (ch === 'i') {
      setIsEnteringGoal(true);
      setGoalInput('');
    }
  });

  const cardWidth = Math.floor((width - 6) / 2);
  const usableHeight = height - 4;
  const itemsPerCol = Math.ceil(BUILTIN_AGENTS.length / 2);

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      borderStyle="single"
      borderColor={isFocused ? theme.colors.primary : theme.colors.border}
    >
      {/* Header */}
      <Box height={1} flexShrink={0} paddingX={1}>
        <Text color={isFocused ? theme.colors.accent : theme.colors.muted} bold>
          {isFocused ? '● ' : '○ '}AI Agents
        </Text>
        <Text color={theme.colors.muted}> — 选择 agent 执行任务</Text>
        {notification && <Text color={theme.colors.success}>  {notification}</Text>}
      </Box>

      {/* Goal input */}
      {isEnteringGoal && (
        <Box height={1} flexShrink={0} paddingX={2}>
          <Text color={theme.colors.primary} bold>任务目标: </Text>
          <Text color={theme.colors.text}>{goalInput}</Text>
          <Text color={theme.colors.primary} backgroundColor={theme.colors.primary}> </Text>
          <Text color={theme.colors.muted}> Enter确认 ESC取消</Text>
        </Box>
      )}

      {/* Agent grid */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden" paddingX={1}>
        {/* Left column */}
        <Box flexDirection="column" width={cardWidth} marginRight={1}>
          {BUILTIN_AGENTS.slice(0, itemsPerCol).map((agent, idx) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={isFocused && cursor === idx}
              width={cardWidth}
            />
          ))}
        </Box>

        {/* Right column */}
        <Box flexDirection="column" width={cardWidth}>
          {BUILTIN_AGENTS.slice(itemsPerCol).map((agent, idx) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={isFocused && cursor === idx + itemsPerCol}
              width={cardWidth}
            />
          ))}
        </Box>
      </Box>

      {/* Selected agent detail */}
      {isFocused && selectedAgent && !isEnteringGoal && (
        <Box
          height={3}
          flexShrink={0}
          paddingX={2}
          borderStyle="single"
          borderColor={theme.colors.border}
        >
          <Box flexDirection="column">
            <Text color={theme.colors.text} bold>
              {selectedAgent.icon} {selectedAgent.name}: {selectedAgent.description}
            </Text>
            <Text color={theme.colors.muted}>
              技能: {selectedAgent.skills.join(' · ')}
            </Text>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box height={1} flexShrink={0} paddingX={1}>
        {isFocused ? (
          <Text color={theme.colors.muted}>
            j/k:选择 Enter:快速运行 i:输入目标运行
          </Text>
        ) : (
          <Text color={theme.colors.muted}>Tab:聚焦 Agent 面板</Text>
        )}
      </Box>
    </Box>
  );
}

// ── Agent Card ────────────────────────────────────────────────────────────

function AgentCard({ agent, isSelected, width }: {
  agent: AgentDef;
  isSelected: boolean;
  width: number;
}) {
  const maxDesc = Math.max(10, width - 8);
  const desc = agent.description.length > maxDesc
    ? agent.description.slice(0, maxDesc - 1) + '…'
    : agent.description;

  return (
    <Box
      flexDirection="column"
      borderStyle={isSelected ? 'double' : 'single'}
      borderColor={isSelected ? theme.colors.primary : theme.colors.border}
      paddingX={1}
      marginBottom={1}
      backgroundColor={isSelected ? theme.colors.surfaceLight : undefined}
    >
      <Box>
        <Text color={isSelected ? theme.colors.primary : theme.colors.text} bold>
          {agent.icon} {agent.name}
        </Text>
        {isSelected && (
          <Text color={theme.colors.accent}> ← 已选</Text>
        )}
      </Box>
      <Text color={theme.colors.muted}>{desc}</Text>
    </Box>
  );
}
