/**
 * User Preferences - Personalization and settings
 */

import { getDB } from '../core/db/index.js';

export interface UserPreferences {
  userId: string;
  theme: 'dark' | 'light' | 'auto';
  language: string;
  timezone: string;
  dateFormat: 'iso' | 'locale' | 'relative';
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    email: boolean;
    quietHours: { start: string; end: string } | null;
  };
  display: {
    compactMode: boolean;
    showIcons: boolean;
    pageSize: number;
    autoRefresh: number; // seconds, 0 = off
  };
  editor: {
    defaultEditor: 'vim' | 'nano' | 'code' | string;
    autoSave: boolean;
    wordWrap: boolean;
  };
  shortcuts: Record<string, string>; // command -> shortcut
  updatedAt: Date;
}

const DEFAULT_PREFERENCES: Omit<UserPreferences, 'userId' | 'updatedAt'> = {
  theme: 'dark',
  language: 'zh-CN',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  dateFormat: 'locale',
  notifications: {
    enabled: true,
    sound: false,
    desktop: true,
    email: false,
    quietHours: null,
  },
  display: {
    compactMode: false,
    showIcons: true,
    pageSize: 20,
    autoRefresh: 0,
  },
  editor: {
    defaultEditor: 'vim',
    autoSave: true,
    wordWrap: true,
  },
  shortcuts: {
    'agent list': 'agents',
    'workflow list': 'workflows',
    'monitor status': 'status',
    'backup create': 'backup',
  },
};

// Get preferences
export function getPreferences(userId: string = 'default'): UserPreferences {
  const db = getDB();
  const row = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as any;
  
  if (!row) {
    // Create default preferences
    return createPreferences(userId, {});
  }

  return rowToPreferences(row);
}

// Create/update preferences
export function createPreferences(
  userId: string,
  prefs: Partial<Omit<UserPreferences, 'userId' | 'updatedAt'>>
): UserPreferences {
  const db = getDB();
  const now = new Date();
  
  const merged: UserPreferences = {
    ...DEFAULT_PREFERENCES,
    ...prefs,
    userId,
    updatedAt: now,
  };

  db.prepare(`
    INSERT OR REPLACE INTO user_preferences (user_id, theme, language, timezone, date_format, 
      notifications, display, editor, shortcuts, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    merged.theme,
    merged.language,
    merged.timezone,
    merged.dateFormat,
    JSON.stringify(merged.notifications),
    JSON.stringify(merged.display),
    JSON.stringify(merged.editor),
    JSON.stringify(merged.shortcuts),
    now.toISOString()
  );

  return merged;
}

// Update preferences
export function updatePreferences(
  userId: string,
  updates: Partial<Omit<UserPreferences, 'userId' | 'updatedAt'>>
): UserPreferences {
  const current = getPreferences(userId);
  return createPreferences(userId, { ...current, ...updates });
}

// Update specific section
export function updatePreferenceSection<K extends keyof Omit<UserPreferences, 'userId' | 'updatedAt'>>(
  userId: string,
  section: K,
  values: Partial<UserPreferences[K]>
): UserPreferences {
  const current = getPreferences(userId);
  const sectionData = { ...current[section], ...values };
  return updatePreferences(userId, { [section]: sectionData } as any);
}

// Reset to defaults
export function resetPreferences(userId: string = 'default'): UserPreferences {
  return createPreferences(userId, DEFAULT_PREFERENCES);
}

// Export preferences
export function exportPreferences(userId: string = 'default'): string {
  const prefs = getPreferences(userId);
  return JSON.stringify(prefs, null, 2);
}

// Import preferences
export function importPreferences(json: string, userId: string = 'default'): UserPreferences {
  const parsed = JSON.parse(json);
  return createPreferences(userId, parsed);
}

// Get theme for display
export function getActiveTheme(prefs?: UserPreferences): 'dark' | 'light' {
  const preferences = prefs || getPreferences();
  
  if (preferences.theme === 'auto') {
    // Check system preference (simplified - would use OS API in real implementation)
    const hour = new Date().getHours();
    return hour >= 6 && hour < 18 ? 'light' : 'dark';
  }
  
  return preferences.theme;
}

// Format date according to preferences
export function formatDate(date: Date, prefs?: UserPreferences): string {
  const preferences = prefs || getPreferences();
  
  switch (preferences.dateFormat) {
    case 'iso':
      return date.toISOString();
    case 'relative':
      return getRelativeTime(date);
    case 'locale':
    default:
      return date.toLocaleString(preferences.language, { timeZone: preferences.timezone });
  }
}

// Get relative time string
function getRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// Check if notifications should be sent (respect quiet hours)
export function shouldNotify(prefs?: UserPreferences): boolean {
  const preferences = prefs || getPreferences();
  
  if (!preferences.notifications.enabled) return false;
  
  if (preferences.notifications.quietHours) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const { start, end } = preferences.notifications.quietHours;
    
    if (start <= end) {
      if (currentTime >= start && currentTime <= end) return false;
    } else {
      if (currentTime >= start || currentTime <= end) return false;
    }
  }
  
  return true;
}

// Initialize tables
export function initPreferencesTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      theme TEXT DEFAULT 'dark',
      language TEXT DEFAULT 'zh-CN',
      timezone TEXT,
      date_format TEXT DEFAULT 'locale',
      notifications TEXT,
      display TEXT,
      editor TEXT,
      shortcuts TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Helper
function rowToPreferences(row: any): UserPreferences {
  return {
    userId: row.user_id,
    theme: row.theme,
    language: row.language,
    timezone: row.timezone,
    dateFormat: row.date_format,
    notifications: row.notifications ? JSON.parse(row.notifications) : DEFAULT_PREFERENCES.notifications,
    display: row.display ? JSON.parse(row.display) : DEFAULT_PREFERENCES.display,
    editor: row.editor ? JSON.parse(row.editor) : DEFAULT_PREFERENCES.editor,
    shortcuts: row.shortcuts ? JSON.parse(row.shortcuts) : DEFAULT_PREFERENCES.shortcuts,
    updatedAt: new Date(row.updated_at),
  };
}
