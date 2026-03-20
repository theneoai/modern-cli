/**
 * App.new.tsx - 重构后的主应用组件
 * 
 * 设计原则：
 * 1. 职责分离：状态管理、视图渲染、事件处理分离
 * 2. 可组合性：通过 Provider 组合功能
 * 3. 可测试性：纯组件，依赖注入
 */

import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { tuiTheme as theme, icons } from '../theme/index.js';
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
import { MainPanel, TaskPanel, Sidebar } from './components/panel/index.js';
import { InputBar } from './components/input/index.js';
import { FullScreen } from './components/FullScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { Message, Task, CalendarEvent, Email, Meeting } from './types/ui.js';

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
  
  // Demo state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'system',
      content: 'Welcome to HyperTerminal! Type /help for commands.',
      timestamp: new Date(),
    },
    {
      id: '2',
      type: 'user',
      content: 'Hello, this is a demo message',
      timestamp: new Date(Date.now() - 60000),
    },
    {
      id: '3',
      type: 'agent',
      content: 'Hi there! How can I help you today?\nI can help with tasks, calendar, and more.',
      timestamp: new Date(Date.now() - 30000),
      agentName: 'Assistant',
      agentIcon: '🤖',
    },
  ]);
  
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Review project proposal',
      status: 'pending',
      priority: 'high',
      createdAt: new Date(),
    },
    {
      id: '2',
      title: 'Email team updates',
      status: 'in_progress',
      priority: 'medium',
      createdAt: new Date(Date.now() - 86400000),
    },
    {
      id: '3',
      title: 'Prepare presentation',
      status: 'pending',
      priority: 'high',
      createdAt: new Date(Date.now() - 172800000),
    },
  ]);
  
  // Demo sidebar data
  const [events] = useState<CalendarEvent[]>([
    { id: '1', title: 'Team Standup', startTime: new Date(), type: 'event' },
    { id: '2', title: 'Lunch with Sarah', startTime: new Date(Date.now() + 3600000), type: 'event' },
    { id: '3', title: 'Project Review', startTime: new Date(Date.now() + 7200000), type: 'event' },
  ]);
  
  const [emails] = useState<Email[]>([
    { id: '1', subject: 'Project Update', from: 'boss@company.com', preview: 'Here is the latest...', read: false, receivedAt: new Date(), priority: 'high' },
    { id: '2', subject: 'Team Lunch', from: 'team@company.com', preview: 'Let us meet at...', read: true, receivedAt: new Date(Date.now() - 3600000), priority: 'normal' },
  ]);
  
  const [meetings] = useState<Meeting[]>([
    { id: '1', title: 'Weekly Sync', time: new Date(Date.now() + 3600000), duration: 30, attendees: 5 },
    { id: '2', title: 'Design Review', time: new Date(Date.now() + 7200000), duration: 60, attendees: 3 },
  ]);
  
  // Task handlers
  const handleUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);
  
  const handleCompleteTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, status: 'completed' as const, completedAt: new Date() } : t
    ));
  }, []);
  
  const handleDeleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);
  
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
        {/* Main Panel - 使用重构后的组件 */}
        <MainPanel 
          messages={messages}
          height={layout.layoutSizes.mainContentHeight}
          width={layout.layoutSizes.mainPanelWidth}
          focusId="main-panel"
        />
        
        {/* Sidebar - 使用重构后的组件 */}
        {layout.panels.sidebar && (
          <Sidebar
            events={events}
            emails={emails}
            meetings={meetings}
            height={layout.layoutSizes.mainContentHeight}
            width={layout.layoutSizes.sidebarWidth}
            focusId="sidebar"
          />
        )}
      </Box>
      
      {/* Bottom Panel - 使用重构后的TaskPanel */}
      {layout.panels.bottomPanel && (
        <Box 
          height={layout.layoutSizes.bottomPanelHeight}
          flexShrink={0}
        >
          <Box flexGrow={1}>
            <TaskPanel
              tasks={tasks}
              onUpdateTask={handleUpdateTask}
              onCompleteTask={handleCompleteTask}
              onDeleteTask={handleDeleteTask}
              height={layout.layoutSizes.bottomPanelHeight}
              focusId="task-panel"
            />
          </Box>
          <Box width={layout.layoutSizes.sidebarWidth}>
            <StatsPanel tasks={tasks} />
          </Box>
        </Box>
      )}
      
      {/* Input Bar - 使用重构后的组件 */}
      <InputBar
        onSubmit={(input) => {
          // Handle user input
          console.log('Submitted:', input);
        }}
        placeholder="Type a message or command..."
        mode="chat"
      />
      
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

interface StatsPanelProps {
  tasks: Task[];
}

function StatsPanel({ tasks }: StatsPanelProps) {
  const { layout } = useTUI();
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  
  return (
    <Box 
      height={layout.layoutSizes.bottomPanelHeight}
      borderStyle="single"
      borderColor={theme.colors.border}
      padding={1}
    >
      <Text color={theme.colors.primary}>{icons.stats} Quick Stats</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.colors.text}>
          {icons.pending} {pendingCount} pending
        </Text>
        <Text color={theme.colors.success}>
          {icons.check} {completedCount} done
        </Text>
        <Text color={theme.colors.info}>
          {icons.check} {tasks.length} total
        </Text>
      </Box>
    </Box>
  );
}
