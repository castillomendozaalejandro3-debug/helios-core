import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';

// ============================================================
// CAPTCHA SOLVER v2.2 - RESOLUCION REAL
// Soporta: evasion, 2captcha API, notificacion humana
// ============================================================

interface CAPTCHAConfig {
  apiKey?: string;
  service?: '2captcha' | 'anti-captcha' | 'manual';
  timeout?: number;
}

interface CAPTCHADetection {
  detected: boolean;
  type: string;
  confidence: number;
  selectors: string[];
}

interface CAPTCHAHandleResult {
  status: 'solved' | 'blocked' | 'evaded' | 'manual-required' | 'error';
  solution?: string;
  cost?: number;
  error?: string;
}

export class CAPTCHASolver extends EventEmitter {
  private config: CAPTCHAConfig;
  private readonly log = logger.child('captcha-solver');
  private stats = { detected: 0, solved: 0, evaded: 0, blocked: 0, manual: 0, cost: 0 };

  // Selectores de deteccion para diferentes tipos de CAPTCHA
  private readonly CAPTCHA_SELECTORS: Record<string, string[]> = {
    recaptcha: ['.g-recaptcha', 'iframe[src*="recaptcha"]', '#recaptcha'],
    hcaptcha: ['.h-captcha', 'iframe[src*="hcaptcha"]', '[data-hcaptcha-sitekey]'],
    image: ['img[src*="captcha"]', '.captcha-image', '#captcha-img'],
    text: ['input[name*="captcha"]', '.captcha-input', '#captcha-input'],
    cloudflare: ['.cf-turnstile', '[data-turnstile-sitekey]', '#turnstile'],
    datadome: ['.datadome-captcha', '#datadome'],
    generic: ['.captcha', '#captcha', '[class*="captcha"]', '[id*="captcha"]'],
  };

  constructor(config: CAPTCHAConfig = {}) {
    super();
    this.config = {
      service: config.service || 'manual',
      apiKey: config.apiKey || process.env.HELIOS_CAPTCHA_API_KEY,
      timeout: config.timeout || 120000,
    };
  }

  // ----------------------------------------------------------
  // DETECCION
  // ----------------------------------------------------------

  async detect(page: any): Promise<CAPTCHADetection> {
    const detections: CAPTCHADetection[] = [];

    for (const [type, selectors] of Object.entries(this.CAPTCHA_SELECTORS)) {
      for (const selector of selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const isVisible = await element.isVisible().catch(() => false);
            if (isVisible) {
              detections.push({
                detected: true,
                type,
                confidence: type === 'recaptcha' || type === 'hcaptcha' ? 0.95 : 0.7,
                selectors: [selector],
              });
            }
            await element.dispose();
          }
        } catch {
          // Selector no encontrado, continuar
        }
      }
    }

    // Deteccion por URL (Cloudflare challenge)
    try {
      const url = page.url();
      if (url.includes('cloudflare') || url.includes('challenges')) {
        detections.push({
          detected: true,
          type: 'cloudflare-challenge',
          confidence: 0.9,
          selectors: [],
        });
      }
    } catch {
      // Ignorar
    }

    if (detections.length > 0) {
      const best = detections.sort((a, b) => b.confidence - a.confidence)[0];
      this.stats.detected++;
      this.emit('captcha-detected', best);
      this.log.warn(`CAPTCHA detectado: ${best.type} (${(best.confidence * 100).toFixed(0)}%)`);
      return best;
    }

    return { detected: false, type: 'none', confidence: 0, selectors: [] };
  }

  // ----------------------------------------------------------
  // MANEJO
  // ----------------------------------------------------------

  async handle(page: any, options: { strategy?: 'evasion' | 'api' | 'manual'; notifyHuman?: boolean } = {}): Promise<CAPTCHAHandleResult> {
    const strategy = options.strategy || 'evasion';

    switch (strategy) {
      case 'evasion':
        return this.evasionStrategy(page);
      case 'api':
        if (!this.config.apiKey) {
          this.log.warn('API key no configurada, fallback a manual');
          return this.manualStrategy(page, options.notifyHuman);
        }
        return this.apiStrategy(page);
      case 'manual':
        return this.manualStrategy(page, options.notifyHuman);
      default:
        return { status: 'error', error: 'Estrategia desconocida' };
    }
  }

  // ----------------------------------------------------------
  // EVASION
  // ----------------------------------------------------------

  private async evasionStrategy(page: any): Promise<CAPTCHAHandleResult> {
    this.log.info('Intentando evasion de CAPTCHA');
    try {
      // Scroll aleatorio
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 500);
      });
      await page.waitForTimeout(500 + Math.random() * 1000);

      // Mover mouse aleatoriamente
      const viewport = page.viewportSize();
      if (viewport) {
        await page.mouse.move(
          Math.random() * viewport.width,
          Math.random() * viewport.height
        );
        await page.waitForTimeout(200 + Math.random() * 500);
      }

      // Reintentar navegacion con espera
      await page.waitForTimeout(2000 + Math.random() * 3000);

      // Verificar si CAPTCHA persiste
      const recheck = await this.detect(page);
      if (!recheck.detected) {
        this.stats.evaded++;
        this.emit('captcha-evaded');
        this.log.info('CAPTCHA evadido exitosamente');
        return { status: 'evaded' };
      }

      this.log.warn('Evasion fallida, CAPTCHA persiste');
      return { status: 'blocked', error: 'Evasion fallida, CAPTCHA persiste' };
    } catch (err: any) {
      this.log.error('Error en evasion', { error: err.message });
      return { status: 'error', error: err.message };
    }
  }

  // ----------------------------------------------------------
  // API (2captcha / anti-captcha)
  // ----------------------------------------------------------

  private async apiStrategy(page: any): Promise<CAPTCHAHandleResult> {
    if (!this.config.apiKey) {
      return { status: 'error', error: 'API key no configurada' };
    }

    this.log.info(`Resolviendo CAPTCHA via ${this.config.service}`);

    try {
      // Detectar tipo de CAPTCHA
      const detection = await this.detect(page);
      if (!detection.detected) {
        return { status: 'solved', solution: 'no-captcha' };
      }

      // Para reCAPTCHA/hCaptcha, extraer sitekey
      let sitekey: string | null = null;
      if (detection.type === 'recaptcha') {
        sitekey = await page.evaluate(() => {
          const el = document.querySelector('.g-recaptcha');
          return el?.getAttribute('data-sitekey') || null;
        });
      } else if (detection.type === 'hcaptcha') {
        sitekey = await page.evaluate(() => {
          const el = document.querySelector('.h-captcha');
          return el?.getAttribute('data-sitekey') || null;
        });
      }

      if (!sitekey) {
        this.log.warn('Sitekey no encontrado, fallback a manual');
        return this.manualStrategy(page, true);
      }

      // Enviar a servicio de resolucion
      const url = page.url();
      const taskId = await this.submitToService(detection.type, sitekey, url);

      if (!taskId) {
        return { status: 'error', error: 'No se pudo enviar tarea al servicio' };
      }

      // Esperar solucion
      const solution = await this.pollSolution(taskId);

      if (solution) {
        // Aplicar solucion en la pagina
        await page.evaluate((token: string) => {
          const textarea = document.querySelector('textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement;
          if (textarea) textarea.value = token;
        }, solution);

        this.stats.solved++;
        this.stats.cost += 0.003; // ~$0.003 por reCAPTCHA
        this.emit('captcha-solved', { type: detection.type, cost: 0.003 });
        this.log.info(`CAPTCHA resuelto via API: ${detection.type}`);
        return { status: 'solved', solution, cost: 0.003 };
      }

      return { status: 'error', error: 'Timeout esperando solucion' };
    } catch (err: any) {
      this.log.error('Error en API strategy', { error: err.message });
      return { status: 'error', error: err.message };
    }
  }

  private async submitToService(type: string, sitekey: string, url: string): Promise<string | null> {
    // Implementacion real para 2captcha
    if (this.config.service === '2captcha') {
      try {
        const response = await fetch('http://2captcha.com/in.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            key: this.config.apiKey!,
            method: 'userrecaptcha',
            googlekey: sitekey,
            pageurl: url,
            json: '1',
          }),
        });
        const data = await response.json();
        if (data.status === 1) {
          return data.request;
        }
      } catch (err) {
        this.log.error('Error enviando a 2captcha', { error: String(err) });
      }
    }
    return null;
  }

  private async pollSolution(taskId: string): Promise<string | null> {
    const startTime = Date.now();
    const timeout = this.config.timeout || 120000;

    while (Date.now() - startTime < timeout) {
      try {
        await new Promise(r => setTimeout(r, 5000));
        const response = await fetch(`http://2captcha.com/res.php?key=${this.config.apiKey}&action=get&id=${taskId}&json=1`);
        const data = await response.json();
        if (data.status === 1) {
          return data.request;
        }
        if (data.request === 'CAPCHA_NOT_READY') {
          continue;
        }
        this.log.warn(`2captcha error: ${data.request}`);
        return null;
      } catch {
        // Reintentar
      }
    }
    return null;
  }

  // ----------------------------------------------------------
  // MANUAL
  // ----------------------------------------------------------

  private async manualStrategy(page: any, notifyHuman?: boolean): Promise<CAPTCHAHandleResult> {
    this.stats.manual++;
    this.emit('human-intervention-required', {
      url: page.url(),
      screenshot: 'screenshot-not-implemented',
    });
    this.log.error('Intervencion humana requerida para CAPTCHA');

    if (notifyHuman) {
      // Notificar via evento (el sistema puede escuchar y enviar a telefono)
      this.emit('notification', {
        type: 'captcha-human-required',
        message: `CAPTCHA detectado en ${page.url()}. Requiere resolucion manual.`,
        urgency: 'high',
      });
    }

    return { status: 'manual-required' };
  }

  // ----------------------------------------------------------
  // ESTADISTICAS
  // ----------------------------------------------------------

  getStats() {
    return { ...this.stats };
  }

  updateConfig(config: Partial<CAPTCHAConfig>): void {
    this.config = { ...this.config, ...config };
    this.log.info('Configuracion actualizada', { service: this.config.service });
  }
}

export const captchaSolver = new CAPTCHASolver();
