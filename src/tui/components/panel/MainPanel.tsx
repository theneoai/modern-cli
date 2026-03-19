/**
 * MainPanel - 重构后的主消息面板
 * 使用新的 TUI 架构: useScrollable, Focusable
 */

import React from 'react';
import { Box, Text, type Key } from 'ink';
import { theme, icons, formatTime, wrapTextLines } from '../../../theme/index.js';
import { useScrollable, useScrollableKeyboard } from '../../hooks/useScrollable.js';
import { FocusLayer } from '../../contexts/FocusContext.js';
import { Focusable } from '../ui/Focusable.js';
import type { Message } from '../../types/ui.js';

interface MainPanelProps {
  messages: Message[];
  height: number;
  width: number;
  focusId?: string;
}

export function MainPanel({ messages, height, width, focusId = 'main-panel' }: MainPanelProps) {
  // Estimate visible message count
  const visibleCount = Math.max(3, Math.floor((height - 6) / 2));
  
  // Use scrollable hook
  const scroll = useScrollable({
    totalItems: messages.length,
    visibleItems: visibleCount,
    onScroll: (state) => {
      // Scroll callback if needed
    },
  });
  
  // Keyboard handler
  const handleKey = useScrollableKeyboard(scroll, {
    enabled: true,
  });
  
  // Focus-aware key handler
  const onFocusKey = (input: string, key: Key): boolean => {
    return handleKey(input, key);
  };
  
  const visibleMessages = messages.slice(scroll.offset, scroll.offset + visibleCount);
  
  return (
    <Focusable
      id={focusId}
      layer={FocusLayer.CONTENT}
      showIndicator
      indicatorStyle="border"
      onKey={onFocusKey}
      width={width}
      height={height}
      flexDirection="column"
    >
      {/* Header */}
      <Box height={2} paddingX={1} flexShrink={0}>
        <Text color={theme.colors.primary} bold>
          {icons.agent} Terminal 
          <Text color={theme.colors.muted}> ({messages.length} messages</Text>
          {scroll.hasMoreAbove && <Text color={theme.colors.warning}> ↑more</Text>}
          {scroll.hasMoreBelow && <Text color={theme.colors.warning}> ↓more</Text>}
          <Text color={theme.colors.muted}>)</Text>
        </Text>
      </Box>

      {/* Top scroll indicator */}
      {scroll.hasMoreAbove && (
        <Box height={1} justifyContent="center" flexShrink={0}>
          <Text color={theme.colors.muted}>▲ Scroll up for more ▲</Text>
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          visibleMessages.map((msg) => (
            <MessageItem 
              key={msg.id} 
              message={msg} 
              width={width - 6}
            />
          ))
        )}
      </Box>

      {/* Bottom scroll indicator */}
      {scroll.hasMoreBelow && (
        <Box height={1} justifyContent="center" flexShrink={0}>
          <Text color={theme.colors.muted}>▼ Scroll down for more ▼</Text>
        </Box>
      )}

      {/* Footer hint */}
      <Box height={1} paddingX={1} flexShrink={0}>
        <Text color={theme.colors.muted}>
          ↑↓: Scroll | PgUp/PgDn: Page | Home/End: Top/Bottom
        </Text>
      </Box>
    </Focusable>
  );
}

function EmptyState() {
  return (
    <Box flexDirection="column">
      <Text color={theme.colors.muted} italic>
        No messages yet. Type something to start...
      </Text>
      <Text color={theme.colors.muted}>
        Try: /help | "Add task buy milk"
      </Text>
    </Box>
  );
}

interface MessageItemProps {
  message: Message;
  width: number;
}

function MessageItem({ message, width }: MessageItemProps) {
  const timeStr = formatTime(message.timestamp);
  const contentLines = wrapTextLines(message.content, width - 20);
  
  switch (message.type) {
    case 'system':
      return <SystemMessage time={timeStr} content={message.content} />;
    case 'user':
      return <UserMessage time={timeStr} content={message.content} />;
    default:
      return (
        <AgentMessage 
          time={timeStr} 
          content={message.content}
          contentLines={contentLines}
          agentName={message.agentName}
          agentIcon={message.agentIcon}
        />
      );
  }
}

interface SystemMessageProps {
  time: string;
  content: string;
}

function SystemMessage({ time, content }: SystemMessageProps) {
  return (
    <Box marginY={0.5} paddingX={1}>
      <Text color={theme.colors.muted}>[{time}] </Text>
      <Text color={theme.colors.info}>{content}</Text>
    </Box>
  );
}

interface UserMessageProps {
  time: string;
  content: string;
}

function UserMessage({ time, content }: UserMessageProps) {
  return (
    <Box marginY={0.5} paddingX={1}>
      <Text color={theme.colors.muted}>[{time}] </Text>
      <Text color={theme.colors.accent} bold>{icons.user} You: </Text>
      <Text color={theme.colors.text}>{content}</Text>
    </Box>
  );
}

interface AgentMessageProps {
  time: string;
  content: string;
  contentLines: string[];
  agentName?: string;
  agentIcon?: string;
}

function AgentMessage({ time, contentLines, agentName, agentIcon }: AgentMessageProps) {
  return (
    <Box marginY={0.5} flexDirection="column" paddingX={1}>
      <Box>
        <Text color={theme.colors.muted}>[{time}] </Text>
        <Text color={theme.colors.primary} bold>
          {agentIcon || icons.agent} {agentName || 'Agent'}: 
        </Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        {contentLines.map((line, i) => (
          <Text key={i} color={theme.colors.text}>{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
