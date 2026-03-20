/**
 * FlowInput.tsx - 键盘优先智能输入栏
 *
 * 功能:
 * - 命令自动补全 (/ 前缀触发)
 * - 历史记录 (↑/↓ 导航)
 * - 模式感知占位符
 * - Ctrl+U 清行
 * - 内联光标渲染
 * - 流式中 block 发送 (显示状态)
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { AppMode } from '../FlowApp.js';

const COMMANDS = [
  // 视图
  { cmd: '/chat',      desc: '对话模式 (Ctrl+1)' },
  { cmd: '/tasks',     desc: '任务模式 (Ctrl+2)' },
  { cmd: '/notes',     desc: '笔记模式 (Ctrl+3)' },
  { cmd: '/agents',    desc: 'Agent 模式 (Ctrl+4)' },
  // 效率
  { cmd: '/plan',      desc: 'AI 生成今日计划' },
  { cmd: '/standup',   desc: 'AI 生成站会内容' },
  { cmd: '/review',    desc: 'AI 每日工作回顾' },
  { cmd: '/timer',     desc: '番茄计时: /timer 25' },
  { cmd: '/stop',      desc: '停止番茄计时' },
  // 创建
  { cmd: '/task',      desc: '创建任务: /task 标题' },
  { cmd: '/note',      desc: '记录笔记: /note 内容' },
  // 开发
  { cmd: '/code',      desc: '代码生成: /code 需求' },
  { cmd: '/debug',     desc: '调试: /debug 错误信息' },
  { cmd: '/explain',   desc: '解释代码/概念' },
  { cmd: '/refactor',  desc: '重构代码' },
  // 写作
  { cmd: '/write',     desc: '内容写作' },
  { cmd: '/research',  desc: '深度研究某主题' },
  { cmd: '/summary',   desc: '内容总结提炼' },
  { cmd: '/translate', desc: '中英互译' },
  // 系统
  { cmd: '/new',       desc: '新建对话 (Ctrl+N)' },
  { cmd: '/clear',     desc: '清空对话 (Ctrl+L)' },
  { cmd: '/help',      desc: '快捷键帮助 (?)' },
  { cmd: '/exit',      desc: '退出' },
];

const PLACEHOLDERS: Record<AppMode, string> = {
  chat:   '与 AI 对话... | todo X | note X | timer 25 | /plan /standup /code /debug',
  tasks:  'todo 任务标题  /task 标题  — 或 Tab 用键盘管理任务',
  notes:  'note 快速记录内容  /note 内容  — 或 Tab 聚焦笔记面板',
  agents: '描述目标让 Agent 执行... — 或 Tab 选择 Agent',
};

interface FlowInputProps {
  onSubmit: (input: string) => void;
  mode: AppMode;
  isFocused: boolean;
  isStreaming: boolean;
  width: number;
  onFocusContent: () => void;
}

export function FlowInput({
  onSubmit, mode, isFocused, isStreaming, width, onFocusContent,
}: FlowInputProps) {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState<typeof COMMANDS>([]);
  const [suggIdx, setSuggIdx] = useState(0);

  // Update suggestions on value change
  useEffect(() => {
    if (value.startsWith('/') && value.length >= 1) {
      const q = value.toLowerCase();
      const matches = COMMANDS.filter(c => c.cmd.startsWith(q) && c.cmd !== q);
      setSuggestions(matches.slice(0, 5));
      setSuggIdx(0);
    } else {
      setSuggestions([]);
    }
  }, [value]);

  const submit = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    onSubmit(value);
    setHistory(prev => {
      const filtered = prev.filter(h => h !== value);
      return [...filtered, value].slice(-100);
    });
    setHistIdx(-1);
    setValue('');
    setCursor(0);
    setSuggestions([]);
  }, [value, isStreaming, onSubmit]);

  useInput((ch, key) => {
    if (!isFocused) return;

    // Suggestion navigation
    if (suggestions.length > 0) {
      if (key.downArrow) {
        setSuggIdx(prev => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
      if (key.upArrow) {
        setSuggIdx(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.tab) {
        // Accept suggestion
        const sug = suggestions[suggIdx];
        if (sug) {
          setValue(sug.cmd + ' ');
          setCursor(sug.cmd.length + 1);
          setSuggestions([]);
        }
        return;
      }
      if (key.return && suggestions[suggIdx]) {
        const sug = suggestions[suggIdx];
        if (sug.cmd.endsWith(' ') || !sug.cmd.includes(' ')) {
          // Commands that need args: auto-complete then let user type
          setValue(sug.cmd + ' ');
          setCursor(sug.cmd.length + 1);
          setSuggestions([]);
          return;
        }
      }
    }

    // Submit
    if (key.return) {
      submit();
      return;
    }

    // History navigation (only when no suggestions)
    if (suggestions.length === 0) {
      if (key.upArrow) {
        const newIdx = Math.min(histIdx + 1, history.length - 1);
        if (newIdx >= 0 && newIdx < history.length) {
          const item = history[history.length - 1 - newIdx];
          setValue(item);
          setCursor(item.length);
          setHistIdx(newIdx);
        }
        return;
      }
      if (key.downArrow) {
        if (histIdx <= 0) {
          setValue('');
          setCursor(0);
          setHistIdx(-1);
        } else {
          const newIdx = histIdx - 1;
          const item = history[history.length - 1 - newIdx];
          setValue(item);
          setCursor(item.length);
          setHistIdx(newIdx);
        }
        return;
      }
    }

    // Cursor movement
    if (key.leftArrow) {
      setCursor(prev => Math.max(0, prev - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor(prev => Math.min(value.length, prev + 1));
      return;
    }
    if (key.home) { setCursor(0); return; }
    if (key.end) { setCursor(value.length); return; }

    // Word jump
    if (key.ctrl && ch === 'a') { setCursor(0); return; }
    if (key.ctrl && ch === 'e') { setCursor(value.length); return; }

    // Deletion
    if (key.backspace) {
      if (cursor > 0) {
        setValue(prev => prev.slice(0, cursor - 1) + prev.slice(cursor));
        setCursor(prev => prev - 1);
      }
      return;
    }
    if (key.delete) {
      if (cursor < value.length) {
        setValue(prev => prev.slice(0, cursor) + prev.slice(cursor + 1));
      }
      return;
    }

    // Ctrl+U — clear line
    if (key.ctrl && ch === 'u') {
      setValue('');
      setCursor(0);
      setSuggestions([]);
      setHistIdx(-1);
      return;
    }

    // Ctrl+W — delete word
    if (key.ctrl && ch === 'w') {
      const before = value.slice(0, cursor);
      const trimmed = before.trimEnd();
      const wordStart = trimmed.lastIndexOf(' ') + 1;
      const newVal = value.slice(0, wordStart) + value.slice(cursor);
      setValue(newVal);
      setCursor(wordStart);
      return;
    }

    // Tab with no suggestions — focus content
    if (key.tab) {
      onFocusContent();
      return;
    }

    // Regular character input
    if (ch && !key.ctrl && !key.meta && !key.escape) {
      const clean = ch.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (!clean) return;
      const newVal = value.slice(0, cursor) + clean + value.slice(cursor);
      if (newVal.length <= 1000) {
        setValue(newVal);
        setCursor(cursor + clean.length);
        setHistIdx(-1);
      }
    }
  });

  // Render input with cursor
  const maxVisible = width - 10;
  let vis = value;
  let visOff = 0;
  if (value.length > maxVisible) {
    const start = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), value.length - maxVisible));
    vis = value.slice(start, start + maxVisible);
    visOff = start;
  }
  const visCursor = cursor - visOff;
  const beforeCursor = vis.slice(0, visCursor);
  const atCursor = vis[visCursor] ?? ' ';
  const afterCursor = vis.slice(visCursor + 1);

  const modeColor: Record<AppMode, string> = {
    chat: theme.colors.primary,
    tasks: theme.colors.success,
    agents: theme.colors.accent,
  };
  const promptColor = modeColor[mode];

  return (
    <Box flexDirection="column" width={width}>
      {/* Autocomplete suggestions */}
      {suggestions.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.colors.primary}
          paddingX={1}
          marginX={1}
        >
          {suggestions.map((sug, idx) => (
            <Box key={sug.cmd}>
              <Text
                color={idx === suggIdx ? theme.colors.background : theme.colors.text}
                backgroundColor={idx === suggIdx ? theme.colors.primary : undefined}
                bold={idx === suggIdx}
              >
                {idx === suggIdx ? '❯ ' : '  '}
                {sug.cmd}
              </Text>
              <Text color={idx === suggIdx ? theme.colors.background : theme.colors.muted}>
                {idx === suggIdx ? '  ' : '  '}{sug.desc}
              </Text>
            </Box>
          ))}
          <Text color={theme.colors.muted}>Tab:补全 ↑↓:选择</Text>
        </Box>
      )}

      {/* Input bar */}
      <Box
        height={3}
        borderStyle="single"
        borderColor={isFocused ? promptColor : theme.colors.border}
        paddingX={1}
        alignItems="center"
      >
        {/* Prompt */}
        <Text color={promptColor} bold>
          {isStreaming ? '⠿ ' : isFocused ? '❯ ' : '○ '}
        </Text>

        {/* Input area */}
        <Box flexGrow={1}>
          {isStreaming ? (
            <Text color={theme.colors.muted}>AI 正在响应中... (等待完成后输入)</Text>
          ) : value.length === 0 ? (
            <Text color={theme.colors.muted}>{PLACEHOLDERS[mode]}</Text>
          ) : (
            <Box>
              <Text color={theme.colors.text}>{beforeCursor}</Text>
              <Text
                color={theme.colors.background}
                backgroundColor={isFocused ? promptColor : theme.colors.muted}
              >
                {atCursor}
              </Text>
              <Text color={theme.colors.text}>{afterCursor}</Text>
            </Box>
          )}
        </Box>

        {/* Right hints */}
        <Box flexShrink={0}>
          <Text color={theme.colors.muted}>
            {value.length > 50 ? ` ${value.length} ` : ''}
            {isFocused ? '↵:发送' : 'Tab:输入'}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
