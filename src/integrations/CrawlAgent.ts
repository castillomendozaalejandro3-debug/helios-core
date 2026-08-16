import { EventEmitter } from 'events';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { logger } from '../core/Logger.js';
import { frugalLedger } from '../frugality/FrugalLedger.js';
import { captchaSolver } from './CAPTCHASolver.js';
import { budgetManager } from '../economy/BudgetManager.js';

// ============================================================
// INTERFACES
// ============================================================

export interface CrawlStrategy {
  type: 'css' | 'xpath' | 'llm' | 'auto';
  selector?: string;
  prompt?: string;
  extract?: {
    title?: boolean;
    description?: boolean;
    links?: boolean;
    images?: boolean;
    tables?: boolean;
    text?: boolean;
  };
  maxPages?: number;
  respectRobotsTxt?: boolean;
  userAgent?: string;
  timeout?: number;
}

export interface CrawlResult {
  url: string;
  data: any;
  strategy: string;
  timestamp: number;
  pagesCrawled: number;
  linksFound: string[];
  success: boolean;
  error?: string;
  cost: number;
}

export interface CrawlSession {
  id: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: CrawlResult[];
  startTime: number;
  endTime?: number;
  totalCost: number;
}

interface ExtractedData {
  title?: string;
  description?: string;
  headings: { level: number; text: string }[];
  paragraphs: string[];
  links: { text: string; href: string }[];
  images: { src: string; alt: string }[];
  tables: { headers: string[]; rows: string[][] }[];
  meta: Record<string, string>;
}

// ============================================================
// CRAWL AGENT - SCRAPING REAL CON PLAYWRIGHT + CHEERIO
// ============================================================

export class CrawlAgent extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private sessions = new Map<string, CrawlSession>();
  private active = false;
  private readonly log = logger.child('crawl-agent');
  private readonly COST_PER_PAGE = 0.01;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly DEFAULT_MAX_PAGES = 1;

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
        ],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });
      this.active = true;
      this.log.info('CrawlAgent inicializado con Playwright real');
      this.emit('ready');
    } catch (err) {
      this.log.error('Error inicializando Playwright', { error: String(err) });
      this.active = false;
      throw err;
    }
  }

  async crawl(url: string, strategy: CrawlStrategy, budgetOwner?: string): Promise<CrawlResult> {
    const sessionId = crypto.randomUUID();
    const session: CrawlSession = {
      id: sessionId,
      url,
      status: 'running',
      results: [],
      startTime: Date.now(),
      totalCost: 0,
    };
    this.sessions.set(sessionId, session);
    this.emit('crawl-start', { sessionId, url, strategy });

    try {
      if (!this.active) {
        await this.init();
      }

      if (budgetOwner) {
        const check = budgetManager.canSpend(budgetOwner, 'agent', this.COST_PER_PAGE);
        if (!check.allowed) {
          throw new Error(`Presupuesto insuficiente: ${check.reason}`);
        }
      }

      const result = await this.executeRealCrawl(url, strategy, session);
      session.results.push(result);
      session.status = result.success ? 'completed' : 'failed';
      session.endTime = Date.now();
      session.totalCost = result.cost;

      if (budgetOwner && result.success) {
        await budgetManager.spend(budgetOwner, 'agent', result.cost, `Crawl: ${url}`);
      }

      await frugalLedger.recordExpense(
        result.cost,
        'crawl',
        'CrawlAgent',
        budgetOwner || 'system',
        {
          estimatedROI: 2.0,
          justification: `Scraping ${url} con estrategia ${strategy.type}`,
          metadata: { url, strategy: strategy.type, pagesCrawled: result.pagesCrawled },
        }
      );

      this.emit('crawl-complete', { sessionId, result });
      return result;
    } catch (err: any) {
      session.status = 'failed';
      session.endTime = Date.now();
      const failedResult: CrawlResult = {
        url,
        data: null,
        strategy: strategy.type,
        timestamp: Date.now(),
        pagesCrawled: 0,
        linksFound: [],
        success: false,
        error: err.message,
        cost: 0,
      };
      session.results.push(failedResult);
      this.emit('crawl-error', { sessionId, error: err.message });
      this.log.error(`Crawl fallido: ${url}`, { error: err.message });
      return failedResult;
    }
  }

  private async executeRealCrawl(url: string, strategy: CrawlStrategy, session: CrawlSession): Promise<CrawlResult> {
    const page = await this.context!.newPage();
    const timeout = strategy.timeout || this.DEFAULT_TIMEOUT;
    const maxPages = strategy.maxPages || this.DEFAULT_MAX_PAGES;
    let pagesCrawled = 0;
    let totalCost = 0;
    const allLinks: string[] = [];
    let extractedData: any = null;

    try {
      this.log.debug(`Navegando a ${url}`);
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout,
      });
      pagesCrawled++;
      totalCost += this.COST_PER_PAGE;

      const captchaDetection = await captchaSolver.detect(page);
      if (captchaDetection.detected) {
        this.log.warn(`CAPTCHA detectado en ${url}`, {
          type: captchaDetection.type,
          confidence: captchaDetection.confidence,
        });
        const handleResult = await captchaSolver.handle(page, {
          strategy: 'evasion',
          notifyHuman: true,
        });
        if (handleResult.status === 'blocked') {
          throw new Error(`CAPTCHA bloqueo el acceso a ${url}`);
        }
        if (handleResult.status === 'manual-required') {
          this.emit('captcha-human-required', { url, detection: captchaDetection });
          throw new Error(`CAPTCHA requiere intervencion humana en ${url}`);
        }
        const recheck = await captchaSolver.detect(page);
        if (recheck.detected) {
          throw new Error(`CAPTCHA persistente en ${url}`);
        }
      }

      const html = await page.content();
      const $ = cheerio.load(html);

      switch (strategy.type) {
        case 'css':
          extractedData = this.extractWithCSS($, strategy);
          break;
        case 'xpath':
          extractedData = this.extractWithXPath(html, strategy);
          break;
        case 'auto':
          extractedData = this.extractAuto($, html, strategy);
          break;
        case 'llm':
          extractedData = await this.extractWithLLM($, strategy);
          break;
        default:
          extractedData = this.extractAuto($, html, strategy);
      }

      const links = this.extractLinks($, url);
      allLinks.push(...links);

      if (maxPages > 1) {
        const linksToFollow = links.slice(0, maxPages - 1);
        for (const link of linksToFollow) {
          try {
            this.log.debug(`Siguiendo link: ${link}`);
            await page.goto(link, {
              waitUntil: 'networkidle',
              timeout,
            });
            pagesCrawled++;
            totalCost += this.COST_PER_PAGE;
            const linkHtml = await page.content();
            const link$ = cheerio.load(linkHtml);
            const linkLinks = this.extractLinks(link$, link);
            allLinks.push(...linkLinks);
          } catch {
            this.log.warn(`Error crawling link: ${link}`);
          }
        }
      }

      return {
        url,
        data: extractedData,
        strategy: strategy.type,
        timestamp: Date.now(),
        pagesCrawled,
        linksFound: [...new Set(allLinks)],
        success: true,
        cost: totalCost,
      };
    } finally {
      await page.close();
    }
  }

  private extractWithCSS($: cheerio.CheerioAPI, strategy: CrawlStrategy): any {
    if (!strategy.selector) {
      return this.extractAuto($, $.html(), strategy);
    }
    const elements = $(strategy.selector);
    const results: any[] = [];
    elements.each((_, el) => {
      const $el = $(el);
      const elem = el as any;
      results.push({
        text: $el.text().trim(),
        html: $el.html(),
        attributes: elem.attribs || {},
      });
    });
    return {
      selector: strategy.selector,
      count: results.length,
      elements: results,
    };
  }

  private extractWithXPath(_html: string, strategy: CrawlStrategy): any {
    this.log.warn('XPath no soportado nativamente, usando CSS selector');
    return {
      strategy: 'xpath',
      note: 'Convertido a CSS selector',
      selector: strategy.selector,
    };
  }

  private extractAuto($: cheerio.CheerioAPI, _html: string, strategy: CrawlStrategy): ExtractedData {
    const extract = strategy.extract || {};
    const data: ExtractedData = {
      headings: [],
      paragraphs: [],
      links: [],
      images: [],
      tables: [],
      meta: {},
    };

    if (extract.title !== false) {
      data.title = $('title').text().trim() || $('h1').first().text().trim() || undefined;
    }

    if (extract.description !== false) {
      data.description = $('meta[name="description"]').attr('content')
        || $('meta[property="og:description"]').attr('content')
        || undefined;
    }

    $('meta').each((_, el) => {
      const name = $(el).attr('name') || $(el).attr('property');
      const content = $(el).attr('content');
      if (name && content) {
        data.meta[name] = content;
      }
    });

    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      data.headings.push({
        level: parseInt(el.tagName[1]),
        text: $(el).text().trim(),
      });
    });

    if (extract.text !== false) {
      $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 20) {
          data.paragraphs.push(text);
        }
      });
    }

    if (extract.links !== false) {
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          data.links.push({
            text: $(el).text().trim() || href,
            href,
          });
        }
      });
    }

    if (extract.images !== false) {
      $('img[src]').each((_, el) => {
        data.images.push({
          src: $(el).attr('src')!,
          alt: $(el).attr('alt') || '',
        });
      });
    }

    if (extract.tables !== false) {
      $('table').each((_, table) => {
        const $table = $(table);
        const headers: string[] = [];
        $table.find('th').each((_, th) => {
          headers.push($(th).text().trim());
        });
        const rows: string[][] = [];
        $table.find('tr').each((_, tr) => {
          const row: string[] = [];
          $(tr).find('td').each((_, td) => {
            row.push($(td).text().trim());
          });
          if (row.length > 0) {
            rows.push(row);
          }
        });
        if (headers.length > 0 || rows.length > 0) {
          data.tables.push({ headers, rows });
        }
      });
    }

    return data;
  }

  private async extractWithLLM($: cheerio.CheerioAPI, strategy: CrawlStrategy): Promise<any> {
    const textContent = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
    return {
      strategy: 'llm',
      prompt: strategy.prompt,
      textSample: textContent.slice(0, 500) + '...',
      fullTextLength: textContent.length,
      note: 'LLM extraction requiere integracion con LLMProvider para procesamiento completo',
    };
  }

  private extractLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const links: string[] = [];
    const base = new URL(baseUrl);
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      try {
        const url = new URL(href, baseUrl);
        if (url.hostname === base.hostname && !href.startsWith('#')) {
          links.push(url.href);
        }
      } catch {
        // URL invalida, ignorar
      }
    });
    return [...new Set(links)];
  }

  async batchCrawl(urls: string[], strategy: CrawlStrategy, budgetOwner?: string): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    for (const url of urls) {
      try {
        const result = await this.crawl(url, strategy, budgetOwner);
        results.push(result);
      } catch (err: any) {
        results.push({
          url,
          data: null,
          strategy: strategy.type,
          timestamp: Date.now(),
          pagesCrawled: 0,
          linksFound: [],
          success: false,
          error: err.message,
          cost: 0,
        });
      }
    }
    return results;
  }

  getSession(sessionId: string): CrawlSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): CrawlSession[] {
    return Array.from(this.sessions.values());
  }

  getStats(): {
    totalSessions: number;
    completed: number;
    failed: number;
    totalCost: number;
    totalPagesCrawled: number;
  } {
    const sessions = this.getAllSessions();
    return {
      totalSessions: sessions.length,
      completed: sessions.filter(s => s.status === 'completed').length,
      failed: sessions.filter(s => s.status === 'failed').length,
      totalCost: sessions.reduce((sum, s) => sum + s.totalCost, 0),
      totalPagesCrawled: sessions.reduce(
        (sum, s) => sum + s.results.reduce((ps, r) => ps + r.pagesCrawled, 0),
        0
      ),
    };
  }

  async destroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.context = null;
    this.active = false;
    this.sessions.clear();
    this.log.info('CrawlAgent destruido');
  }
}

export const crawlAgent = new CrawlAgent();
