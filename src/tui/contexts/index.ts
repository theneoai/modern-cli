/**
 * Contexts - 全局状态管理导出
 */

export { TUIProvider, useTUI, useTerminalSize, useLayout } from './TUIProvider.js';
export type { 
  TerminalSize, 
  PanelVisibility, 
  LayoutState, 
  TUIContextValue,
  Breakpoint,
} from './TUIProvider.js';

export { FocusProvider, useFocus, useFocusZone, FocusLayer } from './FocusContext.js';
export type { 
  FocusZone, 
  FocusState, 
  FocusContextValue, 
  UseFocusZoneOptions,
} from './FocusContext.js';

export { ToastProvider, useToast } from './ToastContext.js';
export type { 
  ToastType, 
  ToastMessage, 
  ToastContextValue,
} from './ToastContext.js';

export { 
  ModalProvider, 
  useModal, 
  ModalType,
} from './ModalContext.js';
export type { 
  ModalConfig, 
  ModalState, 
  ModalContextValue,
  ConfirmOptions,
  InputOptions,
  PaletteOptions,
  PaletteItem,
} from './ModalContext.js';

export { 
  ViewProvider, 
  useView, 
  useCurrentView, 
  useViewNavigation,
} from './ViewContext.js';
export type { 
  ViewType, 
  ViewState, 
  ViewContextValue,
} from './ViewContext.js';
