#!/usr/bin/env node
/**
 * FlowApp.tsx — NEO  键盘优先 · AI 原生 · 心流体验
 *
 * 模式: CHAT / TASKS / NOTES / AGENTS / PLUGINS
 * 按键: Ctrl+1-5 切换模式  Ctrl+K 命令面板  ? 帮助
 *
 * 命令 (短命令优先):
 *   /c  代码   /d  调试   /e  解释   /w  写作
 *   /tr 翻译   /sm 摘要   /rs 研究   /rf 重构
 *   /t  任务   /n  笔记   /ti 计时器
 *   /plan /sup /rev  AI 效率工具
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { sendMessageStream, resetClient } from '../ai/client.js';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { tuiTheme as theme } from '../theme/index.js';
import { switchProvider, switchModel, getConfig } from '../utils/config.js';
import { keyStore } from '../ai/keystore.js';
import { ChatView } from './views/ChatView.js';
import { TasksView } from './views/TasksView.js';
import { AgentsView } from './views/AgentsView.js';
import { NotesView } from './views/NotesView.js';
import { PluginsView } from './views/PluginsView.js';
import { FlowInput } from './views/FlowInput.js';
import { HelpOverlay } from './views/HelpOverlay.js';
import { ModelSelector } from './views/ModelSelector.js';
import { CommandPaletteOverlay } from './views/CommandPaletteOverlay.js';
import type { Note } from './views/NotesView.js';
import { pluginRegistry } from './plugins/index.js';
import { recordRound } from './plugins/token-counter.js';
import { recordAnalyticsRound, type TaskType } from './plugins/analytics.js';
import type { LoadedPlugin, StatusContext, PluginContext } from '../sdk/plugin.js';
import { autonomousEngine, type AutonomousTask } from './agents/AutonomousEngine.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type AppMode = 'chat' | 'tasks' | 'notes' | 'agents' | 'plugins';

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

interface TimerState {
  active: boolean;
  seconds: number;
  total: number;
  label: string;
  type: 'focus' | 'break';
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FlowApp() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const appStartRef = useRef(Date.now());

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

  // ── Core State ───────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<AppMode>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content: [
        '◆ NEO — AI 原生超级终端  v0.4.0',
        '',
        '快速开始 (短命令版):',
        '  直接输入    → AI 对话 (Claude 实时流式)',
        '  t 买菜      → 创建任务   (或 /t)',
        '  n 想法      → 快速记录   (或 /n)',
        '  ti 25       → 25分钟番茄钟',
        '  /c <需求>   → 生成代码',
        '  /d <错误>   → 调试分析',
        '  /rs <主题>  → 深度研究',
        '  /plan       → AI 规划今日',
        '',
        '  /stats → 成本收益分析  /price → 价格表  /news → 资讯',
        '  /key add <provider> <key> → 配置 API Key',
        '  /model (Ctrl+M) → 切换模型/Provider',
        '',
        '  Ctrl+1/2/3/4/5 → CHAT/TASKS/NOTES/AGENTS/PLUGINS',
        '  Ctrl+K → 命令面板   Ctrl+M → 模型选择  ? → 帮助',
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
  ]);

  const [totalTokens, setTotalTokens] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [activeProvider, setActiveProvider] = useState(() => getConfig().provider);
  const [activeModel, setActiveModel] = useState(() => getConfig().model);
  const [focusOnInput, setFocusOnInput] = useState(true);
  const [pluginList, setPluginList] = useState<LoadedPlugin[]>([]);
  const [statusWidgets, setStatusWidgets] = useState<string[]>([]);
  const [, forceUpdate] = useState(0);  // for plugin widget refresh

  // Pomodoro timer
  const [timer, setTimer] = useState<TimerState>({
    active: false, seconds: 0, total: 0, label: '', type: 'focus',
  });
  useEffect(() => {
    if (!timer.active || timer.seconds <= 0) return;
    const t = setInterval(() => {
      setTimer(prev => {
        if (prev.seconds <= 1) {
          clearInterval(t);
          sysMsg(`⏰ ${prev.label} 结束！休息一下 ☕`);
          return { ...prev, active: false, seconds: 0 };
        }
        return { ...prev, seconds: prev.seconds - 1 };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [timer.active]);

  const conversationRef = useRef<MessageParam[]>([]);
  // Stable ref to sendToAI, avoids circular hook dependency
  const sendToAIRef = useRef<(text: string, sys?: string) => Promise<void>>(async () => {});

  // ── Quick Capture (Ctrl+T/Shift+N without mode switch) ───────────────────
  const [capture, setCapture] = useState<{ mode: 'task' | 'note'; text: string } | null>(null);

  // ── Status Context (for plugins) ─────────────────────────────────────────
  const statusCtx = useMemo<StatusContext>(() => ({
    now: new Date(),
    getConfig: () => undefined,
    getTokenStats: () => ({
      totalInput: 0,
      totalOutput: totalTokens,
      totalTokens,
      sessionCost: totalTokens * 0.000003,
      model: 'claude-sonnet',
    }),
  }), [totalTokens]);

  // ── Plugin Context ────────────────────────────────────────────────────────
  const makePluginCtx = useCallback((): PluginContext => ({
    addMessage: (content, role = 'system') => {
      setMessages(prev => [...prev, {
        id: `plug-${Date.now()}`,
        role: role as Message['role'],
        content,
        timestamp: new Date(),
      }]);
    },
    notify: (content) => {
      setMessages(prev => [...prev, {
        id: `notif-${Date.now()}`,
        role: 'system',
        content: `ℹ ${content}`,
        timestamp: new Date(),
      }]);
    },
    setMode: (m) => setMode(m),
    getConfig: () => undefined,
    setConfig: () => {},
    getTasks: () => tasks.map(t => ({
      id: t.id, title: t.title, status: t.status, priority: t.priority,
    })),
    getNotes: () => notes.map(n => ({
      id: n.id, title: n.title, content: n.content, tags: n.tags,
    })),
    // sendToAI resolved at call time via closure (defined below)
    sendToAI: async (prompt, sys) => { await (sendToAIRef.current)(prompt, sys); },
    getTokenStats: () => ({
      totalInput: 0, totalOutput: totalTokens, totalTokens,
      sessionCost: totalTokens * 0.000003, model: 'claude-sonnet',
    }),
  }), [tasks, notes, totalTokens]);

  // ── Init Plugins ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = makePluginCtx();
    void pluginRegistry.init(ctx).then(() => {
      setPluginList(pluginRegistry.list());
    });

    // Widget refresh every second
    const widgetTimer = setInterval(() => {
      const ctx2: StatusContext = {
        now: new Date(),
        getConfig: () => undefined,
        getTokenStats: () => ({
          totalInput: 0, totalOutput: totalTokens,
          totalTokens, sessionCost: totalTokens * 0.000003, model: 'claude-sonnet',
        }),
      };
      setStatusWidgets(pluginRegistry.getStatusWidgets(ctx2));
      forceUpdate(n => n + 1);
    }, 1000);

    return () => {
      clearInterval(widgetTimer);
      pluginRegistry.destroy();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Init autonomous engine with real AI call
  useEffect(() => {
    autonomousEngine.init(
      sendMessageStream,
      (updatedTasks) => {
        // Log completed tasks to chat
        for (const t of updatedTasks) {
          if (t.status === 'done' && t.result && t.milestones.length > 0) {
            const lastMilestone = t.milestones[t.milestones.length - 1];
            if (lastMilestone?.startsWith('✓')) return; // already logged
          }
        }
      },
    );
    return () => autonomousEngine.destroy();
  }, []);

  // ── Layout ────────────────────────────────────────────────────────────────
  const headerHeight = 1;
  const inputHeight = 3;
  const contentHeight = termSize.height - headerHeight - inputHeight;
  const tooSmall = termSize.width < 60 || termSize.height < 12;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const sysMsg = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: 'system',
      content,
      timestamp: new Date(),
    }]);
  }, []);

  // ── AI Streaming ──────────────────────────────────────────────────────────
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

    conversationRef.current = [...conversationRef.current, { role: 'user', content: userText }];

    const aiId = `ai-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: aiId, role: 'assistant', content: '', timestamp: new Date(), streaming: true,
    }]);
    setIsStreaming(true);
    setStreamingId(aiId);

    let accumulated = '';
    const inputStart = Date.now();
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

      const newTokens = result.usage.inputTokens + result.usage.outputTokens;
      setTotalTokens(prev => prev + newTokens);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId
            ? { ...m, content: result.content || accumulated, streaming: false, tokenCount: result.usage.outputTokens }
            : m
        )
      );

      // Record in token-counter plugin
      void recordRound(
        result.usage.inputTokens,
        result.usage.outputTokens,
        result.model,
        userText.slice(0, 80),
      );
      // Record in analytics (detect task type from command prefix)
      const taskType: TaskType = userText.startsWith('/c ') || userText.startsWith('/code ') ? 'code'
        : userText.startsWith('/d ') || userText.startsWith('/debug ') ? 'debug'
        : userText.startsWith('/rs ') || userText.startsWith('/research ') ? 'research'
        : userText.startsWith('/w ') || userText.startsWith('/write ') ? 'write'
        : 'chat';
      recordAnalyticsRound(result.usage.inputTokens, result.usage.outputTokens, taskType);

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === aiId ? { ...m, content: `⚠ 错误: ${errMsg}`, streaming: false } : m
        )
      );
    } finally {
      void inputStart; // suppress unused warning
      setIsStreaming(false);
      setStreamingId(null);
    }
  }, [isStreaming]);

  // Keep ref current so makePluginCtx can call sendToAI without circular dep
  useEffect(() => { sendToAIRef.current = sendToAI; }, [sendToAI]);

  // ── Task Operations ───────────────────────────────────────────────────────
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

  // ── Note Operations ───────────────────────────────────────────────────────
  const addNote = useCallback((content: string, tags: string[] = []) => {
    const words = content.split(' ').slice(0, 6).join(' ');
    const title = words.length > 30 ? words.slice(0, 30) + '…' : words;
    const n: Note = {
      id: `n-${Date.now()}`, title, content, tags,
      pinned: false, createdAt: new Date(), updatedAt: new Date(),
    };
    setNotes(prev => [n, ...prev]);
    return n;
  }, []);

  const deleteNote = useCallback((id: string) => setNotes(prev => prev.filter(n => n.id !== id)), []);
  const pinNote = useCallback((id: string) => setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n)), []);
  const addNoteTag = useCallback((id: string, tag: string) => {
    setNotes(prev => prev.map(n =>
      n.id === id && !n.tags.includes(tag) ? { ...n, tags: [...n.tags, tag] } : n
    ));
  }, []);

  // ── Command Handler ───────────────────────────────────────────────────────
  const handleInput = useCallback(async (raw: string) => {
    const input = raw.trim();
    if (!input) return;

    // ── Slash Commands ────────────────────────────────────────────────────
    if (input.startsWith('/')) {
      const parts = input.slice(1).split(' ');
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      // Try plugin commands first
      const pluginCtx = makePluginCtx();
      const handled = await pluginRegistry.handleCommand(cmd, arg, {
        ...pluginCtx,
        args: arg,
        raw: input,
      });
      if (handled) return;

      switch (cmd) {
        // ── Mode switching ──────────────────────────────────────────────
        case 'chat':   case '1': setMode('chat');    return;
        case 'tasks':  case '2': setMode('tasks');   return;
        case 'notes':  case '3': setMode('notes');   return;
        case 'agents': case '4': setMode('agents');  return;
        case 'plugins':case '5': setMode('plugins'); return;

        // ── Chat management ─────────────────────────────────────────────
        case 'clear': case 'cl':
          setMessages([]);
          conversationRef.current = [];
          return;
        case 'new':
          setMessages([]);
          conversationRef.current = [];
          setMode('chat');
          return;

        // ── Help ────────────────────────────────────────────────────────
        case 'help': case 'h':
          setShowHelp(true);
          return;

        // ── Task: /t or /task or /todo ──────────────────────────────────
        case 'task': case 'todo': case 't': {
          if (!arg) { sysMsg('用法: /t <标题>  [!紧急]'); return; }
          const isPrio = arg.includes('紧急') || arg.includes('urgent') || arg.includes('!');
          const t = addTask(arg, isPrio ? 'high' : 'normal');
          sysMsg(`✓ 任务: ${t.title}`);
          return;
        }

        // ── Note: /n or /note ───────────────────────────────────────────
        case 'note': case 'n': {
          if (!arg) { sysMsg('用法: /n <内容>'); return; }
          const n = addNote(arg);
          sysMsg(`📝 笔记: ${n.title}`);
          setMode('notes');
          return;
        }

        // ── Timer: /ti or /timer ────────────────────────────────────────
        case 'timer': case 'ti': {
          const mins = parseInt(arg) || 25;
          const label = mins <= 5 ? `休息 ${mins}m` : `专注 ${mins}m`;
          setTimer({ active: true, seconds: mins * 60, total: mins * 60, label, type: mins <= 5 ? 'break' : 'focus' });
          sysMsg(`⏱ ${label} 开始`);
          return;
        }
        case 'stop':
          setTimer(prev => ({ ...prev, active: false }));
          sysMsg('⏹ 计时已停止');
          return;

        // ── AI productivity: /plan /sup /rev ───────────────────────────
        case 'plan': {
          const taskList = tasks.filter(t => t.status !== 'done').map(t => `- ${t.title} [${t.priority}]`).join('\n');
          await sendToAI(
            `请帮我规划今天的工作。待办任务:\n${taskList || '(暂无)'}\n\n给出时间块安排和开始建议。`,
            '你是高效的日程规划师。给出简洁可执行的每日计划。'
          );
          return;
        }
        case 'standup': case 'sup': {
          const done = tasks.filter(t => t.status === 'done').slice(0, 5).map(t => `- ${t.title}`).join('\n');
          const pending = tasks.filter(t => t.status !== 'done').slice(0, 5).map(t => `- ${t.title}`).join('\n');
          await sendToAI(
            `生成站会内容:\n昨日完成:\n${done || '(暂无)'}\n今日计划:\n${pending || '(暂无)'}`,
            '你是敏捷开发助手。生成简洁专业的站会发言。'
          );
          return;
        }
        case 'review': case 'rev': {
          const all = tasks.slice(0, 10).map(t => `[${t.status}] ${t.title}`).join('\n');
          await sendToAI(
            `工作回顾:\n${all}\n\n分析完成情况，给出明日改进建议。`,
            '你是效能教练。给出建设性的每日回顾。'
          );
          return;
        }

        // ── AI tools: short commands ────────────────────────────────────
        case 'code': case 'c': {
          if (!arg) { sysMsg('用法: /c <需求>'); return; }
          await sendToAI(`实现以下功能:\n\n${arg}\n\n给出完整代码、注释和使用示例。`, '你是资深工程师。写出高质量可维护的代码。');
          return;
        }
        case 'debug': case 'd': {
          if (!arg) { sysMsg('用法: /d <错误或代码>'); return; }
          await sendToAI(`调试以下问题:\n\n${arg}\n\n分析原因，给出修复方案。`, '你是调试专家。系统性分析问题根因。');
          return;
        }
        case 'explain': case 'e': {
          if (!arg) { sysMsg('用法: /e <代码或概念>'); return; }
          await sendToAI(`解释以下内容:\n\n${arg}\n\n用清晰语言解释工作原理和使用场景。`, '你是技术讲师。用简单方式解释复杂概念。');
          return;
        }
        case 'refactor': case 'rf': {
          if (!arg) { sysMsg('用法: /rf <代码>'); return; }
          await sendToAI(`重构以下代码，改进可读性、性能、设计:\n\n${arg}`, '你是代码质量专家。给出优雅高效的重构方案。');
          return;
        }
        case 'write': case 'w': {
          if (!arg) { sysMsg('用法: /w <写作需求>'); return; }
          await sendToAI(`写作需求:\n\n${arg}\n\n结构清晰、语言流畅。`, '你是专业写作助手。给出高质量原创内容。');
          return;
        }
        case 'translate': case 'tr': {
          if (!arg) { sysMsg('用法: /tr <文本>'); return; }
          await sendToAI(`翻译 (中英互译):\n\n${arg}`, '你是专业翻译。给出准确自然的翻译。');
          return;
        }
        case 'summary': case 'sm': {
          if (!arg) { sysMsg('用法: /sm <文本>'); return; }
          await sendToAI(`摘要总结 (5条以内):\n\n${arg}`, '你是信息提炼专家。给出精准结构化的摘要。');
          return;
        }
        case 'research': case 'rs': {
          if (!arg) { sysMsg('用法: /rs <主题>'); return; }
          await sendToAI(
            `深入研究: ${arg}\n\n包括: 背景、关键要点、优缺点、实践建议、推荐资源。`,
            '你是专业研究员。给出深度有见地的分析。'
          );
          return;
        }

        // ── Model/Provider selector ────────────────────────────────────
        case 'model': case 'm':
          setShowModelSelector(true);
          return;

        // ── Analytics shortcuts (handled by plugin above; this is a fallback) ──
        case 'stats': case 'price': case 'news': case 'roi':
          sysMsg(`${cmd}: analytics 插件未加载。确认插件已启用 (/5 → PLUGINS)`);
          return;

        // ── API Key management ─────────────────────────────────────────
        case 'key': {
          const sub = parts[1]?.toLowerCase();
          const rest = parts.slice(2);
          if (!sub || sub === 'list' || sub === 'ls') {
            const keys = keyStore.listKeys('configure');
            if (keys.length === 0) { sysMsg('暂无已配置的 API Key。用 /key add <provider> <key>'); return; }
            const lines = keys.map(k =>
              `  ${k.active ? '●' : '○'} ${k.providerId.padEnd(12)} ${k.label.padEnd(16)} ${k.hint}`
            ).join('\n');
            sysMsg(`已配置的 Key:\n${lines}`);
          } else if (sub === 'add') {
            const [pid, ...keyParts] = rest;
            const rawKey = keyParts.join(' ').trim();
            if (!pid || !rawKey) { sysMsg('用法: /key add <provider> <api-key>'); return; }
            try {
              keyStore.addKey(pid, rawKey);
              resetClient();
              sysMsg(`✓ Key 已添加: ${pid}`);
            } catch (e) {
              sysMsg(`✗ 添加失败: ${e instanceof Error ? e.message : String(e)}`);
            }
          } else if (sub === 'rm' || sub === 'remove' || sub === 'del') {
            const id = rest[0];
            if (!id) { sysMsg('用法: /key rm <provider>'); return; }
            const removed = keyStore.removeKey(id, 'admin');
            sysMsg(removed ? `✓ Key 已删除: ${id}` : `未找到 Key: ${id}`);
          } else {
            sysMsg('key 子命令: list | add <provider> <key> | rm <provider>');
          }
          return;
        }

        case 'exit': case 'quit': case 'q':
          exit();
          return;

        default:
          sysMsg(`未知命令: /${cmd}  输入 /h 查看帮助`);
          return;
      }
    }

    // ── Natural Language: plugin routing first ────────────────────────────
    const pluginCtx = makePluginCtx();
    const pluginHandled = await pluginRegistry.handleNatural(input, pluginCtx);
    if (pluginHandled) return;

    // ── Natural Language Shortcuts ────────────────────────────────────────
    const lc = input.toLowerCase();

    // "t X" or "todo X" or "任务 X"  — but avoid single "t" (too short)
    if (/^(todo|任务)\s+/i.test(input) || (lc.startsWith('t ') && input.length > 2)) {
      const title = input.replace(/^(todo|任务|t)\s+/i, '');
      if (title) { addTask(title); sysMsg(`✓ 任务: ${title}`); return; }
    }

    // "n X" or "note X" or "记录/笔记 X"
    if (/^(note|记录|笔记)\s+/i.test(input) || (lc.startsWith('n ') && input.length > 2)) {
      const content = input.replace(/^(note|记录|笔记|n)\s+/i, '');
      if (content) { const n = addNote(content); sysMsg(`📝 已记录: ${n.title}`); return; }
    }

    // "ti N" or "timer N" or "番茄 N"
    if (/^(timer|番茄|ti)\s+\d+/i.test(input)) {
      const mins = parseInt(input.replace(/^(timer|番茄|ti)\s+/i, '')) || 25;
      setTimer({ active: true, seconds: mins * 60, total: mins * 60, label: `专注 ${mins}m`, type: 'focus' });
      sysMsg(`⏱ 开始 ${mins} 分钟番茄钟`);
      return;
    }

    // "plan" / "规划今天"
    if (lc === 'plan' || lc === '规划今天' || lc === '今日计划') {
      void handleInput('/plan');
      return;
    }
    // "standup" / "站会"
    if (lc === 'standup' || lc === 'sup' || lc === '站会') {
      void handleInput('/sup');
      return;
    }

    // Default: send to AI
    await sendToAI(input);
  }, [addNote, addTask, exit, sysMsg, sendToAI, tasks, makePluginCtx]);

  // ── Global Keyboard ───────────────────────────────────────────────────────
  useInput((ch, key) => {
    // Quick capture modal keyboard
    if (capture) {
      if (key.escape) { setCapture(null); return; }
      if (key.return) {
        if (capture.text.trim()) {
          if (capture.mode === 'task') {
            addTask(capture.text.trim());
            sysMsg(`✓ 任务: ${capture.text.trim()}`);
          } else {
            const n = addNote(capture.text.trim());
            sysMsg(`📝 已记录: ${n.title}`);
          }
        }
        setCapture(null);
        return;
      }
      if (key.backspace) { setCapture(p => p ? { ...p, text: p.text.slice(0, -1) } : null); return; }
      if (ch && !key.ctrl && !key.meta) { setCapture(p => p ? { ...p, text: p.text + ch } : null); return; }
      return;
    }

    if (showPalette || showHelp) return;

    if (key.ctrl && ch === 'k') { setShowPalette(true); return; }
    if (key.ctrl && ch === 'm') { setShowModelSelector(true); return; }
    if (ch === '?' && !focusOnInput) { setShowHelp(true); return; }

    if (key.ctrl && ch === '1') { setMode('chat');    return; }
    if (key.ctrl && ch === '2') { setMode('tasks');   return; }
    if (key.ctrl && ch === '3') { setMode('notes');   return; }
    if (key.ctrl && ch === '4') { setMode('agents');  return; }
    if (key.ctrl && ch === '5') { setMode('plugins'); return; }

    // Quick capture: Ctrl+T = task, Ctrl+Shift+N = note (without Ctrl+N conflict)
    if (key.ctrl && ch === 't') { setCapture({ mode: 'task', text: '' }); return; }

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

  // ── Render ────────────────────────────────────────────────────────────────
  if (tooSmall) {
    return (
      <Box flexDirection="column" width={termSize.width} height={termSize.height} padding={1}>
        <Text color={theme.colors.error} bold>终端太小！最小 60×12</Text>
        <Text color={theme.colors.muted}>当前: {termSize.width}×{termSize.height}</Text>
      </Box>
    );
  }

  const pendingCount = tasks.filter(t => t.status !== 'done').length;
  const runningAgents = autonomousEngine.list().filter(t => t.status === 'running').length;
  const timerPct = timer.active && timer.total > 0 ? Math.floor((timer.seconds / timer.total) * 100) : 0;
  const activePlugins = pluginList.filter(p => p.enabled).length;

  return (
    <Box flexDirection="column" width={termSize.width} height={termSize.height}>

      {/* ── Quick Capture Overlay ── */}
      {capture && (
        <Box
          position="absolute"
          marginTop={0}
          marginLeft={2}
          borderStyle="double"
          borderColor={capture.mode === 'task' ? theme.colors.success : theme.colors.info}
          paddingX={2}
          paddingY={0}
          width={Math.min(60, termSize.width - 8)}
        >
          <Text color={capture.mode === 'task' ? theme.colors.success : theme.colors.info} bold>
            {capture.mode === 'task' ? '☐ 快速任务  ' : '📝 快速笔记  '}
          </Text>
          <Text color={theme.colors.text}>{capture.text}</Text>
          <Text color={theme.colors.primary} backgroundColor={theme.colors.primary}> </Text>
          <Text color={theme.colors.muted}>  Enter:保存  ESC:取消</Text>
        </Box>
      )}

      {/* ── Header: compact one-line ── */}
      <Box
        height={headerHeight}
        flexShrink={0}
        borderStyle="single"
        borderColor={
          timer.active && timer.type === 'focus'
            ? theme.colors.warning
            : isStreaming ? theme.colors.accent : theme.colors.primary
        }
        paddingX={1}
        alignItems="center"
      >
        {/* Left: logo + numbered mode tabs */}
        <Box flexShrink={0}>
          <Text color={theme.colors.primary} bold>◆ </Text>
          <CompactTab n={1} label="CHAT"    badge={undefined}             mode="chat"    active={mode} onClick={setMode} />
          <CompactTab n={2} label="TASKS"   badge={pendingCount || undefined} mode="tasks"   active={mode} onClick={setMode} />
          <CompactTab n={3} label="NOTES"   badge={notes.length || undefined} mode="notes"   active={mode} onClick={setMode} />
          <CompactTab n={4} label="AGENTS"  badge={runningAgents > 0 ? runningAgents : undefined} mode="agents"  active={mode} onClick={setMode} />
          <CompactTab n={5} label="PLUGINS" badge={activePlugins > 0 ? activePlugins : undefined} mode="plugins" active={mode} onClick={setMode} />
        </Box>

        {/* Right: status (minimal) */}
        <Box flexGrow={1} justifyContent="flex-end">
          {/* Plugin widgets — collapsed to icons */}
          {statusWidgets.length > 0 && (
            <Text color={theme.colors.muted}>{statusWidgets.join('  ')}  </Text>
          )}
          {/* Timer bar */}
          {timer.active && (
            <Text color={timer.type === 'focus' ? theme.colors.warning : theme.colors.success} bold>
              {timer.type === 'focus' ? '⏱' : '☕'} {formatTimer(timer.seconds)}
              <Text color={theme.colors.muted}> {timerPct}%  </Text>
            </Text>
          )}
          {/* Token count (compact) */}
          {totalTokens > 0 && (
            <Text color={theme.colors.muted}>{formatTokens(totalTokens)}  </Text>
          )}
          {/* Provider/Model + hints */}
          <Text color={isStreaming ? theme.colors.warning : theme.colors.success}>●</Text>
          <Text color={theme.colors.muted}> {activeProvider}/{activeModel}  ^M ^K ?</Text>
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
            onAddTask={(title) => { addTask(title); sysMsg(`✓ 任务: ${title}`); }}
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
              void handleInput(`作为 ${agentName}, 请帮我: ${goal}`);
            }}
            onAutoTask={(task: AutonomousTask) => {
              sysMsg(`🤖 自主任务已启动: ${task.goal.slice(0, 50)}`);
            }}
          />
        )}
        {mode === 'plugins' && (
          <PluginsView
            plugins={pluginList}
            height={contentHeight}
            width={termSize.width}
            isFocused={!focusOnInput}
            onToggle={async (id) => {
              const p = pluginList.find(x => x.def.id === id);
              if (p) await pluginRegistry.setEnabled(id, !p.enabled);
              setPluginList(pluginRegistry.list());
            }}
            statusCtx={statusCtx}
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
      {showModelSelector && (
        <ModelSelector
          width={Math.min(90, termSize.width - 4)}
          height={Math.min(28, termSize.height - 4)}
          onSelect={(pid, mid) => {
            switchProvider(pid, mid);
            resetClient();
            setActiveProvider(pid);
            setActiveModel(mid);
            sysMsg(`✓ 切换到 ${pid}/${mid}`);
          }}
          onClose={() => setShowModelSelector(false)}
        />
      )}
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
            void handleInput(cmd);
          }}
          onClose={() => setShowPalette(false)}
        />
      )}
    </Box>
  );
}

// ── Helper Components ─────────────────────────────────────────────────────────

/** Compact numbered mode tab: "¹CHAT" or "²TASKS(3)" */
function CompactTab({
  n, label, badge, mode, active, onClick,
}: {
  n: number;
  label: string;
  badge?: number;
  mode: AppMode;
  active: AppMode;
  onClick: (m: AppMode) => void;
}) {
  const isActive = mode === active;
  const sup = ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹'][n] ?? String(n);
  const badgeStr = badge != null ? `(${badge})` : '';
  return (
    <Text
      color={isActive ? theme.colors.background : theme.colors.muted}
      backgroundColor={isActive ? theme.colors.primary : undefined}
      bold={isActive}
    >
      {' '}{sup}{label}{badgeStr}{' '}
    </Text>
  );
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
