/**
 * Focus Context - 焦点管理系统
 * 提供统一的焦点管理和键盘事件分发
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useInput, type Key } from 'ink';

// ============================================================================
// Types
// ============================================================================

export enum FocusLayer {
  BACKGROUND = 0,   // 背景内容 (最低)
  CONTENT = 1,      // 主内容区
  SIDEBAR = 2,      // 侧边栏
  PANEL = 3,        // 面板
  MODAL = 4,        // 模态框
  DIALOG = 5,       // 对话框
  OVERLAY = 6,      // 覆盖层
  TOAST = 7,        // 通知 (最高)
}

export interface FocusZone {
  id: string;
  layer: FocusLayer;
  priority: number;           // 同层内的优先级，数字越大优先级越高
  captureInput: boolean;      // 是否独占输入
  disabled?: boolean;         // 是否禁用
  onFocus?: () => void;
  onBlur?: () => void;
  onKey?: (input: string, key: Key) => boolean; // 返回 true 表示已处理
}

export interface FocusState {
  activeZoneId: string | null;
  zones: Map<string, FocusZone>;
  maxLayer: FocusLayer;
}

export interface FocusContextValue {
  // 注册/注销焦点区域
  registerZone: (zone: FocusZone) => void;
  unregisterZone: (id: string) => void;
  
  // 焦点控制
  setFocus: (zoneId: string) => void;
  blur: (zoneId?: string) => void;
  
  // 查询
  isActive: (zoneId: string) => boolean;
  getActiveZone: () => FocusZone | null;
  canReceiveFocus: (zoneId: string) => boolean;
  
  // 层级控制
  maxLayer: FocusLayer;
  setMaxLayer: (layer: FocusLayer) => void;
  resetMaxLayer: () => void;
}

// ============================================================================
// Context
// ============================================================================

const FocusContext = createContext<FocusContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface FocusProviderProps {
  children: React.ReactNode;
  debug?: boolean;
}

export function FocusProvider({ children, debug = false }: FocusProviderProps) {
  const zonesRef = useRef<Map<string, FocusZone>>(new Map());
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [maxLayer, setMaxLayerState] = useState<FocusLayer>(FocusLayer.BACKGROUND);
  
  // Auto-assign focus when zones change or maxLayer changes
  const autoAssignFocus = useCallback(() => {
    const zones = Array.from<FocusZone>(zonesRef.current.values())
      .filter(z => !z.disabled && z.layer <= maxLayer)
      .sort((a, b) => {
        // Sort by layer descending, then priority descending
        if (a.layer !== b.layer) return b.layer - a.layer;
        return b.priority - a.priority;
      });
    
    if (zones.length > 0) {
      const topZone = zones[0];
      if (topZone.id !== activeZoneId) {
        // Blur current
        if (activeZoneId) {
          const currentZone = zonesRef.current.get(activeZoneId);
          currentZone?.onBlur?.();
        }
        // Focus new
        setActiveZoneId(topZone.id);
        topZone.onFocus?.();
        
        if (debug) {
          console.error(`[Focus] Auto-assigned to: ${topZone.id} (layer: ${topZone.layer})`);
        }
      }
    } else if (activeZoneId) {
      // No zones available, clear focus
      const currentZone = zonesRef.current.get(activeZoneId);
      currentZone?.onBlur?.();
      setActiveZoneId(null);
    }
  }, [activeZoneId, maxLayer, debug]);
  
  // Register a new focus zone
  const registerZone = useCallback((zone: FocusZone) => {
    zonesRef.current.set(zone.id, zone);
    if (debug) {
      console.error(`[Focus] Registered zone: ${zone.id} (layer: ${zone.layer})`);
    }
    // Trigger auto-assign
    setTimeout(autoAssignFocus, 0);
  }, [autoAssignFocus, debug]);
  
  // Unregister a focus zone
  const unregisterZone = useCallback((id: string) => {
    const zone = zonesRef.current.get(id);
    if (zone) {
      zonesRef.current.delete(id);
      if (activeZoneId === id) {
        zone.onBlur?.();
        setActiveZoneId(null);
        setTimeout(autoAssignFocus, 0);
      }
      if (debug) {
        console.error(`[Focus] Unregistered zone: ${id}`);
      }
    }
  }, [activeZoneId, autoAssignFocus, debug]);
  
  // Manually set focus to a zone
  const setFocus = useCallback((zoneId: string) => {
    const zone = zonesRef.current.get(zoneId);
    if (!zone || zone.disabled) return;
    
    if (zone.layer > maxLayer) {
      if (debug) {
        console.error(`[Focus] Cannot focus ${zoneId}: layer ${zone.layer} > maxLayer ${maxLayer}`);
      }
      return;
    }
    
    if (activeZoneId !== zoneId) {
      // Blur current
      if (activeZoneId) {
        const currentZone = zonesRef.current.get(activeZoneId);
        currentZone?.onBlur?.();
      }
      // Focus new
      setActiveZoneId(zoneId);
      zone.onFocus?.();
      
      if (debug) {
        console.error(`[Focus] Manually set to: ${zoneId}`);
      }
    }
  }, [activeZoneId, maxLayer, debug]);
  
  // Blur a zone (or current if not specified)
  const blur = useCallback((zoneId?: string) => {
    const targetId = zoneId || activeZoneId;
    if (!targetId) return;
    
    const zone = zonesRef.current.get(targetId);
    if (zone && activeZoneId === targetId) {
      zone.onBlur?.();
      setActiveZoneId(null);
      setTimeout(autoAssignFocus, 0);
    }
  }, [activeZoneId, autoAssignFocus]);
  
  // Check if a zone is currently active
  const isActive = useCallback((zoneId: string) => {
    return activeZoneId === zoneId;
  }, [activeZoneId]);
  
  // Get the currently active zone
  const getActiveZone = useCallback(() => {
    return activeZoneId ? zonesRef.current.get(activeZoneId) || null : null;
  }, [activeZoneId]);
  
  // Check if a zone can receive focus
  const canReceiveFocus = useCallback((zoneId: string) => {
    const zone = zonesRef.current.get(zoneId);
    if (!zone || zone.disabled) return false;
    return zone.layer <= maxLayer;
  }, [maxLayer]);
  
  // Set max layer (for modal/dialog handling)
  const setMaxLayer = useCallback((layer: FocusLayer) => {
    setMaxLayerState(prev => Math.max(prev, layer));
  }, []);
  
  // Reset max layer to highest active zone
  const resetMaxLayer = useCallback(() => {
    let highest = FocusLayer.BACKGROUND;
    zonesRef.current.forEach(zone => {
      if (!zone.disabled) {
        highest = Math.max(highest, zone.layer);
      }
    });
    setMaxLayerState(highest);
    setTimeout(autoAssignFocus, 0);
  }, [autoAssignFocus]);
  
  // Global keyboard handler
  useInput((input, key) => {
    const activeZone = getActiveZone();
    
    if (activeZone?.onKey) {
      const handled = activeZone.onKey(input, key);
      if (handled) return;
    }
    
    // Global shortcuts
    if (key.escape) {
      // ESC blurs current or exits if at background
      if (activeZone && activeZone.layer > FocusLayer.BACKGROUND) {
        blur();
      }
    }
  });
  
  // Context value
  const value = useMemo<FocusContextValue>(() => ({
    registerZone,
    unregisterZone,
    setFocus,
    blur,
    isActive,
    getActiveZone,
    canReceiveFocus,
    maxLayer,
    setMaxLayer,
    resetMaxLayer,
  }), [
    registerZone, unregisterZone, setFocus, blur,
    isActive, getActiveZone, canReceiveFocus, maxLayer, setMaxLayer, resetMaxLayer,
  ]);
  
  return (
    <FocusContext.Provider value={value}>
      {children}
    </FocusContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useFocus(): FocusContextValue {
  const context = useContext(FocusContext);
  if (!context) {
    throw new Error('useFocus must be used within a FocusProvider');
  }
  return context;
}

export interface UseFocusZoneOptions {
  id: string;
  layer: FocusLayer;
  priority?: number;
  captureInput?: boolean;
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onKey?: (input: string, key: Key) => boolean;
}

export function useFocusZone(options: UseFocusZoneOptions) {
  const focus = useFocus();
  const { id, layer, priority = 0, captureInput = false, disabled = false, onFocus, onBlur, onKey } = options;
  
  // Register zone on mount
  useEffect(() => {
    focus.registerZone({
      id,
      layer,
      priority,
      captureInput,
      disabled,
      onFocus,
      onBlur,
      onKey,
    });
    
    return () => {
      focus.unregisterZone(id);
    };
  }, [id, layer, priority, captureInput, disabled]);
  
  // Update zone when callbacks change
  useEffect(() => {
    focus.registerZone({
      id,
      layer,
      priority,
      captureInput,
      disabled,
      onFocus,
      onBlur,
      onKey,
    });
  }, [onFocus, onBlur, onKey]);
  
  return {
    isActive: focus.isActive(id),
    setFocus: () => focus.setFocus(id),
    blur: () => focus.blur(id),
  };
}
