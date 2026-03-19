/**
 * Unified Theme System for HyperTerminal
 * 
 * This module provides a consistent theme across both CLI and TUI interfaces.
 * All colors, icons, and styles are centralized here.
 */

import chalk from 'chalk';

// ============================================================================
// Color Palette
// ============================================================================

export const palette = {
  // Primary brand colors
  primary: '#6366f1',      // Indigo - main brand
  primaryLight: '#818cf8', // Light indigo
  secondary: '#8b5cf6',    // Purple - accent
  accent: '#f472b6',       // Pink - highlights
  
  // Status colors
  success: '#22c55e',      // Green
  warning: '#f59e0b',      // Amber
  error: '#ef4444',        // Red
  info: '#3b82f6',         // Blue
  
  // Grayscale
  text: '#e2e8f0',         // Slate 200 - main text
  textMuted: '#94a3b8',    // Slate 400 - secondary text
  border: '#334155',       // Slate 700 - borders
  background: '#0f172a',   // Slate 900 - background
  surface: '#1e293b',      // Slate 800 - panels
  surfaceLight: '#334155', // Slate 700 - elevated
} as const;

// ============================================================================
// Chalk Theme (for CLI output)
// ============================================================================

export const chalkTheme = {
  primary: chalk.hex(palette.primary),
  secondary: chalk.hex(palette.secondary),
  success: chalk.hex(palette.success),
  warning: chalk.hex(palette.warning),
  error: chalk.hex(palette.error),
  info: chalk.hex(palette.info),
  muted: chalk.hex(palette.textMuted),
  text: chalk.hex(palette.text),
  bold: chalk.bold,
  dim: chalk.dim,
  italic: chalk.italic,
  
  // Compound styles
  heading: chalk.bold.hex(palette.primary),
  code: chalk.bgHex(palette.surface).hex(palette.text),
  user: chalk.bold.hex(palette.info),
  assistant: chalk.bold.hex(palette.secondary),
} as const;

// ============================================================================
// Ink Theme (for TUI - returns raw color values)
// ============================================================================

export const inkTheme = {
  colors: {
    primary: palette.primary,
    primaryLight: palette.primaryLight,
    secondary: palette.secondary,
    accent: palette.accent,
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
    info: palette.info,
    text: palette.text,
    muted: palette.textMuted,
    border: palette.border,
    background: palette.background,
    surface: palette.surface,
    surfaceLight: palette.surfaceLight,
  },
  
  gradient: (text: string) => chalkTheme.primary.bold(text),
  
  styles: {
    title: chalkTheme.heading,
    subtitle: chalkTheme.muted,
    highlight: chalk.bold.hex(palette.accent),
    code: chalkTheme.code,
    link: chalk.underline.hex(palette.info),
  }
} as const;

// ============================================================================
// Unified Icons
// ============================================================================

export const icons = {
  // Brand
  logo: '🚀',
  ai: '✦',
  sparkle: '✨',
  
  // Users
  user: '👤',
  agent: '🤖',
  robot: '⬡',
  
  // Actions
  add: '+',
  edit: '✏️',
  delete: '🗑️',
  check: '✔',
  checkHeavy: '✅',
  cross: '✖',
  crossHeavy: '❌',
  pending: '○',
  inProgress: '◐',
  
  // Navigation
  arrow: '→',
  arrowUp: '↑',
  arrowDown: '↓',
  bullet: '•',
  
  // Communication
  calendar: '📅',
  email: '✉️',
  meeting: '📹',
  bell: '🔔',
  chat: '💬',
  
  // Status
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  thinking: '◌',
  waiting: '⏳',
  running: '⚡',
  
  // System
  settings: '⚙️',
  search: '🔍',
  time: '⏰',
  stats: '📊',
  memory: '🧠',
  building: '🏢',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format time as HH:MM
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

/**
 * Format date as "Jan 15"
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Wrap text at given width
 */
export function wrapText(text: string, width = 80): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

/**
 * Create wrapped text lines array
 */
export function wrapTextLines(text: string, width: number): string[] {
  const lines: string[] = [];
  const rawLines = text.split('\n');
  
  for (const line of rawLines) {
    if (line.length <= width) {
      lines.push(line);
    } else {
      let currentLine = '';
      const words = line.split(' ');
      
      for (const word of words) {
        if ((currentLine + ' ' + word).length <= width) {
          currentLine = currentLine ? currentLine + ' ' + word : word;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      
      if (currentLine) lines.push(currentLine);
    }
  }
  
  return lines;
}

/**
 * Format header with decorative lines
 */
export function formatHeader(title: string): string {
  const line = '─'.repeat(Math.min(50, title.length + 4));
  return `\n${chalkTheme.primary(line)}\n${chalkTheme.heading(`  ${title}  `)}\n${chalkTheme.primary(line)}\n`;
}

/**
 * Format section label: value
 */
export function formatSection(label: string, content: string): string {
  return `${chalkTheme.muted(label + ':')} ${content}`;
}

/**
 * Format error message
 */
export function formatError(message: string): string {
  return `${chalkTheme.error(icons.cross)} ${chalkTheme.error(message)}`;
}

/**
 * Format success message
 */
export function formatSuccess(message: string): string {
  return `${chalkTheme.success(icons.check)} ${message}`;
}

/**
 * Format warning message
 */
export function formatWarning(message: string): string {
  return `${chalkTheme.warning(icons.warning)} ${chalkTheme.warning(message)}`;
}

/**
 * Format info message
 */
export function formatInfo(message: string): string {
  return `${chalkTheme.info(icons.info)} ${chalkTheme.muted(message)}`;
}

// ============================================================================
// Layout Constants
// ============================================================================

export const layout = {
  // Minimum terminal dimensions
  minWidth: 80,
  minHeight: 24,
  
  // Panel heights
  headerHeight: 3,
  inputBarHeight: 3,
  minBottomPanelHeight: 8,
  
  // Sidebar
  sidebarWidthMin: 25,
  sidebarWidthMax: 40,
  sidebarWidthPercent: 0.25,
  
  // Input
  maxInputLength: 1000,
  maxHistorySize: 100,
  
  // Messages
  maxMessages: 1000,
} as const;

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// For CLI (chalk-based)
export const theme = chalkTheme;

// For TUI (raw colors)
export const tuiTheme = inkTheme;
