/**
 * IntelEngine.ts — 情报引擎 (主动 + 被动采集)
 *
 * 功能:
 *   被动采集 — 后台定时运行各 Collector，自动汇入 IntelStore
 *   主动采集 — on-demand 搜索 / 监控触发
 *   上下文注入 — 最新情报注入助理 System Prompt
 *   助理提醒 — 重要情报推送给助理主动播报
 *
 * 采集调度:
 *   HackerNews  每 1h
 *   Weather     每 3h
 *   GitHub      每 4h
 *   RSS         每 30min
 *   Exchange    每 6h
 *   URLMonitor  每 15min
 */

import { assertSafeUrl } from '../../utils/security.js';
import { intelStore, type IntelItem } from './IntelStore.js';
import {
  HackerNewsCollector,
  WeatherCollector,
  GitHubCollector,
  RSSCollector,
  ExchangeCollector,
  BraveSearchCollector,
  URLMonitorCollector,
  type Collector,
} from './collectors.js';

export type { IntelItem };

// ── Config ────────────────────────────────────────────────────────────────────

export interface IntelConfig {
  enabled: boolean;
  weatherLocation: string;
  braveApiKey?: string;
  githubLang?: string;
  monitorTargets?: Array<{ name: string; url: string; selector?: string }>;
  disabledSources?: string[];
}

// ── IntelEngine ───────────────────────────────────────────────────────────────

export class IntelEngine {
  private collectors: Collector[];
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private onNewItems: ((items: IntelItem[]) => void) | null = null;
  private initialized = false;

  // Public collector refs for direct access
  readonly brave: BraveSearchCollector;
  readonly monitor: URLMonitorCollector;
  readonly weather: WeatherCollector;

  constructor() {
    this.weather  = new WeatherCollector();
    this.brave    = new BraveSearchCollector();
    this.monitor  = new URLMonitorCollector();

    this.collectors = [
      new HackerNewsCollector(),
      this.weather,
      new GitHubCollector(),
      new RSSCollector(),
      new ExchangeCollector(),
      this.brave,
      this.monitor,
    ];
  }

  // ── Init / Destroy ────────────────────────────────────────────────────────

  /** Update the new-items callback (safe to call before or after init) */
  setOnNewItems(cb: (items: IntelItem[]) => void) {
    this.onNewItems = cb;
  }

  init(cfg: Partial<IntelConfig> = {}, onNewItems?: (items: IntelItem[]) => void) {
    if (onNewItems) this.onNewItems = onNewItems;
    if (this.initialized) return;
    this.initialized = true;

    // Apply config
    if (cfg.weatherLocation) {
      this.weather.config.params = { location: cfg.weatherLocation };
    }
    if (cfg.braveApiKey) {
      this.brave.setApiKey(cfg.braveApiKey);
    }
    if (cfg.disabledSources) {
      for (const col of this.collectors) {
        if (cfg.disabledSources.includes(col.config.id)) {
          col.config.enabled = false;
        }
      }
    }

    // Start all scheduled collectors
    for (const col of this.collectors) {
      if (!col.config.enabled || col.config.intervalMs <= 0) continue;
      this.schedule(col);
    }

    // Run first-pass collection after 5s (give app time to boot)
    setTimeout(() => void this.runAll(), 5000);
  }

  destroy() {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.initialized = false;
    intelStore.flush();
  }

  // ── Scheduling ────────────────────────────────────────────────────────────

  private schedule(col: Collector) {
    if (this.timers.has(col.config.id)) return;
    const timer = setInterval(() => {
      void this.runCollector(col);
    }, col.config.intervalMs);
    this.timers.set(col.config.id, timer);
  }

  private async runCollector(col: Collector): Promise<IntelItem[]> {
    if (!col.config.enabled) return [];
    try {
      const raw = await col.collect();
      if (raw.length === 0) return [];
      const added = intelStore.upsert(raw);
      if (added.length > 0) this.onNewItems?.(added);
      return added;
    } catch (err) {
      process.stderr.write(`[intel:${col.config.id}] collection failed: ${err}\n`);
      return [];
    }
  }

  private async runAll(): Promise<void> {
    await Promise.allSettled(
      this.collectors
        .filter(c => c.config.enabled && c.config.intervalMs > 0)
        .map(c => this.runCollector(c)),
    );
  }

  // ── Active / On-demand ────────────────────────────────────────────────────

  /** Web search via Brave API */
  async search(query: string, count = 8): Promise<IntelItem[]> {
    const raw = await this.brave.search(query, count);
    if (raw.length === 0) return [];
    return intelStore.upsert(raw);
  }

  /** Manually fetch a specific source now */
  async fetchNow(sourceId: string): Promise<IntelItem[]> {
    const col = this.collectors.find(c => c.config.id === sourceId);
    if (!col) return [];
    return this.runCollector(col);
  }

  /** Scrape any URL and store as intel */
  async scrapeURL(url: string, name: string): Promise<IntelItem[]> {
    try {
      assertSafeUrl(url);
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NEO-CLI/1.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) return [];
      const text = await resp.text();
      // Extract title and description
      const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(text);
      const descMatch  = /<meta[^>]*name="description"[^>]*content="([^"]+)"/i.exec(text)
        ?? /<meta[^>]*content="([^"]+)"[^>]*name="description"/i.exec(text);

      const title = titleMatch?.[1]?.trim() ?? url;
      const desc  = descMatch?.[1]?.trim() ?? '';
      // Extract text content (rough)
      const body = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);

      return intelStore.upsert([{
        source: 'monitor',
        title: `[${name}] ${title}`.slice(0, 120),
        url,
        body: desc || body,
        score: 70,
        tags: ['scrape', name.toLowerCase()],
      }]);
    } catch {
      return [];
    }
  }

  // ── Query / Context ───────────────────────────────────────────────────────

  getRecent(limit = 20) { return intelStore.getRecent(limit); }
  getUnread(limit = 10) { return intelStore.getUnread(limit); }
  getStats()            { return intelStore.stats(); }

  /** Context block for companion system prompt injection */
  contextBlock(limit = 8): string {
    return intelStore.toContextBlock(limit);
  }

  /** Collector status list */
  collectorStatus() {
    return this.collectors.map(c => ({
      id:       c.config.id,
      name:     c.config.name,
      enabled:  c.config.enabled,
      interval: c.config.intervalMs,
      running:  this.timers.has(c.config.id),
    }));
  }
}

export const intelEngine = new IntelEngine();
