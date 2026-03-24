/**
 * Header - 重构后的顶部栏组件
 * 使用新的 TUI 架构
 */


import { Box, Text } from 'ink';
import { tuiTheme as theme, icons } from '../../../theme/index.js';
import { FocusLayer } from '../../contexts/FocusContext.js';
import { Focusable } from '../ui/Focusable.js';
import type { TerminalSize } from '../../contexts/TUIProvider.js';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  version?: string;
  notifications?: number;
  isConnected?: boolean;
  terminalSize?: TerminalSize;
  showHelp?: boolean;
  focusId?: string;
}

export function Header({
  title = 'NEO',
  subtitle,
  version = 'v0.4.0',
  notifications = 0,
  isConnected = true,
  terminalSize,
  showHelp = true,
  focusId = 'header',
}: HeaderProps) {
  const sizeInfo = terminalSize 
    ? `${terminalSize.width}×${terminalSize.height}` 
    : '';
  
  return (
    <Focusable
      id={focusId}
      layer={FocusLayer.BACKGROUND}
      showIndicator={false}
      height={3}
      borderStyle="single"
      borderColor={theme.colors.primary}
      paddingX={1}
      flexDirection="row"
      alignItems="center"
    >
      {/* Left: Logo and title */}
      <Box width="30%">
        <Text color={theme.colors.primary} bold>
          {icons.logo} {title}
          <Text color={theme.colors.muted}> {version}</Text>
          {subtitle && (
            <Text color={theme.colors.muted}> | {subtitle}</Text>
          )}
        </Text>
      </Box>
      
      {/* Center: Help hint */}
      <Box flexGrow={1} justifyContent="center">
        {showHelp && (
          <Text color={theme.colors.muted}>
            {icons.sparkle} Press <Text color={theme.colors.accent} bold>Tab</Text> for commands
            {sizeInfo && (
              <Text color={theme.colors.muted}> | {sizeInfo}</Text>
            )}
          </Text>
        )}
      </Box>
      
      {/* Right: Status */}
      <Box width="30%" justifyContent="flex-end">
        {notifications > 0 && (
          <Box marginRight={2}>
            <Text color={theme.colors.warning} bold>
              {icons.bell} {notifications}
            </Text>
          </Box>
        )}
        <Box>
          <Text color={isConnected ? theme.colors.success : theme.colors.error}>
            {isConnected ? '●' : '○'}
          </Text>
          <Text color={theme.colors.muted}>
            {' '}{isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </Box>
      </Box>
    </Focusable>
  );
}

interface CompactHeaderProps {
  title?: string;
  isConnected?: boolean;
}

export function CompactHeader({
  title = 'NEO',
  isConnected = true,
}: CompactHeaderProps) {
  return (
    <Box
      height={1}
      paddingX={1}
    >
      <Text color={theme.colors.background} bold>
        {icons.logo} {title}
      </Text>
      <Box flexGrow={1} />
      <Text color={isConnected ? theme.colors.success : theme.colors.error}>
        {isConnected ? '●' : '○'}
      </Text>
    </Box>
  );
}

interface StatusItemProps {
  icon: string;
  label: string;
  value: string | number;
  color?: string;
}

export function StatusItem({ icon, label, value, color = theme.colors.text }: StatusItemProps) {
  return (
    <Box marginRight={2}>
      <Text color={color}>
        {icon} {label}: <Text bold>{value}</Text>
      </Text>
    </Box>
  );
}

interface StatusBarProps {
  items: StatusItemProps[];
}

export function StatusBar({ items }: StatusBarProps) {
  return (
    <Box 
      height={1} 
      paddingX={1}
      borderStyle="single"
      borderColor={theme.colors.border}
      flexDirection="row"
    >
      {items.map((item, index) => (
        <StatusItem key={index} {...item} />
      ))}
    </Box>
  );
}
