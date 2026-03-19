/**
 * Toast - 通知组件
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../../../theme/index.js';
import type { ToastMessage, ToastType } from '../../contexts/ToastContext.js';

// ============================================================================
// Types
// ============================================================================

export interface ToastProps {
  toast: ToastMessage;
}

// ============================================================================
// Component
// ============================================================================

const toastConfig: Record<ToastType, { icon: string; color: string; bgColor?: string }> = {
  success: { icon: icons.checkHeavy, color: theme.colors.success },
  error: { icon: icons.error, color: theme.colors.error },
  warning: { icon: icons.warning, color: theme.colors.warning },
  info: { icon: icons.info, color: theme.colors.info },
};

export function Toast({ toast }: ToastProps) {
  const config = toastConfig[toast.type];
  
  return (
    <Box 
      paddingX={2} 
      paddingY={1}
      borderStyle="round"
      borderColor={config.color}
      backgroundColor={theme.colors.surface}
    >
      <Text color={config.color} bold>
        {config.icon}
      </Text>
      <Text color={theme.colors.text}>
        {' '}{toast.content}
      </Text>
    </Box>
  );
}

// ============================================================================
// Toast Container Component
// ============================================================================

export interface ToastContainerProps {
  toasts: ToastMessage[];
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center';
  maxVisible?: number;
}

export function ToastContainer({ 
  toasts, 
  position = 'top-right',
  maxVisible = 5,
}: ToastContainerProps) {
  const visibleToasts = useMemo(() => {
    return toasts.slice(-maxVisible);
  }, [toasts, maxVisible]);
  
  if (visibleToasts.length === 0) {
    return null;
  }
  
  // Calculate position
  const getMargin = () => {
    switch (position) {
      case 'top-left':
        return { marginTop: 1, marginLeft: 1 };
      case 'top-right':
        return { marginTop: 1, marginRight: 1 };
      case 'bottom-left':
        return { marginBottom: 1, marginLeft: 1 };
      case 'bottom-right':
        return { marginBottom: 1, marginRight: 1 };
      case 'top-center':
        return { marginTop: 1 };
      default:
        return { marginTop: 1, marginRight: 1 };
    }
  };
  
  const isBottom = position.startsWith('bottom');
  
  return (
    <Box 
      position="absolute" 
      flexDirection="column"
      alignItems={position.includes('right') ? 'flex-end' : position.includes('center') ? 'center' : 'flex-start'}
      {...getMargin()}
    >
      {visibleToasts.map((toast, index) => (
        <Box 
          key={toast.id} 
          marginTop={isBottom ? 0 : (index > 0 ? 1 : 0)}
          marginBottom={isBottom ? (index > 0 ? 1 : 0) : 0}
        >
          <Toast toast={toast} />
        </Box>
      ))}
    </Box>
  );
}

// ============================================================================
// Simple Toast Component (for standalone use)
// ============================================================================

export interface SimpleToastProps {
  type: ToastType;
  content: string;
}

export function SimpleToast({ type, content }: SimpleToastProps) {
  const config = toastConfig[type];
  
  return (
    <Box 
      paddingX={2} 
      paddingY={1}
      borderStyle="round"
      borderColor={config.color}
    >
      <Text color={config.color} bold>
        {config.icon}
      </Text>
      <Text color={theme.colors.text}>
        {' '}{content}
      </Text>
    </Box>
  );
}
