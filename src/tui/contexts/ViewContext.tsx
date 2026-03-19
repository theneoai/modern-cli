/**
 * View Context - 视图路由管理
 * 提供视图切换和状态管理
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ViewType = 
  | 'chat' 
  | 'tasks' 
  | 'calendar' 
  | 'email' 
  | 'settings' 
  | 'help'
  | 'workbench-dashboard'
  | 'workbench-messages'
  | 'workbench-tasks'
  | 'workbench-calendar'
  | 'workbench-workflows'
  | 'workbench-team';

export interface ViewState {
  currentView: ViewType;
  previousView: ViewType | null;
  viewHistory: ViewType[];
  viewData: Map<string, unknown>;
}

export interface ViewContextValue {
  // 当前视图
  currentView: ViewType;
  previousView: ViewType | null;
  canGoBack: boolean;
  
  // 视图切换
  navigateTo: (view: ViewType, data?: unknown) => void;
  goBack: () => void;
  goHome: () => void;
  
  // 视图数据
  getViewData: <T>(key: string) => T | undefined;
  setViewData: <T>(key: string, data: T) => void;
  clearViewData: (key?: string) => void;
  
  // 视图判断
  isView: (...views: ViewType[]) => boolean;
  isWorkbench: boolean;
}

// ============================================================================
// Context
// ============================================================================

const ViewContext = createContext<ViewContextValue | null>(null);

// Default view
const DEFAULT_VIEW: ViewType = 'chat';

// Workbench views
const WORKBENCH_VIEWS: ViewType[] = [
  'workbench-dashboard',
  'workbench-messages',
  'workbench-tasks',
  'workbench-calendar',
  'workbench-workflows',
  'workbench-team',
];

// ============================================================================
// Provider Component
// ============================================================================

interface ViewProviderProps {
  children: React.ReactNode;
  defaultView?: ViewType;
  maxHistory?: number;
}

export function ViewProvider({ 
  children, 
  defaultView = DEFAULT_VIEW,
  maxHistory = 10,
}: ViewProviderProps) {
  const [currentView, setCurrentView] = useState<ViewType>(defaultView);
  const [previousView, setPreviousView] = useState<ViewType | null>(null);
  const [viewHistory, setViewHistory] = useState<ViewType[]>([defaultView]);
  const [viewData, setViewDataState] = useState<Map<string, unknown>>(new Map());
  
  // Navigate to a view
  const navigateTo = useCallback((view: ViewType, data?: unknown) => {
    setPreviousView(currentView);
    setCurrentView(view);
    
    setViewHistory(prev => {
      const newHistory = [...prev, view];
      if (newHistory.length > maxHistory) {
        return newHistory.slice(-maxHistory);
      }
      return newHistory;
    });
    
    if (data !== undefined) {
      setViewDataState(prev => new Map(prev).set(`view:${view}`, data));
    }
  }, [currentView, maxHistory]);
  
  // Go back to previous view
  const goBack = useCallback(() => {
    if (viewHistory.length > 1) {
      const newHistory = viewHistory.slice(0, -1);
      const previous = newHistory[newHistory.length - 1];
      setViewHistory(newHistory);
      setPreviousView(currentView);
      setCurrentView(previous);
    }
  }, [viewHistory, currentView]);
  
  // Go to home view
  const goHome = useCallback(() => {
    navigateTo(defaultView);
  }, [navigateTo, defaultView]);
  
  // Get view data
  const getViewData = useCallback(<T,>(key: string): T | undefined => {
    return viewData.get(key) as T | undefined;
  }, [viewData]);
  
  // Set view data
  const setViewData = useCallback(<T,>(key: string, data: T) => {
    setViewDataState(prev => new Map(prev).set(key, data));
  }, []);
  
  // Clear view data
  const clearViewData = useCallback((key?: string) => {
    if (key) {
      setViewDataState(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      setViewDataState(new Map());
    }
  }, []);
  
  // Check if current view is in list
  const isView = useCallback((...views: ViewType[]): boolean => {
    return views.includes(currentView);
  }, [currentView]);
  
  // Computed values
  const canGoBack = viewHistory.length > 1;
  const isWorkbench = WORKBENCH_VIEWS.includes(currentView);
  
  // Context value
  const value = useMemo<ViewContextValue>(() => ({
    currentView,
    previousView,
    canGoBack,
    navigateTo,
    goBack,
    goHome,
    getViewData,
    setViewData,
    clearViewData,
    isView,
    isWorkbench,
  }), [
    currentView, previousView, canGoBack,
    navigateTo, goBack, goHome,
    getViewData, setViewData, clearViewData, isView, isWorkbench,
  ]);
  
  return (
    <ViewContext.Provider value={value}>
      {children}
    </ViewContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useView(): ViewContextValue {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useView must be used within a ViewProvider');
  }
  return context;
}

export function useCurrentView(): ViewType {
  return useView().currentView;
}

export function useViewNavigation() {
  const { navigateTo, goBack, goHome, canGoBack } = useView();
  return { navigateTo, goBack, goHome, canGoBack };
}
