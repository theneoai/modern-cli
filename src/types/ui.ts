/**
 * Shared UI Types for HyperTerminal
 * 
 * Centralized type definitions for TUI components to avoid duplication
 */

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// Message Types
// ============================================================================

export type MessageType = 'user' | 'agent' | 'system';

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  agentName?: string;
  agentIcon?: string;
}

// ============================================================================
// Toast Types
// ============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  content: string;
  duration?: number;
}

// ============================================================================
// Google Data Types
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  type: 'event' | 'reminder';
}

export interface Email {
  id: string;
  subject: string;
  from: string;
  preview: string;
  read: boolean;
  receivedAt: Date;
  priority: 'high' | 'normal' | 'low';
}

export interface Meeting {
  id: string;
  title: string;
  time: Date;
  duration: number;
  attendees: number;
  link?: string;
}

// ============================================================================
// Command Types
// ============================================================================

export interface CommandResult {
  success: boolean;
  message?: string;
}

export interface CommandContext {
  addTask: (task: Partial<Task>) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  completeTask: (id: string) => void;
  deleteTask: (id: string) => void;
  refreshData: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  exit: () => void;
  showToast?: (type: ToastType, content: string) => void;
}

// ============================================================================
// Layout Types
// ============================================================================

export interface TerminalSize {
  width: number;
  height: number;
}

export interface LayoutSizes {
  width: number;
  height: number;
  headerHeight: number;
  inputBarHeight: number;
  bottomPanelHeight: number;
  mainContentHeight: number;
  sidebarWidth: number;
  mainPanelWidth: number;
  isCompact: boolean;
}
