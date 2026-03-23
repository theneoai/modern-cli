/**
 * layoutManager.ts — 布局预设管理 & 持久化
 *
 * 预设:
 *   focus   — 全屏主内容，无侧栏 (专注模式)
 *   split   — 主内容 + 侧栏 (默认)
 *   wide    — 宽侧栏 (信息密集)
 *   zen     — 最简模式：无侧栏、状态栏只显示必要信息
 *   custom  — 用户自定义尺寸
 *
 * 持久化: ~/.neo/layout.json
 *   每个模式可单独保存布局偏好
 *
 * 键盘:
 *   Ctrl+B       — 显示/隐藏侧栏
 *   Ctrl+[       — 收窄侧栏 (-2 列)
 *   Ctrl+]       — 展宽侧栏 (+2 列)
 *   Ctrl+Alt+L   — 循环切换预设
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AppMode } from '../FlowApp.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const LAYOUT_FILE = join(homedir(), '.neo', 'layout.json');

export const SIDEBAR_MIN = 20;
export const SIDEBAR_MAX = 70;
export const SIDEBAR_STEP = 2;

// ── Types ─────────────────────────────────────────────────────────────────────

export type LayoutPresetId = 'focus' | 'split' | 'wide' | 'zen' | 'custom';

export interface LayoutPreset {
  id: LayoutPresetId;
  name: string;
  label: string;        // short, for status bar
  icon: string;
  description: string;
  sidebarWidth: number; // 0 = hidden
}

export interface LayoutState {
  preset: LayoutPresetId;
  sidebarWidth: number;
  sidebarVisible: boolean;
  /** Per-mode sidebar width overrides */
  modeWidths: Partial<Record<AppMode, number>>;
}

interface PersistedLayout {
  version: 1;
  global: {
    preset: LayoutPresetId;
    sidebarWidth: number;
  };
  modeWidths: Partial<Record<AppMode, number>>;
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: 'focus',
    name: '专注',
    label: 'FOCUS',
    icon: '▣',
    description: '全屏主内容，无侧栏',
    sidebarWidth: 0,
  },
  {
    id: 'split',
    name: '分栏',
    label: 'SPLIT',
    icon: '▤',
    description: '主内容 + 30列侧栏',
    sidebarWidth: 30,
  },
  {
    id: 'wide',
    name: '宽栏',
    label: 'WIDE',
    icon: '▥',
    description: '主内容 + 45列宽侧栏',
    sidebarWidth: 45,
  },
  {
    id: 'zen',
    name: '禅模式',
    label: 'ZEN',
    icon: '○',
    description: '极简无侧栏',
    sidebarWidth: 0,
  },
  {
    id: 'custom',
    name: '自定义',
    label: 'CUSTOM',
    icon: '◈',
    description: '用户调整过的自定义布局',
    sidebarWidth: 32,
  },
];

// ── I/O ───────────────────────────────────────────────────────────────────────

function loadPersisted(): PersistedLayout | null {
  try {
    if (!existsSync(LAYOUT_FILE)) return null;
    return JSON.parse(readFileSync(LAYOUT_FILE, 'utf-8')) as PersistedLayout;
  } catch {
    return null;
  }
}

function savePersisted(state: LayoutState): void {
  try {
    mkdirSync(join(homedir(), '.neo'), { recursive: true, mode: 0o700 });
    const data: PersistedLayout = {
      version: 1,
      global: {
        preset: state.preset,
        sidebarWidth: state.sidebarWidth,
      },
      modeWidths: state.modeWidths,
    };
    writeFileSync(LAYOUT_FILE, JSON.stringify(data, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // best-effort
  }
}

// ── LayoutManager class ───────────────────────────────────────────────────────

export class LayoutManager {
  private state: LayoutState;

  constructor() {
    const persisted = loadPersisted();
    const defaultPreset: LayoutPresetId = 'split';
    const defaultWidth = LAYOUT_PRESETS.find(p => p.id === defaultPreset)!.sidebarWidth;

    this.state = {
      preset: persisted?.global.preset ?? defaultPreset,
      sidebarWidth: persisted?.global.sidebarWidth ?? defaultWidth,
      sidebarVisible: (persisted?.global.sidebarWidth ?? defaultWidth) > 0,
      modeWidths: persisted?.modeWidths ?? {},
    };
  }

  // ── Getters ─────────────────────────────────────────────────────────────────

  get preset(): LayoutPresetId { return this.state.preset; }
  get presetDef(): LayoutPreset {
    return LAYOUT_PRESETS.find(p => p.id === this.state.preset) ?? LAYOUT_PRESETS[1]!;
  }
  get sidebarWidth(): number { return this.state.sidebarWidth; }
  get sidebarVisible(): boolean { return this.state.sidebarVisible; }

  /** Effective sidebar width for a given terminal width — returns 0 if hidden */
  effectiveWidth(terminalWidth: number, mode?: AppMode): number {
    if (!this.state.sidebarVisible) return 0;
    // Mode-specific override
    const modeW = mode ? this.state.modeWidths[mode] : undefined;
    const raw = modeW ?? this.state.sidebarWidth;
    // Never allow sidebar to take more than 45% of terminal
    const max = Math.floor(terminalWidth * 0.45);
    return Math.max(0, Math.min(raw, max, SIDEBAR_MAX));
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  /** Toggle sidebar visibility */
  toggleSidebar(): LayoutState {
    this.state = {
      ...this.state,
      sidebarVisible: !this.state.sidebarVisible,
    };
    this.persist();
    return { ...this.state };
  }

  /** Show sidebar */
  showSidebar(): LayoutState {
    this.state = { ...this.state, sidebarVisible: true };
    this.persist();
    return { ...this.state };
  }

  /** Hide sidebar */
  hideSidebar(): LayoutState {
    this.state = { ...this.state, sidebarVisible: false };
    this.persist();
    return { ...this.state };
  }

  /** Resize sidebar by delta columns (positive = wider, negative = narrower) */
  resizeSidebar(delta: number, mode?: AppMode): LayoutState {
    const current = mode
      ? (this.state.modeWidths[mode] ?? this.state.sidebarWidth)
      : this.state.sidebarWidth;
    const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, current + delta));

    if (mode) {
      this.state = {
        ...this.state,
        preset: 'custom',
        sidebarVisible: true,
        modeWidths: { ...this.state.modeWidths, [mode]: next },
      };
    } else {
      this.state = {
        ...this.state,
        preset: 'custom',
        sidebarVisible: true,
        sidebarWidth: next,
      };
    }
    this.persist();
    return { ...this.state };
  }

  /** Apply a named preset */
  applyPreset(id: LayoutPresetId): LayoutState {
    const preset = LAYOUT_PRESETS.find(p => p.id === id);
    if (!preset) return { ...this.state };
    this.state = {
      ...this.state,
      preset: id,
      sidebarWidth: preset.sidebarWidth,
      sidebarVisible: preset.sidebarWidth > 0,
    };
    this.persist();
    return { ...this.state };
  }

  /** Cycle to next preset */
  cyclePreset(): { state: LayoutState; preset: LayoutPreset } {
    const ids = LAYOUT_PRESETS.map(p => p.id);
    const idx = ids.indexOf(this.state.preset);
    const nextId = ids[(idx + 1) % ids.length] as LayoutPresetId;
    const newState = this.applyPreset(nextId);
    return { state: newState, preset: LAYOUT_PRESETS.find(p => p.id === nextId)! };
  }

  /** Save a per-mode sidebar width (from keyboard resize in that mode) */
  saveModeWidth(mode: AppMode, width: number): void {
    this.state = {
      ...this.state,
      preset: 'custom',
      modeWidths: { ...this.state.modeWidths, [mode]: width },
    };
    this.persist();
  }

  /** Get immutable copy of state */
  getState(): LayoutState { return { ...this.state }; }

  private persist(): void {
    savePersisted(this.state);
  }
}

/** Global singleton — shared across the app */
export const layoutManager = new LayoutManager();
