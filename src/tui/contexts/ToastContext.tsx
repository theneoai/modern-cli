/**
 * Toast Context - 通知管理系统
 * 提供统一的 Toast 通知队列管理
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  content: string;
  duration: number;
  createdAt: number;
}

export interface ToastContextValue {
  toasts: ToastMessage[];
  showToast: (type: ToastType, content: string, duration?: number) => string;
  showSuccess: (content: string, duration?: number) => string;
  showError: (content: string, duration?: number) => string;
  showWarning: (content: string, duration?: number) => string;
  showInfo: (content: string, duration?: number) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

// ============================================================================
// Context
// ============================================================================

const ToastContext = createContext<ToastContextValue | null>(null);

// Default durations by type
const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

// Max toasts to show at once
const MAX_TOASTS = 5;

// ============================================================================
// Provider Component
// ============================================================================

interface ToastProviderProps {
  children: React.ReactNode;
  maxToasts?: number;
}

export function ToastProvider({ children, maxToasts = MAX_TOASTS }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      timeoutsRef.current.clear();
    };
  }, []);
  
  // Show a new toast
  const showToast = useCallback((
    type: ToastType,
    content: string,
    duration: number = DEFAULT_DURATIONS[type]
  ): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const newToast: ToastMessage = {
      id,
      type,
      content,
      duration,
      createdAt: Date.now(),
    };
    
    setToasts(prev => {
      // Remove oldest if at max
      const updated = [...prev, newToast];
      if (updated.length > maxToasts) {
        const removed = updated.shift();
        if (removed) {
          const timeout = timeoutsRef.current.get(removed.id);
          if (timeout) {
            clearTimeout(timeout);
            timeoutsRef.current.delete(removed.id);
          }
        }
      }
      return updated;
    });
    
    // Auto dismiss
    const timeout = setTimeout(() => {
      dismissToast(id);
    }, duration);
    
    timeoutsRef.current.set(id, timeout);
    
    return id;
  }, [maxToasts]);
  
  // Helper methods for each type
  const showSuccess = useCallback((content: string, duration?: number) => {
    return showToast('success', content, duration);
  }, [showToast]);
  
  const showError = useCallback((content: string, duration?: number) => {
    return showToast('error', content, duration);
  }, [showToast]);
  
  const showWarning = useCallback((content: string, duration?: number) => {
    return showToast('warning', content, duration);
  }, [showToast]);
  
  const showInfo = useCallback((content: string, duration?: number) => {
    return showToast('info', content, duration);
  }, [showToast]);
  
  // Dismiss a specific toast
  const dismissToast = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  
  // Dismiss all toasts
  const dismissAll = useCallback(() => {
    timeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    timeoutsRef.current.clear();
    setToasts([]);
  }, []);
  
  // Context value
  const value = useMemo<ToastContextValue>(() => ({
    toasts,
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    dismissToast,
    dismissAll,
  }), [toasts, showToast, showSuccess, showError, showWarning, showInfo, dismissToast, dismissAll]);
  
  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
