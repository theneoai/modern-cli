import chalk from 'chalk';

export const theme = {
  colors: {
    primary: '#6366f1',      // Indigo
    secondary: '#8b5cf6',    // Purple
    accent: '#f472b6',       // Pink
    success: '#22c55e',      // Green
    warning: '#f59e0b',      // Amber
    error: '#ef4444',        // Red
    info: '#3b82f6',         // Blue
    text: '#e2e8f0',         // Slate 200
    muted: '#94a3b8',        // Slate 400
    border: '#334155',       // Slate 700
    background: '#0f172a',   // Slate 900
    surface: '#1e293b',      // Slate 800
  },
  
  gradient: (text: string) => chalk.hex('#6366f1').bold(text),
  
  styles: {
    title: chalk.bold.hex('#6366f1'),
    subtitle: chalk.hex('#94a3b8'),
    highlight: chalk.bold.hex('#f472b6'),
    code: chalk.hex('#22c55e').bgHex('#0f172a'),
    link: chalk.underline.hex('#3b82f6'),
  }
};

export const icons = {
  logo: '🚀',
  agent: '🤖',
  user: '👤',
  calendar: '📅',
  email: '✉️',
  meeting: '📹',
  task: '✓',
  check: '✓',
  pending: '○',
  inProgress: '◐',
  warning: '⚠️',
  error: '✗',
  info: 'ℹ️',
  settings: '⚙️',
  search: '🔍',
  add: '+',
  delete: '🗑️',
  edit: '✏️',
  time: '⏰',
  stats: '📊',
  bell: '🔔',
  sparkle: '✨',
};

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
