/**
 * InputBar - 重构后的输入栏组件
 * 使用新的 TUI 架构: useKeyboard, useToast, useModal
 */

import { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { tuiTheme as theme, icons, layout as layoutConfig } from '../../../theme/index.js';
import { useToast } from '../../contexts/ToastContext.js';
import { useModal, type PaletteItem } from '../../contexts/ModalContext.js';
import { useTUI } from '../../contexts/TUIProvider.js';

export interface InputBarProps {
  onSubmit?: (input: string) => void;
  placeholder?: string;
  mode?: 'command' | 'chat';
  focusId?: string;
}

// Command suggestions
const commandSuggestions: PaletteItem[] = [
  { id: 'help', label: '/help', description: 'Show help', icon: icons.info },
  { id: 'tasks', label: '/tasks', description: 'Show all tasks', icon: icons.check },
  { id: 'task-add', label: '/task add', description: 'Create new task', icon: icons.add },
  { id: 'calendar', label: '/calendar', description: 'Show calendar', icon: icons.calendar },
  { id: 'emails', label: '/emails', description: 'Show emails', icon: icons.email },
  { id: 'meetings', label: '/meetings', description: 'Show meetings', icon: icons.meeting },
  { id: 'agents', label: '/agents', description: 'List agents', icon: icons.agent },
  { id: 'clear', label: '/clear', description: 'Clear screen', icon: '🧹' },
  { id: 'exit', label: '/exit', description: 'Exit', icon: '🚪' },
];

export function InputBar({
  onSubmit,
  placeholder = 'Type a message... (Tab for commands)',
  mode = 'chat',
  focusId: _focusId = 'input-bar',
}: InputBarProps) {
  const { layout } = useTUI();
  const { showInfo, showSuccess } = useToast();
  const { openPalette } = useModal();
  useStdout();
  
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<PaletteItem[]>([]);
  
  // Filter suggestions when input changes
  useEffect(() => {
    if (input.startsWith('/') && input.length > 0) {
      const filtered = commandSuggestions.filter(s =>
        s.label?.toLowerCase().startsWith(input.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0 && input.length > 1);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [input]);
  
  // Handle keyboard input
  useInput((value, key) => {
    if (key.return) {
      if (input.trim()) {
        handleSubmit(input);
      }
      return;
    }
    
    if (key.tab) {
      openPalette({
        items: commandSuggestions,
        placeholder: 'Search commands...',
        onSelect: (item) => {
          if (item.label) {
            setInput(item.label + ' ');
          }
        },
      });
      return;
    }
    
    if (key.ctrl && value === 'c') {
      showInfo('Press ESC to exit');
      return;
    }
  });
  
  const handleSubmit = useCallback((value: string) => {
    // Check for commands
    if (value.startsWith('/')) {
      handleCommand(value);
    } else {
      // Regular message
      onSubmit?.(value);
      showSuccess(`Sent: ${value.slice(0, 30)}${value.length > 30 ? '...' : ''}`);
    }
    setInput('');
  }, [onSubmit, showSuccess]);
  
  const handleCommand = useCallback((cmd: string) => {
    const parts = cmd.trim().split(' ');
    const command = parts[0].toLowerCase();
    
    switch (command) {
      case '/help':
        showInfo('Available commands: /tasks, /calendar, /emails, /exit');
        break;
      case '/clear':
        console.clear();
        showInfo('Screen cleared');
        break;
      case '/exit':
        showInfo('Use ESC to exit');
        break;
      default:
        onSubmit?.(cmd);
    }
  }, [onSubmit, showInfo]);
  
  const maxVisibleChars = layout.layoutSizes.width - 20;
  let visibleInput = input;

  if (input.length > maxVisibleChars) {
    const start = Math.max(0, input.length - maxVisibleChars);
    visibleInput = input.slice(start);
  }
  
  return (
    <Box flexDirection="column" width={layout.layoutSizes.width}>
      {/* Suggestions dropdown */}
      {showSuggestions && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.colors.border}
          backgroundColor={theme.colors.surface}
          marginBottom={1}
          paddingX={1}
        >
          {suggestions.slice(0, 5).map((suggestion, index) => (
            <Box key={suggestion.id} paddingY={0.5}>
              <Text color={index === 0 ? theme.colors.primary : theme.colors.text}>
                {index === 0 ? icons.arrow + ' ' : '  '}
                <Text bold>{suggestion.label}</Text>
                <Text color={theme.colors.muted}> - {suggestion.description}</Text>
              </Text>
            </Box>
          ))}
        </Box>
      )}
      
      {/* Input bar */}
      <Box
        height={layout.layoutSizes.inputBarHeight}
        borderStyle="single"
        borderColor={showSuggestions ? theme.colors.primary : theme.colors.primary}
        paddingX={1}
        alignItems="center"
        flexShrink={0}
      >
        {/* Mode indicator */}
        <Box width={3} flexShrink={0}>
          <Text color={theme.colors.primary} bold>
            {mode === 'command' ? '>' : icons.chat}
          </Text>
        </Box>
        
        {/* Input area */}
        <Box flexGrow={1}>
          {input.length === 0 ? (
            <Text color={theme.colors.muted}>{placeholder}</Text>
          ) : (
            <TextInput
              value={visibleInput}
              onChange={(newValue) => {
                if (newValue.length <= layoutConfig.maxInputLength) {
                  setInput(newValue);
                }
              }}
              placeholder={placeholder}
              focus={true}
            />
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
