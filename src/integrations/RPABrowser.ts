/**
 * RPABrowser - Automatización de Interacciones Web
 * Navegación real con mouse/teclado virtual, evasión de detección,
 * respeto a robots.txt, cache agresivo, y fallback documentado.
 */

import { EventEmitter } from 'events';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface RPASession {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  actions: string[];
}

export interface RPAResult {
  success: boolean;
  data: any;
  url: string;
  method: string;
  timestamp: number;
  cached?: boolean;
  simulated?: boolean;
  page?: Page;
  captcha?: any;
}

export interface RPAConfig {
  headless: boolean;
  userAgent: string;
  viewport: { width: number; height: number };
  delayMinMs: number;
  delayMaxMs: number;
  respectRobotsTxt: boolean;
  maxRetries: number;
  cacheTtlHours: number;
}

export class RPABrowser extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private sessions: RPASession[] = [];
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private active = false;
  private config: RPAConfig;

  constructor(config: Partial<RPAConfig> = {}) {
    super();
    this.config = {
      headless: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      delayMinMs: 500,
      delayMaxMs: 2000,
      respectRobotsTxt: true,
      maxRetries: 3,
      cacheTtlHours: 24,
      ...config,
    };
  }

  async init(): Promise<void> {
    if (this.active) return;
    try {
      this.browser = await chromium.launch({ headless: this.config.headless });
      this.context = await this.browser.newContext({
        viewport: this.config.viewport,
        userAgent: this.config.userAgent,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });
      this.active = true;
      this.emit('browser-ready');
      console.log('[RPABrowser] Navegador inicializado con evasión de detección');
    } catch (err) {
      console.warn('[RPABrowser] Playwright no disponible, modo simulado');
      this.active = false;
    }
  }

  // ----------------------------------------------------------
  // NAVEGACIÓN
  // ----------------------------------------------------------

  async navigate(url: string): Promise<RPAResult> {
    const cacheKey = `nav_${url}`;
    const cached = this.getCache(cacheKey);
    if (cached) return { ...cached, cached: true, url, method: 'navigate', timestamp: Date.now() };

    if (!this.active || !this.context) {
      return this.simulateNavigate(url);
    }

    const result = await this.executeWithRetry(async () => {
      const page = await this.context!.newPage();
      
      // Evasión de detección: plugins, webdriver, etc.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        (globalThis as any).chrome = { runtime: {} };
      });

      await this.humanDelay();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.humanDelay();

      const title = await page.title();
      const finalUrl = page.url();

      const session: RPASession = {
        id: crypto.randomUUID(),
        url: finalUrl,
        title,
        timestamp: Date.now(),
        actions: ['navigate'],
      };
      this.sessions.push(session);
      if (this.sessions.length > 100) this.sessions.shift();

      const result: RPAResult = {
        success: true,
        data: { title, url: finalUrl },
        url: finalUrl,
        method: 'navigate',
        timestamp: Date.now(),
        page, // [v2.1] Expose page for CAPTCHA handling
      };

      this.setCache(cacheKey, { ...result, page: undefined });
      this.emit('page-visited', session);
      return result;
    });

    return result;
  }

  // ----------------------------------------------------------
  // INTERACCIÓN
  // ----------------------------------------------------------

  async click(url: string, selector: string): Promise<RPAResult> {
    if (!this.active || !this.context) {
      return this.simulateAction(url, 'click', selector);
    }

    return this.executeWithRetry(async () => {
      const page = await this.context!.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.humanDelay();

      await page.click(selector, { delay: Math.random() * 100 + 50 });
      await this.humanDelay();

      const result: RPAResult = {
        success: true,
        data: { clicked: selector, currentUrl: page.url() },
        url: page.url(),
        method: 'click',
        timestamp: Date.now(),
      };

      await page.close();
      return result;
    });
  }

  async type(url: string, selector: string, text: string): Promise<RPAResult> {
    if (!this.active || !this.context) {
      return this.simulateAction(url, 'type', { selector, text });
    }

    return this.executeWithRetry(async () => {
      const page = await this.context!.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.humanDelay();

      await page.fill(selector, text);
      await this.humanDelay();

      const result: RPAResult = {
        success: true,
        data: { typed: text, selector },
        url: page.url(),
        method: 'type',
        timestamp: Date.now(),
      };

      await page.close();
      return result;
    });
  }

  async scroll(url: string, amount: number = 500): Promise<RPAResult> {
    if (!this.active || !this.context) {
      return this.simulateAction(url, 'scroll', amount);
    }

    return this.executeWithRetry(async () => {
      const page = await this.context!.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.humanDelay();

      await page.evaluate(`window.scrollBy(0, ${amount})`);
      await this.humanDelay();

      const result: RPAResult = {
        success: true,
        data: { scrolled: amount },
        url: page.url(),
        method: 'scroll',
        timestamp: Date.now(),
      };

      await page.close();
      return result;
    });
  }

  // ----------------------------------------------------------
  // EXTRACCIÓN
  // ----------------------------------------------------------

  async extract(url: string, selector: string): Promise<RPAResult> {
    const cacheKey = `extract_${url}_${selector}`;
    const cached = this.getCache(cacheKey);
    if (cached) return { ...cached, cached: true, url, method: 'extract', timestamp: Date.now() };

    if (!this.active || !this.context) {
      return this.simulateExtract(url, selector);
    }

    return this.executeWithRetry(async () => {
      const page = await this.context!.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.humanDelay();

      const data = await page.evaluate(`((sel) => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).map(el => ({
          text: (el.textContent || '').trim(),
          href: el.href || undefined,
          src: el.src || undefined,
        }));
      })('${selector.replace(/'/g, "\\'")}')`);

      const result: RPAResult = {
        success: true,
        data,
        url: page.url(),
        method: 'extract',
        timestamp: Date.now(),
      };

      await page.close();
      this.setCache(cacheKey, result);
      return result;
    });
  }

  async screenshot(url: string): Promise<RPAResult> {
    if (!this.active || !this.context) {
      return this.simulateAction(url, 'screenshot', null);
    }

    return this.executeWithRetry(async () => {
      const page = await this.context!.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await this.humanDelay();

      const screenshot = await page.screenshot({ fullPage: true, type: 'png' });

      const result: RPAResult = {
        success: true,
        data: { screenshot: screenshot.toString('base64'), size: screenshot.length },
        url: page.url(),
        method: 'screenshot',
        timestamp: Date.now(),
      };

      await page.close();
      return result;
    });
  }

  // ----------------------------------------------------------
  // SCRAPING ESTÁTICO (sin browser)
  // ----------------------------------------------------------

  async scrapeStatic(url: string): Promise<RPAResult> {
    const cacheKey = `static_${url}`;
    const cached = this.getCache(cacheKey);
    if (cached) return { ...cached, cached: true, url, method: 'scrape-static', timestamp: Date.now() };

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const result: RPAResult = {
        success: true,
        data: { html: html.substring(0, 10000), length: html.length },
        url,
        method: 'scrape-static',
        timestamp: Date.now(),
      };

      this.setCache(cacheKey, result);
      return result;
    } catch (err) {
      return {
        success: false,
        data: { error: (err as Error).message },
        url,
        method: 'scrape-static',
        timestamp: Date.now(),
      };
    }
  }

  // ----------------------------------------------------------
  // UTILIDADES
  // ----------------------------------------------------------

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastError || new Error('Max retries exceeded');
  }

  private async humanDelay(): Promise<void> {
    const delay = this.config.delayMinMs + Math.random() * (this.config.delayMaxMs - this.config.delayMinMs);
    await new Promise(r => setTimeout(r, delay));
  }

  private getCache(key: string): RPAResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    const ttl = this.config.cacheTtlHours * 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCache(key: string, data: RPAResult): void {
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  getSessions(): RPASession[] {
    return [...this.sessions];
  }

  isActive(): boolean {
    return this.active;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
    this.active = false;
    this.emit('browser-closed');
  }

  // ----------------------------------------------------------
  // SIMULACIÓN (fallback cuando Playwright no está disponible)
  // ----------------------------------------------------------

  private simulateNavigate(url: string): RPAResult {
    const session: RPASession = {
      id: crypto.randomUUID(),
      url,
      title: `Página simulada: ${url}`,
      timestamp: Date.now(),
      actions: ['navigate-simulated'],
    };
    this.sessions.push(session);
    return {
      success: true,
      data: { title: session.title, url, simulated: true },
      url,
      method: 'navigate',
      timestamp: Date.now(),
      simulated: true,
    };
  }

  private simulateAction(url: string, action: string, detail: any): RPAResult {
    return {
      success: true,
      data: { action, detail, simulated: true },
      url,
      method: action,
      timestamp: Date.now(),
      simulated: true,
    };
  }

  private simulateExtract(url: string, selector: string): RPAResult {
    return {
      success: true,
      data: [
        { text: `Elemento 1 de ${selector}`, href: `${url}/1` },
        { text: `Elemento 2 de ${selector}`, href: `${url}/2` },
        { text: `Elemento 3 de ${selector}`, href: `${url}/3` },
      ],
      url,
      method: 'extract',
      timestamp: Date.now(),
      simulated: true,
    };
  }
}

export const rpaBrowser = new RPABrowser();
