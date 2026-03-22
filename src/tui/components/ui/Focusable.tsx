/**
 * Focusable - 可聚焦容器组件
 * 提供焦点状态视觉反馈和键盘事件处理
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { tuiTheme as theme } from '../../../theme/index.js';
import { useFocusZone, FocusLayer } from '../../contexts/FocusContext.js';
import { type Key } from 'ink';

// ============================================================================
// Types
// ============================================================================

export interface FocusableProps {
  id: string;
  layer?: FocusLayer;
  priority?: number;
  captureInput?: boolean;
  disabled?: boolean;
  showIndicator?: boolean;      // 是否显示焦点指示器
  indicatorStyle?: 'border' | 'background' | 'arrow' | 'none';
  children: React.ReactNode;
  onFocus?: () => void;
  onBlur?: () => void;
  onKey?: (input: string, key: Key) => boolean;
  width?: number | string;
  height?: number | string;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  margin?: number;
  flexGrow?: number;
  flexDirection?: 'row' | 'column';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
  borderStyle?: 'single' | 'double' | 'round' | 'bold' | 'singleDouble' | 'doubleSingle' | 'classic';
  borderColor?: string;
  backgroundColor?: string;
}

// ============================================================================
// Component
// ============================================================================

export function Focusable({
  id,
  layer = FocusLayer.CONTENT,
  priority = 0,
  captureInput = false,
  disabled = false,
  showIndicator = true,
  indicatorStyle = 'border',
  children,
  onFocus,
  onBlur,
  onKey,
  width,
  height,
  padding = 0,
  paddingX,
  paddingY,
  margin = 0,
  flexGrow,
  flexDirection = 'column',
  alignItems,
  justifyContent,
  borderStyle = 'single',
  borderColor,
  backgroundColor,
}: FocusableProps) {
  const { isActive } = useFocusZone({
    id,
    layer,
    priority,
    captureInput,
    disabled,
    onFocus,
    onBlur,
    onKey,
  });
  
  // Calculate border color based on focus state
  const effectiveBorderColor = useMemo(() => {
    if (!showIndicator || indicatorStyle !== 'border') {
      return borderColor || theme.colors.border;
    }
    return isActive ? theme.colors.primary : (borderColor || theme.colors.border);
  }, [isActive, showIndicator, indicatorStyle, borderColor]);
  
  // Calculate background color based on focus state
  const effectiveBackgroundColor = useMemo(() => {
    if (!showIndicator || indicatorStyle !== 'background') {
      return backgroundColor;
    }
    return isActive ? theme.colors.surfaceLight : backgroundColor;
  }, [isActive, showIndicator, indicatorStyle, backgroundColor]);
  
  return (
    <Box
      width={width}
      height={height}
      padding={padding}
      paddingX={paddingX}
      paddingY={paddingY}
      margin={margin}
      flexGrow={flexGrow}
      flexDirection={flexDirection}
      alignItems={alignItems}
      justifyContent={justifyContent}
      borderStyle={borderStyle}
      borderColor={effectiveBorderColor}
      backgroundColor={effectiveBackgroundColor}
    >
      {indicatorStyle === 'arrow' && isActive && (
        <Box marginRight={1}>
          <Text color={theme.colors.primary}>{'>'}</Text>
        </Box>
      )}
      {children}
    </Box>
  );
}

// ============================================================================
// Focus Indicator Component
// ============================================================================

export interface FocusIndicatorProps {
  isFocused: boolean;
  style?: 'dot' | 'arrow' | 'bracket' | 'highlight';
  children: React.ReactNode;
}

export function FocusIndicator({ isFocused, style = 'arrow', children }: FocusIndicatorProps) {
  const indicator = useMemo(() => {
    switch (style) {
      case 'dot':
        return isFocused ? <Text color={theme.colors.primary}>● </Text> : <Text>  </Text>;
      case 'arrow':
        return isFocused ? <Text color={theme.colors.primary}>{'> '}</Text> : <Text>{'  '}</Text>;
      case 'bracket':
        return (
          <>
            <Text color={isFocused ? theme.colors.primary : theme.colors.muted}>[</Text>
            {children}
            <Text color={isFocused ? theme.colors.primary : theme.colors.muted}>]</Text>
          </>
        );
      case 'highlight':
        return (
          <Text 
            color={isFocused ? theme.colors.primary : theme.colors.text}
            bold={isFocused}
            backgroundColor={isFocused ? theme.colors.surfaceLight : undefined}
          >
            {children}
          </Text>
        );
      default:
        return children;
    }
  }, [isFocused, style, children]);
  
  if (style === 'bracket' || style === 'highlight') {
    return <>{indicator}</>;
  }
  
  return (
    <Box flexDirection="row">
      {indicator}
      {children}
    </Box>
  );
}

// ============================================================================
// Focus Border Component
// ============================================================================

export interface FocusBorderProps {
  isFocused: boolean;
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  activeColor?: string;
  inactiveColor?: string;
  padding?: number;
}

export function FocusBorder({
  isFocused,
  children,
  width,
  height,
  activeColor = theme.colors.primary,
  inactiveColor = theme.colors.border,
  padding = 1,
}: FocusBorderProps) {
  return (
    <Box
      width={width}
      height={height}
      borderStyle="single"
      borderColor={isFocused ? activeColor : inactiveColor}
      padding={padding}
    >
      {children}
    </Box>
  );
}
