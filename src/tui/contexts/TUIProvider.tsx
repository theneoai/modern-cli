/**
 * TUI Provider - 全局状态管理
 * 提供终端尺寸、主题、配置等全局状态
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useStdout } from 'ink';
import { layout as layoutConfig } from '../../theme/index.js';
import type { LayoutSizes } from '../../types/ui.js';

// ============================================================================
// Types
// ============================================================================

export enum Breakpoint {
  COMPACT = 'compact',     // < 80 cols or < 24 rows
  NORMAL = 'normal',       // 80-120 cols, 24-40 rows
  WIDE = 'wide',           // > 120 cols, > 40 rows
}

export interface TerminalSize {
  width: number;
  height: number;
  breakpoint: Breakpoint;
}

export interface PanelVisibility {
  sidebar: boolean;
  bottomPanel: boolean;
  rightPanel: boolean;
}

export interface LayoutState {
  terminal: TerminalSize;
  panels: PanelVisibility;
  layoutSizes: LayoutSizes;
  isCompact: boolean;
}

export interface TUIContextValue {
  // 布局状态
  layout: LayoutState;
  
  // 面板控制
  toggleSidebar: () => void;
  toggleBottomPanel: () => void;
  toggleRightPanel: () => void;
  setPanelVisibility: (panels: Partial<PanelVisibility>) => void;
  
  // 终端信息
  terminalSize: TerminalSize;
  
  // 配置
  minWidth: number;
  minHeight: number;
}

// ============================================================================
// Context
// ============================================================================

const TUIContext = createContext<TUIContextValue | null>(null);

// ============================================================================
// Helper Functions
// ============================================================================

function calculateBreakpoint(width: number, height: number): Breakpoint {
  if (width < layoutConfig.minWidth || height < layoutConfig.minHeight) {
    return Breakpoint.COMPACT;
  }
  if (width > 120 || height > 40) {
    return Breakpoint.WIDE;
  }
  return Breakpoint.NORMAL;
}

function calculateLayoutSizes(
  width: number, 
  height: number, 
  panels: PanelVisibility
): LayoutSizes {
  const headerHeight = layoutConfig.headerHeight;
  const inputBarHeight = layoutConfig.inputBarHeight;
  
  // Calculate sidebar width
  const sidebarWidth = panels.sidebar
    ? Math.min(
        layoutConfig.sidebarWidthMax,
        Math.max(layoutConfig.sidebarWidthMin, Math.floor(width * layoutConfig.sidebarWidthPercent))
      )
    : 0;
  
  // Calculate bottom panel height
  const bottomPanelHeight = panels.bottomPanel
    ? Math.max(layoutConfig.minBottomPanelHeight, Math.floor((height - headerHeight - inputBarHeight) * 0.25))
    : 0;
  
  // Calculate main content height
  const mainContentHeight = height - headerHeight - bottomPanelHeight - inputBarHeight;
  
  // Calculate main panel width
  const mainPanelWidth = width - sidebarWidth - (panels.rightPanel ? 30 : 0);
  
  return {
    width,
    height,
    headerHeight,
    inputBarHeight,
    bottomPanelHeight,
    mainContentHeight,
    sidebarWidth,
    mainPanelWidth,
    isCompact: false,
  };
}

// ============================================================================
// Provider Component
// ============================================================================

interface TUIProviderProps {
  children: React.ReactNode;
  initialPanels?: Partial<PanelVisibility>;
}

export function TUIProvider({ children, initialPanels }: TUIProviderProps) {
  const { stdout } = useStdout();
  
  // Terminal size state
  const [terminalSize, setTerminalSize] = useState<TerminalSize>(() => ({
    width: stdout.columns || 120,
    height: stdout.rows || 40,
    breakpoint: calculateBreakpoint(stdout.columns || 120, stdout.rows || 40),
  }));
  
  // Panel visibility state
  const [panels, setPanels] = useState<PanelVisibility>({
    sidebar: initialPanels?.sidebar ?? true,
    bottomPanel: initialPanels?.bottomPanel ?? true,
    rightPanel: initialPanels?.rightPanel ?? false,
  });
  
  // Listen for terminal resize
  useEffect(() => {
    const handleResize = () => {
      const width = stdout.columns || 120;
      const height = stdout.rows || 40;
      setTerminalSize({
        width,
        height,
        breakpoint: calculateBreakpoint(width, height),
      });
    };
    
    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);
  
  // Auto-hide panels in compact mode
  useEffect(() => {
    if (terminalSize.breakpoint === Breakpoint.COMPACT) {
      setPanels({ sidebar: false, bottomPanel: false, rightPanel: false });
    }
  }, [terminalSize.breakpoint]);
  
  // Calculate layout sizes
  const layoutSizes = useMemo(() => 
    calculateLayoutSizes(terminalSize.width, terminalSize.height, panels),
    [terminalSize, panels]
  );
  
  // Check if in compact mode
  const isCompact = terminalSize.breakpoint === Breakpoint.COMPACT;
  
  // Panel control callbacks
  const toggleSidebar = useCallback(() => {
    setPanels(prev => ({ ...prev, sidebar: !prev.sidebar }));
  }, []);
  
  const toggleBottomPanel = useCallback(() => {
    setPanels(prev => ({ ...prev, bottomPanel: !prev.bottomPanel }));
  }, []);
  
  const toggleRightPanel = useCallback(() => {
    setPanels(prev => ({ ...prev, rightPanel: !prev.rightPanel }));
  }, []);
  
  const setPanelVisibility = useCallback((newPanels: Partial<PanelVisibility>) => {
    setPanels(prev => ({ ...prev, ...newPanels }));
  }, []);
  
  // Context value
  const value = useMemo<TUIContextValue>(() => ({
    layout: {
      terminal: terminalSize,
      panels,
      layoutSizes,
      isCompact,
    },
    toggleSidebar,
    toggleBottomPanel,
    toggleRightPanel,
    setPanelVisibility,
    terminalSize,
    minWidth: layoutConfig.minWidth,
    minHeight: layoutConfig.minHeight,
  }), [
    terminalSize, panels, layoutSizes, isCompact,
    toggleSidebar, toggleBottomPanel, toggleRightPanel, setPanelVisibility,
  ]);
  
  return (
    <TUIContext.Provider value={value}>
      {children}
    </TUIContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useTUI(): TUIContextValue {
  const context = useContext(TUIContext);
  if (!context) {
    throw new Error('useTUI must be used within a TUIProvider');
  }
  return context;
}

export function useTerminalSize(): TerminalSize {
  return useTUI().terminalSize;
}

export function useLayout(): LayoutState {
  return useTUI().layout;
}
