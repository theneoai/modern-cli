/**
 * useScrollable - 滚动管理 Hook
 * 提供统一的滚动状态管理和键盘导航
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { type Key } from 'ink';

// ============================================================================
// Types
// ============================================================================

export interface ScrollState {
  offset: number;
  totalItems: number;
  visibleItems: number;
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
  scrollProgress: number; // 0-1
}

export interface ScrollActions {
  scrollUp: (count?: number) => void;
  scrollDown: (count?: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  scrollTo: (offset: number) => void;
  pageUp: () => void;
  pageDown: () => void;
}

export interface UseScrollableOptions {
  totalItems: number;
  visibleItems: number;
  initialOffset?: number;
  loop?: boolean;           // 是否循环滚动
  onScroll?: (state: ScrollState) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useScrollable(options: UseScrollableOptions): ScrollState & ScrollActions {
  const { totalItems, visibleItems, initialOffset = 0, loop = false, onScroll } = options;
  
  const [offset, setOffset] = useState(initialOffset);
  const onScrollRef = useRef(onScroll);
  
  // Keep callback ref up to date
  useEffect(() => {
    onScrollRef.current = onScroll;
  }, [onScroll]);
  
  // Calculate scroll state
  const state = useMemo<ScrollState>(() => {
    const maxOffset = Math.max(0, totalItems - visibleItems);
    const clampedOffset = Math.min(offset, maxOffset);
    
    return {
      offset: clampedOffset,
      totalItems,
      visibleItems,
      hasMoreAbove: clampedOffset > 0,
      hasMoreBelow: clampedOffset < maxOffset,
      scrollProgress: totalItems > 0 ? clampedOffset / totalItems : 0,
    };
  }, [offset, totalItems, visibleItems]);
  
  // Notify on scroll change
  useEffect(() => {
    onScrollRef.current?.(state);
  }, [state]);
  
  // Scroll actions
  const scrollUp = useCallback((count = 1) => {
    setOffset(prev => {
      const newOffset = prev - count;
      if (loop && totalItems > 0 && newOffset < 0) {
        return totalItems - 1;
      }
      return Math.max(0, newOffset);
    });
  }, [loop, totalItems]);
  
  const scrollDown = useCallback((count = 1) => {
    setOffset(prev => {
      const maxOffset = Math.max(0, totalItems - visibleItems);
      const newOffset = prev + count;
      if (loop && totalItems > 0 && newOffset > maxOffset) {
        return 0;
      }
      return Math.min(maxOffset, newOffset);
    });
  }, [loop, totalItems, visibleItems]);
  
  const scrollToTop = useCallback(() => {
    setOffset(0);
  }, []);
  
  const scrollToBottom = useCallback(() => {
    setOffset(Math.max(0, totalItems - visibleItems));
  }, [totalItems, visibleItems]);
  
  const scrollTo = useCallback((targetOffset: number) => {
    const maxOffset = Math.max(0, totalItems - visibleItems);
    setOffset(Math.max(0, Math.min(maxOffset, targetOffset)));
  }, [totalItems, visibleItems]);
  
  const pageUp = useCallback(() => {
    scrollUp(visibleItems);
  }, [scrollUp, visibleItems]);
  
  const pageDown = useCallback(() => {
    scrollDown(visibleItems);
  }, [scrollDown, visibleItems]);
  

  
  return {
    ...state,
    scrollUp,
    scrollDown,
    scrollToTop,
    scrollToBottom,
    scrollTo,
    pageUp,
    pageDown,
  };
}

// ============================================================================
// Hook for keyboard navigation
// ============================================================================

export interface UseScrollableKeyboardOptions {
  onUp?: () => void;
  onDown?: () => void;
  onPageUp?: () => void;
  onPageDown?: () => void;
  onHome?: () => void;
  onEnd?: () => void;
  enabled?: boolean;
}

export function useScrollableKeyboard(
  scrollActions: ScrollActions,
  options: UseScrollableKeyboardOptions = {}
) {
  const { enabled = true } = options;
  
  const handleKey = useCallback((_input: string, key: Key): boolean => {
    if (!enabled) return false;
    
    if (key.upArrow) {
      options.onUp ? options.onUp() : scrollActions.scrollUp();
      return true;
    }
    
    if (key.downArrow) {
      options.onDown ? options.onDown() : scrollActions.scrollDown();
      return true;
    }
    
    if (key.pageUp) {
      options.onPageUp ? options.onPageUp() : scrollActions.pageUp();
      return true;
    }
    
    if (key.pageDown) {
      options.onPageDown ? options.onPageDown() : scrollActions.pageDown();
      return true;
    }
    
    if (key.home) {
      options.onHome ? options.onHome() : scrollActions.scrollToTop();
      return true;
    }
    
    if (key.end) {
      options.onEnd ? options.onEnd() : scrollActions.scrollToBottom();
      return true;
    }
    
    return false;
  }, [enabled, scrollActions, options]);
  
  return handleKey;
}

// ============================================================================
// Hook for selection with scrolling
// ============================================================================

export interface UseSelectableOptions {
  totalItems: number;
  visibleItems: number;
  initialIndex?: number;
  loop?: boolean;
  onSelect?: (index: number) => void;
  onConfirm?: (index: number) => void;
}

export interface SelectableState {
  selectedIndex: number;
  scrollOffset: number;
  visibleRange: { start: number; end: number };
}

export function useSelectable(options: UseSelectableOptions) {
  const { totalItems, visibleItems, initialIndex = 0, loop, onSelect, onConfirm } = options;
  
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);
  
  // Keep selection in view and notify
  useEffect(() => {
    if (selectedIndex < scrollOffset) {
      setScrollOffset(selectedIndex);
    } else if (selectedIndex >= scrollOffset + visibleItems) {
      setScrollOffset(selectedIndex - visibleItems + 1);
    }
    onSelect?.(selectedIndex);
  }, [selectedIndex, scrollOffset, visibleItems, onSelect]);
  
  const moveUp = useCallback(() => {
    setSelectedIndex(prev => {
      const newIndex = prev - 1;
      if (newIndex < 0) {
        return loop ? totalItems - 1 : 0;
      }
      return newIndex;
    });
  }, [loop, totalItems]);
  
  const moveDown = useCallback(() => {
    setSelectedIndex(prev => {
      const newIndex = prev + 1;
      if (newIndex >= totalItems) {
        return loop ? 0 : totalItems - 1;
      }
      return newIndex;
    });
  }, [loop, totalItems]);
  
  const moveTo = useCallback((index: number) => {
    setSelectedIndex(Math.max(0, Math.min(totalItems - 1, index)));
  }, [totalItems]);
  
  const moveToFirst = useCallback(() => {
    setSelectedIndex(0);
  }, []);
  
  const moveToLast = useCallback(() => {
    setSelectedIndex(totalItems - 1);
  }, [totalItems]);
  
  const confirm = useCallback(() => {
    onConfirm?.(selectedIndex);
  }, [selectedIndex, onConfirm]);
  
  const state: SelectableState = {
    selectedIndex,
    scrollOffset,
    visibleRange: {
      start: scrollOffset,
      end: Math.min(scrollOffset + visibleItems, totalItems),
    },
  };
  
  return {
    state,
    actions: {
      moveUp,
      moveDown,
      moveTo,
      moveToFirst,
      moveToLast,
      confirm,
    },
  };
}
