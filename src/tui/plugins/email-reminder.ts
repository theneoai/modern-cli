/**
 * 插件: email-reminder
 * ====================
 * 邮件提醒插件 —— 定时提醒 + 邮件摘要显示
 *
 * 命令:
 *   /remind <N>min <内容>      — N分钟后提醒
 *   /remind <N>h <内容>        — N小时后提醒
 *   /remind <HH:MM> <内容>     — 指定时间提醒
 *   /reminders                 — 查看所有提醒
 *   /reminder cancel <ID>      — 取消提醒
 *
 * 自然语言:
 *   "remind me in 30 minutes to call boss"
 *   "提醒我 10分钟后 开会"
 *   "set reminder 15:30 提交报告"
 *
 * 状态栏:
 *   🔔 2 条提醒     (有待触发提醒时显示)
 *
 * MCP Tools (AI 可调用):
 *   set_reminder(minutes, message)
 *   list_reminders()
 *   cancel_reminder(id)
 */

import { definePlugin, defineSkill } from '../../sdk/plugin.js';

// ── 数据结构 ─────────────────────────────────────────────────────────────────

interface Reminder {
  id: string;
  message: string;
  fireAt: Date;
  fired: boolean;
  createdAt: Date;
}

const reminders: Map<string, Reminder> = new Map();
let nextId = 1;

function makeId(): string {
  return String(nextId++);
}

function parseTime(timeStr: string, _message: string): { fireAt: Date; label: string } | null {
  const now = Date.now();
  const lc = timeStr.toLowerCase().trim();

  // "30min" / "30m" / "30分钟"
  const minsMatch = lc.match(/^(\d+)\s*(min|m|分钟|分)$/);
  if (minsMatch) {
    const mins = parseInt(minsMatch[1], 10);
    return { fireAt: new Date(now + mins * 60000), label: `${mins}分钟后` };
  }

  // "2h" / "2小时"
  const hoursMatch = lc.match(/^(\d+)\s*(h|小时|hour)s?$/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    return { fireAt: new Date(now + hours * 3600000), label: `${hours}小时后` };
  }

  // "HH:MM"
  const clockMatch = lc.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) {
    const target = new Date();
    target.setHours(parseInt(clockMatch[1], 10), parseInt(clockMatch[2], 10), 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1); // tomorrow
    return { fireAt: target, label: `${clockMatch[1]}:${clockMatch[2]}` };
  }

  return null;
}

function formatCountdown(fireAt: Date): string {
  const diff = fireAt.getTime() - Date.now();
  if (diff <= 0) return '已过期';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins >= 60) return `${Math.floor(mins / 60)}h${mins % 60}m`;
  if (mins > 0) return `${mins}m${secs}s`;
  return `${secs}s`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Plugin Definition ────────────────────────────────────────────────────────

export default definePlugin({
  id: 'email-reminder',
  name: '邮件提醒',
  version: '1.0.0',
  description: '定时提醒 + 邮件摘要, 不错过任何重要事项',
  author: 'neo',
  tags: ['productivity', 'reminder', 'email'],

  onLoad: async () => {
    // Could load persisted reminders from disk here
  },

  onUnload: async () => {
    reminders.clear();
  },

  // ── 每秒检查是否有提醒到期 ─────────────────────────────────────────────
  onTick: async ({ now, notify, addMessage }) => {
    for (const r of reminders.values()) {
      if (!r.fired && r.fireAt <= now) {
        r.fired = true;
        notify(`🔔 提醒: ${r.message}`, 'warning');
        addMessage(
          `🔔 **提醒到时!**\n\n${r.message}\n\n_设置于 ${formatTime(r.createdAt)}_`,
          'system'
        );
      }
    }
  },

  // ── 命令处理 ──────────────────────────────────────────────────────────────
  commands: {
    // /remind <time> <message>
    remind: async ({ args, addMessage, notify }) => {
      if (!args) {
        addMessage(
          '用法:\n' +
          '  /remind 30min 打电话给客户\n' +
          '  /remind 2h    提交代码\n' +
          '  /remind 15:30 团队会议\n' +
          '\n查看提醒: /reminders',
          'system'
        );
        return;
      }

      // Parse "30min 消息内容" or "15:30 消息内容"
      const parts = args.trim().split(/\s+/);
      const timeToken = parts[0];
      const message = parts.slice(1).join(' ') || '提醒';

      const parsed = parseTime(timeToken, message);
      if (!parsed) {
        addMessage(`⚠ 无法解析时间: "${timeToken}"\n格式: 30min | 2h | 15:30`, 'system');
        return;
      }

      const id = makeId();
      reminders.set(id, {
        id,
        message,
        fireAt: parsed.fireAt,
        fired: false,
        createdAt: new Date(),
      });

      notify(`✓ 提醒已设置: ${parsed.label} — ${message}`, 'success');
      addMessage(
        `✓ 提醒已设置 [#${id}]\n内容: ${message}\n时间: ${formatTime(parsed.fireAt)} (${parsed.label})`,
        'system'
      );
    },

    // /reminders — 列出所有提醒
    reminders: async ({ addMessage }) => {
      const active = [...reminders.values()].filter(r => !r.fired);
      const fired = [...reminders.values()].filter(r => r.fired);

      if (active.length === 0 && fired.length === 0) {
        addMessage('📭 暂无提醒\n\n使用 /remind 30min 内容 创建提醒', 'system');
        return;
      }

      const lines: string[] = ['📋 **提醒列表**\n'];

      if (active.length > 0) {
        lines.push('─ 待触发 ─');
        for (const r of active) {
          lines.push(`  [#${r.id}] ⏱ ${formatCountdown(r.fireAt)}  ${r.message}`);
        }
      }

      if (fired.length > 0) {
        lines.push('\n─ 已触发 ─');
        for (const r of fired.slice(-5)) {
          lines.push(`  [#${r.id}] ✓  ${r.message}`);
        }
      }

      lines.push('\n取消: /reminder cancel <ID>');
      addMessage(lines.join('\n'), 'system');
    },

    // /reminder cancel <id>
    reminder: async ({ args, addMessage, notify }) => {
      const parts = args.trim().split(/\s+/);
      if (parts[0] === 'cancel' && parts[1]) {
        const id = parts[1];
        if (reminders.has(id)) {
          const r = reminders.get(id)!;
          reminders.delete(id);
          notify(`✓ 已取消提醒: ${r.message}`, 'info');
        } else {
          addMessage(`⚠ 找不到提醒 #${id}`, 'system');
        }
        return;
      }
      addMessage('用法: /reminder cancel <ID>', 'system');
    },
  },

  // ── 自然语言触发 ──────────────────────────────────────────────────────────
  naturalTriggers: [
    /^remind(?:er)?\s+me\s+(?:in\s+)?(\S+)\s+(?:to\s+)?(.+)/i,
    /^提醒(?:我)?\s+(\S+)\s+(.+)/,
    /^set\s+reminder\s+(\S+)\s+(.+)/i,
  ],

  onNaturalInput: async ({ match, addMessage, notify }) => {
    const timeToken = match[1];
    const message = match[2];
    const parsed = parseTime(timeToken, message);

    if (!parsed) {
      addMessage(`⚠ 无法解析时间: "${timeToken}"`, 'system');
      return;
    }

    const id = makeId();
    reminders.set(id, {
      id,
      message,
      fireAt: parsed.fireAt,
      fired: false,
      createdAt: new Date(),
    });

    notify(`✓ 提醒: ${parsed.label} — ${message}`, 'success');
    addMessage(`✓ 提醒 [#${id}]: ${parsed.label} → ${message}`, 'system');
  },

  // ── 状态栏 ────────────────────────────────────────────────────────────────
  statusWidget: () => {
    const active = [...reminders.values()].filter(r => !r.fired);
    if (active.length === 0) return '';
    const next = active.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())[0];
    return `🔔 ${active.length} | ${formatCountdown(next.fireAt)}`;
  },

  // ── 插件视图内容 ──────────────────────────────────────────────────────────
  viewLines: () => {
    const active = [...reminders.values()].filter(r => !r.fired);
    const lines = ['  === 邮件提醒插件 ==='];

    if (active.length === 0) {
      lines.push('  (无待触发提醒)');
      lines.push('  /remind 30min 内容  创建提醒');
    } else {
      lines.push(`  待触发 ${active.length} 条:`);
      for (const r of active.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())) {
        lines.push(`  [#${r.id}] ${formatCountdown(r.fireAt).padEnd(8)} ${r.message}`);
      }
    }
    return lines;
  },

  // ── MCP Skills (AI 可调用) ────────────────────────────────────────────────
  skills: [
    defineSkill(
      'reminder',
      '设置、查看、取消提醒',
      [
        {
          name: 'set_reminder',
          description: '设置一个定时提醒',
          params: {
            minutes: { type: 'number', description: '多少分钟后触发' },
            message: { type: 'string', description: '提醒内容' },
          },
          handler: async (input) => {
            const mins = Number(input['minutes'] ?? 5);
            const msg = String(input['message'] ?? '提醒');
            const id = makeId();
            reminders.set(id, {
              id,
              message: msg,
              fireAt: new Date(Date.now() + mins * 60000),
              fired: false,
              createdAt: new Date(),
            });
            return { content: `提醒已设置 [#${id}]: ${mins}分钟后 → ${msg}` };
          },
        },
        {
          name: 'list_reminders',
          description: '查看所有待触发的提醒',
          params: {},
          handler: async () => {
            const active = [...reminders.values()].filter(r => !r.fired);
            if (active.length === 0) return { content: '无待触发提醒' };
            const lines = active.map(r =>
              `[#${r.id}] ${formatCountdown(r.fireAt)} - ${r.message}`
            );
            return { content: lines.join('\n') };
          },
        },
        {
          name: 'cancel_reminder',
          description: '取消一个提醒',
          params: {
            id: { type: 'string', description: '提醒 ID' },
          },
          handler: async (input) => {
            const id = String(input['id'] ?? '');
            if (reminders.has(id)) {
              reminders.delete(id);
              return { content: `提醒 #${id} 已取消` };
            }
            return { content: `找不到提醒 #${id}`, isError: true };
          },
        },
      ]
    ),
  ],
});
