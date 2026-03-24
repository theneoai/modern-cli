import { useState, useCallback, useEffect, useReducer } from 'react';
import { Box, Text } from 'ink';
import { tuiTheme as theme, icons, layout } from '../../theme/index.js';
import { useRawInput } from '../hooks/useRawInput.js';
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

// ── Input reducer — atomic updates, no stale-closure bugs ──────────────────────
interface InputState { value: string; cursor: number }

type InputAction =
  | { type: 'insert'; ch: string }
  | { type: 'backspace' }
  | { type: 'delete_fwd' }
  | { type: 'cursor_left' }
  | { type: 'cursor_right' }
  | { type: 'cursor_home' }
  | { type: 'cursor_end' }
  | { type: 'clear' }
  | { type: 'set_value'; value: string };

function inputReducer(state: InputState, action: InputAction): InputState {
  const { value, cursor } = state;
  switch (action.type) {
    case 'backspace':
      if (cursor > 0) return { value: value.slice(0, cursor - 1) + value.slice(cursor), cursor: cursor - 1 };
      return state;
    case 'delete_fwd':
      if (cursor < value.length) return { value: value.slice(0, cursor) + value.slice(cursor + 1), cursor };
      return state;
    case 'insert': {
      const nv = value.slice(0, cursor) + action.ch + value.slice(cursor);
      return nv.length <= layout.maxInputLength ? { value: nv, cursor: cursor + action.ch.length } : state;
    }
    case 'cursor_left':  return { value, cursor: Math.max(0, cursor - 1) };
    case 'cursor_right': return { value, cursor: Math.min(value.length, cursor + 1) };
    case 'cursor_home':  return { value, cursor: 0 };
    case 'cursor_end':   return { value, cursor: value.length };
    case 'clear':        return { value: '', cursor: 0 };
    case 'set_value':    return { value: action.value, cursor: action.value.length };
  }
}

export function InputBar({ onSubmit, mode, width, isFocused = true }: InputBarProps) {
  const [inputState, dispatch] = useReducer(inputReducer, { value: '', cursor: 0 });
  const { value: input, cursor: cursorPosition } = inputState;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const { addToHistory, navigateHistory, resetHistoryIndex } = useInputHistory();

  const handleSubmit = useCallback(() => {
    if (input.trim()) {
      onSubmit(input);
      addToHistory(input);
      resetHistoryIndex();
      dispatch({ type: 'clear' });
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

  useRawInput((key) => {
    // Suggestion navigation
    if (suggestions.length > 0) {
      if (key.down) { setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1)); return; }
      if (key.up)   { setSelectedSuggestion(prev => Math.max(0, prev - 1)); return; }
      if (key.tab || (key.return && suggestions[selectedSuggestion])) {
        const suggestion = suggestions[selectedSuggestion];
        dispatch({ type: 'set_value', value: suggestion.command + ' ' });
        setSuggestions([]);
        return;
      }
    }

    // ESC clears input when text is present
    if (key.escape) {
      if (input.length > 0) { dispatch({ type: 'clear' }); setSuggestions([]); }
      return;
    }

    if (key.return) { handleSubmit(); return; }

    // History navigation
    if (key.up && suggestions.length === 0) {
      const { newInput, newIndex } = navigateHistory('up', input);
      if (newIndex !== -1) dispatch({ type: 'set_value', value: newInput });
      return;
    }
    if (key.down && suggestions.length === 0) {
      const { newInput } = navigateHistory('down', input);
      dispatch({ type: 'set_value', value: newInput });
      return;
    }

    // Cursor movement
    if (key.left)  { dispatch({ type: 'cursor_left' });  return; }
    if (key.right) { dispatch({ type: 'cursor_right' }); return; }
    if (key.home || (key.ctrl && key.char === 'a')) { dispatch({ type: 'cursor_home' }); return; }
    if (key.end  || (key.ctrl && key.char === 'e')) { dispatch({ type: 'cursor_end' });  return; }

    // Ctrl shortcuts
    if (key.ctrl && key.char === 'u') { dispatch({ type: 'clear' }); setSuggestions([]); return; }

    // Deletion
    if (key.delete)    { dispatch({ type: 'delete_fwd' }); return; }
    if (key.backspace) { dispatch({ type: 'backspace' });   return; }

    // Printable character input
    if (key.char && !key.ctrl && !key.meta) {
      dispatch({ type: 'insert', ch: key.char[0]! });
    }
  }, isFocused);

  // Calculate visible portion of input (for very long lines)
  const maxVisibleChars = width - 15;
  const start = input.length > maxVisibleChars
    ? Math.max(0, Math.min(cursorPosition - Math.floor(maxVisibleChars / 2), input.length - maxVisibleChars))
    : 0;
  const visibleInput = input.slice(start, start + maxVisibleChars);
  const actualCursorPos = cursorPosition - start;

  return (
    <Box flexDirection="column" width={width}>
      {/* Suggestions dropdown */}
      {suggestions.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.colors.border}
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
            <Text color={theme.colors.muted}>Type a message... (Tab for commands)</Text>
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
