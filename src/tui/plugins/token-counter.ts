/**
 * 插件: token-counter
 * ===================
 * Token 消耗统计插件 —— 实时追踪用量、成本、效率分析
 *
 * 命令:
 *   /tokens           — 查看本次会话详细统计
 *   /tokens reset     — 重置统计
 *   /tokens budget N  — 设置 token 预算告警 (超出时提醒)
 *   /cost             — 查看费用明细
 *
 * 状态栏:
 *   📊 1.2k / $0.003   (token数 / 费用)
 *
 * 模型定价 (每 1M tokens, USD):
 *   claude-opus-4-6:   Input $15  / Output $75
 *   claude-sonnet-4-6: Input $3   / Output $15
 *   claude-haiku-4-5:  Input $0.8 / Output $4
 */

import { definePlugin, defineSkill } from '../../sdk/plugin.js';

// ── 模型定价表 ───────────────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.00  },
  // fallback
  'default':           { input: 3.00,  output: 15.00 },
};

function getPrice(model: string) {
  for (const [key, val] of Object.entries(PRICING)) {
    if (model.includes(key)) return val;
  }
  return PRICING['default']!;
}

// ── 统计数据 ─────────────────────────────────────────────────────────────────

interface RoundStats {
  ts: Date;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costUSD: number;
  prompt: string;  // 前30字
}

interface SessionStats {
  rounds: RoundStats[];
  totalInput: number;
  totalOutput: number;
  totalCost: number;
  budgetTokens: number;  // 0 = no limit
  startedAt: Date;
}

const session: SessionStats = {
  rounds: [],
  totalInput: 0,
  totalOutput: 0,
  totalCost: 0,
  budgetTokens: 0,
  startedAt: new Date(),
};

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h${mins % 60}m`;
  return `${mins}m`;
}

/** 外部调用: 记录一轮 AI 对话的 token 消耗 */
export function recordRound(
  inputTokens: number,
  outputTokens: number,
  model: string,
  promptPreview: string
): void {
  const price = getPrice(model);
  const costUSD = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

  session.rounds.push({
    ts: new Date(),
    inputTokens,
    outputTokens,
    model,
    costUSD,
    prompt: promptPreview.slice(0, 40),
  });

  session.totalInput += inputTokens;
  session.totalOutput += outputTokens;
  session.totalCost += costUSD;
}

// ── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
  id: 'token-counter',
  name: 'Token 统计',
  version: '1.0.0',
  description: '实时追踪 token 消耗和 API 费用, 支持预算提醒',
  author: 'hyperterminal',
  tags: ['utility', 'analytics', 'cost'],

  // ── 预算告警 ─────────────────────────────────────────────────────────────
  onTick: async ({ uptime, notify }) => {
    if (session.budgetTokens <= 0) return;
    const total = session.totalInput + session.totalOutput;
    // Check at 80% and 100%
    if (uptime % 30 === 0 && total >= session.budgetTokens * 0.8) {
      const pct = Math.floor((total / session.budgetTokens) * 100);
      if (pct >= 100) {
        notify(`⚠ Token 预算已超出! 已用 ${formatNum(total)} / ${formatNum(session.budgetTokens)}`, 'error');
      } else if (pct >= 80) {
        notify(`Token 预算已用 ${pct}%: ${formatNum(total)} / ${formatNum(session.budgetTokens)}`, 'warning');
      }
    }
  },

  // ── 命令 ─────────────────────────────────────────────────────────────────
  commands: {
    tokens: async ({ args, addMessage }) => {
      if (args.startsWith('reset')) {
        session.rounds = [];
        session.totalInput = 0;
        session.totalOutput = 0;
        session.totalCost = 0;
        session.startedAt = new Date();
        addMessage('✓ Token 统计已重置', 'system');
        return;
      }

      if (args.startsWith('budget')) {
        const n = parseInt(args.split(/\s+/)[1] ?? '0');
        session.budgetTokens = n;
        addMessage(n > 0
          ? `✓ Token 预算设为 ${formatNum(n)} (超出 80% 时提醒)`
          : '✓ 已取消 Token 预算',
          'system'
        );
        return;
      }

      // Summary view
      const total = session.totalInput + session.totalOutput;
      const sessionMins = formatDuration(Date.now() - session.startedAt.getTime());
      const avgPerRound = session.rounds.length > 0
        ? Math.round(total / session.rounds.length)
        : 0;

      const modelGroups: Record<string, { rounds: number; tokens: number; cost: number }> = {};
      for (const r of session.rounds) {
        const m = r.model.split('-').slice(0, 3).join('-');
        if (!modelGroups[m]) modelGroups[m] = { rounds: 0, tokens: 0, cost: 0 };
        modelGroups[m].rounds++;
        modelGroups[m].tokens += r.inputTokens + r.outputTokens;
        modelGroups[m].cost += r.costUSD;
      }

      const lines = [
        '📊 **Token 用量统计**\n',
        `会话时长: ${sessionMins}  |  对话轮次: ${session.rounds.length}`,
        '',
        '─ 总计 ─',
        `  输入: ${formatNum(session.totalInput)} tokens`,
        `  输出: ${formatNum(session.totalOutput)} tokens`,
        `  合计: ${formatNum(total)} tokens`,
        `  费用: ${formatCost(session.totalCost)}`,
        `  均次: ${formatNum(avgPerRound)} tokens/轮`,
      ];

      if (session.budgetTokens > 0) {
        const pct = Math.floor((total / session.budgetTokens) * 100);
        lines.push(`  预算: ${pct}% (${formatNum(total)}/${formatNum(session.budgetTokens)})`);
      }

      if (Object.keys(modelGroups).length > 0) {
        lines.push('\n─ 按模型 ─');
        for (const [model, s] of Object.entries(modelGroups)) {
          lines.push(`  ${model}: ${s.rounds}轮 ${formatNum(s.tokens)} tok ${formatCost(s.cost)}`);
        }
      }

      if (session.rounds.length > 0) {
        lines.push('\n─ 最近 5 轮 ─');
        for (const r of session.rounds.slice(-5).reverse()) {
          lines.push(
            `  ${r.ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` +
            ` in:${formatNum(r.inputTokens)} out:${formatNum(r.outputTokens)}` +
            ` ${formatCost(r.costUSD)}  "${r.prompt}"`
          );
        }
      }

      lines.push('\n命令: /tokens reset | /tokens budget 10000');
      addMessage(lines.join('\n'), 'system');
    },

    cost: async ({ addMessage }) => {
      const lines = [
        '💰 **费用明细**\n',
        `本次会话: ${formatCost(session.totalCost)}`,
        `Token 总量: ${formatNum(session.totalInput + session.totalOutput)}`,
        '',
        '─ 模型定价 (每 1M tokens) ─',
      ];
      for (const [model, price] of Object.entries(PRICING)) {
        if (model === 'default') continue;
        lines.push(`  ${model.padEnd(22)} 输入 $${price.input.toFixed(2).padStart(5)}  输出 $${price.output.toFixed(2).padStart(5)}`);
      }
      lines.push(`\n预估今日费用: ${formatCost(session.totalCost)}`);
      addMessage(lines.join('\n'), 'system');
    },
  },

  // ── 状态栏小部件 ──────────────────────────────────────────────────────────
  statusWidget: ({ getTokenStats }) => {
    const stats = getTokenStats();
    if (stats.totalTokens === 0) return '';
    const cost = stats.sessionCost;
    return `📊 ${formatNum(stats.totalTokens)} ${formatCost(cost)}`;
  },

  // ── 插件视图内容 ──────────────────────────────────────────────────────────
  viewLines: ({ getTokenStats }) => {
    const stats = getTokenStats();
    const sessionMins = formatDuration(Date.now() - session.startedAt.getTime());

    return [
      '  === Token 统计插件 ===',
      `  会话: ${sessionMins}  轮次: ${session.rounds.length}`,
      `  输入: ${formatNum(stats.totalInput)}  输出: ${formatNum(stats.totalOutput)}`,
      `  费用: ${formatCost(stats.sessionCost)}`,
      session.budgetTokens > 0
        ? `  预算: ${Math.floor(((stats.totalInput + stats.totalOutput) / session.budgetTokens) * 100)}%`
        : '  /tokens budget N  设置预算告警',
      '  /tokens  查看详情  /cost  价格表',
    ];
  },

  // ── MCP Skills ────────────────────────────────────────────────────────────
  skills: [
    defineSkill(
      'token-stats',
      '查询当前 Token 用量统计',
      [
        {
          name: 'get_token_stats',
          description: '获取当前会话的 Token 用量和费用统计',
          params: {},
          handler: async () => {
            const total = session.totalInput + session.totalOutput;
            return {
              content: JSON.stringify({
                totalInput: session.totalInput,
                totalOutput: session.totalOutput,
                totalTokens: total,
                totalCostUSD: session.totalCost,
                rounds: session.rounds.length,
                sessionMinutes: Math.floor((Date.now() - session.startedAt.getTime()) / 60000),
              }),
            };
          },
        },
      ]
    ),
  ],
});
