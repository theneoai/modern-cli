#!/usr/bin/env node
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { MainPanel } from './components/MainPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { TaskPanel } from './components/TaskPanel.js';
import { InputBar } from './components/InputBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { FullScreen } from './components/FullScreen.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { Toast } from './components/Toast.js';
import { useTasks } from './hooks/useTasks.js';
import { useGoogleData } from './hooks/useGoogleData.js';
import { useCommandParser } from './hooks/useCommandParser.js';
import { tuiTheme as theme, icons, layout } from '../theme/index.js';

export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  agentName?: string;
  agentIcon?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  content: string;
  duration?: number;
}

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [inputMode] = useState<'command' | 'chat'>('chat');
  const [terminalSize, setTerminalSize] = useState({
    width: stdout.columns || 120,
    height: stdout.rows || 40,
  });
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [focusedPanel, setFocusedPanel] = useState<'input' | 'main' | 'sidebar' | 'tasks'>('input');
  
  const { tasks, addTask, updateTask, completeTask, deleteTask, hasPendingTasks } = useTasks();
  const { events, emails, meetings, loading, error: dataError, refreshData } = useGoogleData();
  const { executeCommand } = useCommandParser();

  // Toast helper
  const showToast = useCallback((type: ToastMessage['type'], content: string, duration = 3000) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, content, duration }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  // Listen for terminal resize
  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({
        width: stdout.columns || 120,
        height: stdout.rows || 40,
      });
    };

    stdout.on('resize', handleResize);
    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  // Show toast when data loading fails
  useEffect(() => {
    if (dataError) {
      showToast('error', `Data sync failed: ${dataError.message}`);
    }
  }, [dataError, showToast]);

  // Welcome message
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content: `✨ Welcome to ${theme.gradient('NEO')} v0.4.0\nYour AI-native personal OS is ready.\nTerminal: ${terminalSize.width}x${terminalSize.height} | Type /help for commands.`,
        timestamp: new Date(),
      },
    ]);
  }, []);

  // Calculate dynamic layout sizes
  const layoutSizes = useMemo(() => {
    const { width, height } = terminalSize;
    const tooSmall = width < layout.minWidth || height < layout.minHeight;
    
    // If terminal too small, return minimal layout
    if (tooSmall) {
      return {
        width,
        height,
        headerHeight: 1,
        inputBarHeight: 1,
        bottomPanelHeight: 0,
        mainContentHeight: height - 2,
        sidebarWidth: 0,
        mainPanelWidth: width,
        isCompact: true,
      };
    }
    
    // Header: always 3 rows
    const headerHeight = layout.headerHeight;
    
    // Focus indicator: 1 row
    const focusIndicatorHeight = 1;
    
    // Input bar: always 3 rows  
    const inputBarHeight = layout.inputBarHeight;
    
    // Bottom panel (tasks + stats): 25% of remaining or min 10
    const remainingHeight = height - headerHeight - focusIndicatorHeight - inputBarHeight;
    const bottomPanelHeight = Math.max(layout.minBottomPanelHeight, Math.floor(remainingHeight * 0.25));
    
    // Main content area
    const mainContentHeight = remainingHeight - bottomPanelHeight;
    
    // Sidebar width: responsive (max 40, min 25)
    const sidebarWidth = Math.min(layout.sidebarWidthMax, Math.max(layout.sidebarWidthMin, Math.floor(width * layout.sidebarWidthPercent)));
    
    // Main panel takes remaining width
    const mainPanelWidth = width - sidebarWidth;
    
    return {
      width,
      height,
      headerHeight,
      focusIndicatorHeight,
      inputBarHeight,
      bottomPanelHeight,
      mainContentHeight,
      sidebarWidth,
      mainPanelWidth,
      isCompact: false,
    };
  }, [terminalSize]);

  // Handle user input
  const handleInput = useCallback(async (input: string) => {
    if (!input.trim()) return;

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Check if it's a command
    if (input.startsWith('/')) {
      try {
        const result = await executeCommand(input, {
          addTask,
          updateTask,
          completeTask,
          deleteTask,
          refreshData,
          setMessages,
          exit,
          showToast,
        });

        if (result.message) {
          if (result.success) {
            showToast('success', result.message);
          } else {
            showToast('error', result.message);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast('error', `Command failed: ${msg}`);
      }
      return;
    }

    // Natural language task creation
    if (input.toLowerCase().includes('todo') || 
        input.toLowerCase().includes('task') ||
        input.toLowerCase().startsWith('add ')) {
      const taskTitle = input.replace(/^(add|create|new)\s+/i, '');
      const task = addTask({
        title: taskTitle,
        priority: input.includes('urgent') || input.includes('important') ? 'high' : 'medium',
      });
      
      showToast('success', `Created task: ${task.title}`);
      return;
    }

    // Check for update task status patterns
    const doneMatch = input.match(/(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)/i);
    if (doneMatch) {
      const taskTitle = doneMatch[1];
      const task = tasks.find(t => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
      if (task) {
        completeTask(task.id);
        showToast('success', `Completed: ${task.title}`);
        return;
      }
    }

    // Default: echo with AI processing indicator
    setMessages(prev => [...prev, {
      id: Date.now().toString() + '-ai',
      type: 'agent',
      content: `Processing: "${input}"...\nTry starting with:\n  • "Add buy milk" - create task\n  • "/calendar" - view calendar\n  • "/tasks" - view all tasks\n  • "/help" - see all commands`,
      timestamp: new Date(),
      agentName: 'Assistant',
      agentIcon: '🤖',
    }]);
  }, [addTask, completeTask, deleteTask, executeCommand, exit, refreshData, setMessages, showToast, tasks]);

  // Keyboard shortcuts
  useInput((input, key) => {
    // Handle exit confirmation
    if (showExitConfirm) {
      if (input === 'y' || input === 'Y') {
        exit();
      } else if (input === 'n' || input === 'N' || key.escape) {
        setShowExitConfirm(false);
      }
      return;
    }

    // Handle command palette
    if (showCommandPalette) {
      if (key.escape) {
        setShowCommandPalette(false);
      }
      // Command palette handles its own keyboard input
      return;
    }

    if (key.escape) {
      if (hasPendingTasks) {
        setShowExitConfirm(true);
      } else {
        exit();
      }
      return;
    }
    
    // Tab to cycle through panels (when not in input)
    if (key.tab && !key.shift) {
      setFocusedPanel(prev => {
        const panels: ('input' | 'main' | 'sidebar' | 'tasks')[] = ['input', 'main', 'sidebar', 'tasks'];
        const currentIndex = panels.indexOf(prev);
        return panels[(currentIndex + 1) % panels.length];
      });
      return;
    }
    
    // Shift+Tab to cycle backwards
    if (key.tab && key.shift) {
      setFocusedPanel(prev => {
        const panels: ('input' | 'main' | 'sidebar' | 'tasks')[] = ['input', 'main', 'sidebar', 'tasks'];
        const currentIndex = panels.indexOf(prev);
        return panels[(currentIndex - 1 + panels.length) % panels.length];
      });
      return;
    }
    
    // Quick focus shortcuts
    if (key.ctrl) {
      if (input === '1') {
        setFocusedPanel('input');
        return;
      }
      if (input === '2') {
        setFocusedPanel('main');
        return;
      }
      if (input === '3') {
        setFocusedPanel('sidebar');
        return;
      }
      if (input === '4') {
        setFocusedPanel('tasks');
        return;
      }
    }
    
    if (key.ctrl && input === 'c') {
      showToast('info', '^C received. Press ESC to exit.');
    }
  });

  // Compact mode for small terminals
  if (layoutSizes.isCompact) {
    return (
      <FullScreen>
        <Box flexDirection="column" width={layoutSizes.width} height={layoutSizes.height}>
          <Box height={1} backgroundColor={theme.colors.error} justifyContent="center">
            <Text color={theme.colors.text} bold>
              Terminal too small! Min: {layout.minWidth}x{layout.minHeight}
            </Text>
          </Box>
          <Box flexGrow={1} padding={1}>
            <Text color={theme.colors.text}>
              Current: {terminalSize.width}x{terminalSize.height}\n
              Please resize your terminal or use CLI mode:\n
              hyper agent run "your task"
            </Text>
          </Box>
        </Box>
      </FullScreen>
    );
  }

  return (
    <FullScreen>
      <Box 
        flexDirection="column" 
        width={layoutSizes.width}
        height={layoutSizes.height}
      >
        {/* Header */}
        <Box height={layoutSizes.headerHeight} flexShrink={0}>
          <Header 
            title="NEO"
            subtitle={`v0.4.0 | ${terminalSize.width}×${terminalSize.height}`}
            notifications={emails.filter(e => !e.read).length}
          />
        </Box>

        {/* Focus indicator */}
        <Box height={layoutSizes.focusIndicatorHeight} flexShrink={0}>
          <Text color={theme.colors.muted}>
            Focus: {focusedPanel} | Tab:cycle | Ctrl+1/2/3/4:focus | ESC:exit
          </Text>
        </Box>

        {/* Main Content Area */}
        <Box 
          flexDirection="row" 
          height={layoutSizes.mainContentHeight}
          flexShrink={0}
        >
          {/* Left: Main Terminal Area */}
          <Box 
            width={layoutSizes.mainPanelWidth} 
            flexDirection="column"
            flexShrink={0}
          >
            <MainPanel 
              messages={messages} 
              height={layoutSizes.mainContentHeight}
              width={layoutSizes.mainPanelWidth}
              isFocused={focusedPanel === 'main'}
            />
          </Box>

          {/* Right: Sidebar */}
          <Box 
            width={layoutSizes.sidebarWidth} 
            flexDirection="column" 
            flexShrink={0}
            borderStyle="single" 
            borderColor={theme.colors.border}
          >
            <Sidebar 
              events={events}
              emails={emails}
              meetings={meetings}
              loading={loading}
              height={layoutSizes.mainContentHeight}
              width={layoutSizes.sidebarWidth}
              isFocused={focusedPanel === 'sidebar'}
            />
          </Box>
        </Box>

        {/* Bottom Area */}
        <Box 
          flexDirection="row" 
          height={layoutSizes.bottomPanelHeight}
          flexShrink={0}
        >
          {/* Bottom Left: Tasks */}
          <Box 
            flexGrow={1} 
            flexShrink={0}
            borderStyle="single" 
            borderColor={focusedPanel === 'tasks' ? theme.colors.primary : theme.colors.border}
          >
            <TaskPanel 
              tasks={tasks} 
              onUpdateTask={updateTask}
              onCompleteTask={completeTask}
              onDeleteTask={deleteTask}
              height={layoutSizes.bottomPanelHeight}
              showToast={showToast}
              isFocused={focusedPanel === 'tasks'}
            />
          </Box>

          {/* Bottom Right: Quick Stats */}
          <Box 
            width={layoutSizes.sidebarWidth} 
            flexShrink={0}
            borderStyle="single" 
            borderColor={theme.colors.border} 
            padding={1}
          >
            <Text color={theme.colors.primary}>{icons.stats} Quick Stats</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.colors.text}>
                {icons.pending} {tasks.filter(t => t.status === 'pending').length} pending
              </Text>
              <Text color={theme.colors.success}>
                {icons.check} {tasks.filter(t => t.status === 'completed').length} done
              </Text>
              <Text color={theme.colors.warning}>
                {icons.calendar} {events.length} events today
              </Text>
              <Text color={theme.colors.info}>
                {icons.email} {emails.filter(e => !e.read).length} unread
              </Text>
              <Text color={theme.colors.muted}>
                {terminalSize.width}×{terminalSize.height}
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Input Bar */}
        <Box 
          height={layoutSizes.inputBarHeight} 
          flexShrink={0}
          borderStyle={focusedPanel === 'input' ? 'double' : 'single'}
          borderColor={focusedPanel === 'input' ? theme.colors.primary : theme.colors.border}
        >
          <InputBar 
            onSubmit={handleInput} 
            mode={inputMode}
            width={layoutSizes.width - 2}
            isFocused={focusedPanel === 'input'}
          />
        </Box>

        {/* Command Palette Overlay */}
        {showCommandPalette && (
          <CommandPalette 
            onSelect={(cmd) => {
              handleInput(cmd);
              setShowCommandPalette(false);
            }}
            onClose={() => setShowCommandPalette(false)}
            width={Math.min(80, layoutSizes.width - 4)}
            height={Math.min(20, layoutSizes.height - 8)}
          />
        )}

        {/* Exit Confirmation Dialog */}
        {showExitConfirm && (
          <ConfirmDialog
            title="Exit NEO?"
            message={hasPendingTasks ? `You have ${tasks.filter(t => t.status === 'pending').length} pending tasks.` : undefined}
            onConfirm={() => exit()}
            onCancel={() => setShowExitConfirm(false)}
          />
        )}

        {/* Toast Notifications */}
        <Box position="absolute" marginTop={1} marginLeft={1} flexDirection="column">
          {toasts.map((toast, index) => (
            <Box key={toast.id} marginTop={index > 0 ? 1 : 0}>
              <Toast type={toast.type} content={toast.content} />
            </Box>
          ))}
        </Box>
      </Box>
    </FullScreen>
  );
}
