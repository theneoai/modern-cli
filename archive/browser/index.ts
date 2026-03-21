/**
 * Browser Automation - Playwright integration for web scraping and automation
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../core/db/index.js';
import { events } from '../core/events/index.js';

export interface BrowserSession {
  id: string;
  name: string;
  browserType: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  proxy?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  createdAt: Date;
  lastUsed: Date;
}

export interface AutomationScript {
  id: string;
  name: string;
  description?: string;
  steps: AutomationStep[];
  createdAt: Date;
}

export interface AutomationStep {
  id: string;
  type: 'goto' | 'click' | 'fill' | 'screenshot' | 'wait' | 'extract' | 'scroll' | 'eval' | 'download';
  params: Record<string, any>;
  waitFor?: string;
  timeout?: number;
}

const activeBrowsers = new Map<string, { browser: Browser; context: BrowserContext; page: Page }>();

// Create browser session
export async function createBrowserSession(config: Omit<BrowserSession, 'id' | 'createdAt' | 'lastUsed'>): Promise<BrowserSession> {
  const session: BrowserSession = {
    id: uuidv4(),
    ...config,
    createdAt: new Date(),
    lastUsed: new Date(),
  };

  const db = getDB();
  db.prepare(`
    INSERT INTO browser_sessions (id, name, browser_type, headless, proxy, user_agent, viewport, created_at, last_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    session.name,
    session.browserType,
    session.headless ? 1 : 0,
    session.proxy,
    session.userAgent,
    JSON.stringify(session.viewport),
    session.createdAt.toISOString(),
    session.lastUsed.toISOString()
  );

  events.emit('browser.session.created', { sessionId: session.id, name: session.name });
  return session;
}

// Launch browser
export async function launchBrowser(sessionId: string): Promise<void> {
  const db = getDB();
  const row = db.prepare('SELECT * FROM browser_sessions WHERE id = ?').get(sessionId) as any;
  if (!row) throw new Error(`Session ${sessionId} not found`);

  const session: BrowserSession = {
    id: row.id,
    name: row.name,
    browserType: row.browser_type,
    headless: row.headless === 1,
    proxy: row.proxy,
    userAgent: row.user_agent,
    viewport: row.viewport ? JSON.parse(row.viewport) : undefined,
    createdAt: new Date(row.created_at),
    lastUsed: new Date(row.last_used),
  };

  if (activeBrowsers.has(sessionId)) {
    throw new Error('Browser already active for this session');
  }

  const browser = await chromium.launch({
    headless: session.headless,
    proxy: session.proxy ? { server: session.proxy } : undefined,
  });

  const context = await browser.newContext({
    userAgent: session.userAgent,
    viewport: session.viewport || { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  activeBrowsers.set(sessionId, { browser, context, page });

  // Update last used
  db.prepare('UPDATE browser_sessions SET last_used = ? WHERE id = ?')
    .run(new Date().toISOString(), sessionId);

  events.emit('browser.launched', { sessionId });
}

// Close browser
export async function closeBrowser(sessionId: string): Promise<void> {
  const active = activeBrowsers.get(sessionId);
  if (!active) return;

  await active.browser.close();
  activeBrowsers.delete(sessionId);

  events.emit('browser.closed', { sessionId });
}

// Execute automation script
export async function executeScript(
  sessionId: string,
  script: AutomationScript
): Promise<{ success: boolean; results: any[]; error?: string }> {
  const active = activeBrowsers.get(sessionId);
  if (!active) {
    throw new Error('Browser not launched. Call launchBrowser first.');
  }

  const { page } = active;
  const results: any[] = [];

  try {
    for (const step of script.steps) {
      const result = await executeStep(page, step);
      results.push({ stepId: step.id, result });
    }

    events.emit('browser.script.completed', { sessionId, scriptId: script.id });
    return { success: true, results };

  } catch (error) {
    events.emit('browser.script.failed', {
      sessionId,
      scriptId: script.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      results,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Execute single step
async function executeStep(page: Page, step: AutomationStep): Promise<any> {
  const timeout = step.timeout || 30000;

  switch (step.type) {
    case 'goto':
      await page.goto(step.params.url, { waitUntil: 'networkidle', timeout });
      return { url: page.url() };

    case 'click':
      const clickSelector = step.params.selector;
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      await page.click(clickSelector);
      return { clicked: clickSelector };

    case 'fill':
      const fillSelector = step.params.selector;
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      await page.fill(fillSelector, step.params.value);
      return { filled: fillSelector, value: step.params.value };

    case 'screenshot':
      const screenshotPath = step.params.path || `screenshot-${Date.now()}.png`;
      await page.screenshot({
        path: screenshotPath,
        fullPage: step.params.fullPage || false,
      });
      return { screenshot: screenshotPath };

    case 'wait':
      if (step.params.selector) {
        await page.waitForSelector(step.params.selector, { timeout });
      } else if (step.params.time) {
        await page.waitForTimeout(step.params.time);
      }
      return { waited: step.params.selector || step.params.time };

    case 'extract':
      const extractSelector = step.params.selector;
      if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout });
      
      if (step.params.attribute) {
        const attrValue = await page.getAttribute(extractSelector, step.params.attribute);
        return { [step.params.attribute]: attrValue };
      } else if (step.params.property) {
        const propValue = await page.$eval(extractSelector, (el: any) => el[step.params.property]);
        return { [step.params.property]: propValue };
      } else {
        const text = await page.textContent(extractSelector);
        return { text };
      }

    case 'scroll':
      if (step.params.selector) {
        await page.$eval(step.params.selector, (el: any) => el.scrollIntoView());
      } else {
        await page.evaluate(() => window.scrollBy(0, step.params.y || 500));
      }
      return { scrolled: step.params.selector || 'window' };

    case 'eval':
      const evalResult = await page.evaluate(step.params.script);
      return { result: evalResult };

    case 'download':
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click(step.params.selector),
      ]);
      const downloadPath = await download.path();
      return { downloadPath };

    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

// Quick scrape function
export async function quickScrape(url: string, selectors: Record<string, string>): Promise<Record<string, any>> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    const results: Record<string, any> = {};
    for (const [key, selector] of Object.entries(selectors)) {
      try {
        const text = await page.textContent(selector);
        results[key] = text?.trim();
      } catch {
        results[key] = null;
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}

// List sessions
export function listBrowserSessions(): BrowserSession[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM browser_sessions ORDER BY last_used DESC').all() as any[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    browserType: row.browser_type,
    headless: row.headless === 1,
    proxy: row.proxy,
    userAgent: row.user_agent,
    viewport: row.viewport ? JSON.parse(row.viewport) : undefined,
    createdAt: new Date(row.created_at),
    lastUsed: new Date(row.last_used),
  }));
}

// Create browser sessions table
export function initBrowserTables(): void {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      browser_type TEXT NOT NULL,
      headless INTEGER DEFAULT 1,
      proxy TEXT,
      user_agent TEXT,
      viewport TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_browser_sessions_name ON browser_sessions(name);
  `);
}

// Auto-scrape with AI
export async function aiScrape(url: string, instructions: string): Promise<any> {
  // Launch browser and navigate
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    // Get page content
    const content = await page.content();
    const title = await page.title();

    // Extract structured data based on instructions
    // This would integrate with LLM in full implementation
    const result = {
      url,
      title,
      content: content.slice(0, 5000), // Limit content
      instructions,
    };

    return result;
  } finally {
    await browser.close();
  }
}
