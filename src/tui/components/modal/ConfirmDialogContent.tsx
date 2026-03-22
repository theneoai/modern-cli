/**
 * ConfirmDialogContent - 确认对话框内容组件
 */

import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme, icons } from '../../../theme/index.js';
import type { ConfirmOptions } from '../../contexts/ModalContext.js';
import { useModal } from '../../contexts/ModalContext.js';

// ============================================================================
// Component
// ============================================================================

export function ConfirmDialogContent(options: ConfirmOptions) {
  const { 
    title, 
    message, 
    confirmLabel = 'Yes', 
    cancelLabel = 'No',
    type = 'info',
    onConfirm, 
    onCancel 
  } = options;
  
  const { closeActive } = useModal();
  
  const icon = useMemo(() => {
    switch (type) {
      case 'warning': return icons.warning;
      case 'danger': return icons.error;
      case 'info':
      default: return icons.info;
    }
  }, [type]);
  
  const color = useMemo(() => {
    switch (type) {
      case 'warning': return theme.colors.warning;
      case 'danger': return theme.colors.error;
      case 'info':
      default: return theme.colors.info;
    }
  }, [type]);
  
  useInput((input, key) => {
    if (key.return || input.toLowerCase() === 'y') {
      closeActive();
      onConfirm();
    } else if (key.escape || input.toLowerCase() === 'n') {
      closeActive();
      onCancel?.();
    }
  });
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Title with icon */}
      <Box marginBottom={1}>
        <Text color={color} bold>
          {icon} {title}
        </Text>
      </Box>
      
      {/* Message */}
      {message && (
        <Box marginBottom={1}>
          <Text color={theme.colors.text}>{message}</Text>
        </Box>
      )}
      
      {/* Buttons hint */}
      <Box marginTop={1}>
        <Text color={theme.colors.muted}>
          <Text color={theme.colors.primary} bold>[Enter/{confirmLabel}]</Text>
          {' '}to confirm,{' '}
          <Text color={theme.colors.muted} bold>[ESC/{cancelLabel}]</Text>
          {' '}to cancel
        </Text>
      </Box>
    </Box>
  );
}

// ============================================================================
// Standalone Confirm Dialog (for backward compatibility)
// ============================================================================


export interface ConfirmDialogProps {
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Box 
      position="absolute"
      marginTop={5}
      width={50}
      height={10}
      borderStyle="double"
      borderColor={theme.colors.warning}
      backgroundColor={theme.colors.surface}
      flexDirection="column"
      padding={1}
    >
      <ConfirmDialogContent 
        title={title}
        message={message}
        onConfirm={onConfirm}
        onCancel={onCancel}
        type="warning"
      />
    </Box>
  );
}
