import React from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../theme.js';

interface HeaderProps {
  title: string;
  subtitle: string;
  notifications?: number;
}

export function Header({ title, subtitle, notifications = 0 }: HeaderProps) {
  return (
    <Box 
      height={3} 
      borderStyle="single" 
      borderColor={theme.colors.primary}
      paddingX={1}
      alignItems="center"
    >
      <Box width="30%">
        <Text color={theme.colors.primary} bold>
          {icons.logo} {title} <Text color={theme.colors.muted}>{subtitle}</Text>
        </Text>
      </Box>
      
      <Box flexGrow={1} justifyContent="center">
        <Text color={theme.colors.muted}>
          {icons.sparkle} Press <Text color={theme.colors.accent}>Tab</Text> for commands | <Text color={theme.colors.accent}>ESC</Text> to exit
        </Text>
      </Box>
      
      <Box width="30%" justifyContent="flex-end">
        {notifications > 0 && (
          <Text color={theme.colors.warning}>
            {icons.bell} {notifications}
          </Text>
        )}
        <Box marginLeft={2}>
          <Text color={theme.colors.success}>●</Text>
          <Text color={theme.colors.muted}> Connected</Text>
        </Box>
      </Box>
    </Box>
  );
}
