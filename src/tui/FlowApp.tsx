#!/usr/bin/env node
/**
 * FlowApp.tsx - 键盘优先的心流体验 TUI
 *
 * 设计哲学:
 * - 模态交互 (Modal): 四模式架构, 类 vim 理念
 * - 心流 (Flow): 最小认知负担, 上下文感知按键提示
 * - 键盘优先: 全程无需鼠标, 快捷键覆盖所有操作
 * - 真实 AI: 流式响应, token 逐字显示
 *
 * 布局:
 * ┌────────────────────────────────────────────────────────┐
 * │  ◆ HYPER  [CHAT] [TASKS] [NOTES] [AGENTS]  ● sonnet  │ ← header
 * ├────────────────────────────────────────────────────────┤
 * │                                                        │
 * │  CHAT   → AI 流式对话 (研究/写作/答疑/规划...)          │
 * │  TASKS  → Vim 风格任务管理 (j/k/s/d/v/gg/G)           │
 * │  NOTES  → 快速笔记双栏 (j/k/p/d//)                    │
 * │  AGENTS → 6 Agent 网格 (研究/规划/编码/审查/写作/分析)  │
 * │                                                        │
 * ├────────────────────────────────────────────────────────┤
 * │  ❯ [智能输入 + 命令补全 + 历史]       ⌘K:面板 ?:帮助   │ ← 输入
 * └────────────────────────────────────────────────────────┘
 *
 * 自然语言快捷语:
 *   "todo X"   → 创建任务
 *   "note X"   → 快速记录
 *   "timer N"  → 番茄钟
 *   "plan"     → AI 生成日计划
 *   "standup"  → AI 生成站会内容
 *
 * 按键总览 (打断计算: 同窗口内 = 0 打断, 切换应用 = 1 打断):
 *   Ctrl+1/2/3/4  切换模式 (0 打断)
 *   Ctrl+K        命令面板 (0 打断)
 *   Tab           焦点切换 (0 打断)
 *   ?             帮助面板 (0 打断)
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { sendMessageStream } from '../ai/client.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { tuiTheme as theme } from '../theme/index.js';
import { ChatView } from './views/ChatView.js';
import { TasksView } from './views/TasksView.js';
import { AgentsView } from './views/AgentsView.js';
import { NotesView } from './views/NotesView.js';
import { FlowInput } from './views/FlowInput.js';
import { HelpOverlay } from './views/HelpOverlay.js';
import { CommandPaletteOverlay } from './views/CommandPaletteOverlay.js';
import type { Note } from './views/NotesView.js';

// ============================================================================
// Types
// ============================================================================

export type AppMode = 'chat' | 'tasks' | 'notes' | 'agents';

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

// ── Pomodoro Timer State ─────────────────────────────────────────────────────
interface TimerState {
  active: boolean;
  seconds: number;
  total: number;
  label: string;
  type: 'focus' | 'break';
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

  // ── Core State ──────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content: [
        '◆ HyperTerminal — AI 原生超级终端  v0.3.0',
        '',
        '快速开始:',
        '  直接输入 → 与 AI 对话 (真实 Claude 流式响应)',
        '  todo 买菜  → 创建任务',
        '  note 想法  → 快速记录',
        '  timer 25   → 25分钟番茄钟',
        '  plan        → AI 生成今日计划',
        '  standup     → AI 生成站会内容',
        '',
        '  Ctrl+K → 命令面板   ? → 快捷键帮助',
        '  Ctrl+1/2/3/4 → 切换 CHAT/TASKS/NOTES/AGENTS',
      ].join('\n'),
      timestamp: new Date(),
    },
  ]);

  const [tasks, setTasks] = useState<Task[]>([
    { id: '1', title: '查看项目文档', status: 'pending', priority: 'high', createdAt: new Date() },
    { id: '2', title: '回复重要邮件', status: 'in_progress', priority: 'normal', createdAt: new Date(Date.now() - 3600000) },
    { id: '3', title: '代码审查 PR#42', status: 'pending', priority: 'high', createdAt: new Date(Date.now() - 7200000) },
  ]);

  const [notes, setNotes] = useState<Note[]>([
    {
      id: 'n1',
      title: '项目架构决策',
      content: '采用微服务架构, 服务间通过 gRPC 通信\n数据库: PostgreSQL + Redis 缓存层\n部署: Kubernetes on AWS EKS',
      tags: ['架构', '技术'],
      pinned: true,
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 3600000),
    },
    {
      id: 'n2',
      title: '每周回顾',
      content: '本周完成: API 重构, 测试覆盖率提升至 85%\n下周目标: 上线新功能, 优化数据库查询',
      tags: ['回顾'],
      pinned: false,
      createdAt: new Date(Date.now() - 172800000),
      updatedAt: new Date(Date.now() - 172800000),
    },
  ]);

  const [totalTokens, setTotalTokens] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [focusOnInput, setFocusOnInput] = useState(true);

  // ── Timer (Pomodoro) ─────────────────────────────────────────────────────
  const [timer, setTimer] = useState<TimerState>({
    active: false, seconds: 0, total: 0, label: '', type: 'focus',
  });
  useEffect(() => {
    if (!timer.active || timer.seconds <= 0) return;
    const t = setInterval(() => {
      setTimer(prev => {
        if (prev.seconds <= 1) {
          clearInterval(t);
          sysMsg(`⏰ ${prev.label} 结束！`);
          return { ...prev, active: false, seconds: 0 };
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [timer.active]);

  // Conversation history for AI context
  const conversationRef = useRef<MessageParam[]>([]);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const headerHeight = 1;
  const inputHeight = 3;
  const contentHeight = termSize.height - headerHeight - inputHeight;
  const tooSmall = termSize.width < 60 || termSize.height < 12;

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const sysMsg = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: new Date(),
    }]);
    setMode('chat');
  }, []);

  // ── AI Streaming ─────────────────────────────────────────────────────────
  const sendToAI = useCallback(async (userText: string, systemOverride?: string) => {
    if (isStreaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setMode('chat');

    conversationRef.current = [
      ...conversationRef.current,
      { role: 'user', content: userText },
    ];

    const aiId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: aiId, role: 'assistant', content: '', timestamp: new Date(), streaming: true,
    }]);
    setIsStreaming(true);
    setStreamingId(aiId);

    let accumulated = '';
    try {
      const result = await sendMessageStream(
        conversationRef.current,
        (delta: string) => {
          accumulated += delta;
          setMessages(prev =>
            prev.map(m => m.id === aiId ? { ...m, content: accumulated } : m)
          );
        },
        systemOverride,
      );

      conversationRef.current = [
        ...conversationRef.current,
        { role: 'assistant', content: result.content || accumulated },
      ];
      setTotalTokens(prev => prev + result.usage.inputTokens + result.usage.outputTokens);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId
            ? { ...m, content: result.content || accumulated, streaming: false, tokenCount: result.usage.outputTokens }
            : m
        )
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId ? { ...m, content: `⚠ 错误: ${errMsg}`, streaming: false } : m
        )
      );
    } finally {
      setIsStreaming(false);
      setStreamingId(null);
    }
  }, [isStreaming]);

  // ── Task Operations ──────────────────────────────────────────────────────
  const addTask = useCallback((title: string, priority: Task['priority'] = 'normal') => {
    const t: Task = { id: Date.now().toString(), title, status: 'pending', priority, createdAt: new Date() };
    setTasks(prev => [t, ...prev]);
    return t;
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.status === 'done') return { ...t, status: 'pending' as const, doneAt: undefined };
      return { ...t, status: 'done' as const, doneAt: new Date() };
    }));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const setTaskStatus = useCallback((id: string, status: Task['status']) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status, ...(status === 'done' ? { doneAt: new Date() } : {}) } : t
    ));
  }, []);

  // ── Note Operations ──────────────────────────────────────────────────────
  const addNote = useCallback((content: string, tags: string[] = []) => {
    const words = content.split(' ').slice(0, 6).join(' ');
    const title = words.length > 30 ? words.slice(0, 30) + '…' : words;
    const n: Note = {
      id: `n-${Date.now()}`,
      title,
      content,
      tags,
      pinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setNotes(prev => [n, ...prev]);
    return n;
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const pinNote = useCallback((id: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
  }, []);

  const addNoteTag = useCallback((id: string, tag: string) => {
    setNotes(prev => prev.map(n =>
      n.id === id && !n.tags.includes(tag) ? { ...n, tags: [...n.tags, tag] } : n
    ));
  }, []);

  // ── Command Handling ─────────────────────────────────────────────────────
  const handleInput = useCallback(async (raw: string) => {
    const input = raw.trim();
    if (!input) return;

    // ── Slash Commands ────────────────────────────────────────────────────
    if (input.startsWith('/')) {
      const parts = input.slice(1).split(' ');
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      switch (cmd) {
        // Mode switching
        case 'chat':   setMode('chat');   return;
        case 'tasks':  setMode('tasks');  return;
        case 'notes':  setMode('notes');  return;
        case 'agents': setMode('agents'); return;

        // Chat management
        case 'clear':
          setMessages([]);
          conversationRef.current = [];
          return;
        case 'new':
          setMessages([]);
          conversationRef.current = [];
          setMode('chat');
          return;

        // Help
        case 'help':
          setShowHelp(true);
          return;

        // Task creation
        case 'task':
        case 'todo': {
          if (!arg) { sysMsg('用法: /task <标题>'); return; }
          const isPrio = arg.includes('紧急') || arg.includes('urgent') || arg.includes('!');
          const t = addTask(arg, isPrio ? 'high' : 'normal');
          sysMsg(`✓ 任务: ${t.title}`);
          return;
        }

        // Note creation
        case 'note': {
          if (!arg) { sysMsg('用法: /note <内容>'); return; }
          const n = addNote(arg);
          sysMsg(`📝 笔记: ${n.title}`);
          setMode('notes');
          return;
        }

        // Timer (Pomodoro)
        case 'timer': {
          const mins = parseInt(arg) || 25;
          const label = mins <= 5 ? '休息' : `专注 ${mins}m`;
          setTimer({ active: true, seconds: mins * 60, total: mins * 60, label, type: mins <= 5 ? 'break' : 'focus' });
          sysMsg(`⏱ 计时开始: ${label}`);
          return;
        }
        case 'stop':
          setTimer(prev => ({ ...prev, active: false }));
          sysMsg('⏹ 计时已停止');
          return;

        // AI-powered productivity shortcuts
        case 'plan': {
          const taskList = tasks.filter(t => t.status !== 'done').map(t => `- ${t.title} [${t.priority}]`).join('\n');
          const prompt = `请帮我规划今天的工作日程。当前待办任务:\n${taskList || '(暂无任务)'}\n\n请给出今天的时间块安排，优先级排序，以及开始建议。`;
          await sendToAI(prompt, '你是一个高效的日程规划师。请给出简洁、可执行的每日计划。');
          return;
        }

        case 'standup': {
          const doneTasks = tasks.filter(t => t.status === 'done').slice(0, 5).map(t => `- ${t.title}`).join('\n');
          const pendingTaskList = tasks.filter(t => t.status !== 'done').slice(0, 5).map(t => `- ${t.title}`).join('\n');
          const prompt = `请帮我生成今日站会内容:\n\n昨日完成:\n${doneTasks || '(暂无)'}\n\n今日计划:\n${pendingTaskList || '(暂无)'}\n\n请生成简洁的站会发言稿，包括昨日、今日、是否有阻塞。`;
          await sendToAI(prompt, '你是一个敏捷开发助手。生成简洁专业的站会内容。');
          return;
        }

        case 'review': {
          const allTasks = tasks.slice(0, 10).map(t => `[${t.status}] ${t.title}`).join('\n');
          const prompt = `请帮我做今日工作回顾:\n\n任务情况:\n${allTasks}\n\n请分析完成情况，识别未完成原因，给出明日改进建议。`;
          await sendToAI(prompt, '你是一个效能教练。给出建设性的每日回顾分析。');
          return;
        }

        case 'research': {
          if (!arg) { sysMsg('用法: /research <主题>'); return; }
          await sendToAI(
            `请深入研究以下主题，给出全面的分析报告:\n\n${arg}\n\n包括: 背景介绍, 关键要点, 优缺点分析, 实践建议, 推荐资源。`,
            '你是一个专业研究员。给出深度、有见地的分析。'
          );
          return;
        }

        case 'code': {
          if (!arg) { sysMsg('用法: /code <需求描述>'); return; }
          await sendToAI(
            `请实现以下功能:\n\n${arg}\n\n给出完整的代码实现，包括注释说明和使用示例。`,
            '你是一个资深工程师。给出高质量、可维护的代码实现。'
          );
          return;
        }

        case 'debug': {
          if (!arg) { sysMsg('用法: /debug <错误信息或代码>'); return; }
          await sendToAI(
            `请帮我调试以下问题:\n\n${arg}\n\n请分析错误原因，给出修复方案和预防措施。`,
            '你是一个调试专家。系统性分析问题根因，给出明确的解决步骤。'
          );
          return;
        }

        case 'explain': {
          if (!arg) { sysMsg('用法: /explain <代码或概念>'); return; }
          await sendToAI(
            `请解释以下内容:\n\n${arg}\n\n用清晰简单的语言解释，包括工作原理、使用场景和注意事项。`,
            '你是一个优秀的技术讲师。用简单易懂的方式解释复杂概念。'
          );
          return;
        }

        case 'refactor': {
          if (!arg) { sysMsg('用法: /refactor <代码>'); return; }
          await sendToAI(
            `请重构以下代码:\n\n${arg}\n\n改进: 可读性、性能、设计模式。给出重构后代码和改动说明。`,
            '你是一个代码质量专家。给出优雅、高效的重构方案。'
          );
          return;
        }

        case 'write': {
          if (!arg) { sysMsg('用法: /write <写作需求>'); return; }
          await sendToAI(
            `请写作以下内容:\n\n${arg}\n\n要求: 结构清晰、语言流畅、内容充实。`,
            '你是一个专业写作助手。给出高质量的原创内容。'
          );
          return;
        }

        case 'translate': {
          if (!arg) { sysMsg('用法: /translate <文本>'); return; }
          await sendToAI(
            `请翻译以下内容 (中英互译，根据语言自动判断方向):\n\n${arg}`,
            '你是一个专业翻译。给出准确、自然的翻译结果。'
          );
          return;
        }

        case 'summary': {
          if (!arg) { sysMsg('用法: /summary <文本或主题>'); return; }
          await sendToAI(
            `请对以下内容进行摘要总结:\n\n${arg}\n\n给出核心要点 (5条以内)。`,
            '你是一个信息提炼专家。给出精准、结构化的摘要。'
          );
          return;
        }

        case 'exit':
        case 'quit':
          exit();
          return;

        default:
          sysMsg(`未知命令: /${cmd}  输入 /help 查看所有命令`);
          return;
      }
    }

    // ── Natural Language Shortcuts ────────────────────────────────────────
    const lc = input.toLowerCase();

    // "todo X" / "任务 X"
    if (lc.startsWith('todo ') || lc.startsWith('任务 ')) {
      const title = input.replace(/^(todo|任务)\s+/i, '');
      const t = addTask(title);
      sysMsg(`✓ 任务: ${t.title}`);
      return;
    }

    // "note X" / "记录 X" / "笔记 X"
    if (lc.startsWith('note ') || lc.startsWith('记录 ') || lc.startsWith('笔记 ')) {
      const content = input.replace(/^(note|记录|笔记)\s+/i, '');
      const n = addNote(content);
      sysMsg(`📝 已记录: ${n.title}`);
      return;
    }

    // "timer N" / "番茄 N"
    if (lc.startsWith('timer ') || lc.startsWith('番茄 ')) {
      const mins = parseInt(input.replace(/^(timer|番茄)\s+/i, '')) || 25;
      setTimer({ active: true, seconds: mins * 60, total: mins * 60, label: `专注 ${mins}m`, type: 'focus' });
      sysMsg(`⏱ 开始 ${mins} 分钟番茄钟`);
      return;
    }

    // "plan" / "规划今天"
    if (lc === 'plan' || lc === '规划今天' || lc === '今日计划') {
      handleInput('/plan');
      return;
    }

    // "standup" / "站会"
    if (lc === 'standup' || lc === '站会') {
      handleInput('/standup');
      return;
    }

    // Default: send to AI
    await sendToAI(input);
  }, [addNote, addTask, exit, sysMsg, sendToAI, tasks]);

  // ── Global Keyboard ──────────────────────────────────────────────────────
  useInput((ch, key) => {
    if (showPalette || showHelp) return;

    if (key.ctrl && ch === 'k') { setShowPalette(true); return; }
    if (ch === '?' && !focusOnInput) { setShowHelp(true); return; }

    if (key.ctrl && ch === '1') { setMode('chat');   return; }
    if (key.ctrl && ch === '2') { setMode('tasks');  return; }
    if (key.ctrl && ch === '3') { setMode('notes');  return; }
    if (key.ctrl && ch === '4') { setMode('agents'); return; }

    if (key.ctrl && ch === 'n') {
      setMessages([]);
      conversationRef.current = [];
      setMode('chat');
      return;
    }
    if (key.ctrl && ch === 'l') {
      setMessages([]);
      conversationRef.current = [];
      return;
    }

    if (key.escape && !focusOnInput) { setFocusOnInput(true); return; }
    if (key.tab) { setFocusOnInput(prev => !prev); return; }
  });

  // ── Render ───────────────────────────────────────────────────────────────
  if (tooSmall) {
    return (
      <Box flexDirection="column" width={termSize.width} height={termSize.height} padding={1}>
        <Text color={theme.colors.error} bold>终端太小！最小 60×12</Text>
        <Text color={theme.colors.muted}>当前: {termSize.width}×{termSize.height}</Text>
      </Box>
    );
  }

  const pendingCount = tasks.filter(t => t.status !== 'done').length;
  const timerPct = timer.active && timer.total > 0
    ? Math.floor((timer.seconds / timer.total) * 100)
    : 0;

  return (
    <Box flexDirection="column" width={termSize.width} height={termSize.height}>
      {/* ── Header ── */}
      <Box
        height={headerHeight}
        flexShrink={0}
        borderStyle="single"
        borderColor={timer.active && timer.type === 'focus' ? theme.colors.warning : theme.colors.primary}
        paddingX={1}
        alignItems="center"
      >
        <Box flexShrink={0}>
          <Text color={theme.colors.primary} bold>◆ HYPER </Text>
          <ModeTab label="CHAT"  mode="chat"   active={mode} onClick={setMode} />
          <Text color={theme.colors.muted}> </Text>
          <ModeTab
            label={`TASKS${pendingCount > 0 ? `(${pendingCount})` : ''}`}
            mode="tasks" active={mode} onClick={setMode}
          />
          <Text color={theme.colors.muted}> </Text>
          <ModeTab label={`NOTES(${notes.length})`} mode="notes"  active={mode} onClick={setMode} />
          <Text color={theme.colors.muted}> </Text>
          <ModeTab label="AGENTS" mode="agents" active={mode} onClick={setMode} />
        </Box>

        <Box flexGrow={1} justifyContent="flex-end">
          {/* Timer display */}
          {timer.active && (
            <Text color={timer.type === 'focus' ? theme.colors.warning : theme.colors.success} bold>
              {timer.type === 'focus' ? '⏱' : '☕'} {formatTimer(timer.seconds)}  {timerPct}%
            </Text>
          )}
          {isStreaming && <Text color={theme.colors.warning}><StreamingDots /> 思考  </Text>}
          {totalTokens > 0 && <Text color={theme.colors.muted}>{formatTokens(totalTokens)}tok  </Text>}
          <Text color={theme.colors.success}>●</Text>
          <Text color={theme.colors.muted}> sonnet  ⌘K ?</Text>
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
              sysMsg(`✓ 任务: ${title}`);
            }}
          />
        )}
        {mode === 'notes' && (
          <NotesView
            notes={notes}
            height={contentHeight}
            width={termSize.width}
            isFocused={!focusOnInput}
            onDelete={deleteNote}
            onPin={pinNote}
            onAddTag={addNoteTag}
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
          width={Math.min(76, termSize.width - 4)}
          height={Math.min(34, termSize.height - 4)}
          onClose={() => setShowHelp(false)}
        />
      )}
      {showPalette && (
        <CommandPaletteOverlay
          width={Math.min(68, termSize.width - 4)}
          height={Math.min(24, termSize.height - 4)}
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

function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
