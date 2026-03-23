import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { tuiTheme as theme, icons, layout } from '../../theme/index.js';
import { useInputHistory } from '../hooks/useTasks.js';

interface InputBarProps {
  onSubmit: (input: string) => void;
  mode: 'command' | 'chat';
  width: number;
  isFocused?: boolean;
}

interface Suggestion {
  command: string;
  description: string;
}

const commandSuggestions: Suggestion[] = [
  { command: '/help', description: 'Show help' },
  { command: '/tasks', description: 'Show all tasks' },
  { command: '/task add', description: 'Create new task' },
  { command: '/calendar', description: 'Show calendar' },
  { command: '/emails', description: 'Show emails' },
  { command: '/meetings', description: 'Show meetings' },
  { command: '/agents', description: 'List agents' },
  { command: '/orgs', description: 'List organizations' },
  { command: '/refresh', description: 'Sync data' },
  { command: '/clear', description: 'Clear screen' },
  { command: '/exit', description: 'Exit' },
];

export function InputBar({ onSubmit, mode, width, isFocused = true }: InputBarProps) {
  const [input, setInput] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [placeholder] = useState('Type a message... (Tab for commands)');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  useStdout();
  
  const { addToHistory, navigateHistory, resetHistoryIndex } = useInputHistory();

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      onSubmit(input);
      addToHistory(input);
      resetHistoryIndex();
      setInput('');
      setCursorPosition(0);
      setSuggestions([]);
    }
  }, [input, onSubmit, addToHistory, resetHistoryIndex]);

  // Update suggestions when input changes
  useEffect(() => {
    if (input.startsWith('/') && input.length > 0) {
      const filtered = commandSuggestions.filter(s => 
        s.command.startsWith(input.toLowerCase()) && s.command !== input.toLowerCase()
      );
      setSuggestions(filtered.slice(0, 5));
      setSelectedSuggestion(0);
    } else {
      setSuggestions([]);
    }
  }, [input]);

  useInput((value, key) => {
    const extKey = key as typeof key & { home?: boolean; end?: boolean };
    
    // Handle suggestion navigation
    if (suggestions.length > 0) {
      if (key.downArrow) {
        setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
      if (key.upArrow) {
        setSelectedSuggestion(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.tab || (key.return && suggestions[selectedSuggestion])) {
        const suggestion = suggestions[selectedSuggestion];
        setInput(suggestion.command + ' ');
        setCursorPosition(suggestion.command.length + 1);
        setSuggestions([]);
        return;
      }
    }

    // ESC clears input when text is present; otherwise lets App handle exit
    if (key.escape) {
      if (input.length > 0) {
        setInput('');
        setCursorPosition(0);
        setSuggestions([]);
      }
      return;
    }

    if (key.return) {
      handleSubmit();
      return;
    }

    // History navigation
    if (key.upArrow && suggestions.length === 0) {
      const { newInput, newIndex } = navigateHistory('up', input);
      if (newIndex !== -1) {
        setInput(newInput);
        setCursorPosition(newInput.length);
      }
      return;
    }

    if (key.downArrow && suggestions.length === 0) {
      const { newInput } = navigateHistory('down', input);
      setInput(newInput);
      setCursorPosition(newInput.length);
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

    if (extKey.home) {
      setCursorPosition(0);
      return;
    }

    if (extKey.end) {
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

    if (key.backspace || value === '\x7f') {
      if (cursorPosition > 0) {
        const newInput = input.slice(0, cursorPosition - 1) + input.slice(cursorPosition);
        setInput(newInput);
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    // Character input - handle one character at a time
    if (value && !key.ctrl && !key.meta) {
      // Filter out backspace bytes and escape sequences (mouse events, etc)
      if (value === '\x7f' || value === '\b') return;
      const cleanValue = value.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      if (cleanValue.length === 0) return;
      
      const char = cleanValue[0];
      const newInput = input.slice(0, cursorPosition) + char + input.slice(cursorPosition);
      if (newInput.length <= layout.maxInputLength) {
        setInput(newInput);
        setCursorPosition(cursorPosition + 1);
      }
    }

    // Ctrl+U: clear line
    if (key.ctrl && value === 'u') {
      setInput('');
      setCursorPosition(0);
      setSuggestions([]);
      return;
    }

    // Ctrl+C: interrupt (handled by parent)
    if (key.ctrl && value === 'c') {
      return;
    }
  }, { isActive: isFocused });

  // Calculate visible portion of input (for very long lines)
  const maxVisibleChars = width - 15;
  let visibleInput = input;
  let cursorOffset = 0;
  
  if (input.length > maxVisibleChars) {
    const start = Math.max(0, Math.min(cursorPosition - Math.floor(maxVisibleChars / 2), input.length - maxVisibleChars));
    const end = Math.min(input.length, start + maxVisibleChars);
    visibleInput = input.slice(start, end);
    cursorOffset = start;
  }

  const actualCursorPos = cursorPosition - cursorOffset;

  return (
    <Box 
      flexDirection="column"
      width={width}
    >
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <Box 
          flexDirection="column" 
          borderStyle="single" 
          borderColor={theme.colors.border}
          backgroundColor={theme.colors.surface}
          marginBottom={1}
          paddingX={1}
        >
          {suggestions.map((suggestion, index) => (
            <Box key={suggestion.command} paddingY={0.5}>
              <Text 
                color={index === selectedSuggestion ? theme.colors.primary : theme.colors.text}
                backgroundColor={index === selectedSuggestion ? theme.colors.surfaceLight : undefined}
              >
                {index === selectedSuggestion ? icons.arrow + ' ' : '  '}
                <Text bold>{suggestion.command}</Text>
                <Text color={theme.colors.muted}> - {suggestion.description}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}
      
      {/* Input bar */}
      <Box
        height={3}
        borderStyle="single"
        borderColor={isFocused || suggestions.length > 0 ? theme.colors.primary : theme.colors.border}
        paddingX={1}
        width={width}
      >
        {/* Mode indicator */}
        <Box width={3} flexShrink={0}>
          <Text color={theme.colors.primary} bold>
            {mode === 'command' ? '>' : icons.chat}
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
            <Text color={input.length > 900 ? theme.colors.warning : theme.colors.muted}>
              {input.length}/{layout.maxInputLength}
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
    </Box>
  );
}
