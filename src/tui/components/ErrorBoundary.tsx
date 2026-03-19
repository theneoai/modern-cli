import React, { Component, type ReactNode } from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../../theme/index.js';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary for TUI
 * Catches React rendering errors and displays a friendly message
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    console.error('TUI Error:', error);
    console.error('Error Info:', errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box 
          flexDirection="column" 
          padding={2}
          borderStyle="double"
          borderColor={theme.colors.error}
        >
          <Box marginBottom={1}>
            <Text color={theme.colors.error} bold>
              {icons.error} Something went wrong
            </Text>
          </Box>
          
          <Box marginBottom={1}>
            <Text color={theme.colors.textMuted}>
              The UI encountered an error. You can:
            </Text>
          </Box>
          
          <Box flexDirection="column" marginBottom={1}>
            <Text color={theme.colors.text}>
              1. Press R to try recovering
            </Text>
            <Text color={theme.colors.text}>
              2. Press ESC to exit and restart
            </Text>
          </Box>
          
          {this.state.error && (
            <Box 
              marginTop={1} 
              padding={1} 
              borderStyle="single" 
              borderColor={theme.colors.border}
            >
              <Text color={theme.colors.muted}>
                Error: {this.state.error.message}
              </Text>
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}
