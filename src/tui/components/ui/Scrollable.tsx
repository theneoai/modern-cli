/**
 * Scrollable - 可滚动容器组件
 * 提供滚动状态指示和统一滚动体验
 */

import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { tuiTheme as theme, icons } from '../../../theme/index.js';
import { useScrollable, useScrollableKeyboard } from '../../hooks/useScrollable.js';
import { type Key } from 'ink';

// ============================================================================
// Types
// ============================================================================

export interface ScrollableProps {
  children: React.ReactNode;
  totalItems: number;
  visibleItems: number;
  height: number;
  width?: number;
  showIndicators?: boolean;
  showScrollBar?: boolean;
  onScroll?: (offset: number) => void;
  onKey?: (input: string, key: Key) => boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  emptyState?: React.ReactNode;
  borderColor?: string;
  padding?: number;
}

// ============================================================================
// Component
// ============================================================================

export function Scrollable({
  children,
  totalItems,
  visibleItems,
  height,
  width,
  showIndicators = true,
  showScrollBar = false,
  onScroll,
  onKey,
  header,
  footer,
  emptyState,
  borderColor = theme.colors.border,
  padding = 1,
}: ScrollableProps) {
  const scroll = useScrollable({
    totalItems,
    visibleItems,
    onScroll: (state) => onScroll?.(state.offset),
  });
  
  // Handle keyboard navigation
  const handleKey = useScrollableKeyboard(scroll, {
    enabled: true,
  });
  
  // Combined key handler
  const onKeyHandler = (input: string, key: Key): boolean => {
    if (handleKey(input, key)) return true;
    return onKey?.(input, key) || false;
  };
  
  // Calculate scroll bar
  const scrollBarContent = useMemo(() => {
    if (!showScrollBar) return null;
    
    const barHeight = Math.max(1, Math.floor(visibleItems * (visibleItems / totalItems)));
    const barPosition = Math.floor(scroll.scrollProgress * (visibleItems - barHeight));
    
    return (
      <Box flexDirection="column" width={1}>
        {Array.from({ length: visibleItems }).map((_, i) => (
          <Text key={i} color={theme.colors.muted}>
            {i >= barPosition && i < barPosition + barHeight ? '█' : '░'}
          </Text>
        ))}
      </Box>
    );
  }, [showScrollBar, visibleItems, totalItems, scroll.scrollProgress]);
  
  const hasContent = totalItems > 0;
  
  return (
    <Box 
      flexDirection="column" 
      height={height} 
      width={width}
      borderStyle="single"
      borderColor={borderColor}
    >
      {/* Header */}
      {header && (
        <Box flexShrink={0}>
          {header}
        </Box>
      )}
      
      {/* Top scroll indicator */}
      {showIndicators && scroll.hasMoreAbove && (
        <Box height={1} justifyContent="center" flexShrink={0}>
          <Text color={theme.colors.muted}>
            {icons.arrowUp} More above
          </Text>
        </Box>
      )}
      
      {/* Content area */}
      <Box flexDirection="row" flexGrow={1} overflow="hidden">
        {/* Main content */}
        <Box flexGrow={1} flexDirection="column" padding={padding}>
          {hasContent ? (
            children
          ) : (
            emptyState || (
              <Text color={theme.colors.muted} italic>
                No items to display
              </Text>
            )
          )}
        </Box>
        
        {/* Scroll bar */}
        {showScrollBar && hasContent && (
          <Box flexShrink={0} paddingRight={1}>
            {scrollBarContent}
          </Box>
        )}
      </Box>
      
      {/* Bottom scroll indicator */}
      {showIndicators && scroll.hasMoreBelow && (
        <Box height={1} justifyContent="center" flexShrink={0}>
          <Text color={theme.colors.muted}>
            {icons.arrowDown} More below
          </Text>
        </Box>
      )}
      
      {/* Footer */}
      {footer && (
        <Box flexShrink={0}>
          {footer}
        </Box>
      )}
      
      {/* Hidden keyboard handler - this is a hack to capture input */}
      <KeyboardCapture onKey={onKeyHandler} />
    </Box>
  );
}

// ============================================================================
// Keyboard Capture Component
// ============================================================================

interface KeyboardCaptureProps {
  onKey: (input: string, key: Key) => boolean;
}

function KeyboardCapture({ onKey }: KeyboardCaptureProps) {
  useInput((input: string, key: Key) => {
    onKey(input, key);
  });
  return null;
}

// ============================================================================
// Scroll Progress Component
// ============================================================================

export interface ScrollProgressProps {
  current: number;
  total: number;
  showPercentage?: boolean;
}

export function ScrollProgress({ current, total, showPercentage = true }: ScrollProgressProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  return (
    <Box>
      <Text color={theme.colors.muted}>
        {current + 1}/{total}
        {showPercentage && ` (${percentage}%)`}
      </Text>
    </Box>
  );
}

// ============================================================================
// Simple List Component
// ============================================================================

export interface ScrollableListProps<T> {
  items: T[];
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  selectedIndex: number;
  height: number;
  width?: number;
  onSelect?: (index: number) => void;
  keyExtractor?: (item: T, index: number) => string;
  emptyText?: string;
}

export function ScrollableList<T>({
  items,
  renderItem,
  selectedIndex,
  height,
  width,
  keyExtractor = (_, index) => String(index),
  emptyText = 'No items',
}: ScrollableListProps<T>) {
  const visibleItems = Math.max(3, height - 4);
  const scroll = useScrollable({
    totalItems: items.length,
    visibleItems,
  });
  
  // Adjust scroll to keep selected item in view
  const effectiveOffset = Math.min(
    scroll.offset,
    Math.max(0, items.length - visibleItems)
  );
  
  const visibleItemsList = items.slice(effectiveOffset, effectiveOffset + visibleItems);
  
  if (items.length === 0) {
    return (
      <Box height={height} padding={1}>
        <Text color={theme.colors.muted} italic>{emptyText}</Text>
      </Box>
    );
  }
  
  return (
    <Box flexDirection="column" height={height} width={width}>
      {/* Top indicator */}
      {effectiveOffset > 0 && (
        <Box height={1}>
          <Text color={theme.colors.muted}>▲ {effectiveOffset} more</Text>
        </Box>
      )}
      
      {/* Items */}
      <Box flexDirection="column" flexGrow={1}>
        {visibleItemsList.map((item, idx) => {
          const actualIndex = effectiveOffset + idx;
          const isSelected = actualIndex === selectedIndex;
          return (
            <Box key={keyExtractor(item, actualIndex)}>
              {renderItem(item, actualIndex, isSelected)}
            </Box>
          );
        })}
      </Box>
      
      {/* Bottom indicator */}
      {effectiveOffset + visibleItems < items.length && (
        <Box height={1}>
          <Text color={theme.colors.muted}>
            ▼ {items.length - effectiveOffset - visibleItems} more
          </Text>
        </Box>
      )}
    </Box>
  );
}
