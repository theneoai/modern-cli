/**
 * Footer - 重构后的底部栏组件
 * 使用新的 TUI 架构
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../../../theme/index.js';
import { FocusLayer } from '../../contexts/FocusContext.js';
import { Focusable } from '../ui/Focusable.js';
import type { ViewType } from '../../contexts/ViewContext.js';

interface FooterProps {
  currentView?: ViewType;
  shortcuts?: Shortcut[];
  version?: string;
  focusId?: string;
}

export interface Shortcut {
  key: string;
  description: string;
}

const defaultShortcuts: Shortcut[] = [
  { key: 'Tab', description: 'Commands' },
  { key: 'ESC', description: 'Exit' },
];

const viewNames: Record<string, string> = {
  'chat': 'Chat',
  'tasks': 'Tasks',
  'calendar': 'Calendar',
  'email': 'Email',
  'settings': 'Settings',
  'workbench-dashboard': 'Dashboard',
  'workbench-messages': 'Messages',
  'workbench-tasks': 'Team Tasks',
  'workbench-calendar': 'Calendar',
  'workbench-workflows': 'Workflows',
  'workbench-team': 'Team',
};

export function Footer({
  currentView = 'chat',
  shortcuts = defaultShortcuts,
  version = 'v0.2.0',
  focusId = 'footer',
}: FooterProps) {
  const viewName = viewNames[currentView] || currentView;
  
  return (
    <Focusable
      id={focusId}
      layer={FocusLayer.BACKGROUND}
      showIndicator={false}
      height={1}
      borderStyle="single"
      borderColor={theme.colors.border}
      paddingX={1}
      flexDirection="row"
      alignItems="center"
    >
      {/* Left: Current view */}
      <Box width="20%">
        <Text color={theme.colors.muted}>
          {viewName}
        </Text>
      </Box>
      
      {/* Center: Shortcuts */}
      <Box flexGrow={1} justifyContent="center">
        <Text color={theme.colors.muted}>
          {shortcuts.map((shortcut, index) => (
            <Text key={shortcut.key}>
              {index > 0 && <Text> | </Text>}
              <Text color={theme.colors.primary} bold>{shortcut.key}</Text>
              <Text>:{shortcut.description}</Text>
            </Text>
          ))}
        </Text>
      </Box>
      
      {/* Right: Version */}
      <Box width="20%" justifyContent="flex-end">
        <Text color={theme.colors.muted}>
          {version}
        </Text>
      </Box>
    </Focusable>
  );
}

interface CompactFooterProps {
  message?: string;
}

export function CompactFooter({ message = 'HyperTerminal' }: CompactFooterProps) {
  return (
    <Box
      height={1}
      paddingX={1}
      backgroundColor={theme.colors.border}
    >
      <Text color={theme.colors.muted}>
        {message}
      </Text>
    </Box>
  );
}

interface NavigationFooterProps {
  items: { key: string; label: string }[];
  activeKey?: string;
}

export function NavigationFooter({ items, activeKey }: NavigationFooterProps) {
  return (
    <Box
      height={1}
      paddingX={1}
      borderStyle="single"
      borderColor={theme.colors.border}
      flexDirection="row"
    >
      {items.map((item) => (
        <Box key={item.key} marginRight={2}>
          <Text 
            color={item.key === activeKey ? theme.colors.primary : theme.colors.muted}
            bold={item.key === activeKey}
          >
            {item.key}:{item.label}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
