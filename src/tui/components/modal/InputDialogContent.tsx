/**
 * InputDialogContent - 输入对话框内容组件
 */

import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { tuiTheme as theme, icons } from '../../../theme/index.js';
import type { InputOptions } from '../../contexts/ModalContext.js';
import { useModal } from '../../contexts/ModalContext.js';

// ============================================================================
// Component
// ============================================================================

export function InputDialogContent(options: InputOptions) {
  const { title, placeholder, defaultValue = '', onSubmit, onCancel, validate } = options;
  const { closeActive } = useModal();
  
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  
  const handleSubmit = () => {
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    
    closeActive();
    onSubmit(value);
  };
  
  useInput((_input, key) => {
    if (key.escape) {
      closeActive();
      onCancel?.();
      return;
    }
    
    if (key.return && !key.shift) {
      handleSubmit();
      return;
    }
  });
  
  return (
    <Box flexDirection="column" padding={1}>
      {/* Title */}
      <Box marginBottom={1}>
        <Text color={theme.colors.primary} bold>
          {icons.edit} {title}
        </Text>
      </Box>
      
      {/* Input */}
      <Box marginBottom={1}>
        <TextInput
          value={value}
          onChange={(newValue) => {
            setValue(newValue);
            setError(null);
          }}
          placeholder={placeholder}
          focus={true}
        />
      </Box>
      
      {/* Error message */}
      {error && (
        <Box marginBottom={1}>
          <Text color={theme.colors.error}>
            {icons.error} {error}
          </Text>
        </Box>
      )}
      
      {/* Footer hint */}
      <Box marginTop={1}>
        <Text color={theme.colors.muted}>
          <Text color={theme.colors.primary} bold>[Enter]</Text>
          {' '}to confirm,{' '}
          <Text color={theme.colors.muted} bold>[ESC]</Text>
          {' '}to cancel
        </Text>
      </Box>
    </Box>
  );
}
