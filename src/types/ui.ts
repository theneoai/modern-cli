// Shared UI types for TUI components

export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  completed: boolean;
  dueDate?: Date;
  description?: string;
  tags?: string[];
}

export interface Message {
  id: string;
  role?: 'user' | 'assistant' | 'system';
  type?: 'user' | 'agent' | 'system';
  content: string;
  contentLines?: string[];
  timestamp: Date;
  agentName?: string;
  agentIcon?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  description?: string;
  type?: 'event' | 'reminder';
}

export interface Email {
  id: string;
  from: string;
  subject: string;
  body?: string;
  preview?: string;
  read: boolean;
  priority?: 'high' | 'normal' | 'low';
  timestamp?: Date;
  receivedAt?: Date;
}

export interface Meeting {
  id: string;
  title: string;
  time: Date;
  duration: number; // minutes
  attendees: number;
  location?: string;
  link?: string;
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
