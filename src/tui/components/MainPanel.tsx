import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme, icons, formatTime, wrapTextLines } from '../../theme/index.js';
import type { Message } from '../App.js';

interface MainPanelProps {
  messages: Message[];
  height: number;
  width: number;
}

export function MainPanel({ messages, height, width }: MainPanelProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const messagesEndRef = useRef<null>(null);

  // Estimate message height (each message takes ~2-4 rows)
  const maxVisibleMessages = Math.max(3, Math.floor((height - 6) / 2));
  
  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > maxVisibleMessages) {
      setScrollOffset(Math.max(0, messages.length - maxVisibleMessages));
    }
  }, [messages.length, maxVisibleMessages]);

  // Handle scrolling
  useInput((_, key) => {
    // Only handle scroll keys when main panel is focused
    if (key.upArrow) {
      setScrollOffset(prev => Math.max(0, prev - 1));
    }
    if (key.downArrow) {
      setScrollOffset(prev => Math.min(
        Math.max(0, messages.length - maxVisibleMessages),
        prev + 1
      ));
    }
    if (key.pageUp) {
      setScrollOffset(prev => Math.max(0, prev - maxVisibleMessages));
    }
    if (key.pageDown) {
      setScrollOffset(prev => Math.min(
        Math.max(0, messages.length - maxVisibleMessages),
        prev + maxVisibleMessages
      ));
    }
    if (key.home) {
      setScrollOffset(0);
    }
    if (key.end) {
      setScrollOffset(Math.max(0, messages.length - maxVisibleMessages));
    }
  });

  const visibleMessages = messages.slice(scrollOffset, scrollOffset + maxVisibleMessages);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + maxVisibleMessages < messages.length;

  return (
    <Box 
      flexDirection="column"
      height={height}
      borderStyle="single"
      borderColor={theme.colors.border}
      backgroundColor={theme.colors.background}
    >
      {/* Header with scroll indicators */}
      <Box height={2} paddingX={1} flexShrink={0}>
        <Text color={theme.colors.primary} bold>
          {icons.agent} Terminal 
          <Text color={theme.colors.muted}> ({messages.length} messages</Text>
          {hasMoreAbove && <Text color={theme.colors.warning}> ↑more</Text>}
          {hasMoreBelow && <Text color={theme.colors.warning}> ↓more</Text>}
          <Text color={theme.colors.muted}>)</Text>
        </Text>
      </Box>

      {/* Scroll indicator - top */}
      {hasMoreAbove && (
        <Box height={1} justifyContent="center" flexShrink={0}>
          <Text color={theme.colors.muted}>▲ Scroll up for more ▲</Text>
        </Box>
      )}

      {/* Messages area */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {messages.length === 0 ? (
          <Text color={theme.colors.muted} italic>
            No messages yet. Type something to start...
            {'\n'}Try: /help | "Add task buy milk"
          </Text>
        ) : (
          visibleMessages.map((msg) => (
            <MessageItem 
              key={msg.id} 
              message={msg} 
              width={width - 4}
            />
          ))
        )}
      </Box>

      {/* Scroll indicator - bottom */}
      {hasMoreBelow && (
        <Box height={1} justifyContent="center" flexShrink={0}>
          <Text color={theme.colors.muted}>▼ Scroll down for more ▼</Text>
        </Box>
      )}

      {/* Footer with hint */}
      <Box height={1} paddingX={1} flexShrink={0}>
        <Text color={theme.colors.muted}>
          ↑↓: Scroll | PgUp/PgDn: Page | Home/End: Top/Bottom
        </Text>
      </Box>
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
  
  if (message.type === 'system') {
    return (
      <Box 
        marginY={0.5} 
        paddingX={1}
      >
        <Text color={theme.colors.muted}>[{timeStr}] </Text>
        <Text color={theme.colors.info}>{message.content}</Text>
      </Box>
    );
  }
  
  if (message.type === 'user') {
    return (
      <Box 
        marginY={0.5} 
        paddingX={1}
      >
        <Text color={theme.colors.muted}>[{timeStr}] </Text>
        <Text color={theme.colors.accent} bold>{icons.user} You: </Text>
        <Text color={theme.colors.text}>{message.content}</Text>
      </Box>
    );
  }
  
  // Agent message
  return (
    <Box 
      marginY={0.5} 
      flexDirection="column"
      paddingX={1}
    >
      <Box>
        <Text color={theme.colors.muted}>[{timeStr}] </Text>
        <Text color={theme.colors.primary} bold>
          {message.agentIcon || icons.agent} {message.agentName || 'Agent'}: 
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
