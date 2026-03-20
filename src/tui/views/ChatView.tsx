/**
 * ChatView.tsx - AI 对话视图
 *
 * 功能:
 * - 流式 token 显示 (打字机效果)
 * - 消息气泡布局 (用户右对齐, AI 左对齐)
 * - 键盘滚动: ↑/↓, PgUp/PgDn, g/G (vim style)
 * - 工具调用内联可视
 * - 滚动位置指示器
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

export function ChatView({ messages, height, width, isFocused, streamingId }: ChatViewProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const prevMsgCount = useRef(messages.length);

  // Estimate lines per message for scroll calculations
  const lineEst = (msg: Message) => {
    const lines = msg.content.split('\n').length;
    const wrapLines = Math.ceil(msg.content.length / Math.max(1, width - 10));
    return Math.max(lines, wrapLines) + 2; // +2 for header + padding
  };

  // Content height minus header and footer hints
  const usableHeight = height - 2;

  // Compute visible window
  const allLines: { msgIdx: number; line: string }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    // Message header
    allLines.push({ msgIdx: i, line: `__header__:${i}` });
    // Content lines
    const contentLines = renderMessageLines(msg, width);
    for (const l of contentLines) {
      allLines.push({ msgIdx: i, line: l });
    }
    // Separator
    allLines.push({ msgIdx: i, line: '' });
  }

  const totalLines = allLines.length;
  const maxScroll = Math.max(0, totalLines - usableHeight);

  // Auto-scroll when new messages arrive (or streaming)
  useEffect(() => {
    const newCount = messages.length;
    const isNewMsg = newCount !== prevMsgCount.current;
    prevMsgCount.current = newCount;
    if (isNewMsg || streamingId) {
      setScrollOffset(maxScroll);
    }
  }, [messages.length, streamingId, maxScroll]);

  // Keyboard scrolling (vim + arrows)
  useInput((ch, key) => {
    if (!isFocused) return;

    if (key.upArrow || ch === 'k') {
      setScrollOffset(prev => Math.max(0, prev - 1));
    } else if (key.downArrow || ch === 'j') {
      setScrollOffset(prev => Math.min(maxScroll, prev + 1));
    } else if (key.pageUp || (key.ctrl && ch === 'u')) {
      setScrollOffset(prev => Math.max(0, prev - Math.floor(usableHeight / 2)));
    } else if (key.pageDown || (key.ctrl && ch === 'd')) {
      setScrollOffset(prev => Math.min(maxScroll, prev + Math.floor(usableHeight / 2)));
    } else if (ch === 'g') {
      setScrollOffset(0);
    } else if (ch === 'G') {
      setScrollOffset(maxScroll);
    }
  });

  const visibleLines = allLines.slice(scrollOffset, scrollOffset + usableHeight);
  const atBottom = scrollOffset >= maxScroll;
  const atTop = scrollOffset === 0;

  return (
    <Box
      flexDirection="column"
      height={height}
      width={width}
      borderStyle="single"
      borderColor={isFocused ? theme.colors.primary : theme.colors.border}
      overflow="hidden"
    >
      {/* Scroll indicator bar */}
      <Box height={1} flexShrink={0} paddingX={1}>
        <Text color={theme.colors.muted}>
          {isFocused ? (
            <>
              <Text color={theme.colors.accent}>● 对话</Text>
              <Text> j/k:滚动 g/G:顶/底 PgUp/PgDn</Text>
              {!atTop && <Text color={theme.colors.warning}>  ▲ 上方有更多</Text>}
              {!atBottom && <Text color={theme.colors.warning}>  ▼ 下方有更多</Text>}
            </>
          ) : (
            <>
              <Text color={theme.colors.muted}>○ 对话</Text>
              <Text color={theme.colors.muted}>  Tab:聚焦此面板</Text>
            </>
          )}
        </Text>
      </Box>

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {messages.length === 0 ? (
          <Box marginTop={2} flexDirection="column">
            <Text color={theme.colors.muted}>
              {' '}欢迎使用 HyperTerminal AI 对话{'\n'}
              {' '}• 直接输入消息与 AI 对话{'\n'}
              {' '}• 输入 /help 查看命令{'\n'}
              {' '}• 按 Ctrl+K 打开命令面板{'\n'}
              {' '}• 按 ? 查看快捷键帮助
            </Text>
          </Box>
        ) : (
          visibleLines.map((item, idx) => {
            if (item.line === '') return <Box key={`sep-${idx}`} height={1} />;

            if (item.line.startsWith('__header__:')) {
              const msgIdx = parseInt(item.line.split(':')[1]);
              const msg = messages[msgIdx];
              if (!msg) return null;
              return <MessageHeader key={`hdr-${msgIdx}`} message={msg} isStreaming={msg.id === streamingId} />;
            }

            const msg = messages[item.msgIdx];
            if (!msg) return null;
            return <MessageLine key={`${item.msgIdx}-${idx}`} line={item.line} role={msg.role} />;
          })
        )}
      </Box>
    </Box>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function MessageHeader({ message, isStreaming }: { message: Message; isStreaming: boolean }) {
  const timeStr = formatTime(message.timestamp);
  switch (message.role) {
    case 'user':
      return (
        <Box marginTop={1}>
          <Text color={theme.colors.accent} bold>▶ 你</Text>
          <Text color={theme.colors.muted}> {timeStr}</Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box marginTop={1}>
          <Text color={theme.colors.primary} bold>◆ Claude</Text>
          {isStreaming && <Text color={theme.colors.warning}> ⠿ 生成中...</Text>}
          {!isStreaming && message.tokenCount && (
            <Text color={theme.colors.muted}> {message.tokenCount} tok</Text>
          )}
          <Text color={theme.colors.muted}> {timeStr}</Text>
        </Box>
      );
    case 'tool':
      return (
        <Box marginTop={1}>
          <Text color={theme.colors.info} bold>🔧 工具</Text>
          <Text color={theme.colors.muted}> {timeStr}</Text>
        </Box>
      );
    default:
      return (
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>── 系统 {timeStr} ──</Text>
        </Box>
      );
  }
}

function MessageLine({ line, role }: { line: string; role: Message['role'] }) {
  const indent = role === 'user' ? '  ' : '  ';
  const color =
    role === 'user'
      ? theme.colors.text
      : role === 'assistant'
      ? theme.colors.text
      : role === 'tool'
      ? theme.colors.info
      : theme.colors.muted;

  return (
    <Box>
      <Text color={color}>{indent}{line}</Text>
    </Box>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderMessageLines(msg: Message, width: number): string[] {
  const maxWidth = Math.max(20, width - 8);
  const lines: string[] = [];
  for (const rawLine of msg.content.split('\n')) {
    if (rawLine.length <= maxWidth) {
      lines.push(rawLine);
    } else {
      // Word wrap
      const words = rawLine.split(' ');
      let current = '';
      for (const w of words) {
        if ((current + ' ' + w).trimStart().length <= maxWidth) {
          current = current ? current + ' ' + w : w;
        } else {
          if (current) lines.push(current);
          current = w;
        }
      }
      if (current) lines.push(current);
    }
  }
  return lines;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
