import { EventEmitter } from 'events';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../core/Logger.js';
import { captchaSolver } from './CAPTCHASolver.js';

// ============================================================
// BROWSER AGENT - NAVEGACION REAL SIN FALLBACK SIMULADO
// ============================================================

interface BrowserSession {
  id: string;
  url: string;
  title: string;
  timestamp: number;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface NavigateResult {
  title: string;
  url: string;
  success: boolean;
  error?: string;
}

export class BrowserAgent extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private sessions: BrowserSession[] = [];
  private active = false;
  private readonly log = logger.child('browser-agent');
  private readonly MAX_SESSIONS = 100;

  // ----------------------------------------------------------
  // INICIALIZACION
  // ----------------------------------------------------------

  async init(): Promise<void> {
    if (this.active) return;
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
      });
      // Ocultar propiedades de automation
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      });
      this.active = true;
      this.emit('browser-ready');
      this.log.info('BrowserAgent: Navegador inicializado con anti-detection');
    } catch (err) {
      this.log.error('BrowserAgent: Playwright no disponible', { error: String(err) });
      this.active = false;
      throw new Error(`Playwright no disponible: ${String(err)}`);
    }
  }

  // ----------------------------------------------------------
  // NAVEGACION REAL
  // ----------------------------------------------------------

  async navigate(url: string): Promise<NavigateResult> {
    if (!this.active || !this.context) {
      await this.init();
    }

    const page = await this.context!.newPage();
    try {
      this.log.debug(`Navegando a ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Detectar CAPTCHA
      const captchaCheck = await captchaSolver.detect(page);
      if (captchaCheck.detected) {
        this.log.warn(`CAPTCHA detectado en ${url}`, { type: captchaCheck.type });
        const handleResult = await captchaSolver.handle(page, { strategy: 'evasion', notifyHuman: true });
        if (handleResult.status === 'blocked' || handleResult.status === 'manual-required') {
          throw new Error(`CAPTCHA bloqueo navegacion a ${url}`);
        }
      }

      const title = await page.title();
      const finalUrl = page.url();

      const session: BrowserSession = {
        id: crypto.randomUUID(),
        url: finalUrl,
        title,
        timestamp: Date.now(),
      };
      this.sessions.push(session);
      if (this.sessions.length > this.MAX_SESSIONS) this.sessions.shift();

      this.emit('page-visited', session);
      this.log.info(`Pagina visitada: ${title} (${finalUrl})`);
      return { title, url: finalUrl, success: true };
    } catch (err: any) {
      this.emit('navigation-error', { url, error: err.message });
      this.log.error(`Navegacion fallida: ${url}`, { error: err.message });
      return { title: '', url, success: false, error: err.message };
    } finally {
      await page.close();
    }
  }

  // ----------------------------------------------------------
  // BUSQUEDA REAL
  // ----------------------------------------------------------

  async search(query: string, engine: 'google' | 'duckduckgo' = 'duckduckgo'): Promise<SearchResult[]> {
    if (!this.active || !this.context) {
      await this.init();
    }

    const page = await this.context!.newPage();
    try {
      const searchUrl = engine === 'google'
        ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
        : `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      this.log.debug(`Buscando: ${query} en ${engine}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // Detectar CAPTCHA
      const captchaCheck = await captchaSolver.detect(page);
      if (captchaCheck.detected) {
        this.log.warn(`CAPTCHA en busqueda ${engine}`, { query });
        const handleResult = await captchaSolver.handle(page, { strategy: 'evasion', notifyHuman: true });
        if (handleResult.status === 'blocked' || handleResult.status === 'manual-required') {
          throw new Error(`CAPTCHA bloqueo busqueda en ${engine}`);
        }
      }

      const results = await page.evaluate(() => {
        const items: SearchResult[] = [];
        // DuckDuckGo selectors
        document.querySelectorAll('.result').forEach((el) => {
          const titleEl = el.querySelector('.result__title a');
          const snippetEl = el.querySelector('.result__snippet');
          if (titleEl && snippetEl) {
            items.push({
              title: (titleEl.textContent || '').trim(),
              url: (titleEl as HTMLAnchorElement).href,
              snippet: (snippetEl.textContent || '').trim(),
            });
          }
        });
        // Google selectors (fallback)
        if (items.length === 0) {
          document.querySelectorAll('div.g').forEach((el) => {
            const titleEl = el.querySelector('h3');
            const linkEl = el.querySelector('a');
            const snippetEl = el.querySelector('span');
            if (titleEl && linkEl) {
              items.push({
                title: (titleEl.textContent || '').trim(),
                url: (linkEl as HTMLAnchorElement).href,
                snippet: (snippetEl?.textContent || '').trim(),
              });
            }
          });
        }
        return items.slice(0, 10);
      });

      this.log.info(`Busqueda completada: ${results.length} resultados para "${query}"`);
      return results;
    } catch (err: any) {
      this.log.error(`Busqueda fallida: ${query}`, { error: err.message });
      throw new Error(`Busqueda fallida: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  // ----------------------------------------------------------
  // EXTRACCION DE DATOS REAL
  // ----------------------------------------------------------

  async extractData(url: string, selector: string): Promise<{ url: string; selector: string; data: string[]; success: boolean; error?: string }> {
    if (!this.active || !this.context) {
      await this.init();
    }

    const page = await this.context!.newPage();
    try {
      this.log.debug(`Extrayendo datos de ${url} con selector ${selector}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const data = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel);
        return Array.from(elements).map((el) => (el.textContent || '').trim()).filter((t) => t.length > 0);
      }, selector);

      this.log.info(`Datos extraidos: ${data.length} elementos de ${url}`);
      return { url, selector, data, success: true };
    } catch (err: any) {
      this.log.error(`Extraccion fallida: ${url}`, { error: err.message });
      return { url, selector, data: [], success: false, error: err.message };
    } finally {
      await page.close();
    }
  }

  // ----------------------------------------------------------
  // SCREENSHOT
  // ----------------------------------------------------------

  async screenshot(url: string, options: { fullPage?: boolean; path?: string } = {}): Promise<{ success: boolean; path?: string; error?: string }> {
    if (!this.active || !this.context) {
      await this.init();
    }

    const page = await this.context!.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const path = options.path || `/tmp/screenshot-${Date.now()}.png`;
      await page.screenshot({
        fullPage: options.fullPage ?? true,
        path,
      });
      this.log.info(`Screenshot guardado: ${path}`);
      return { success: true, path };
    } catch (err: any) {
      this.log.error(`Screenshot fallido: ${url}`, { error: err.message });
      return { success: false, error: err.message };
    } finally {
      await page.close();
    }
  }

  // ----------------------------------------------------------
  // CONSULTAS
  // ----------------------------------------------------------

  getSessions(): BrowserSession[] {
    return [...this.sessions];
  }

  isActive(): boolean {
    return this.active;
  }

  // ----------------------------------------------------------
  // LIMPIEZA
  // ----------------------------------------------------------

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
    this.active = false;
    this.sessions = [];
    this.emit('browser-closed');
    this.log.info('BrowserAgent cerrado');
  }
}

export const browserAgent = new BrowserAgent();
