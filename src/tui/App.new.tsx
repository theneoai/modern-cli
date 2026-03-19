/**
 * App.new.tsx - 重构后的主应用组件
 * 
 * 设计原则：
 * 1. 职责分离：状态管理、视图渲染、事件处理分离
 * 2. 可组合性：通过 Provider 组合功能
 * 3. 可测试性：纯组件，依赖注入
 */

import React from 'react';
import { Box, Text } from 'ink';
import { theme, icons } from '../theme/index.js';
import {
  TUIProvider,
  FocusProvider,
  ToastProvider,
  ModalProvider,
  ViewProvider,
  useTUI,
  useToast,
  useModal,
  useView,
} from './index.js';
import { ModalContainer } from './components/modal/index.js';
import { ToastContainer } from './components/toast/index.js';
import { FullScreen } from './components/FullScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

// ============================================================================
// Main App Component
// ============================================================================

export default function App() {
  return (
    <ErrorBoundary onReset={() => console.clear()}>
      <FullScreen>
        <TUIProvider>
          <FocusProvider debug={false}>
            <ToastProvider maxToasts={5}>
              <ModalProvider maxModals={3}>
                <ViewProvider defaultView="chat">
                  <AppContent />
                </ViewProvider>
              </ModalProvider>
            </ToastProvider>
          </FocusProvider>
        </TUIProvider>
      </FullScreen>
    </ErrorBoundary>
  );
}

// ============================================================================
// App Content Component
// ============================================================================

function AppContent() {
  const { layout } = useTUI();
  const { toasts } = useToast();
  const { currentView } = useView();
  
  // Handle compact mode
  if (layout.isCompact) {
    return <CompactModeView />;
  }
  
  return (
    <Box 
      flexDirection="column" 
      width={layout.layoutSizes.width}
      height={layout.layoutSizes.height}
    >
      {/* Header */}
      <AppHeader />
      
      {/* Main Content Area */}
      <Box 
        flexDirection="row" 
        height={layout.layoutSizes.mainContentHeight}
        flexShrink={0}
      >
        {/* Main Panel */}
        <MainPanel />
        
        {/* Sidebar */}
        {layout.panels.sidebar && <Sidebar />}
      </Box>
      
      {/* Bottom Panel */}
      {layout.panels.bottomPanel && <BottomPanel />}
      
      {/* Input Bar */}
      <InputBar />
      
      {/* Overlays */}
      <ModalContainer />
      <ToastContainer toasts={toasts} position="top-right" />
    </Box>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function CompactModeView() {
  const { layout, minWidth, minHeight } = useTUI();
  
  return (
    <Box flexDirection="column" width={layout.layoutSizes.width} height={layout.layoutSizes.height}>
      <Box height={1} justifyContent="center">
        <Text color={theme.colors.error} bold>
          Terminal too small! Min: {minWidth}x{minHeight}
        </Text>
      </Box>
      <Box flexGrow={1} padding={1}>
        <Text color={theme.colors.text}>
          Current: {layout.terminal.width}x{layout.terminal.height}
          {'\n'}Please resize your terminal or use CLI mode:
          {'\n'}  hyper agent run "your task"
        </Text>
      </Box>
    </Box>
  );
}

function AppHeader() {
  const { layout } = useTUI();
  const { showInfo } = useToast();
  
  return (
    <Box 
      height={layout.layoutSizes.headerHeight}
      borderStyle="single"
      borderColor={theme.colors.primary}
      paddingX={1}
      alignItems="center"
      flexShrink={0}
    >
      <Box width="30%">
        <Text color={theme.colors.primary} bold>
          {icons.logo} HyperTerminal
          <Text color={theme.colors.muted}> v0.2.0</Text>
        </Text>
      </Box>
      
      <Box flexGrow={1} justifyContent="center">
        <Text color={theme.colors.muted}>
          {icons.sparkle} Press <Text color={theme.colors.accent} bold>Tab</Text> for commands
        </Text>
      </Box>
      
      <Box width="30%" justifyContent="flex-end">
        <Text color={theme.colors.success}>●</Text>
        <Text color={theme.colors.muted}> Connected</Text>
      </Box>
    </Box>
  );
}

function MainPanel() {
  const { layout } = useTUI();
  const { currentView } = useView();
  
  return (
    <Box 
      width={layout.layoutSizes.mainPanelWidth}
      height={layout.layoutSizes.mainContentHeight}
      borderStyle="single"
      borderColor={theme.colors.border}
      padding={1}
    >
      <Text color={theme.colors.text}>
        View: {currentView}
        {'\n'}Main content area (placeholder)
        {'\n'}Layout: {layout.layoutSizes.mainPanelWidth}x{layout.layoutSizes.mainContentHeight}
      </Text>
    </Box>
  );
}

function Sidebar() {
  const { layout } = useTUI();
  
  return (
    <Box 
      width={layout.layoutSizes.sidebarWidth}
      height={layout.layoutSizes.mainContentHeight}
      borderStyle="single"
      borderColor={theme.colors.border}
      padding={1}
    >
      <Text color={theme.colors.primary} bold>
        {icons.calendar} Sidebar
      </Text>
      <Box marginTop={1}>
        <Text color={theme.colors.muted}>
          Calendar, Email, Meetings
        </Text>
      </Box>
    </Box>
  );
}

function BottomPanel() {
  const { layout } = useTUI();
  
  return (
    <Box 
      height={layout.layoutSizes.bottomPanelHeight}
      flexShrink={0}
    >
      <Box 
        flexGrow={1}
        borderStyle="single"
        borderColor={theme.colors.border}
        padding={1}
      >
        <Text color={theme.colors.primary}>
          {icons.check} Tasks
        </Text>
      </Box>
      <Box 
        width={layout.layoutSizes.sidebarWidth}
        borderStyle="single"
        borderColor={theme.colors.border}
        padding={1}
      >
        <Text color={theme.colors.primary}>
          {icons.stats} Stats
        </Text>
      </Box>
    </Box>
  );
}

function InputBar() {
  const { layout } = useTUI();
  const { openPalette } = useModal();
  const { showInfo } = useToast();
  const { useInput } = require('ink');
  
  useInput((input: string, key: any) => {
    if (key.tab) {
      // Open command palette
      openPalette({
        items: [
          { id: '1', label: 'View Tasks', icon: icons.check },
          { id: '2', label: 'View Calendar', icon: icons.calendar },
          { id: '3', label: 'Settings', icon: icons.settings },
        ],
        onSelect: (item) => showInfo(`Selected: ${item.label}`),
      });
    }
  });
  
  return (
    <Box 
      height={layout.layoutSizes.inputBarHeight}
      borderStyle="single"
      borderColor={theme.colors.primary}
      paddingX={1}
      alignItems="center"
      flexShrink={0}
    >
      <Text color={theme.colors.primary} bold>{'>'}</Text>
      <Text color={theme.colors.muted}>
        {' '}Type a message... (Tab for commands)
      </Text>
      <Box flexGrow={1} />
      <Text color={theme.colors.muted}>
        Tab:Cmds | ESC:Exit
      </Text>
    </Box>
  );
}
