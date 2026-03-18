import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { theme, icons } from '../theme.js';

interface CommandPaletteProps {
  onSelect: (command: string) => void;
  onClose: () => void;
}

interface CommandItem {
  label: string;
  value: string;
  description: string;
  icon: string;
}

const commands: CommandItem[] = [
  { label: 'View Calendar', value: '/calendar', description: 'Show full calendar', icon: icons.calendar },
  { label: 'View Emails', value: '/emails', description: 'Show all emails', icon: icons.email },
  { label: 'View Meetings', value: '/meetings', description: 'Show all meetings', icon: icons.meeting },
  { label: 'View Tasks', value: '/tasks', description: 'Show all tasks', icon: icons.task },
  { label: 'Create Task', value: '/task add ', description: 'Add new task', icon: icons.add },
  { label: 'Agent List', value: '/agents', description: 'List all agents', icon: icons.agent },
  { label: 'Organization', value: '/orgs', description: 'List organizations', icon: '⚙️' },
  { label: 'Refresh Data', value: '/refresh', description: 'Sync Google data', icon: '🔄' },
  { label: 'Help', value: '/help', description: 'Show help', icon: '❓' },
  { label: 'Clear Screen', value: '/clear', description: 'Clear terminal', icon: '🧹' },
  { label: 'Exit', value: '/exit', description: 'Exit HyperTerminal', icon: '🚪' },
];

export function CommandPalette({ onSelect, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const filteredCommands = search 
    ? commands.filter(cmd => 
        cmd.label.toLowerCase().includes(search.toLowerCase()) ||
        cmd.description.toLowerCase().includes(search.toLowerCase())
      )
    : commands;

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    
    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      return;
    }
    
    if (key.downArrow) {
      setSelectedIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
      return;
    }
    
    if (key.return) {
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        onSelect(cmd.value);
      }
      return;
    }
  });

  return (
    <Box 
      position="absolute" 
      marginLeft={25}
      marginTop={10}
      width={50} 
      height={20}
      borderStyle="double"
      borderColor={theme.colors.primary}
      backgroundColor={theme.colors.surface}
      flexDirection="column"
      padding={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          {icons.search} Command Palette
        </Text>
      </Box>

      <Box marginBottom={1}>
        <TextInput
          value={search}
          onChange={setSearch}
          placeholder="Type to search..."
          focus={true}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {filteredCommands.map((cmd, index) => (
          <Box 
            key={cmd.value}
            paddingY={0.5}
            paddingX={1}
            backgroundColor={index === selectedIndex ? theme.colors.primary : undefined}
          >
            <Text color={index === selectedIndex ? theme.colors.background : theme.colors.text}>
              {cmd.icon} <Text bold>{cmd.label}</Text>
              <Text color={index === selectedIndex ? theme.colors.background : theme.colors.muted}> - {cmd.description}</Text>
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor={theme.colors.border} paddingTop={1}>
        <Text color={theme.colors.muted}>
          ↑↓ Navigate | Enter Select | ESC Close
        </Text>
      </Box>
    </Box>
  );
}
