#!/usr/bin/env node
/**
 * FlowApp.tsx - 键盘优先的心流体验 TUI
 *
 * 设计哲学:
 * - 模态交互 (Modal): 每个 mode 职责清晰, 类 vim 理念
 * - 心流 (Flow): 最小认知负担, 上下文感知按键提示
 * - 键盘优先: 全程无需鼠标, 快捷键覆盖所有操作
 * - 真实 AI: 流式响应, token 逐字显示
 *
 * 布局:
 * ┌──────────────────────────────────────────────┐
 * │  ◆ HYPER  [CHAT] [TASKS] [AGENTS]  ● model  │ ← 1行 header
 * ├──────────────────────────────────────────────┤
 * │                                              │
 * │  [动态内容区 - 随 mode 切换]                  │ ← 主内容
 * │                                              │
 * ├──────────────────────────────────────────────┤
 * │  ❯ [智能输入+自动补全]           ⌘K ?:help   │ ← 输入栏
 * └──────────────────────────────────────────────┘
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { sendMessageStream } from '../ai/client.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { tuiTheme as theme } from '../theme/index.js';
import { ChatView } from './views/ChatView.js';
import { TasksView } from './views/TasksView.js';
import { AgentsView } from './views/AgentsView.js';
import { FlowInput } from './views/FlowInput.js';
import { HelpOverlay } from './views/HelpOverlay.js';
import { CommandPaletteOverlay } from './views/CommandPaletteOverlay.js';

// ============================================================================
// Types
// ============================================================================

export type AppMode = 'chat' | 'tasks' | 'agents';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  streaming?: boolean;
  tokenCount?: number;
}

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  doneAt?: Date;
}

export interface AppState {
  mode: AppMode;
  messages: Message[];
  tasks: Task[];
  totalTokens: number;
  isStreaming: boolean;
  streamingId: string | null;
}

// ============================================================================
// FlowApp - Main Component
// ============================================================================

export default function FlowApp() {
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Terminal size
  const [termSize, setTermSize] = useState({
    width: stdout?.columns || 120,
    height: stdout?.rows || 40,
  });

  useEffect(() => {
    const onResize = () =>
      setTermSize({ width: stdout?.columns || 120, height: stdout?.rows || 40 });
    stdout?.on('resize', onResize);
    return () => { stdout?.off('resize', onResize); };
  }, [stdout]);

  // App state
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content: '◆ HyperTerminal — AI 原生超级终端\n输入消息与 AI 对话, /help 查看命令, Ctrl+K 打开命令面板, ? 显示快捷键',
      timestamp: new Date(),
    },
  ]);
  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: '查看项目文档', status: 'pending', priority: 'high', createdAt: new Date() },
    { id: '2', title: '回复邮件', status: 'in_progress', priority: 'normal', createdAt: new Date(Date.now() - 3600000) },
    { id: '3', title: '代码审查', status: 'pending', priority: 'high', createdAt: new Date(Date.now() - 7200000) },
  ]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [focusOnInput, setFocusOnInput] = useState(true);

  // Conversation history for AI context
  const conversationRef = useRef<MessageParam[]>([]);

  // ── Layout ─────────────────────────────────────────────────────────────────
  const headerHeight = 1;
  const inputHeight = 3;
  const contentHeight = termSize.height - headerHeight - inputHeight;
  const tooSmall = termSize.width < 60 || termSize.height < 12;

  // ── AI Streaming ───────────────────────────────────────────────────────────
  const sendToAI = useCallback(async (userText: string) => {
    if (isStreaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Build conversation history
    conversationRef.current = [
      ...conversationRef.current,
      { role: 'user', content: userText },
    ];

    const aiId = `ai-${Date.now()}`;
    const aiMsg: Message = {
      id: aiId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      streaming: true,
    };
    setMessages(prev => [...prev, aiMsg]);
    setIsStreaming(true);
    setStreamingId(aiId);

    let accumulated = '';
    try {
      const result = await sendMessageStream(
        conversationRef.current,
        (delta: string) => {
          accumulated += delta;
          setMessages(prev =>
            prev.map(m =>
              m.id === aiId ? { ...m, content: accumulated } : m
            )
          );
        }
      );

      // Finalize
      conversationRef.current = [
        ...conversationRef.current,
        { role: 'assistant', content: result.content || accumulated },
      ];
      setTotalTokens(prev => prev + result.usage.inputTokens + result.usage.outputTokens);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId
            ? {
                ...m,
                content: result.content || accumulated,
                streaming: false,
                tokenCount: result.usage.outputTokens,
              }
            : m
        )
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId
            ? { ...m, content: `⚠ 错误: ${errMsg}`, streaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setStreamingId(null);
    }
  }, [isStreaming]);

  // ── Task Operations ────────────────────────────────────────────────────────
  const addTask = useCallback((title: string, priority: Task['priority'] = 'normal') => {
    const t: Task = {
      id: Date.now().toString(),
      title,
      status: 'pending',
      priority,
      createdAt: new Date(),
    };
    setTasks(prev => [t, ...prev]);
    return t;
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        if (t.status === 'done') return { ...t, status: 'pending' as const, doneAt: undefined };
        return { ...t, status: 'done' as const, doneAt: new Date() };
      })
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const setTaskStatus = useCallback((id: string, status: Task['status']) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === id
          ? { ...t, status, ...(status === 'done' ? { doneAt: new Date() } : {}) }
          : t
      )
    );
  }, []);

  // ── Command Handling ───────────────────────────────────────────────────────
  const handleInput = useCallback(async (raw: string) => {
    const input = raw.trim();
    if (!input) return;

    // Slash commands
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.slice(1).split(' ');
      const arg = args.join(' ');

      switch (cmd.toLowerCase()) {
        case 'chat': setMode('chat'); return;
        case 'tasks': setMode('tasks'); return;
        case 'agents': setMode('agents'); return;
        case 'clear':
          setMessages([]);
          conversationRef.current = [];
          return;
        case 'new':
          setMessages([]);
          conversationRef.current = [];
          setMode('chat');
          return;
        case 'help':
          setShowHelp(true);
          return;
        case 'task':
        case 'todo': {
          const title = arg || '新任务';
          const isUrgent = title.toLowerCase().includes('urgent') || title.toLowerCase().includes('紧急');
          addTask(title, isUrgent ? 'high' : 'normal');
          setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            role: 'system',
            content: `✓ 任务已创建: ${title}`,
            timestamp: new Date(),
          }]);
          return;
        }
        case 'exit':
        case 'quit':
          exit();
          return;
        default:
          // Unknown command - show as system message
          setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            role: 'system',
            content: `未知命令: /${cmd}。输入 /help 查看所有命令。`,
            timestamp: new Date(),
          }]);
          return;
      }
    }

    // Natural language task creation
    const lc = input.toLowerCase();
    if (lc.startsWith('todo ') || lc.startsWith('任务 ') || lc.startsWith('add task ')) {
      const title = input.replace(/^(todo|任务|add task)\s+/i, '');
      addTask(title);
      setMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        role: 'system',
        content: `✓ 任务已创建: ${title}`,
        timestamp: new Date(),
      }]);
      return;
    }

    // Default: send to AI
    await sendToAI(input);
  }, [addTask, exit, sendToAI]);

  // ── Global Keyboard ────────────────────────────────────────────────────────
  useInput((ch, key) => {
    // Block when overlays open
    if (showPalette || showHelp) return;

    // Ctrl+K → Command Palette
    if (key.ctrl && ch === 'k') {
      setShowPalette(true);
      return;
    }

    // ? → Help (only when not typing)
    if (ch === '?' && !focusOnInput) {
      setShowHelp(true);
      return;
    }

    // Ctrl+1/2/3 → mode switch
    if (key.ctrl && ch === '1') { setMode('chat'); return; }
    if (key.ctrl && ch === '2') { setMode('tasks'); return; }
    if (key.ctrl && ch === '3') { setMode('agents'); return; }

    // Ctrl+N → new chat
    if (key.ctrl && ch === 'n') {
      setMessages([]);
      conversationRef.current = [];
      setMode('chat');
      return;
    }

    // Ctrl+L → clear view
    if (key.ctrl && ch === 'l') {
      setMessages([]);
      conversationRef.current = [];
      return;
    }

    // ESC → exit focus from content, back to input
    if (key.escape && !focusOnInput) {
      setFocusOnInput(true);
      return;
    }

    // Tab → toggle focus between input and content
    if (key.tab) {
      setFocusOnInput(prev => !prev);
      return;
    }
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  if (tooSmall) {
    return (
      <Box flexDirection="column" width={termSize.width} height={termSize.height} padding={1}>
        <Text color={theme.colors.error} bold>终端太小！最小 60×12</Text>
        <Text color={theme.colors.muted}>当前: {termSize.width}×{termSize.height}</Text>
      </Box>
    );
  }

  const pendingCount = tasks.filter(t => t.status !== 'done').length;

  return (
    <Box flexDirection="column" width={termSize.width} height={termSize.height}>
      {/* ── Header ── */}
      <Box
        height={headerHeight}
        flexShrink={0}
        borderStyle="single"
        borderColor={theme.colors.primary}
        paddingX={1}
        alignItems="center"
      >
        {/* Left: logo + mode tabs */}
        <Box flexShrink={0}>
          <Text color={theme.colors.primary} bold>◆ HYPER </Text>
          <ModeTab label="CHAT" mode="chat" active={mode} onClick={setMode} />
          <Text color={theme.colors.muted}> </Text>
          <ModeTab
            label={`TASKS${pendingCount > 0 ? `(${pendingCount})` : ''}`}
            mode="tasks"
            active={mode}
            onClick={setMode}
          />
          <Text color={theme.colors.muted}> </Text>
          <ModeTab label="AGENTS" mode="agents" active={mode} onClick={setMode} />
        </Box>

        {/* Right: status */}
        <Box flexGrow={1} justifyContent="flex-end">
          {isStreaming && (
            <Text color={theme.colors.warning}>
              <StreamingDots /> 思考中
            </Text>
          )}
          {totalTokens > 0 && (
            <Text color={theme.colors.muted}>{formatTokens(totalTokens)} tok  </Text>
          )}
          <Text color={theme.colors.success}>●</Text>
          <Text color={theme.colors.muted}> sonnet  ⌘K:命令面板 ?:帮助</Text>
        </Box>
      </Box>

      {/* ── Content ── */}
      <Box height={contentHeight} flexShrink={0} overflow="hidden">
        {mode === 'chat' && (
          <ChatView
            messages={messages}
            height={contentHeight}
            width={termSize.width}
            isFocused={!focusOnInput}
            streamingId={streamingId}
          />
        )}
        {mode === 'tasks' && (
          <TasksView
            tasks={tasks}
            height={contentHeight}
            width={termSize.width}
            isFocused={!focusOnInput}
            onToggle={toggleTask}
            onDelete={deleteTask}
            onSetStatus={setTaskStatus}
            onAddTask={(title) => {
              addTask(title);
              setMessages(prev => [...prev, {
                id: `sys-${Date.now()}`,
                role: 'system',
                content: `✓ 任务: ${title}`,
                timestamp: new Date(),
              }]);
            }}
          />
        )}
        {mode === 'agents' && (
          <AgentsView
            height={contentHeight}
            width={termSize.width}
            isFocused={!focusOnInput}
            onRunAgent={(agentName, goal) => {
              setMode('chat');
              handleInput(`作为 ${agentName}, 请帮我: ${goal}`);
            }}
          />
        )}
      </Box>

      {/* ── Input Bar ── */}
      <Box height={inputHeight} flexShrink={0}>
        <FlowInput
          onSubmit={handleInput}
          mode={mode}
          isFocused={focusOnInput}
          isStreaming={isStreaming}
          width={termSize.width}
          onFocusContent={() => setFocusOnInput(false)}
        />
      </Box>

      {/* ── Overlays ── */}
      {showHelp && (
        <HelpOverlay
          width={Math.min(72, termSize.width - 4)}
          height={Math.min(30, termSize.height - 4)}
          onClose={() => setShowHelp(false)}
        />
      )}
      {showPalette && (
        <CommandPaletteOverlay
          width={Math.min(64, termSize.width - 4)}
          height={Math.min(22, termSize.height - 4)}
          mode={mode}
          onSelect={(cmd) => {
            setShowPalette(false);
            handleInput(cmd);
          }}
          onClose={() => setShowPalette(false)}
        />
      )}
    </Box>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function ModeTab({
  label, mode, active, onClick,
}: {
  label: string;
  mode: AppMode;
  active: AppMode;
  onClick: (m: AppMode) => void;
}) {
  const isActive = mode === active;
  return (
    <Text
      color={isActive ? theme.colors.background : theme.colors.muted}
      backgroundColor={isActive ? theme.colors.primary : undefined}
      bold={isActive}
    >
      {' '}{label}{' '}
    </Text>
  );
}

function StreamingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 250);
    return () => clearInterval(t);
  }, []);
  return <Text>{['⠋', '⠙', '⠹', '⠸'][frame]}</Text>;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}
