/**
 * Hooks - 自定义 Hooks 导出
 */

export { useKeyboard, useGlobalKeyboard, registerGlobalShortcut, commonShortcuts } from './useKeyboard.js';
export type { KeyHandler, KeyBinding, ShortcutConfig } from './useKeyboard.js';

export { 
  useScrollable, 
  useScrollableKeyboard, 
  useSelectable,
} from './useScrollable.js';
export type { 
  ScrollState, 
  ScrollActions, 
  UseScrollableOptions,
  UseScrollableKeyboardOptions,
  UseSelectableOptions,
  SelectableState,
} from './useScrollable.js';

// Re-export from contexts for convenience
export {
  useTUI,
  useTerminalSize,
  useLayout,
  useFocus,
  useFocusZone,
  useToast,
  useModal,
  useView,
  useCurrentView,
  useViewNavigation,
} from '../contexts/index.js';

export type {
  UseFocusZoneOptions,
} from '../contexts/index.js';
