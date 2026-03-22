/**
 * Selectable - 可选择列表组件
 * 提供统一的选择体验和键盘导航
 */

import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { tuiTheme as theme, icons } from '../../../theme/index.js';
import { useSelectable } from '../../hooks/useScrollable.js';
import { FocusLayer, useFocusZone } from '../../contexts/FocusContext.js';
import { type Key } from 'ink';

// ============================================================================
// Types
// ============================================================================

export interface SelectableProps<T> {
  items: T[];
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  onSelect?: (item: T, index: number) => void;
  onConfirm?: (item: T, index: number) => void;
  keyExtractor?: (item: T, index: number) => string;
  height: number;
  width?: number;
  initialIndex?: number;
  loop?: boolean;
  focusId?: string;
  focusLayer?: FocusLayer;
  showScrollbar?: boolean;
  emptyText?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

// ============================================================================
// Component
// ============================================================================

export function Selectable<T>({
  items,
  renderItem,
  onSelect,
  onConfirm,
  keyExtractor = (_, index) => String(index),
  height,
  width,
  initialIndex = 0,
  loop = true,
  focusId,
  focusLayer = FocusLayer.CONTENT,
  showScrollbar = false,
  emptyText = 'No items available',
  header,
  footer,
}: SelectableProps<T>) {
  const visibleItems = Math.max(3, height - (header ? 2 : 0) - (footer ? 2 : 0) - 2);
  
  const { state, actions } = useSelectable({
    totalItems: items.length,
    visibleItems,
    initialIndex,
    loop,
    onSelect: (index) => onSelect?.(items[index], index),
    onConfirm: (index) => onConfirm?.(items[index], index),
  });
  
  // Handle keyboard input
  const handleKey = (_input: string, key: Key): boolean => {
    const extKey = key as typeof key & { home?: boolean; end?: boolean };
    if (key.upArrow) {
      actions.moveUp();
      return true;
    }
    if (key.downArrow) {
      actions.moveDown();
      return true;
    }
    if (key.return) {
      actions.confirm();
      return true;
    }
    if (extKey.home) {
      actions.moveToFirst();
      return true;
    }
    if (extKey.end) {
      actions.moveToLast();
      return true;
    }
    return false;
  };
  
  // Register focus zone if focusId is provided
  if (focusId) {
    useFocusZone({
      id: focusId,
      layer: focusLayer,
      captureInput: true,
      onKey: handleKey,
    });
  }
  
  const visibleRange = state.visibleRange;
  const visibleItemsList = items.slice(visibleRange.start, visibleRange.end);
  
  const hasItems = items.length > 0;
  const hasMoreAbove = visibleRange.start > 0;
  const hasMoreBelow = visibleRange.end < items.length;
  
  // Calculate scrollbar
  const scrollbar = useMemo(() => {
    if (!showScrollbar || !hasItems) return null;
    
    const barHeight = Math.max(1, Math.floor(visibleItems * (visibleItems / items.length)));
    const progress = items.length > 0 ? state.selectedIndex / items.length : 0;
    const barPosition = Math.floor(progress * (visibleItems - barHeight));
    
    return (
      <Box flexDirection="column" width={1}>
        {Array.from({ length: visibleItems }).map((_, i) => (
          <Text key={i} color={theme.colors.muted}>
            {i >= barPosition && i < barPosition + barHeight ? '█' : '░'}
          </Text>
        ))}
      </Box>
    );
  }, [showScrollbar, hasItems, visibleItems, items.length, state.selectedIndex]);
  
  return (
    <Box flexDirection="column" height={height} width={width}>
      {/* Header */}
      {header && (
        <Box flexShrink={0} marginBottom={1}>
          {header}
        </Box>
      )}
      
      {/* Top indicator */}
      {hasMoreAbove && (
        <Box height={1} flexShrink={0}>
          <Text color={theme.colors.muted}>
            {icons.arrowUp} {visibleRange.start} more
          </Text>
        </Box>
      )}
      
      {/* Items */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexGrow={1} flexDirection="column">
          {hasItems ? (
            visibleItemsList.map((item, idx) => {
              const actualIndex = visibleRange.start + idx;
              const isSelected = actualIndex === state.selectedIndex;
              return (
                <Box key={keyExtractor(item, actualIndex)}>
                  {renderItem(item, actualIndex, isSelected)}
                </Box>
              );
            })
          ) : (
            <Text color={theme.colors.muted} italic>{emptyText}</Text>
          )}
        </Box>
        
        {/* Scrollbar */}
        {scrollbar && (
          <Box flexShrink={0} marginLeft={1}>
            {scrollbar}
          </Box>
        )}
      </Box>
      
      {/* Bottom indicator */}
      {hasMoreBelow && (
        <Box height={1} flexShrink={0}>
          <Text color={theme.colors.muted}>
            {icons.arrowDown} {items.length - visibleRange.end} more
          </Text>
        </Box>
      )}
      
      {/* Footer */}
      {footer && (
        <Box flexShrink={0} marginTop={1}>
          {footer}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// Selectable Item Component
// ============================================================================

export interface SelectableItemProps {
  isSelected: boolean;
  children: React.ReactNode;
  indicator?: 'arrow' | 'dot' | 'bracket' | 'highlight' | 'none';
  onPress?: () => void;
  disabled?: boolean;
}

export function SelectableItem({
  isSelected,
  children,
  indicator = 'arrow',
  onPress: _onPress,
  disabled: _disabled = false,
}: SelectableItemProps) {
  const content = useMemo(() => {
    switch (indicator) {
      case 'arrow':
        return (
          <Box>
            <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
              {isSelected ? '> ' : '  '}
            </Text>
            {children}
          </Box>
        );
      case 'dot':
        return (
          <Box>
            <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
              {isSelected ? '● ' : '○ '}
            </Text>
            {children}
          </Box>
        );
      case 'bracket':
        return (
          <Box>
            <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
              {'['}
            </Text>
            {children}
            <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
              {']'}
            </Text>
          </Box>
        );
      case 'highlight':
        return (
          <Box 
            backgroundColor={isSelected ? theme.colors.surfaceLight : undefined}
            paddingX={isSelected ? 1 : 0}
          >
            <Text 
              color={isSelected ? theme.colors.primary : theme.colors.text}
              bold={isSelected}
            >
              {children}
            </Text>
          </Box>
        );
      case 'none':
      default:
        return <>{children}</>;
    }
  }, [isSelected, indicator, children]);
  
  return (
    <Box marginY={0.5}>
      {content}
    </Box>
  );
}
