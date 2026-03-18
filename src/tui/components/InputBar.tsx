import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { theme, icons } from '../theme.js';

interface InputBarProps {
  onSubmit: (input: string) => void;
  mode: 'command' | 'chat';
}

export function InputBar({ onSubmit, mode }: InputBarProps) {
  const [input, setInput] = useState('');
  const [placeholder, setPlaceholder] = useState('Type a message...');

  useInput((_, key) => {
    if (key.return) {
      if (input.trim()) {
        onSubmit(input);
        setInput('');
      }
    }
  });

  return (
    <Box 
      height={3} 
      borderStyle="single" 
      borderColor={theme.colors.primary}
      paddingX={1}
      alignItems="center"
    >
      <Box width={3}>
        <Text color={theme.colors.primary} bold>
          {mode === 'command' ? '>' : '💬'}
        </Text>
      </Box>
      
      <Box flexGrow={1}>
        <TextInput
          value={input}
          onChange={setInput}
          placeholder={placeholder}
          focus={true}
        />
      </Box>

      <Box width={25} justifyContent="flex-end">
        <Text color={theme.colors.muted}>
          Tab: Commands | ESC: Exit
        </Text>
      </Box>
    </Box>
  );
}
