import React from 'react';
import { Box, Text, ScrollArea } from 'ink';
import { theme, icons, formatTime } from '../theme.js';
import type { Message } from '../App.js';

interface MainPanelProps {
  messages: Message[];
}

export function MainPanel({ messages }: MainPanelProps) {
  return (
    <Box 
      flexGrow={1} 
      flexDirection="column" 
      padding={1}
      borderStyle="single"
      borderColor={theme.colors.border}
      backgroundColor={theme.colors.background}
    >
      <Text color={theme.colors.primary} bold>
        {icons.agent} Terminal
      </Text>
      
      <Box flexDirection="column" marginTop={1} flexGrow={1} overflow="hidden">
        {messages.length === 0 ? (
          <Text color={theme.colors.muted} italic>
            No messages yet. Type something to start...
          </Text>
        ) : (
          messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} />
          ))
        )}
      </Box>
    </Box>
  );
}

function MessageItem({ message }: { message: Message }) {
  const timeStr = formatTime(message.timestamp);
  
  if (message.type === 'system') {
    return (
      <Box marginY={0.5}>
        <Text color={theme.colors.muted}>[{timeStr}] </Text>
        <Text color={theme.colors.info}>{message.content}</Text>
      </Box>
    );
  }
  
  if (message.type === 'user') {
    return (
      <Box marginY={0.5}>
        <Text color={theme.colors.muted}>[{timeStr}] </Text>
        <Text color={theme.colors.accent} bold>{icons.user} You: </Text>
        <Text color={theme.colors.text}>{message.content}</Text>
      </Box>
    );
  }
  
  // Agent message
  return (
    <Box marginY={0.5} flexDirection="column">
      <Box>
        <Text color={theme.colors.muted}>[{timeStr}] </Text>
        <Text color={theme.colors.primary} bold>
          {message.agentIcon || icons.agent} {message.agentName || 'Agent'}: 
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={theme.colors.text}>{message.content}</Text>
      </Box>
    </Box>
  );
}
