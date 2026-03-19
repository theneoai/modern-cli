import React from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../../theme/index.js';

interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  content: string;
}

const toastConfig = {
  success: {
    icon: icons.check,
    color: theme.colors.success,
    bgColor: theme.colors.surface,
  },
  error: {
    icon: icons.cross,
    color: theme.colors.error,
    bgColor: theme.colors.surface,
  },
  warning: {
    icon: icons.warning,
    color: theme.colors.warning,
    bgColor: theme.colors.surface,
  },
  info: {
    icon: icons.info,
    color: theme.colors.info,
    bgColor: theme.colors.surface,
  },
};

export function Toast({ type, content }: ToastProps) {
  const config = toastConfig[type];
  
  return (
    <Box 
      borderStyle="round" 
      borderColor={config.color}
      backgroundColor={config.bgColor}
      paddingX={1}
      paddingY={0}
    >
      <Text color={config.color}>{config.icon}</Text>
      <Text color={theme.colors.text}> {content}</Text>
    </Box>
  );
}
