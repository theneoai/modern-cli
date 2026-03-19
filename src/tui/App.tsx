#!/usr/bin/env node
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { Header } from './components/Header.js';
import { MainPanel } from './components/MainPanel.js';
import { Sidebar } from './components/Sidebar.js';
import { TaskPanel } from './components/TaskPanel.js';
import { InputBar } from './components/InputBar.js';
import { CommandPalette } from './components/CommandPalette.js';
import { FullScreen } from './components/FullScreen.js';
import { useTasks } from './hooks/useTasks.js';
import { useGoogleData } from './hooks/useGoogleData.js';
import { useCommandParser } from './hooks/useCommandParser.js';
import { theme, icons } from './theme.js';

export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  agentName?: string;
  agentIcon?: string;
}

export default function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activePanel, setActivePanel] = useState<'main' | 'sidebar' | 'tasks'>('main');
  const [inputMode, setInputMode] = useState<'command' | 'chat'>('chat');
  const [terminalSize, setTerminalSize] = useState({
    width: stdout.columns || 120,
    height: stdout.rows || 40,
  });
  
  const { tasks, addTask, updateTask, completeTask, deleteTask } = useTasks();
  const { events, emails, meetings, loading, refreshData } = useGoogleData();
  const { parseCommand, executeCommand } = useCommandParser();

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

  // Calculate dynamic layout sizes
  const layout = useMemo(() => {
    const { width, height } = terminalSize;
    
    // Header: always 3 rows
    const headerHeight = 3;
    
    // Input bar: always 3 rows  
    const inputBarHeight = 3;
    
    // Bottom panel (tasks + stats): 25% of remaining or min 10
    const bottomPanelHeight = Math.max(10, Math.floor((height - headerHeight - inputBarHeight) * 0.25));
    
    // Main content area
    const mainContentHeight = height - headerHeight - bottomPanelHeight - inputBarHeight;
    
    // Sidebar width: responsive (max 40, min 25)
    const sidebarWidth = Math.min(40, Math.max(25, Math.floor(width * 0.25)));
    
    // Main panel takes remaining width
    const mainPanelWidth = width - sidebarWidth;
    
    return {
      width,
      height,
      headerHeight,
      inputBarHeight,
      bottomPanelHeight,
      mainContentHeight,
      sidebarWidth,
      mainPanelWidth,
    };
  }, [terminalSize]);

  // Welcome message
  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        type: 'system',
        content: `✨ Welcome to ${theme.gradient('HyperTerminal')} v0.2.0\nYour AI-native personal OS is ready.\nTerminal: ${terminalSize.width}x${terminalSize.height} | Type /help for commands.`,
        timestamp: new Date(),
      },
    ]);
  }, []);

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
      const result = await executeCommand(input, {
        addTask,
        updateTask,
        completeTask,
        deleteTask,
        refreshData,
        setMessages,
        exit,
      });
      
      if (result.message) {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '-cmd',
          type: 'system',
          content: result.message,
          timestamp: new Date(),
        }]);
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
      
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '-task',
        type: 'system',
        content: `✅ Created task: ${task.title}`,
        timestamp: new Date(),
      }]);
      return;
    }

    // Check for update task status patterns
    const doneMatch = input.match(/(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)/i);
    if (doneMatch) {
      const taskTitle = doneMatch[1];
      const task = tasks.find(t => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
      if (task) {
        completeTask(task.id);
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '-done',
          type: 'system',
          content: `✅ Completed: ${task.title}`,
          timestamp: new Date(),
        }]);
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
  }, [addTask, completeTask, deleteTask, executeCommand, exit, refreshData, setMessages, tasks, updateTask]);

  // Keyboard shortcuts
  useInput((input, key) => {
    if (key.escape) {
      if (showCommandPalette) {
        setShowCommandPalette(false);
      } else {
        exit();
      }
    }
    
    if (key.tab) {
      setShowCommandPalette(prev => !prev);
    }
    
    if (key.ctrl && input === 'c') {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        type: 'system',
        content: '^C received. Press ESC to exit.',
        timestamp: new Date(),
      }]);
    }
  });

  return (
    <FullScreen>
      <Box 
        flexDirection="column" 
        width={layout.width}
        height={layout.height}
      >
        {/* Header */}
        <Box height={layout.headerHeight} flexShrink={0}>
          <Header 
            title="HyperTerminal" 
            subtitle={`v0.2.0 | ${terminalSize.width}×${terminalSize.height}`}
            notifications={emails.filter(e => !e.read).length}
          />
        </Box>

        {/* Main Content Area */}
        <Box 
          flexDirection="row" 
          height={layout.mainContentHeight}
          flexShrink={0}
        >
          {/* Left: Main Terminal Area */}
          <Box 
            width={layout.mainPanelWidth} 
            flexDirection="column"
            flexShrink={0}
          >
            <MainPanel 
              messages={messages} 
              height={layout.mainContentHeight}
              width={layout.mainPanelWidth}
            />
          </Box>

          {/* Right: Sidebar */}
          <Box 
            width={layout.sidebarWidth} 
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
              height={layout.mainContentHeight}
              width={layout.sidebarWidth}
            />
          </Box>
        </Box>

        {/* Bottom Area */}
        <Box 
          flexDirection="row" 
          height={layout.bottomPanelHeight}
          flexShrink={0}
        >
          {/* Bottom Left: Tasks */}
          <Box 
            flexGrow={1} 
            flexShrink={0}
            borderStyle="single" 
            borderColor={theme.colors.border}
          >
            <TaskPanel 
              tasks={tasks} 
              onUpdateTask={updateTask}
              height={layout.bottomPanelHeight}
            />
          </Box>

          {/* Bottom Right: Quick Stats */}
          <Box 
            width={layout.sidebarWidth} 
            flexShrink={0}
            borderStyle="single" 
            borderColor={theme.colors.border} 
            padding={1}
          >
            <Text color={theme.colors.primary}>{icons.stats} Quick Stats</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text color={theme.colors.text}>
                {icons.task} {tasks.filter(t => t.status === 'pending').length} pending
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
        <Box height={layout.inputBarHeight} flexShrink={0}>
          <InputBar 
            onSubmit={handleInput} 
            mode={inputMode}
            width={layout.width}
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
            width={Math.min(80, layout.width - 4)}
            height={Math.min(20, layout.height - 8)}
          />
        )}
      </Box>
    </FullScreen>
  );
}
