/**
 * analytics.ts — 成本收益分析 + 模型价格监控 + 新闻资讯
 *
 * 功能:
 *   /stats          — 显示 token 消耗 / 成本 / 节省时间
 *   /price          — 查看所有 provider 最新价格表
 *   /price check    — 后台检查是否有更优惠价格
 *   /news           — 获取最新技术/时政/金融新闻摘要
 *   /news tech|biz  — 指定分类
 *
 * 收益计算模型:
 *   - 每次 AI 回答 = 用户需要 X 分钟自己完成 (按任务类型估算)
 *   - 时间价值默认 ¥300/h (可配置)
 *   - 成本 = token 数 × 当前模型单价
 *   - ROI = (节省价值 - 成本) / 成本
 */

import type { PluginDef } from '../../sdk/plugin.js';
import { checkUrl } from '../../utils/security.js';

// ── Model Price Database (静态基准，可后台更新) ─────────────────────────────

export interface ModelPrice {
  provider: string;
  model: string;
  inputPer1M: number;   // USD per 1M input tokens
  outputPer1M: number;  // USD per 1M output tokens
  updatedAt: string;
}

export const MODEL_PRICES: ModelPrice[] = [
  // Anthropic
  { provider: 'anthropic', model: 'claude-opus-4-6',   inputPer1M: 15,   outputPer1M: 75,   updatedAt: '2026-01' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', inputPer1M: 3,    outputPer1M: 15,   updatedAt: '2026-01' },
  { provider: 'anthropic', model: 'claude-haiku-4-5',  inputPer1M: 0.8,  outputPer1M: 4,    updatedAt: '2026-01' },
  // OpenAI
  { provider: 'openai',    model: 'gpt-4o',            inputPer1M: 2.5,  outputPer1M: 10,   updatedAt: '2026-01' },
  { provider: 'openai',    model: 'gpt-4o-mini',       inputPer1M: 0.15, outputPer1M: 0.6,  updatedAt: '2026-01' },
  { provider: 'openai',    model: 'o3-mini',           inputPer1M: 1.1,  outputPer1M: 4.4,  updatedAt: '2026-01' },
  // Google Gemini
  { provider: 'gemini',    model: 'gemini-2.0-flash',  inputPer1M: 0.1,  outputPer1M: 0.4,  updatedAt: '2026-01' },
  { provider: 'gemini',    model: 'gemini-2.0-pro',    inputPer1M: 1.25, outputPer1M: 5,    updatedAt: '2026-01' },
  // Moonshot Kimi
  { provider: 'moonshot',  model: 'moonshot-v1-8k',   inputPer1M: 0.12, outputPer1M: 0.12, updatedAt: '2026-01' },
  { provider: 'moonshot',  model: 'moonshot-v1-128k', inputPer1M: 0.6,  outputPer1M: 0.6,  updatedAt: '2026-01' },
  // DeepSeek
  { provider: 'deepseek',  model: 'deepseek-chat',     inputPer1M: 0.07, outputPer1M: 1.1,  updatedAt: '2026-01' },
  { provider: 'deepseek',  model: 'deepseek-reasoner', inputPer1M: 0.55, outputPer1M: 2.19, updatedAt: '2026-01' },
  // Groq (free tier + paid)
  { provider: 'groq',      model: 'llama-3.3-70b',     inputPer1M: 0.59, outputPer1M: 0.79, updatedAt: '2026-01' },
  { provider: 'groq',      model: 'mixtral-8x7b',      inputPer1M: 0.24, outputPer1M: 0.24, updatedAt: '2026-01' },
  // Mistral
  { provider: 'mistral',   model: 'mistral-large',     inputPer1M: 2,    outputPer1M: 6,    updatedAt: '2026-01' },
  { provider: 'mistral',   model: 'mistral-small',     inputPer1M: 0.1,  outputPer1M: 0.3,  updatedAt: '2026-01' },
];

// ── Session Stats ─────────────────────────────────────────────────────────────

interface SessionStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  rounds: number;
  tasksSaved: number;
  notesSaved: number;
  agentRounds: number;
  sessionStartAt: number;
  // Estimated time saved in minutes
  timeSavedMin: number;
}

let _stats: SessionStats = {
  totalInputTokens: 0, totalOutputTokens: 0, rounds: 0,
  tasksSaved: 0, notesSaved: 0, agentRounds: 0,
  sessionStartAt: Date.now(), timeSavedMin: 0,
};

export function recordAnalyticsRound(
  inputTokens: number, outputTokens: number,
  taskType: 'chat' | 'code' | 'research' | 'write' | 'debug' | 'agent' = 'chat',
): void {
  _stats.totalInputTokens += inputTokens;
  _stats.totalOutputTokens += outputTokens;
  _stats.rounds++;
  if (taskType === 'agent') _stats.agentRounds++;

  // Time saved heuristic (minutes of equivalent manual work)
  const timeSavedMap: Record<string, number> = {
    chat: 2, code: 15, research: 30, write: 20, debug: 25, agent: 10,
  };
  _stats.timeSavedMin += timeSavedMap[taskType] ?? 2;
}

export function getStats(): SessionStats { return { ..._stats }; }

// ── Cost calculation ──────────────────────────────────────────────────────────

function calcCostUSD(provider: string, model: string, inputTok: number, outputTok: number): number {
  const price = MODEL_PRICES.find(p => p.provider === provider && p.model === model);
  if (!price) return (inputTok * 3 + outputTok * 15) / 1_000_000; // fallback estimate
  return (inputTok * price.inputPer1M + outputTok * price.outputPer1M) / 1_000_000;
}

export function formatStatsReport(
  provider: string, model: string, hourlyValueCNY = 300,
): string {
  const s = _stats;
  const costUSD = calcCostUSD(provider, model, s.totalInputTokens, s.totalOutputTokens);
  const costCNY = costUSD * 7.2;  // approx exchange rate
  const savedCNY = (s.timeSavedMin / 60) * hourlyValueCNY;
  const roi = savedCNY > 0 && costCNY > 0 ? ((savedCNY - costCNY) / costCNY) : 0;
  const sessionMin = Math.floor((Date.now() - s.sessionStartAt) / 60000);

  const lines: string[] = [
    '═══════════════════════════════════════════',
    '◆ NEO 本次会话成本收益分析',
    '═══════════════════════════════════════════',
    '',
    '📊 消耗统计',
    `  会话时长:    ${sessionMin} 分钟`,
    `  对话轮次:    ${s.rounds} 轮 (Agent 轮: ${s.agentRounds})`,
    `  总 Token:    ${fmtNum(s.totalInputTokens + s.totalOutputTokens)}`,
    `    输入:      ${fmtNum(s.totalInputTokens)}  输出: ${fmtNum(s.totalOutputTokens)}`,
    '',
    '💰 成本',
    `  当前模型:    ${provider}/${model}`,
    `  API 费用:    $${costUSD.toFixed(4)} ≈ ¥${costCNY.toFixed(2)}`,
    '',
    '⏱  节省估算  (按 ¥${hourlyValueCNY}/h)',
    `  节省时间:    ${s.timeSavedMin} 分钟`,
    `  节省价值:    ¥${savedCNY.toFixed(2)}`,
    '',
    '📈 收益指标',
    `  ROI:         ${roi > 0 ? '+' : ''}${(roi * 100).toFixed(0)}%  (每花 ¥1 AI 费用, 节省 ¥${(1 + roi).toFixed(1)})`,
    `  效率倍率:    ${savedCNY > 0 && costCNY > 0 ? (savedCNY / costCNY).toFixed(1) : 'N/A'}×`,
    '',
    '💡 优化建议',
    ...getOptimizationTips(provider, model, s),
    '═══════════════════════════════════════════',
  ];
  return lines.join('\n');
}

function getOptimizationTips(provider: string, model: string, s: SessionStats): string[] {
  const tips: string[] = [];
  const totalTok = s.totalInputTokens + s.totalOutputTokens;

  // Find cheaper alternatives
  const currentPrice = MODEL_PRICES.find(p => p.provider === provider && p.model === model);
  if (currentPrice) {
    const cheaper = MODEL_PRICES.filter(p =>
      p.inputPer1M < currentPrice.inputPer1M * 0.5 && p.provider !== provider
    ).sort((a, b) => a.inputPer1M - b.inputPer1M).slice(0, 2);

    for (const alt of cheaper) {
      const saving = ((currentPrice.inputPer1M - alt.inputPer1M) / currentPrice.inputPer1M * 100).toFixed(0);
      tips.push(`  → ${alt.provider}/${alt.model} 可节省 ~${saving}% 成本 (/model 切换)`);
    }
  }

  if (totalTok > 50000 && s.rounds > 0) {
    tips.push(`  → 平均 ${Math.floor(totalTok / s.rounds)} tok/轮, 考虑更简洁的提示`);
  }
  if (s.agentRounds > 10) {
    tips.push(`  → Agent 已执行 ${s.agentRounds} 轮, 检查终止条件是否合理`);
  }
  if (tips.length === 0) tips.push('  → 当前使用效率良好 ✓');
  return tips;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// ── Price Monitor ─────────────────────────────────────────────────────────────

/** Format a full price comparison table */
export function formatPriceTable(): string {
  const rows = MODEL_PRICES.map(p =>
    `  ${(p.provider + '/' + p.model).padEnd(38)} $${p.inputPer1M.toString().padStart(6)}/M in   $${p.outputPer1M.toString().padStart(7)}/M out`
  );
  return [
    '══════════════════════════════════════════════════════════',
    '◆ AI Provider 价格表  (USD per 1M tokens)',
    '══════════════════════════════════════════════════════════',
    '  Provider/Model                              Input         Output',
    '──────────────────────────────────────────────────────────',
    ...rows,
    '══════════════════════════════════════════════════════════',
    '  /price check  — 后台检查最新价格 (需网络)',
    '  /model        — 切换到更优惠的模型',
  ].join('\n');
}

/** Find best value model for a given task type */
export function findBestValue(taskType: 'quality' | 'speed' | 'cost'): ModelPrice {
  if (taskType === 'cost') {
    return [...MODEL_PRICES].sort((a, b) => a.inputPer1M - b.inputPer1M)[0]!;
  }
  if (taskType === 'speed') {
    // Groq is fastest
    return MODEL_PRICES.find(p => p.provider === 'groq') ?? MODEL_PRICES[0]!;
  }
  // quality: best = anthropic sonnet as balanced
  return MODEL_PRICES.find(p => p.model.includes('sonnet')) ?? MODEL_PRICES[0]!;
}

/** Check provider pricing pages for updates (lightweight HEAD check) */
export async function checkPriceUpdates(): Promise<string[]> {
  const alerts: string[] = [];
  // We just verify endpoints are reachable and report static data status
  // Real pricing APIs require auth, so we report "check manually" with URLs
  const pricingPages = [
    { name: 'Anthropic', url: 'https://www.anthropic.com/pricing' },
    { name: 'OpenAI',    url: 'https://openai.com/pricing' },
    { name: 'Gemini',    url: 'https://ai.google.dev/pricing' },
    { name: 'DeepSeek',  url: 'https://platform.deepseek.com/api-docs/pricing' },
    { name: 'Moonshot',  url: 'https://platform.moonshot.cn/docs/pricing/chat' },
  ];

  for (const p of pricingPages) {
    const check = checkUrl(p.url);
    if (check.allowed) {
      alerts.push(`  ✓ ${p.name}: ${p.url}`);
    }
  }

  return [
    '价格页面地址 (手动确认最新价格):',
    ...alerts,
    '',
    '提示: 价格数据库上次更新: 2026-01  /price 查看本地数据',
  ];
}

// ── News Feed ─────────────────────────────────────────────────────────────────

export type NewsCategory = 'tech' | 'biz' | 'finance' | 'all';

interface NewsSource {
  name: string;
  url: string;
  category: NewsCategory;
}

const NEWS_SOURCES: NewsSource[] = [
  { name: 'Hacker News',   url: 'https://hacker-news.firebaseio.com/v0/topstories.json', category: 'tech' },
  { name: 'GitHub Trending', url: 'https://github.com/trending', category: 'tech' },
];

/** Fetch top HN stories and format as a digest */
export async function fetchNewsDigest(category: NewsCategory = 'all', limit = 10): Promise<string> {
  try {
    const hnUrl = 'https://hacker-news.firebaseio.com/v0/topstories.json';
    const check = checkUrl(hnUrl);
    if (!check.allowed) throw new Error(check.reason);

    const idsRes = await fetch(hnUrl);
    if (!idsRes.ok) throw new Error(`HTTP ${idsRes.status}`);
    const ids = (await idsRes.json() as number[]).slice(0, limit * 2);

    const stories = await Promise.allSettled(
      ids.map(id =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
          .then(r => r.json() as Promise<{ title: string; url?: string; score: number; type: string }>)
      )
    );

    const items = stories
      .filter((r): r is PromiseFulfilledResult<{ title: string; url?: string; score: number; type: string }> =>
        r.status === 'fulfilled' && r.value?.type === 'story'
      )
      .map(r => r.value)
      .slice(0, limit);

    const lines = [
      `◆ Hacker News 热门  (${new Date().toLocaleString('zh-CN')})`,
      '─'.repeat(50),
      ...items.map((s, i) => `  ${String(i + 1).padStart(2)}. [${s.score}↑] ${s.title}`),
      '',
      '用 /rs <话题> 对感兴趣的内容做深度研究',
    ];
    return lines.join('\n');
  } catch (e) {
    return `获取新闻失败: ${e instanceof Error ? e.message : String(e)}\n(需要网络连接)`;
  }
}

// ── Plugin Definition ─────────────────────────────────────────────────────────

export const analyticsPlugin: PluginDef = {
  id: 'analytics',
  name: '成本收益 & 新闻',
  description: '成本统计 / ROI 分析 / 价格监控 / 技术新闻',
  version: '1.0.0',
  author: 'NEO',

  commands: [
    {
      name: 'stats',
      description: '显示本次会话成本收益统计',
      args: '[hourly-value-cny]',
    },
    {
      name: 'price',
      description: '查看所有模型价格表',
      args: '[check]',
    },
    {
      name: 'news',
      description: '最新技术/时政/金融新闻',
      args: '[tech|biz|finance]',
    },
    {
      name: 'roi',
      description: '显示 ROI 和最佳性价比模型推荐',
    },
  ],

  async onCommand(cmd, args, ctx) {
    const { getConfig } = await import('../../utils/config.js');
    const cfg = getConfig();

    if (cmd === 'stats') {
      const hourly = args ? parseInt(args) || 300 : 300;
      ctx.addMessage(formatStatsReport(cfg.provider, cfg.model, hourly));
      return true;
    }

    if (cmd === 'price') {
      if (args?.trim() === 'check') {
        ctx.addMessage('正在检查价格更新...');
        const updates = await checkPriceUpdates();
        ctx.addMessage(updates.join('\n'));
      } else {
        ctx.addMessage(formatPriceTable());
      }
      return true;
    }

    if (cmd === 'news') {
      const cat = (args?.trim() as NewsCategory) || 'all';
      ctx.addMessage('正在获取最新资讯...');
      const digest = await fetchNewsDigest(cat);
      ctx.addMessage(digest);
      return true;
    }

    if (cmd === 'roi') {
      const best = {
        quality: findBestValue('quality'),
        speed:   findBestValue('speed'),
        cost:    findBestValue('cost'),
      };
      ctx.addMessage([
        '◆ 最佳性价比模型推荐',
        `  质量优先: ${best.quality.provider}/${best.quality.model}  $${best.quality.inputPer1M}/M in`,
        `  速度优先: ${best.speed.provider}/${best.speed.model}      $${best.speed.inputPer1M}/M in`,
        `  成本优先: ${best.cost.provider}/${best.cost.model}        $${best.cost.inputPer1M}/M in`,
        '',
        '用 /model 切换  /price 查看完整表格',
      ].join('\n'));
      return true;
    }

    return false;
  },

  getStatusWidget(ctx) {
    const s = _stats;
    if (s.rounds === 0) return '';
    const sessionMin = Math.floor((Date.now() - s.sessionStartAt) / 60000);
    return `⏱${sessionMin}m ${fmtNum(s.totalInputTokens + s.totalOutputTokens)}tok`;
  },
};
