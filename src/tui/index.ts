/**
 * TUI - Terminal User Interface
 * 重构后的 TUI 系统导出
 */

// Contexts
export {
  TUIProvider,
  FocusProvider,
  ToastProvider,
  ModalProvider,
  ViewProvider,
  FocusLayer,
  ModalType,
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
} from './contexts/index.js';

export type {
  TerminalSize,
  PanelVisibility,
  LayoutState,
  TUIContextValue,
  Breakpoint,
  FocusZone,
  FocusState,
  FocusContextValue,
  UseFocusZoneOptions,
  ToastType,
  ToastMessage,
  ToastContextValue,
  ModalConfig,
  ModalState,
  ModalContextValue,
  ConfirmOptions,
  InputOptions,
  PaletteOptions,
  PaletteItem,
  ViewType,
  ViewState,
  ViewContextValue,
} from './contexts/index.js';

// Hooks
export {
  useKeyboard,
  useGlobalKeyboard,
  registerGlobalShortcut,
  commonShortcuts,
  useScrollable,
  useScrollableKeyboard,
  useSelectable,
} from './hooks/index.js';

export type {
  KeyHandler,
  KeyBinding,
  ShortcutConfig,
  ScrollState,
  ScrollActions,
  UseScrollableOptions,
  UseScrollableKeyboardOptions,
  UseSelectableOptions,
  SelectableState,
} from './hooks/index.js';

// UI Components
export {
  Focusable,
  FocusIndicator,
  FocusBorder,
  Scrollable,
  ScrollProgress,
  ScrollableList,
  Selectable,
  SelectableItem,
} from './components/ui/index.js';

export type {
  FocusableProps,
  FocusIndicatorProps,
  FocusBorderProps,
  ScrollableProps,
  ScrollProgressProps,
  ScrollableListProps,
  SelectableProps,
  SelectableItemProps,
} from './components/ui/index.js';

// Toast Components
export {
  Toast,
  ToastContainer,
  SimpleToast,
} from './components/toast/index.js';

export type {
  ToastProps,
  ToastContainerProps,
  SimpleToastProps,
} from './components/toast/index.js';

// Modal Components
export {
  ModalContainer,
  ModalContent,
  ModalActions,
  ModalButton,
  ConfirmDialogContent,
  ConfirmDialog,
  CommandPaletteContent,
  InputDialogContent,
} from './components/modal/index.js';

export type {
  ModalContentProps,
  ModalActionsProps,
  ModalButtonProps,
  ConfirmDialogProps,
} from './components/modal/index.js';

// Layout Components
export {
  Header,
  CompactHeader,
  StatusBar,
  StatusItem,
  Footer,
  CompactFooter,
  NavigationFooter,
} from './components/layout/index.js';

export type {
  HeaderProps,
  FooterProps,
  Shortcut,
} from './components/layout/index.js';

// Panel Components
export {
  MainPanel,
  TaskPanel,
  Sidebar,
  StatsPanel,
  MiniStats,
} from './components/panel/index.js';

export type {
  MainPanelProps,
  TaskPanelProps,
  SidebarProps,
  StatsPanelProps,
  MiniStatsProps,
} from './components/panel/index.js';

// Input Components
export {
  InputBar,
} from './components/input/index.js';

export type {
  InputBarProps,
} from './components/input/index.js';

// Utils
export {
  calculateCenterPosition,
  calculateModalPosition,
  calculateVisibleItems,
  calculateScrollOffset,
  calculateVisibleRange,
  shouldShowScrollIndicators,
  calculateProgress,
  formatFileSize,
  formatDuration,
  truncateText,
  calculateLineCount,
  calculateColumnWidths,
  createResponsiveLayout,
} from './utils/index.js';

export type {
  ResponsiveLayout,
  LayoutConfig,
} from './utils/index.js';

// Legacy components (kept for backward compatibility during migration)
export { ErrorBoundary } from './components/ErrorBoundary.js';
export { FullScreen } from './components/FullScreen.js';

// Main App (new version)
export { default as App } from './App.js';
export { default as Workbench } from './Workbench.js';

// Entry point
export { startTUI } from './index';
