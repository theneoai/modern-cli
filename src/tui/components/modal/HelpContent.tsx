/**
 * HelpContent - 帮助内容组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import { tuiTheme, icons } from '../../../theme/index.js';

interface HelpSection {
  title: string;
  items: { key: string; description: string }[];
}

const helpSections: HelpSection[] = [
  {
    title: 'Navigation',
    items: [
      { key: 'Tab', description: 'Open command palette' },
      { key: 'ESC', description: 'Close modal or exit' },
      { key: '↑/↓', description: 'Navigate up/down' },
      { key: 'PgUp/PgDn', description: 'Page up/down' },
      { key: 'Home/End', description: 'Go to top/bottom' },
    ],
  },
  {
    title: 'Commands',
    items: [
      { key: '/help', description: 'Show this help' },
      { key: '/tasks', description: 'Show all tasks' },
      { key: '/task add', description: 'Create new task' },
      { key: '/clear', description: 'Clear screen' },
      { key: '/exit', description: 'Exit application' },
    ],
  },
  {
    title: 'Task Management',
    items: [
      { key: 'C', description: 'Complete selected task' },
      { key: 'D', description: 'Delete selected task' },
      { key: 'S', description: 'Cycle task status' },
      { key: 'V', description: 'Toggle completed view' },
    ],
  },
  {
    title: 'Sidebar',
    items: [
      { key: '1', description: 'Calendar tab' },
      { key: '2', description: 'Email tab' },
      { key: '3', description: 'Meetings tab' },
      { key: '←/→', description: 'Switch tabs' },
    ],
  },
];

export function HelpContent() {
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color={tuiTheme.colors.primary} bold>
          {icons.info} Keyboard Shortcuts & Commands
        </Text>
      </Box>
      
      {helpSections.map((section) => (
        <Box key={section.title} flexDirection="column" marginY={1}>
          <Text color={tuiTheme.colors.accent} bold>
            {section.title}
          </Text>
          
          {section.items.map((item) => (
            <Box key={item.key} marginY={0.5} paddingLeft={2}>
              <Text color={tuiTheme.colors.primary} bold>
                {item.key.padEnd(12)}
              </Text>
              <Text color={tuiTheme.colors.text}>
                {item.description}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
      
      <Box marginTop={1} borderStyle="single" borderColor={tuiTheme.colors.border} paddingX={1}>
        <Text color={tuiTheme.colors.muted}>
          Press ESC to close this help dialog
        </Text>
      </Box>
    </Box>
  );
}

export function QuickHelp() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color={tuiTheme.colors.primary} bold>
        Quick Help
      </Text>
      <Box marginTop={1}>
        <Text color={tuiTheme.colors.muted}>
          <Text color={tuiTheme.colors.primary}>Tab</Text> - Commands | 
          <Text color={tuiTheme.colors.primary}>ESC</Text> - Exit | 
          <Text color={tuiTheme.colors.primary}>F1</Text> - Help
        </Text>
      </Box>
    </Box>
  );
}
