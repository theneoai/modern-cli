import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { theme, icons } from '../theme.js';

interface InputBarProps {
  onSubmit: (input: string) => void;
  mode: 'command' | 'chat';
  width: number;
}

export function InputBar({ onSubmit, mode, width }: InputBarProps) {
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [placeholder, setPlaceholder] = useState('Type a message...');
  const { stdout } = useStdout();

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      onSubmit(input);
      setHistory(prev => [...prev, input]);
      setHistoryIndex(-1);
      setInput('');
      setCursorPosition(0);
    }
  }, [input, onSubmit]);

  useInput((value, key) => {
    if (key.return) {
      handleSubmit();
      return;
    }

    // History navigation
    if (key.upArrow) {
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || '');
        setCursorPosition((history[history.length - 1 - newIndex] || '').length);
      }
      return;
    }

    if (key.downArrow) {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(history[history.length - 1 - newIndex] || '');
        setCursorPosition((history[history.length - 1 - newIndex] || '').length);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInput('');
        setCursorPosition(0);
      }
      return;
    }

    // Cursor movement
    if (key.leftArrow) {
      setCursorPosition(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.rightArrow) {
      setCursorPosition(prev => Math.min(input.length, prev + 1));
      return;
    }

    if (key.home) {
      setCursorPosition(0);
      return;
    }

    if (key.end) {
      setCursorPosition(input.length);
      return;
    }

    // Deletion
    if (key.delete) {
      if (cursorPosition < input.length) {
        const newInput = input.slice(0, cursorPosition) + input.slice(cursorPosition + 1);
        setInput(newInput);
      }
      return;
    }

    if (key.backspace) {
      if (cursorPosition > 0) {
        const newInput = input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
        setInput(newInput);
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    // Character input
    if (value && !key.ctrl && !key.meta) {
      const newInput = input.slice(0, cursorPosition) + value + input.slice(cursorPosition);
      if (newInput.length <= 1000) { // Max length limit
        setInput(newInput);
        setCursorPosition(cursorPosition + value.length);
      }
    }

    // Ctrl+U: clear line
    if (key.ctrl && value === 'u') {
      setInput('');
      setCursorPosition(0);
      return;
    }

    // Ctrl+C: interrupt (handled by parent)
    if (key.ctrl && value === 'c') {
      return;
    }
  });

  // Calculate visible portion of input (for very long lines)
  const maxVisibleChars = width - 15; // Leave room for prompt and hints
  let visibleInput = input;
  let cursorOffset = 0;
  
  if (input.length > maxVisibleChars) {
    // Show input around cursor position
    const start = Math.max(0, Math.min(cursorPosition - Math.floor(maxVisibleChars / 2), input.length - maxVisibleChars));
    const end = Math.min(input.length, start + maxVisibleChars);
    visibleInput = input.slice(start, end);
    cursorOffset = start;
  }

  const actualCursorPos = cursorPosition - cursorOffset;

  return (
    <Box 
      height={3} 
      borderStyle="single" 
      borderColor={theme.colors.primary}
      paddingX={1}
      width={width}
    >
      {/* Mode indicator */}
      <Box width={3} flexShrink={0}>
        <Text color={theme.colors.primary} bold>
          {mode === 'command' ? '>' : '💬'}
        </Text>
      </Box>
      
      {/* Input area */}
      <Box flexGrow={1} flexDirection="column">
        {input.length === 0 ? (
          <Text color={theme.colors.muted}>{placeholder}</Text>
        ) : (
          <Box>
            <Text color={theme.colors.text}>{visibleInput.slice(0, actualCursorPos)}</Text>
            <Text color={theme.colors.background} backgroundColor={theme.colors.primary}>
              {visibleInput[actualCursorPos] || ' '}
            </Text>
            <Text color={theme.colors.text}>{visibleInput.slice(actualCursorPos + 1)}</Text>
          </Box>
        )}
        
        {/* Character count for long inputs */}
        {input.length > 100 && (
          <Text color={theme.colors.muted}>
            {input.length}/1000
          </Text>
        )}
      </Box>

      {/* Right side hints */}
      <Box width={22} justifyContent="flex-end" flexShrink={0}>
        <Text color={theme.colors.muted}>
          Tab:Cmds | ESC:Exit
        </Text>
      </Box>
    </Box>
  );
}
