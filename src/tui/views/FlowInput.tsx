/**
 * FlowInput.tsx — 心流感知输入栏
 *
 * 三层结构:
 *   [提示行]  ← 动态上下文 hint，随模式/状态自动变化
 *   [输入行]  ← 光标输入 + 内联补全
 *
 * 提示行逻辑:
 *   流式中   → 进度条 + 思考动画
 *   输入 /  → 命令描述 + 参数提示
 *   空闲     → 当前模式的 3 个最常用操作
 *
 * 快捷键:
 *   ↑/↓   历史 / 建议导航    Ctrl+U  清空行
 *   ←/→   光标移动            Ctrl+W  删除词
 *   Ctrl+A/E  行首/尾         Tab    聚焦内容
 */

import React, { useState, useCallback, useEffect, useReducer } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { AppMode } from '../FlowApp.js';

// ── Command Registry ──────────────────────────────────────────────────────────

interface CmdDef { cmd: string; short?: string; desc: string; args?: string }

const COMMANDS: CmdDef[] = [
  // AI 工具
  { cmd: '/code',     short: '/c',  desc: '生成代码',       args: '<需求描述>' },
  { cmd: '/debug',    short: '/d',  desc: '调试分析',       args: '<错误/代码>' },
  { cmd: '/explain',  short: '/e',  desc: '解释说明',       args: '<代码/概念>' },
  { cmd: '/refactor', short: '/rf', desc: '代码重构',       args: '<代码>' },
  { cmd: '/write',    short: '/w',  desc: '写作助手',       args: '<需求>' },
  { cmd: '/research', short: '/rs', desc: '深度研究',       args: '<主题>' },
  { cmd: '/summary',  short: '/sm', desc: '摘要总结',       args: '<文本>' },
  { cmd: '/translate',short: '/tr', desc: '中英互译',       args: '<文本>' },
  // 效率
  { cmd: '/plan',     desc: 'AI 规划今日任务' },
  { cmd: '/standup',  short: '/sup', desc: 'AI 生成站会' },
  { cmd: '/review',   short: '/rev', desc: 'AI 工作回顾' },
  // 任务/笔记/计时
  { cmd: '/task',     short: '/t',  desc: '创建任务',       args: '<标题>' },
  { cmd: '/note',     short: '/n',  desc: '记录笔记',       args: '<内容>' },
  { cmd: '/timer',    short: '/ti', desc: '番茄计时',       args: '<分钟>' },
  { cmd: '/stop',     desc: '停止计时' },
  // 系统
  { cmd: '/chat',      desc: '切换到对话 (Ctrl+1)' },
  { cmd: '/tasks',     desc: '切换到任务 (Ctrl+2)' },
  { cmd: '/notes',     desc: '切换到笔记 (Ctrl+3)' },
  { cmd: '/agents',    desc: '切换到 Agent (Ctrl+4)' },
  { cmd: '/plugins',   desc: '切换到插件 (Ctrl+5)' },
  { cmd: '/companion', short: '/mate', desc: '打开 Neo 关系看板 (Ctrl+6)' },
  // 语音 & 情报
  { cmd: '/voice',     short: '/v',   desc: '开关语音  (Ctrl+V)',  args: '[on|off|<音色名>]' },
  { cmd: '/intel',     short: '/i',   desc: '查看最新情报' },
  { cmd: '/search',    short: '/sr',  desc: '网络搜索 (Brave)',    args: '<关键词>' },
  { cmd: '/fetch',     desc: '抓取 URL 内容',                      args: '<url>' },
  // 系统
  { cmd: '/model',     short: '/m',   desc: '切换模型/服务商 (Ctrl+M)' },
  { cmd: '/key',       desc: '管理 API Key',                       args: '[list|add|rm]' },
  { cmd: '/new',       desc: '新建对话 (Ctrl+N)' },
  { cmd: '/clear',     short: '/cl', desc: '清空 (Ctrl+L)' },
  { cmd: '/help',      short: '/h',  desc: '帮助' },
  { cmd: '/quit',      short: '/q',  desc: '退出' },
];

// ── Context Hints ─────────────────────────────────────────────────────────────

// What to show in the hint bar when idle (no input)
const MODE_HINTS: Record<AppMode, { key: string; label: string }[]> = {
  chat: [
    { key: '/c', label: '代码' },
    { key: '/d', label: '调试' },
    { key: '/sr', label: '搜索' },
    { key: '/plan', label: '规划' },
    { key: '@neo', label: '和助理聊' },
    { key: '^K', label: '命令面板' },
    { key: '^M', label: '切换模型' },
    { key: '/h', label: '帮助' },
  ],
  tasks: [
    { key: 'Enter', label: '创建任务' },
    { key: 'Tab→j/k', label: '导航' },
    { key: 'Space', label: '完成' },
    { key: 'd', label: '删除' },
    { key: 's', label: '状态' },
    { key: '/plan', label: '规划' },
  ],
  notes: [
    { key: 'Enter', label: '记录笔记' },
    { key: 'Tab→j/k', label: '导航' },
    { key: 'p', label: '置顶' },
    { key: 'd', label: '删除' },
    { key: '/', label: '搜索' },
    { key: 'Ctrl+T', label: '快捷捕获' },
  ],
  agents: [
    { key: 'Enter', label: '运行' },
    { key: 'i', label: '输入目标' },
    { key: 'n', label: '自主任务' },
    { key: 'f', label: '漫游模式' },
    { key: 'Tab', label: '切换面板' },
  ],
  plugins: [
    { key: 'Space', label: '启/禁' },
    { key: 'j/k', label: '导航' },
    { key: 'Tab', label: '详情' },
  ],
};

const MODE_COLORS: Record<AppMode, string> = {
  chat:    theme.colors.primary,
  tasks:   theme.colors.success,
  notes:   theme.colors.info,
  agents:  theme.colors.accent,
  plugins: theme.colors.warning,
};

const MODE_ICONS: Record<AppMode, string> = {
  chat:    '◆',
  tasks:   '☐',
  notes:   '📝',
  agents:  '🤖',
  plugins: '⚡',
};

// ── Input State Reducer ───────────────────────────────────────────────────────
// Using useReducer ensures value + cursor are ALWAYS updated atomically,
// eliminating stale-closure bugs when rapid keypresses occur.

interface InputState {
  value: string;
  cursor: number;
}

type InputAction =
  | { type: 'insert'; ch: string }
  | { type: 'backspace' }
  | { type: 'delete_fwd' }
  | { type: 'cursor_left' }
  | { type: 'cursor_right' }
  | { type: 'cursor_home' }
  | { type: 'cursor_end' }
  | { type: 'delete_word' }
  | { type: 'clear' }
  | { type: 'set_value'; value: string };

function inputReducer(state: InputState, action: InputAction): InputState {
  const { value, cursor } = state;
  switch (action.type) {
    case 'backspace':
      if (cursor > 0) {
        return {
          value: value.slice(0, cursor - 1) + value.slice(cursor),
          cursor: cursor - 1,
        };
      }
      return state;
    case 'delete_fwd':
      if (cursor < value.length) {
        return { value: value.slice(0, cursor) + value.slice(cursor + 1), cursor };
      }
      return state;
    case 'insert': {
      const nv = value.slice(0, cursor) + action.ch + value.slice(cursor);
      return nv.length <= 1000 ? { value: nv, cursor: cursor + action.ch.length } : state;
    }
    case 'cursor_left':  return { value, cursor: Math.max(0, cursor - 1) };
    case 'cursor_right': return { value, cursor: Math.min(value.length, cursor + 1) };
    case 'cursor_home':  return { value, cursor: 0 };
    case 'cursor_end':   return { value, cursor: value.length };
    case 'delete_word': {
      const before = value.slice(0, cursor).trimEnd();
      const ws = before.lastIndexOf(' ') + 1;
      return { value: value.slice(0, ws) + value.slice(cursor), cursor: ws };
    }
    case 'clear':     return { value: '', cursor: 0 };
    case 'set_value': return { value: action.value, cursor: action.value.length };
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface FlowInputProps {
  onSubmit: (input: string) => void | Promise<void>;
  mode: AppMode;
  isFocused: boolean;
  isStreaming: boolean;
  width: number;
  onFocusContent: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FlowInput({ onSubmit, mode, isFocused, isStreaming, width, onFocusContent }: FlowInputProps) {
  const [inputState, dispatch] = useReducer(inputReducer, { value: '', cursor: 0 });
  const { value, cursor } = inputState;

  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [suggestions, setSuggestions] = useState<CmdDef[]>([]);
  const [suggIdx, setSuggIdx] = useState(0);

  const promptColor = MODE_COLORS[mode];

  // Update suggestions when value changes
  useEffect(() => {
    if (value.startsWith('/') && value.length >= 1) {
      const q = value.toLowerCase();
      const matches = COMMANDS.filter(c =>
        (c.cmd.startsWith(q) && c.cmd !== q) ||
        (c.short && c.short.startsWith(q) && c.short !== q)
      );
      setSuggestions(matches.slice(0, 4));
      setSuggIdx(0);
    } else {
      setSuggestions([]);
    }
  }, [value]);

  const submit = useCallback(() => {
    if (!value.trim() || isStreaming) return;
    void onSubmit(value);
    setHistory(prev => [...prev.filter(h => h !== value), value].slice(-100));
    setHistIdx(-1);
    dispatch({ type: 'clear' });
    setSuggestions([]);
  }, [value, isStreaming, onSubmit]);

  useInput((ch, key) => {
    if (!isFocused) return;

    // Suggestion navigation
    if (suggestions.length > 0) {
      if (key.downArrow) { setSuggIdx(p => Math.min(suggestions.length - 1, p + 1)); return; }
      if (key.upArrow)   { setSuggIdx(p => Math.max(0, p - 1)); return; }
      if (key.tab) {
        const sug = suggestions[suggIdx];
        if (sug) {
          const c = sug.cmd + ' ';
          dispatch({ type: 'set_value', value: c });
          setSuggestions([]);
        }
        return;
      }
      if (key.return) {
        const sug = suggestions[suggIdx];
        if (sug && !sug.args) { void onSubmit(sug.cmd); dispatch({ type: 'clear' }); setSuggestions([]); return; }
        if (sug) { dispatch({ type: 'set_value', value: sug.cmd + ' ' }); setSuggestions([]); return; }
      }
    }

    if (key.return) { submit(); return; }

    // History (no suggestions)
    if (suggestions.length === 0) {
      if (key.upArrow) {
        const ni = Math.min(histIdx + 1, history.length - 1);
        if (ni >= 0) { const h = history[history.length - 1 - ni]!; dispatch({ type: 'set_value', value: h }); setHistIdx(ni); }
        return;
      }
      if (key.downArrow) {
        if (histIdx <= 0) { dispatch({ type: 'clear' }); setHistIdx(-1); }
        else { const ni = histIdx - 1; const h = history[history.length - 1 - ni]!; dispatch({ type: 'set_value', value: h }); setHistIdx(ni); }
        return;
      }
    }

    // Cursor movement
    if (key.leftArrow)  { dispatch({ type: 'cursor_left' });  return; }
    if (key.rightArrow) { dispatch({ type: 'cursor_right' }); return; }
    if (key.ctrl && ch === 'a') { dispatch({ type: 'cursor_home' }); return; }
    if (key.ctrl && ch === 'e') { dispatch({ type: 'cursor_end' });  return; }

    // Deletion — handle both key.backspace and raw \x7f (DEL sent by many terminals)
    if (key.backspace || ch === '\x7f') {
      dispatch({ type: 'backspace' });
      return;
    }
    if (key.delete) {
      dispatch({ type: 'delete_fwd' });
      return;
    }

    // Ctrl shortcuts
    if (key.ctrl && ch === 'u') { dispatch({ type: 'clear' }); setSuggestions([]); setHistIdx(-1); return; }
    if (key.ctrl && ch === 'w') { dispatch({ type: 'delete_word' }); return; }

    // Tab — focus content (no suggestions)
    if (key.tab) { onFocusContent(); return; }

    // Regular input — filter out control characters and escape sequences
    if (ch && !key.ctrl && !key.meta && !key.escape) {
      // Filter DEL (\x7f) and BS (\b) that weren't caught above
      if (ch === '\x7f' || ch === '\b') return;
      const clean = ch.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (!clean) return;
      dispatch({ type: 'insert', ch: clean });
      setHistIdx(-1);
    }
  }, { isActive: isFocused });

  // ── Render ──────────────────────────────────────────────────────────────────

  // Build hint line content
  const hintContent = buildHint(value, mode, isStreaming, suggestions, suggIdx);

  // Build cursor-aware input display
  const maxVisible = width - 8;
  const visStart = Math.max(0, Math.min(cursor - Math.floor(maxVisible / 2), value.length - maxVisible));
  const vis = value.slice(visStart, visStart + maxVisible);
  const visCursor = cursor - visStart;
  const before = vis.slice(0, visCursor);
  const atCur  = vis[visCursor] ?? ' ';
  const after  = vis.slice(visCursor + 1);

  return (
    <Box flexDirection="column" width={width}>
      {/* Hint / suggestion line */}
      <Box height={1} paddingX={2}>
        {hintContent}
      </Box>

      {/* Input row */}
      <Box
        height={3}
        borderStyle="single"
        borderColor={isFocused ? promptColor : theme.colors.border}
        paddingX={1}
        alignItems="center"
      >
        {/* Mode badge */}
        <Text color={promptColor} bold>
          {isStreaming ? '⠿ ' : isFocused ? `${MODE_ICONS[mode]} ` : '○ '}
        </Text>

        {/* Input field */}
        <Box flexGrow={1}>
          {isStreaming ? (
            <Box>
              <StreamingBar />
              <Text color={theme.colors.muted}> 生成中，完成后可继续输入</Text>
            </Box>
          ) : value.length === 0 ? (
            <Text color={theme.colors.muted} dimColor>
              {getPlaceholder(mode)}
            </Text>
          ) : (
            <Box>
              <Text color={theme.colors.text}>{before}</Text>
              <Text color={theme.colors.background} backgroundColor={isFocused ? promptColor : theme.colors.muted}>
                {atCur}
              </Text>
              <Text color={theme.colors.text}>{after}</Text>
            </Box>
          )}
        </Box>

        {/* Right label */}
        <Text color={theme.colors.muted}>
          {value.length > 80 ? ` ${value.length}` : ''}
          {isFocused ? ' ↵' : ' Tab'}
        </Text>
      </Box>
    </Box>
  );
}

// ── Hint Builder ──────────────────────────────────────────────────────────────

function buildHint(
  value: string,
  mode: AppMode,
  isStreaming: boolean,
  suggestions: CmdDef[],
  suggIdx: number,
): React.ReactNode {

  // Streaming: show spinner
  if (isStreaming) {
    return <ThinkingDots />;
  }

  // Typing a command: show matching suggestions inline
  if (value.startsWith('/') && suggestions.length > 0) {
    const sug = suggestions[suggIdx];
    if (sug) {
      return (
        <Box>
          <Text color={theme.colors.primary} bold>{sug.cmd}</Text>
          {sug.short && sug.short !== value && (
            <Text color={theme.colors.muted}> ({sug.short})</Text>
          )}
          <Text color={theme.colors.muted}>  {sug.desc}</Text>
          {sug.args && <Text color={theme.colors.accent}>  {sug.args}</Text>}
          {suggestions.length > 1 && (
            <Text color={theme.colors.muted}> +{suggestions.length - 1}  Tab:补全</Text>
          )}
        </Box>
      );
    }
  }

  // Idle: show mode hints
  const hints = MODE_HINTS[mode];
  return (
    <Box>
      {hints.map((h, i) => (
        <Box key={i} marginRight={2}>
          <Text color={MODE_COLORS[mode]} bold>{h.key}</Text>
          <Text color={theme.colors.muted}>:{h.label}</Text>
        </Box>
      ))}
    </Box>
  );
}

function getPlaceholder(mode: AppMode): string {
  switch (mode) {
    case 'chat':    return '发消息给 AI · @neo 和助理聊天 · / 触发命令 · /h 帮助';
    case 'tasks':   return '直接输入即创建任务，/ 触发命令，/h 帮助';
    case 'notes':   return '直接输入即记录笔记，/ 触发命令，/h 帮助';
    case 'agents':  return '描述 Agent 目标，或 Tab 选择';
    case 'plugins': return '搜索插件或输入命令';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThinkingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 10), 120);
    return () => clearInterval(t);
  }, []);
  const dots = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  return (
    <Box>
      <Text color={theme.colors.warning} bold>{dots[frame] ?? '⠋'} AI 正在思考</Text>
      <Text color={theme.colors.muted}>  ESC:中断  Ctrl+L:清空</Text>
    </Box>
  );
}

function StreamingBar() {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPos(p => (p + 1) % 8), 150);
    return () => clearInterval(t);
  }, []);
  const bar = '▰▰▰▱▱▱▱▱'.split('');
  const shifted = [...bar.slice(pos), ...bar.slice(0, pos)].join('');
  return <Text color={theme.colors.warning}>{shifted}</Text>;
}
