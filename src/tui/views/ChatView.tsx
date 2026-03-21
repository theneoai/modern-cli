/**
 * ChatView.tsx — 心流对话视图
 *
 * 视觉层次设计:
 *   用户消息  ▸ 右边距  accent 色标注
 *   AI 消息   │ 左边线  primary 色缩进块
 *   系统消息  ── 分割线  muted 色居中
 *
 * 消息分组: 同角色连续消息合并头部，减少视觉噪音
 * 流式光标: 末尾闪烁块，清晰感知生成状态
 * 滚动感知: 顶/底指示仅在溢出时显示
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme } from '../../theme/index.js';
import type { Message } from '../FlowApp.js';

interface ChatViewProps {
  messages: Message[];
  height: number;
  width: number;
  isFocused: boolean;
  streamingId: string | null;
}

// A rendered "line" unit for the scroll buffer
type LineEntry =
  | { kind: 'spacer' }
  | { kind: 'divider'; time: string }
  | { kind: 'user-header'; time: string }
  | { kind: 'user-line'; text: string; last: boolean }
  | { kind: 'ai-header'; streaming: boolean; tokCount?: number; time: string }
  | { kind: 'ai-line'; text: string; streaming: boolean; last: boolean }
  | { kind: 'sys-line'; text: string };

export function ChatView({ messages, height, width, isFocused, streamingId }: ChatViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevMsgCount = useRef(messages.length);

  const innerWidth = Math.max(20, width - 4); // inside border padding

  // Build line buffer
  const lines = buildLines(messages, innerWidth, streamingId);
  const totalLines = lines.length;
  const usableHeight = height - 2; // minus border
  const maxScroll = Math.max(0, totalLines - usableHeight);

  // Auto-scroll to bottom on new messages / streaming
  useEffect(() => {
    const isNew = messages.length !== prevMsgCount.current;
    prevMsgCount.current = messages.length;
    if (isNew || streamingId) setScrollOffset(maxScroll);
  }, [messages.length, streamingId, maxScroll]);

  useInput((ch, key) => {
    if (!isFocused) return;
    if (key.upArrow   || ch === 'k') setScrollOffset(p => Math.max(0, p - 1));
    else if (key.downArrow  || ch === 'j') setScrollOffset(p => Math.min(maxScroll, p + 1));
    else if (key.pageUp     || (key.ctrl && ch === 'u')) setScrollOffset(p => Math.max(0, p - Math.floor(usableHeight / 2)));
    else if (key.pageDown   || (key.ctrl && ch === 'd')) setScrollOffset(p => Math.min(maxScroll, p + Math.floor(usableHeight / 2)));
    else if (ch === 'g') setScrollOffset(0);
    else if (ch === 'G') setScrollOffset(maxScroll);
  });

  const visible = lines.slice(scrollOffset, scrollOffset + usableHeight);
  const atBottom = scrollOffset >= maxScroll;
  const atTop = scrollOffset === 0;
  const scrollPct = maxScroll > 0 ? Math.floor((scrollOffset / maxScroll) * 100) : 100;

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      borderStyle="single"
      borderColor={isFocused ? theme.colors.primary : theme.colors.border}
      overflow="hidden"
    >
      {/* Top bar: scroll indicator */}
      <Box height={1} flexShrink={0} paddingX={1}>
        {!atTop && (
          <Text color={theme.colors.warning}>↑ </Text>
        )}
        <Text color={isFocused ? theme.colors.accent : theme.colors.muted} bold={isFocused}>
          {isFocused ? '● ' : '○ '}
        </Text>
        <Text color={theme.colors.muted}>
          {messages.length > 0 ? `${messages.length} 条消息` : '对话'}
        </Text>
        {maxScroll > 0 && (
          <Text color={theme.colors.muted}>{`  ${scrollPct}%`}</Text>
        )}
        {isFocused && maxScroll > 0 && (
          <Text color={theme.colors.muted}>  j/k  g/G  PgUp/PgDn</Text>
        )}
        {!atBottom && (
          <Text color={theme.colors.warning}> ↓ 更多</Text>
        )}
      </Box>

      {/* Message area */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          visible.map((line, i) => <RenderLine key={i} line={line} width={innerWidth} />)
        )}
      </Box>
    </Box>
  );
}

// ── Line Renderer ─────────────────────────────────────────────────────────────

function RenderLine({ line, width }: { line: LineEntry; width: number }) {
  switch (line.kind) {
    case 'spacer':
      return <Box height={1} />;

    case 'divider':
      return (
        <Box>
          <Text color={theme.colors.border}>{'─'.repeat(Math.floor(width * 0.3))}</Text>
          <Text color={theme.colors.muted}> {line.time} </Text>
          <Text color={theme.colors.border}>{'─'.repeat(Math.floor(width * 0.3))}</Text>
        </Box>
      );

    case 'user-header':
      return (
        <Box marginTop={1}>
          <Text color={theme.colors.accent} bold>▸ 你</Text>
          <Text color={theme.colors.muted}> {line.time}</Text>
        </Box>
      );

    case 'user-line':
      return (
        <Box paddingLeft={2}>
          <Text color={theme.colors.text}>{line.text}</Text>
          {line.last && <Text color={theme.colors.accent}>  </Text>}
        </Box>
      );

    case 'ai-header':
      return (
        <Box marginTop={1}>
          <Text color={theme.colors.primary} bold>◆ Claude</Text>
          {line.streaming && <StreamCursor />}
          {!line.streaming && line.tokCount != null && line.tokCount > 0 && (
            <Text color={theme.colors.muted}> {line.tokCount}tok</Text>
          )}
          <Text color={theme.colors.muted}> {line.time}</Text>
        </Box>
      );

    case 'ai-line':
      return (
        <Box paddingLeft={0}>
          <Text color={theme.colors.primary}>│</Text>
          <Text color={theme.colors.text}> {line.text}</Text>
          {line.streaming && line.last && <StreamCursor />}
        </Box>
      );

    case 'sys-line':
      return (
        <Box paddingLeft={1}>
          <Text color={theme.colors.muted}>{line.text}</Text>
        </Box>
      );
  }
}

// ── Build Line Buffer ─────────────────────────────────────────────────────────

function buildLines(messages: Message[], width: number, streamingId: string | null): LineEntry[] {
  const lines: LineEntry[] = [];
  const msgWidth = Math.max(20, width - 6);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = messages[i - 1];
    const isStreaming = msg.id === streamingId;
    const timeStr = fmtTime(msg.timestamp);

    // Show divider if gap > 5 min between user-messages
    if (prev && msg.role === 'user' && prev.role !== 'user') {
      const gap = msg.timestamp.getTime() - prev.timestamp.getTime();
      if (gap > 5 * 60 * 1000) {
        lines.push({ kind: 'divider', time: timeStr });
      }
    }

    const isSameRole = prev?.role === msg.role;

    switch (msg.role) {
      case 'user': {
        if (!isSameRole) {
          lines.push({ kind: 'user-header', time: timeStr });
        }
        const wrapped = wordWrap(msg.content, msgWidth);
        wrapped.forEach((text, j) =>
          lines.push({ kind: 'user-line', text, last: j === wrapped.length - 1 })
        );
        break;
      }

      case 'assistant': {
        if (!isSameRole) {
          lines.push({ kind: 'ai-header', streaming: isStreaming, tokCount: msg.tokenCount, time: timeStr });
        } else if (isStreaming) {
          // Update last header streaming status (can't mutate, so just add indicator)
          lines.push({ kind: 'sys-line', text: '' });
        }
        const content = msg.content || (isStreaming ? '…' : '');
        const wrapped = wordWrap(content, msgWidth - 2); // -2 for border char
        wrapped.forEach((text, j) =>
          lines.push({ kind: 'ai-line', text, streaming: isStreaming, last: j === wrapped.length - 1 })
        );
        break;
      }

      case 'system': {
        lines.push({ kind: 'spacer' });
        const wrapped = wordWrap(msg.content, msgWidth);
        for (const text of wrapped) {
          lines.push({ kind: 'sys-line', text });
        }
        break;
      }

      default: {
        const wrapped = wordWrap(msg.content, msgWidth);
        for (const text of wrapped) {
          lines.push({ kind: 'sys-line', text });
        }
      }
    }
  }

  return lines;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StreamCursor() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn(p => !p), 500);
    return () => clearInterval(t);
  }, []);
  return <Text color={theme.colors.warning}>{on ? ' █' : '  '}</Text>;
}

function EmptyState() {
  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      <Text color={theme.colors.primary} bold>◆ NEO — AI 原生超级终端</Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>直接输入与 AI 对话，或使用快捷命令:</Text>
        <Text color={theme.colors.muted}> </Text>
        <Text color={theme.colors.text}>  /c  <Text color={theme.colors.muted}>生成代码</Text>   /d  <Text color={theme.colors.muted}>调试分析</Text>   /rs <Text color={theme.colors.muted}>深度研究</Text></Text>
        <Text color={theme.colors.text}>  /w  <Text color={theme.colors.muted}>写作助手</Text>   /tr <Text color={theme.colors.muted}>翻译</Text>      /sm <Text color={theme.colors.muted}>摘要总结</Text></Text>
        <Text color={theme.colors.muted}> </Text>
        <Text color={theme.colors.text}>  /plan  <Text color={theme.colors.muted}>规划今日</Text>   /sup <Text color={theme.colors.muted}>站会内容</Text>   /rev <Text color={theme.colors.muted}>工作回顾</Text></Text>
        <Text color={theme.colors.muted}> </Text>
        <Text color={theme.colors.muted}>  Ctrl+K 命令面板   Ctrl+T 快速任务   Ctrl+N 新对话</Text>
      </Box>
    </Box>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wordWrap(text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= maxWidth) { result.push(raw); continue; }
    const words = raw.split(' ');
    let cur = '';
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (candidate.length <= maxWidth) { cur = candidate; }
      else { if (cur) result.push(cur); cur = w; }
    }
    if (cur) result.push(cur);
  }
  return result.length > 0 ? result : [''];
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
