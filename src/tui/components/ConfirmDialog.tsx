
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme, icons } from '../../theme/index.js';

interface ConfirmDialogProps {
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  useInput((input) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N') {
      onCancel();
    }
  });

  return (
    <Box 
      position="absolute" 
      marginLeft={10}
      marginTop={10}
      width={50}
      height={message ? 8 : 6}
      borderStyle="double"
      borderColor={theme.colors.warning}
      flexDirection="column"
      padding={1}
    >
      <Box marginBottom={1}>
        <Text color={theme.colors.warning} bold>
          {icons.warning} {title}
        </Text>
      </Box>
      
      {message && (
        <Box marginBottom={1}>
          <Text color={theme.colors.textMuted}>
            {message}
          </Text>
        </Box>
      )}
      
      <Box marginTop={message ? 0 : 1}>
        <Text color={theme.colors.text}>
          <Text backgroundColor={theme.colors.primary} color={theme.colors.background}> Y </Text>
          <Text color={theme.colors.muted}> yes  </Text>
          <Text backgroundColor={theme.colors.border} color={theme.colors.text}> N </Text>
          <Text color={theme.colors.muted}> no</Text>
        </Text>
      </Box>
    </Box>
  );
}
