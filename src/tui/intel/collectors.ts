/**
 * collectors.ts — 情报采集器集合
 *
 * 采集器:
 *   HackerNewsCollector  — HN Top Stories (免费, 无需 key)
 *   WeatherCollector     — 天气 via wttr.in (免费, 无需 key)
 *   GitHubCollector      — GitHub Trending (免费, HTML 解析)
 *   RSSCollector         — RSS/Atom 新闻订阅 (免费)
 *   ExchangeCollector    — 汇率 via exchangerate-api (免费)
 *   BraveSearchCollector — 网络搜索 via Brave Search API (需 key)
 *   URLMonitorCollector  — 监控指定 URL 变化
 *
 * 所有采集器实现 Collector 接口, 统一由 IntelEngine 调度。
 */

import type { IntelItem, IntelSource } from './IntelStore.js';

type RawItem = Omit<IntelItem, 'id' | 'read' | 'fetchedAt'>;

// ── Collector Interface ────────────────────────────────────────────────────────

export interface CollectorConfig {
  id: string;
  name: string;
  source: IntelSource;
  intervalMs: number;    // collection interval
  enabled: boolean;
  apiKey?: string;       // optional
  params?: Record<string, string>;
}

export interface Collector {
  config: CollectorConfig;
  collect(): Promise<RawItem[]>;
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (compatible; NEO-CLI/1.0; +https://github.com/theneoai)';

async function fetchJSON<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json', ...headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
  return resp.json() as Promise<T>;
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<string> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,text/xml,application/rss+xml', ...headers },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
  return resp.text();
}

// ── 1. HackerNews Collector ───────────────────────────────────────────────────

export class HackerNewsCollector implements Collector {
  config: CollectorConfig = {
    id: 'hackernews',
    name: 'Hacker News',
    source: 'hackernews',
    intervalMs: 60 * 60 * 1000,  // 1h
    enabled: true,
  };

  async collect(): Promise<RawItem[]> {
    const ids = await fetchJSON<number[]>(
      'https://hacker-news.firebaseio.com/v0/topstories.json',
    );

    // Fetch top 8 stories in parallel
    const top = ids.slice(0, 8);
    const stories = await Promise.allSettled(
      top.map(id =>
        fetchJSON<{ title: string; url?: string; score: number; by: string; descendants?: number }>(
          `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        ),
      ),
    );

    return stories
      .filter(r => r.status === 'fulfilled')
      .map((r) => {
        const s = (r as PromiseFulfilledResult<{ title: string; url?: string; score: number; by: string; descendants?: number }>).value;
        return {
          source: 'hackernews' as IntelSource,
          title: s.title,
          url: s.url ?? `https://news.ycombinator.com/item?id=${top[0]}`,
          body: `Score: ${s.score} | by ${s.by} | ${s.descendants ?? 0} comments`,
          score: Math.min(100, Math.floor(s.score / 5)),
          tags: ['tech', 'news'],
        };
      });
  }
}

// ── 2. Weather Collector ──────────────────────────────────────────────────────

interface WttrResponse {
  current_condition?: Array<{
    temp_C: string;
    weatherDesc: Array<{ value: string }>;
    humidity: string;
    windspeedKmph: string;
    FeelsLikeC: string;
  }>;
  weather?: Array<{
    date: string;
    maxtempC: string;
    mintempC: string;
    hourly?: Array<{ weatherDesc: Array<{ value: string }> }>;
  }>;
  nearest_area?: Array<{
    areaName: Array<{ value: string }>;
    country: Array<{ value: string }>;
  }>;
}

export class WeatherCollector implements Collector {
  config: CollectorConfig;

  constructor(location = 'auto') {
    this.config = {
      id: 'weather',
      name: '天气',
      source: 'weather',
      intervalMs: 3 * 60 * 60 * 1000,   // 3h
      enabled: true,
      params: { location },
    };
  }

  async collect(): Promise<RawItem[]> {
    const loc = this.config.params?.['location'] ?? 'auto';
    const url = `https://wttr.in/${encodeURIComponent(loc)}?format=j1`;
    const data = await fetchJSON<WttrResponse>(url);

    const cur = data.current_condition?.[0];
    if (!cur) return [];

    const area = data.nearest_area?.[0];
    const locName = area?.areaName?.[0]?.value ?? '当前位置';
    const desc = cur.weatherDesc?.[0]?.value ?? '未知';
    const forecast = data.weather?.slice(0, 2).map(d =>
      `${d.date}: ${d.mintempC}–${d.maxtempC}°C`,
    ).join(' | ');

    return [{
      source: 'weather',
      title: `${locName}: ${desc} ${cur.temp_C}°C (体感 ${cur.FeelsLikeC}°C)`,
      body: `湿度 ${cur.humidity}% | 风速 ${cur.windspeedKmph} km/h\n未来: ${forecast ?? ''}`,
      score: 60,
      tags: ['weather', 'daily'],
      extra: { temp: cur.temp_C, humidity: cur.humidity, desc, locName },
    }];
  }
}

// ── 3. GitHub Trending Collector ──────────────────────────────────────────────

export class GitHubCollector implements Collector {
  config: CollectorConfig = {
    id: 'github',
    name: 'GitHub Trending',
    source: 'github',
    intervalMs: 4 * 60 * 60 * 1000,  // 4h
    enabled: true,
    params: { lang: '' },  // '' = all languages
  };

  async collect(): Promise<RawItem[]> {
    const lang = this.config.params?.['lang'] ?? '';
    const url = `https://github.com/trending${lang ? `/${lang}` : ''}?since=daily`;
    const html = await fetchText(url);

    // Parse repo items from HTML
    const items: RawItem[] = [];
    const repoPattern = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    let match: RegExpExecArray | null;

    while ((match = repoPattern.exec(html)) !== null && items.length < 8) {
      const block = match[1];

      // Extract repo name
      const nameMatch = /href="\/([^"]+)"[^>]*>\s*<[^>]+>\s*([^<\s]+)\s*<[^>]+>\s*\/\s*<[^>]+>\s*([^<]+)</.exec(block)
        ?? /href="(\/[^"]+)"/.exec(block);
      if (!nameMatch) continue;

      const repoPath = nameMatch[1].trim();
      // Extract description
      const descMatch = /<p[^>]*class="[^"]*col-9[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/p>/.exec(block);
      const desc = descMatch?.[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '';

      // Extract stars
      const starsMatch = /([\d,]+)\s*stars this week|(\d[\d,]*)\s*<\/span>\s*today/i.exec(block);
      const stars = starsMatch?.[1] ?? starsMatch?.[2] ?? '?';

      // Extract language
      const langMatch = /itemprop="programmingLanguage"[^>]*>\s*([^<]+)</.exec(block);
      const language = langMatch?.[1]?.trim() ?? '';

      items.push({
        source: 'github',
        title: `${repoPath}${language ? ` [${language}]` : ''} — ${desc || ''}`.slice(0, 120),
        url: `https://github.com/${repoPath}`,
        body: `⭐ ${stars} stars today | ${desc}`,
        score: 70,
        tags: ['github', 'trending', language.toLowerCase()].filter(Boolean),
      });
    }

    return items;
  }
}

// ── 4. RSS Collector ──────────────────────────────────────────────────────────

const DEFAULT_RSS_FEEDS = [
  { name: 'V2EX',     url: 'https://www.v2ex.com/index.xml',   tags: ['tech', 'chinese'] },
  { name: 'InfoQ CN', url: 'https://feed.infoq.com/cn',         tags: ['tech', 'chinese'] },
  { name: 'The Verge',url: 'https://www.theverge.com/rss/index.xml', tags: ['tech', 'english'] },
  { name: 'Wired',    url: 'https://www.wired.com/feed/rss',    tags: ['tech', 'english'] },
];

function parseRSSItems(xml: string, feedName: string, tags: string[]): RawItem[] {
  const items: RawItem[] = [];
  // Support both RSS <item> and Atom <entry>
  const itemPattern = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/g;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null && items.length < 5) {
    const block = match[1];
    const title = extractXML(block, 'title');
    const link  = extractXML(block, 'link') || extractAttr(block, 'link', 'href');
    const desc  = extractXML(block, 'description') || extractXML(block, 'summary');

    if (!title) continue;
    const clean = desc
      ? desc.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
      : '';

    items.push({
      source: 'rss',
      title: `[${feedName}] ${title.replace(/<[^>]+>/g, '').trim()}`,
      url: link || undefined,
      body: clean || undefined,
      score: 55,
      tags: ['rss', ...tags],
    });
  }
  return items;
}

function extractXML(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}[^>]*>(?:<\\!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i').exec(xml);
  return m ? m[1].trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = new RegExp(`<${tag}[^>]*${attr}="([^"]+)"`, 'i').exec(xml);
  return m ? m[1] : '';
}

export class RSSCollector implements Collector {
  config: CollectorConfig = {
    id: 'rss',
    name: 'RSS Feeds',
    source: 'rss',
    intervalMs: 30 * 60 * 1000,   // 30min
    enabled: true,
  };

  private feeds = DEFAULT_RSS_FEEDS;

  setFeeds(feeds: typeof DEFAULT_RSS_FEEDS) { this.feeds = feeds; }

  async collect(): Promise<RawItem[]> {
    const results = await Promise.allSettled(
      this.feeds.map(f =>
        fetchText(f.url)
          .then(xml => parseRSSItems(xml, f.name, f.tags))
          .catch(() => [] as RawItem[]),
      ),
    );
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  }
}

// ── 5. Exchange Rate Collector ────────────────────────────────────────────────

export class ExchangeCollector implements Collector {
  config: CollectorConfig = {
    id: 'exchange',
    name: '汇率',
    source: 'exchange',
    intervalMs: 6 * 60 * 60 * 1000,  // 6h
    enabled: true,
    params: { base: 'USD' },
  };

  async collect(): Promise<RawItem[]> {
    const base = this.config.params?.['base'] ?? 'USD';
    const url = `https://api.exchangerate-api.com/v4/latest/${base}`;
    const data = await fetchJSON<{ base: string; date: string; rates: Record<string, number> }>(url);

    const pairs = ['CNY', 'EUR', 'JPY', 'GBP', 'HKD']
      .filter(c => c !== base && data.rates[c])
      .map(c => `${base}/${c}=${data.rates[c]!.toFixed(4)}`)
      .join(' | ');

    return [{
      source: 'exchange',
      title: `💱 汇率 (${data.date}): ${pairs}`,
      body: `基准货币: ${base} | 数据来源: exchangerate-api`,
      score: 40,
      tags: ['finance', 'exchange'],
      extra: { base, rates: data.rates, date: data.date },
    }];
  }
}

// ── 6. Brave Search Collector (active, on-demand) ─────────────────────────────

export class BraveSearchCollector implements Collector {
  config: CollectorConfig = {
    id: 'brave-search',
    name: 'Brave 搜索',
    source: 'search',
    intervalMs: 0,       // on-demand only
    enabled: false,
    apiKey: '',
  };

  setApiKey(key: string) {
    this.config.apiKey = key;
    this.config.enabled = !!key;
  }

  async collect(): Promise<RawItem[]> { return []; }

  async search(query: string, count = 8): Promise<RawItem[]> {
    if (!this.config.apiKey) return [];

    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}&search_lang=zh`;
    const data = await fetchJSON<{
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    }>(url, {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': this.config.apiKey,
    });

    return (data.web?.results ?? []).map(r => ({
      source: 'search' as IntelSource,
      title: r.title,
      url: r.url,
      body: r.description,
      score: 75,
      tags: ['search', 'web', query.split(' ')[0] ?? ''],
    }));
  }
}

// ── 7. URL Monitor Collector ──────────────────────────────────────────────────

interface MonitorTarget {
  name: string;
  url: string;
  selector?: string;  // keyword to look for in response
  lastHash?: string;
}

export class URLMonitorCollector implements Collector {
  config: CollectorConfig = {
    id: 'url-monitor',
    name: 'URL 监控',
    source: 'monitor',
    intervalMs: 15 * 60 * 1000,  // 15min
    enabled: false,
  };

  private targets: MonitorTarget[] = [];

  addTarget(target: MonitorTarget) {
    this.targets.push(target);
    this.config.enabled = true;
  }

  removeTarget(name: string) {
    this.targets = this.targets.filter(t => t.name !== name);
    this.config.enabled = this.targets.length > 0;
  }

  async collect(): Promise<RawItem[]> {
    if (this.targets.length === 0) return [];
    const results: RawItem[] = [];

    for (const target of this.targets) {
      try {
        const html = await fetchText(target.url);
        // Simple change detection via content hash
        const hash = simpleHash(html.slice(0, 5000));
        if (target.lastHash && target.lastHash !== hash) {
          results.push({
            source: 'monitor',
            title: `📡 ${target.name} 页面有更新`,
            url: target.url,
            body: target.selector
              ? (html.includes(target.selector) ? `检测到关键词: "${target.selector}"` : '内容已变化')
              : '页面内容已变化',
            score: 85,
            tags: ['monitor', 'alert'],
          });
        }
        target.lastHash = hash;
      } catch (err) {
        process.stderr.write(`[monitor:${target.name}] fetch failed: ${err}\n`);
      }
    }

    return results;
  }
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

// ── Export all collectors ─────────────────────────────────────────────────────

export {
  DEFAULT_RSS_FEEDS,
};
