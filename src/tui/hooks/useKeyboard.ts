/**
 * useKeyboard - 键盘快捷键管理 Hook
 * 提供全局和局部快捷键管理
 */

import { useEffect, useRef } from 'react';
import { useInput, type Key } from 'ink';

// ============================================================================
// Types
// ============================================================================

export type KeyHandler = (input: string, key: Key) => boolean | void;

export interface KeyBinding {
  key: string;           // 按键描述，如 'ctrl+p', 'escape', 'tab'
  handler: KeyHandler;
  description?: string;  // 用于帮助显示
  scope?: 'global' | 'local';  // 作用域
  priority?: number;     // 优先级，数字越大越先处理
}

export interface ShortcutConfig {
  bindings: KeyBinding[];
  enabled?: boolean;
  capture?: boolean;     // 是否阻止事件冒泡
}

// ============================================================================
// Helper Functions
// ============================================================================

function matchesKey(input: string, key: Key, binding: string): boolean {
  const parts = binding.toLowerCase().split('+');
  
  // Check modifiers
  const hasCtrl = parts.includes('ctrl');
  const hasShift = parts.includes('shift');
  const hasAlt = parts.includes('alt') || parts.includes('meta');
  
  if (hasCtrl !== key.ctrl) return false;
  if (hasShift !== key.shift) return false;
  if (hasAlt !== key.meta) return false;
  
  // Check main key
  const mainKey = parts.find(p => !['ctrl', 'shift', 'alt', 'meta'].includes(p));
  if (!mainKey) return false;
  
  // Handle special keys
  const specialKeyMap: Record<string, keyof Key> = {
    'escape': 'escape',
    'esc': 'escape',
    'tab': 'tab',
    'enter': 'return',
    'return': 'return',
    'space': 'space',
    'up': 'upArrow',
    'down': 'downArrow',
    'left': 'leftArrow',
    'right': 'rightArrow',
    'home': 'home',
    'end': 'end',
    'pageup': 'pageUp',
    'pagedown': 'pageDown',
    'delete': 'delete',
    'del': 'delete',
    'backspace': 'backspace',
  };
  
  if (mainKey in specialKeyMap) {
    const keyProp = specialKeyMap[mainKey];
    return !!key[keyProp];
  }
  
  // Handle regular character keys
  return input.toLowerCase() === mainKey;
}

// ============================================================================
// Hook
// ============================================================================

export function useKeyboard(config: ShortcutConfig) {
  const { bindings, enabled = true, capture = false } = config;
  const bindingsRef = useRef(bindings);
  
  // Keep ref up to date
  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);
  
  useInput((input, key) => {
    if (!enabled) return;
    
    // Sort by priority
    const sortedBindings = [...bindingsRef.current].sort((a, b) => 
      (b.priority || 0) - (a.priority || 0)
    );
    
    for (const binding of sortedBindings) {
      if (matchesKey(input, key, binding.key)) {
        const result = binding.handler(input, key);
        if (capture || result === true) {
          return; // Stop propagation
        }
      }
    }
  });
}

// ============================================================================
// Predefined Shortcuts
// ============================================================================

export const commonShortcuts = {
  exit: { key: 'escape', description: 'Exit or close' },
  commandPalette: { key: 'tab', description: 'Open command palette' },
  navigateUp: { key: 'up', description: 'Navigate up' },
  navigateDown: { key: 'down', description: 'Navigate down' },
  navigateLeft: { key: 'left', description: 'Navigate left' },
  navigateRight: { key: 'right', description: 'Navigate right' },
  confirm: { key: 'enter', description: 'Confirm/Select' },
  cancel: { key: 'ctrl+c', description: 'Cancel' },
  help: { key: 'f1', description: 'Show help' },
  search: { key: 'ctrl+f', description: 'Search' },
} as const;

// ============================================================================
// Hook for registering global shortcuts
// ============================================================================

const globalShortcuts: KeyBinding[] = [];

export function registerGlobalShortcut(binding: KeyBinding) {
  globalShortcuts.push(binding);
  globalShortcuts.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return () => {
    const index = globalShortcuts.indexOf(binding);
    if (index > -1) {
      globalShortcuts.splice(index, 1);
    }
  };
}

export function useGlobalKeyboard() {
  useInput((input, key) => {
    for (const binding of globalShortcuts) {
      if (matchesKey(input, key, binding.key)) {
        const result = binding.handler(input, key);
        if (result === true) {
          return;
        }
      }
    }
  });
}
