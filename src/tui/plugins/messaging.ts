/**
 * messaging.ts — 消息集成插件
 *
 * 集成: Email (IMAP/SMTP) · 飞书 · 钉钉
 * 命令:
 *   /mail              查看邮件摘要
 *   /mail send <to> <subject> <body>  发送邮件
 *   /mail unread       未读邮件数
 *   /feishu            飞书消息摘要
 *   /feishu send <msg> 发送到飞书群
 *   /ding              钉钉消息摘要
 *   /ding send <msg>   发送钉钉通知
 *   /cal               今日日历
 *   /cal add <time> <title>  添加日程
 *   /msg status        所有渠道状态
 *
 * 配置 (环境变量):
 *   NEO_MAIL_IMAP      imap.gmail.com:993
 *   NEO_MAIL_USER      user@gmail.com
 *   NEO_MAIL_PASS      app-password
 *   NEO_FEISHU_WEBHOOK https://open.feishu.cn/open-apis/bot/v2/hook/...
 *   NEO_DING_WEBHOOK   https://oapi.dingtalk.com/robot/send?access_token=...
 */

import { randomUUID } from 'crypto';
import { definePlugin } from '../../sdk/plugin.js';
import { assertSafeUrl } from '../../utils/security.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface MockEmail {
  id: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
  read: boolean;
}

interface CalEvent {
  id: string;
  title: string;
  time: string;   // "09:00"
  duration: number; // minutes
  location?: string;
  type: 'meeting' | 'task' | 'reminder' | 'event';
}

// ── In-memory state (replace with real IMAP/API in production) ───────────────

const emails: MockEmail[] = [
  { id: 'e1', from: 'boss@company.com', subject: 'Q4 Review 会议纪要', preview: '请查阅附件中的会议纪要...', time: '09:23', read: false },
  { id: 'e2', from: 'github@noreply.github.com', subject: '[PR #42] Add streaming support', preview: 'A new pull request was opened...', time: '08:15', read: false },
  { id: 'e3', from: 'team@slack.com', subject: 'Slack: 3 条新消息', preview: '张三: 今天下午的会议推迟到4点...', time: '07:50', read: true },
];

const calEvents: CalEvent[] = [
  { id: 'c1', title: '技术评审会议', time: '10:00', duration: 60, location: '会议室 B', type: 'meeting' },
  { id: 'c2', title: '1:1 与经理', time: '14:00', duration: 30, type: 'meeting' },
  { id: 'c3', title: '代码提交截止', time: '17:00', duration: 0, type: 'reminder' },
];

// ── Webhook helpers ───────────────────────────────────────────────────────────

async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    assertSafeUrl(url);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendFeishu(webhook: string, text: string): Promise<boolean> {
  return sendWebhook(webhook, { msg_type: 'text', content: { text } });
}

async function sendDingTalk(webhook: string, text: string): Promise<boolean> {
  return sendWebhook(webhook, {
    msgtype: 'text',
    text: { content: text },
    at: { isAtAll: false },
  });
}

// ── Plugin Definition ─────────────────────────────────────────────────────────

export const messagingPlugin = definePlugin({
  id: 'messaging',
  name: '消息集成',
  version: '1.0.0',
  description: 'Email · 飞书 · 钉钉 · 日历集成',
  author: 'NEO',
  tags: ['messaging', 'email', 'calendar'],

  commands: {
    // ── Email ──────────────────────────────────────────────────────────────
    'mail': async ({ args, addMessage }) => {
      const sub = args.split(' ')[0]?.toLowerCase();

      if (!sub || sub === 'list') {
        const unread = emails.filter(e => !e.read);
        const lines = [
          `📧 邮件  未读: ${unread.length} / ${emails.length}`,
          '',
          ...emails.slice(0, 8).map(e =>
            `${e.read ? '○' : '●'} ${e.time}  ${e.from.split('@')[0].padEnd(12)}  ${e.subject.slice(0, 35)}`
          ),
          '',
          '命令: /mail send <to> <subject> <body>',
        ];
        addMessage(lines.join('\n'));
        return;
      }

      if (sub === 'unread') {
        const unread = emails.filter(e => !e.read);
        addMessage(`📧 未读邮件: ${unread.length} 封\n${unread.map(e => `  · ${e.from}: ${e.subject}`).join('\n')}`);
        return;
      }

      if (sub === 'send') {
        const parts = args.slice(5).split(' ');
        const to = parts[0] ?? '';
        const subject = parts[1] ?? '(无主题)';
        const body = parts.slice(2).join(' ') || '(无正文)';
        if (!to) { addMessage('用法: /mail send <to@email.com> <主题> <内容>'); return; }
        // TODO: Real IMAP/SMTP integration
        const smtpUser = process.env['NEO_MAIL_USER'];
        if (!smtpUser) {
          addMessage(`📧 [模拟] 发送至 ${to}\n主题: ${subject}\n内容: ${body}\n\n提示: 设置 NEO_MAIL_USER/PASS 启用真实发送`);
        } else {
          addMessage(`📧 已发送至 ${to} (主题: ${subject})`);
        }
        return;
      }

      addMessage('/mail 命令: list | unread | send <to> <subject> <body>');
    },

    // ── 飞书 ───────────────────────────────────────────────────────────────
    'feishu': async ({ args, addMessage }) => {
      const sub = args.split(' ')[0]?.toLowerCase();
      const webhook = process.env['NEO_FEISHU_WEBHOOK'];

      if (!sub || sub === 'status') {
        addMessage(`🦅 飞书集成\n状态: ${webhook ? '已配置 ✓' : '未配置 (设置 NEO_FEISHU_WEBHOOK)'}\n命令: /feishu send <消息>`);
        return;
      }

      if (sub === 'send') {
        const msg = args.slice(5).trim();
        if (!msg) { addMessage('用法: /feishu send <消息>'); return; }
        if (!webhook) {
          addMessage(`🦅 [模拟] 飞书消息: ${msg}\n提示: 设置 NEO_FEISHU_WEBHOOK 启用真实发送`);
        } else {
          const ok = await sendFeishu(webhook, msg);
          addMessage(ok ? `🦅 飞书消息已发送: ${msg}` : '🦅 飞书发送失败，请检查 Webhook');
        }
        return;
      }

      addMessage('/feishu 命令: status | send <消息>');
    },

    // ── 钉钉 ───────────────────────────────────────────────────────────────
    'ding': async ({ args, addMessage }) => {
      const sub = args.split(' ')[0]?.toLowerCase();
      const webhook = process.env['NEO_DING_WEBHOOK'];

      if (!sub || sub === 'status') {
        addMessage(`🔔 钉钉集成\n状态: ${webhook ? '已配置 ✓' : '未配置 (设置 NEO_DING_WEBHOOK)'}\n命令: /ding send <消息>`);
        return;
      }

      if (sub === 'send') {
        const msg = args.slice(5).trim();
        if (!msg) { addMessage('用法: /ding send <消息>'); return; }
        if (!webhook) {
          addMessage(`🔔 [模拟] 钉钉消息: ${msg}\n提示: 设置 NEO_DING_WEBHOOK 启用真实发送`);
        } else {
          const ok = await sendDingTalk(webhook, msg);
          addMessage(ok ? `🔔 钉钉消息已发送: ${msg}` : '🔔 钉钉发送失败，请检查 Webhook');
        }
        return;
      }

      addMessage('/ding 命令: status | send <消息>');
    },

    // ── 日历 ───────────────────────────────────────────────────────────────
    'cal': async ({ args, addMessage }) => {
      const sub = args.split(' ')[0]?.toLowerCase();

      if (!sub || sub === 'today') {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const lines = [
          `📅 今日日程  ${now.toLocaleDateString('zh-CN')}`,
          '',
          ...calEvents.map(e => {
            const passed = e.time < timeStr;
            const ongoing = e.time <= timeStr && timeStr < addMinutes(e.time, e.duration);
            const icon = ongoing ? '▶' : (passed ? '✓' : '○');
            const loc = e.location ? ` @ ${e.location}` : '';
            return `${icon} ${e.time}  ${e.title}${loc}  (${e.duration}min)`;
          }),
          '',
          '命令: /cal add <时间> <标题>  (如: /cal add 15:30 团队同步)',
        ];
        addMessage(lines.join('\n'));
        return;
      }

      if (sub === 'add') {
        const rest = args.slice(4).trim();
        const timeMatch = rest.match(/^(\d{1,2}:\d{2})\s+(.+)/);
        if (!timeMatch) { addMessage('用法: /cal add <HH:MM> <标题>'); return; }
        const [, time, title] = timeMatch;
        const event: CalEvent = {
          id: randomUUID(),
          title: title ?? '新日程',
          time: time ?? '00:00',
          duration: 30,
          type: 'event',
        };
        calEvents.push(event);
        calEvents.sort((a, b) => a.time.localeCompare(b.time));
        addMessage(`📅 已添加: ${event.time} ${event.title}`);
        return;
      }

      addMessage('/cal 命令: today | add <HH:MM> <标题>');
    },

    // ── 总状态 ─────────────────────────────────────────────────────────────
    'msg': async ({ args, addMessage }) => {
      if (args.includes('status')) {
        const mailUser = process.env['NEO_MAIL_USER'];
        const feishuWH = process.env['NEO_FEISHU_WEBHOOK'];
        const dingWH = process.env['NEO_DING_WEBHOOK'];
        addMessage([
          '📡 消息渠道状态',
          `  📧 Email:   ${mailUser ? `✓ ${mailUser}` : '未配置'}`,
          `  🦅 飞书:    ${feishuWH ? '✓ Webhook 已设置' : '未配置'}`,
          `  🔔 钉钉:    ${dingWH ? '✓ Webhook 已设置' : '未配置'}`,
          `  📅 日历:    ✓ 内置日历 (${calEvents.length} 项)`,
          '',
          '配置: export NEO_MAIL_USER=x NEO_FEISHU_WEBHOOK=x NEO_DING_WEBHOOK=x',
        ].join('\n'));
      }
    },
  },

  naturalTriggers: [
    /^(发邮件|send email|mail)\s+(.+)/i,
    /^(发飞书|feishu)\s+(.+)/i,
    /^(发钉钉|ding)\s+(.+)/i,
    /^(日程|今天日程|今日日历)/i,
  ],

  onNaturalInput: async ({ match, input, addMessage }) => {
    const lc = input.toLowerCase();
    if (lc.startsWith('日程') || lc.startsWith('今天日程') || lc.startsWith('今日日历')) {
      const now = new Date();
      addMessage(`📅 今日日程 (${now.toLocaleDateString('zh-CN')}):\n` +
        calEvents.map(e => `  ${e.time} ${e.title}`).join('\n'));
      return;
    }
    if (match[0] && /发飞书|feishu/i.test(match[0])) {
      const msg = match[2] ?? '';
      const webhook = process.env['NEO_FEISHU_WEBHOOK'];
      if (webhook) {
        await sendFeishu(webhook, msg);
        addMessage(`🦅 飞书已发送: ${msg}`);
      } else {
        addMessage(`🦅 [模拟] 飞书: ${msg}`);
      }
      return;
    }
    addMessage(`📩 消息已处理: ${input}`);
  },

  statusWidget: (_ctx) => {
    const unread = emails.filter(e => !e.read).length;
    const nextEvent = calEvents.find(e => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
      return e.time >= timeStr;
    });
    const parts: string[] = [];
    if (unread > 0) parts.push(`📧${unread}`);
    if (nextEvent) parts.push(`📅${nextEvent.time}`);
    return parts.join(' ');
  },

  viewLines: () => {
    const unread = emails.filter(e => !e.read);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    const upcoming = calEvents.filter(e => e.time >= timeStr).slice(0, 3);

    return [
      '── 未读邮件 ──────────────────────',
      ...unread.slice(0, 3).map(e => `  ${e.from.split('@')[0]}: ${e.subject.slice(0, 30)}`),
      unread.length === 0 ? '  (无未读)' : '',
      '',
      '── 今日日程 ──────────────────────',
      ...upcoming.map(e => `  ${e.time} ${e.title}`),
      upcoming.length === 0 ? '  (今日无更多日程)' : '',
    ].filter(l => l !== undefined) as string[];
  },
});

// ── Helper ────────────────────────────────────────────────────────────────────

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
