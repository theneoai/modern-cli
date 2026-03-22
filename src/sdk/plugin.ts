/**
 * HyperTerminal Plugin SDK
 * ========================
 * 开发者友好的插件系统，三行代码即可创建一个功能插件。
 *
 * ## 快速开始
 *
 * ```typescript
 * import { definePlugin } from 'hyperterminal/sdk';
 *
 * export default definePlugin({
 *   id: 'my-plugin',
 *   name: '我的插件',
 *   version: '1.0.0',
 *   description: '做一些有趣的事',
 *
 *   // 注册 /my-cmd 命令
 *   commands: {
 *     'my-cmd': async ({ args, addMessage }) => {
 *       addMessage(`你好, ${args}!`);
 *     },
 *   },
 *
 *   // 状态栏小部件 (右上角显示)
 *   statusWidget: () => '⚡ 已激活',
 *
 *   // 自然语言触发 ("remind me..." → 触发 onNaturalInput)
 *   naturalTriggers: [/^remind me\s+(.+)/i],
 *   onNaturalInput: async ({ match, addMessage }) => {
 *     addMessage(`提醒已设置: ${match[1]}`);
 *   },
 * });
 * ```
 *
 * ## Plugin 接口完整说明
 *
 * ─── 生命周期 ───────────────────────────────────────
 * onLoad()          插件加载时调用 (可做初始化)
 * onUnload()        插件卸载时调用 (可做清理)
 * onTick(ctx)       每秒调用一次 (适合计时器/轮询)
 *
 * ─── 命令系统 ───────────────────────────────────────
 * commands          Record<cmdName, handler> 注册 /cmd 命令
 * naturalTriggers   RegExp[] 匹配自然语言输入
 * onNaturalInput    自然语言命中时的回调
 *
 * ─── UI 组件 ────────────────────────────────────────
 * statusWidget()    状态栏小组件 (返回字符串)
 * headerBadge()     标题 badge (返回字符串, 如 "3 封邮件")
 * view              React 组件, 在 PLUGINS 模式下显示
 *
 * ─── MCP Tools ──────────────────────────────────────
 * skills            Skill[] 注册 MCP 工具供 AI 调用
 */

import type { Skill, ToolResult } from '../mcp/types.js';

// ─── Context 传入每个 handler ───────────────────────────────────────────────

export interface PluginContext {
  /** 添加消息到对话面板 */
  addMessage: (content: string, role?: 'system' | 'assistant') => void;
  /** 显示 Toast 通知 */
  notify: (content: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  /** 切换 TUI 模式 */
  setMode: (mode: 'chat' | 'tasks' | 'notes' | 'agents' | 'plugins') => void;
  /** 读取配置 */
  getConfig: (key: string) => string | undefined;
  /** 写入配置 */
  setConfig: (key: string, value: string) => void;
  /** 当前所有任务 */
  getTasks: () => PluginTask[];
  /** 当前所有笔记 */
  getNotes: () => PluginNote[];
  /** 触发 AI 对话 */
  sendToAI: (prompt: string, systemPrompt?: string) => Promise<void>;
  /** Token 使用统计 */
  getTokenStats: () => TokenStats;
}

export interface CommandContext extends PluginContext {
  /** 命令参数 (/ 后面的文字) */
  args: string;
  /** 完整原始输入 */
  raw: string;
}

export interface NaturalInputContext extends PluginContext {
  /** 正则匹配结果 */
  match: RegExpMatchArray;
  /** 完整输入 */
  input: string;
}

export interface TickContext extends PluginContext {
  /** 当前时间戳 */
  now: Date;
  /** 插件已运行秒数 */
  uptime: number;
}

export interface StatusContext {
  now: Date;
  getConfig: (key: string) => string | undefined;
  getTokenStats: () => TokenStats;
}

// ─── Data Types ─────────────────────────────────────────────────────────────

export interface PluginTask {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'normal' | 'high';
}

export interface PluginNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
}

export interface TokenStats {
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  sessionCost: number;   // USD
  model: string;
}

// ─── Plugin Definition ──────────────────────────────────────────────────────

export interface PluginDefinition {
  /** 唯一 ID, 用于 /plugin enable my-plugin */
  id: string;
  /** 显示名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 描述 */
  description: string;
  /** 作者 */
  author?: string;
  /** 标签 */
  tags?: string[];

  // ─── 生命周期 ────────────────────────────────────────────────────────────
  onLoad?: (ctx: PluginContext) => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  /** 每秒 tick, 适合倒计时/轮询 */
  onTick?: (ctx: TickContext) => void | Promise<void>;

  // ─── 命令 ─────────────────────────────────────────────────────────────────
  /**
   * 注册 /cmd 命令. key = 命令名 (无斜杠), value = 处理函数
   * @example { 'remind': async (ctx) => { ... }, 'reminders': async (ctx) => { ... } }
   */
  commands?: Record<string, (ctx: CommandContext) => void | Promise<void>>;

  /**
   * 自然语言触发正则列表 (按顺序尝试匹配)
   * @example [/^remind me (\d+)min(.+)/i, /^set reminder(.+)/i]
   */
  naturalTriggers?: RegExp[];
  onNaturalInput?: (ctx: NaturalInputContext) => void | Promise<void>;

  // ─── UI ───────────────────────────────────────────────────────────────────
  /**
   * 状态栏右侧小组件文字, 约每秒刷新
   * 返回空字符串则不显示
   */
  statusWidget?: (ctx: StatusContext) => string;

  /**
   * 标题旁 badge 文字 (如未读数)
   */
  headerBadge?: (ctx: StatusContext) => string;

  /**
   * PLUGINS 视图下的内容渲染 (纯文本行, 避免依赖 React 让 SDK 更轻量)
   * 返回要显示的行数组
   */
  viewLines?: (ctx: StatusContext) => string[];

  // ─── MCP Skills ───────────────────────────────────────────────────────────
  /**
   * 注册 MCP tools, AI 可以调用这些工具
   */
  skills?: Skill[];
}

/** 类型安全的 definePlugin 帮助函数 */
export function definePlugin(def: PluginDefinition): PluginDefinition {
  return def;
}

/** Alias for backwards compatibility */
export type PluginDef = PluginDefinition;

/** 类型安全的 defineSkill 帮助函数 */
export function defineSkill(
  name: string,
  description: string,
  tools: Array<{
    name: string;
    description: string;
    params: Record<string, { type: string; description: string; required?: boolean }>;
    handler: (input: Record<string, unknown>) => Promise<ToolResult>;
  }>
): Skill {
  return {
    name,
    version: '1.0.0',
    description,
    author: 'plugin',
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(t.params).map(([k, v]) => [k, { type: v.type, description: v.description }])
        ),
        required: Object.entries(t.params)
          .filter(([, v]) => v.required !== false)
          .map(([k]) => k),
      },
    })),
    handlers: Object.fromEntries(tools.map(t => [t.name, t.handler])),
  };
}

// ─── Plugin Registry (runtime) ──────────────────────────────────────────────

export interface LoadedPlugin {
  def: PluginDefinition;
  enabled: boolean;
  loadedAt: Date;
  uptimeSeconds: number;
}

/** 插件运行时注册表 */
class PluginRegistry {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private ctx: PluginContext | null = null;

  /** 注册并启用一个插件 */
  register(def: PluginDefinition, enabled = true): void {
    this.plugins.set(def.id, {
      def,
      enabled,
      loadedAt: new Date(),
      uptimeSeconds: 0,
    });
  }

  /** 初始化所有插件 (传入 TUI context) */
  async init(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    for (const p of this.plugins.values()) {
      if (p.enabled && p.def.onLoad) {
        await p.def.onLoad(ctx);
      }
    }
    // Start tick loop
    this.tickInterval = setInterval(() => { this.tick(); }, 1000);
  }

  private tick(): void {
    if (!this.ctx) return;
    const now = new Date();
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.onTick) continue;
      p.uptimeSeconds++;
      void p.def.onTick({ ...this.ctx, now, uptime: p.uptimeSeconds });
    }
  }

  /** 处理命令输入, 返回 true 表示已消费 */
  async handleCommand(cmd: string, args: string, ctx: CommandContext): Promise<boolean> {
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.commands) continue;
      const handler = p.def.commands[cmd];
      if (handler) {
        await handler({ ...ctx, args, raw: `/${cmd} ${args}`.trim() });
        return true;
      }
    }
    return false;
  }

  /** 处理自然语言输入, 返回 true 表示已消费 */
  async handleNatural(input: string, ctx: PluginContext): Promise<boolean> {
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.naturalTriggers || !p.def.onNaturalInput) continue;
      for (const re of p.def.naturalTriggers) {
        const match = input.match(re);
        if (match) {
          await p.def.onNaturalInput({ ...ctx, match, input });
          return true;
        }
      }
    }
    return false;
  }

  /** 获取所有状态栏文字 */
  getStatusWidgets(ctx: StatusContext): string[] {
    const out: string[] = [];
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.statusWidget) continue;
      const text = p.def.statusWidget(ctx);
      if (text) out.push(text);
    }
    return out;
  }

  /** 获取所有 header badge */
  getHeaderBadges(ctx: StatusContext): string[] {
    const out: string[] = [];
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.headerBadge) continue;
      const text = p.def.headerBadge(ctx);
      if (text) out.push(text);
    }
    return out;
  }

  /** 获取 PLUGINS 视图内容行 */
  getViewLines(ctx: StatusContext): Array<{ pluginId: string; lines: string[] }> {
    const out: Array<{ pluginId: string; lines: string[] }> = [];
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.viewLines) continue;
      out.push({ pluginId: p.def.id, lines: p.def.viewLines(ctx) });
    }
    return out;
  }

  /** 列出所有插件 */
  list(): LoadedPlugin[] {
    return [...this.plugins.values()];
  }

  /** 启用/禁用插件 */
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const p = this.plugins.get(id);
    if (!p) return;
    if (enabled && !p.enabled && p.def.onLoad && this.ctx) {
      await p.def.onLoad(this.ctx);
    }
    if (!enabled && p.enabled && p.def.onUnload) {
      await p.def.onUnload();
    }
    p.enabled = enabled;
  }

  /** 获取所有已注册 MCP skills */
  getAllSkills(): Skill[] {
    const skills: Skill[] = [];
    for (const p of this.plugins.values()) {
      if (!p.enabled || !p.def.skills) continue;
      skills.push(...p.def.skills);
    }
    return skills;
  }

  destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}

/** 全局插件注册表单例 */
export const pluginRegistry = new PluginRegistry();
