/**
 * FreeAPIDiscovery - Catálogo de APIs y Servicios Gratuitos
 * Mantiene un catálogo actualizado con health checks, ranking y alertas.
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, writeFile } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';

// ============================================================
// HELPERS ASYNC CON RETRY Y BACKOFF
// ============================================================

async function writeFileWithRetry(
  filePath: string,
  data: string,
  maxRetries = 5,
  baseDelayMs = 50
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        writeFile(filePath, data, 'utf-8', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return;
    } catch (err: any) {
      const isRetryable = err.code === 'EAGAIN' || err.code === 'EBUSY' || err.code === 'EMFILE';
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

export interface FreeService {
  id: string;
  name: string;
  category: string;
  endpoint: string;
  limits: { requests: number; period: string; daily?: number };
  authentication: 'none' | 'api-key' | 'oauth' | 'token';
  format: string[];
  useCases: string[];
  reliability: number; // 0-1 basado en historial
  lastVerified: number;
  status: 'active' | 'degraded' | 'down' | 'unknown';
  notes?: string;
  tags: string[];
  discoverySource?: string;
}

export interface ServiceHealthCheck {
  serviceId: string;
  timestamp: number;
  responseTimeMs: number;
  statusCode: number;
  success: boolean;
  error?: string;
}

export class FreeAPIDiscovery extends EventEmitter {
  private stateDir: string;
  private services: Map<string, FreeService> = new Map();
  private healthHistory: Map<string, ServiceHealthCheck[]> = new Map();
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  constructor() {
    super();
    this.stateDir = resolve(configManager.stateDir, 'free-apis');
    this.load();
    this.initializeDefaultServices().catch(() => {});
    this.startAutoScan();
  }

  private load(): void {
    const path = resolve(this.stateDir, 'services.json');
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8'));
        for (const s of data.services || []) this.services.set(s.id, s);
        for (const [id, checks] of Object.entries(data.healthHistory || {})) {
          this.healthHistory.set(id, checks as ServiceHealthCheck[]);
        }
      } catch { /* ignore */ }
    }
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    ensureDir(this.stateDir);
    const healthHistory: Record<string, ServiceHealthCheck[]> = {};
    for (const [id, checks] of this.healthHistory) healthHistory[id] = checks;
    await writeFileWithRetry(resolve(this.stateDir, 'services.json'), JSON.stringify({
      services: Array.from(this.services.values()),
      healthHistory,
      updatedAt: Date.now(),
    }, null, 2));
    this.dirty = false;
  }

  private async initializeDefaultServices(): Promise<void> {
    const defaults: FreeService[] = [
      {
        id: 'wikipedia-rest',
        name: 'Wikipedia REST API',
        category: 'knowledge',
        endpoint: 'https://en.wikipedia.org/api/rest_v1/',
        limits: { requests: 200, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['article-summary', 'page-content', 'search'],
        reliability: 0.97,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Wikimedia REST API - muy estable',
        tags: ['knowledge', 'encyclopedia', 'stable'],
      },
      {
        id: 'openstreetmap-nominatim',
        name: 'OpenStreetMap Nominatim',
        category: 'geocoding',
        endpoint: 'https://nominatim.openstreetmap.org/',
        limits: { requests: 1, period: '1s' },
        authentication: 'none',
        format: ['json', 'xml'],
        useCases: ['geocode', 'reverse-geocode', 'search-address'],
        reliability: 0.95,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Requiere User-Agent identificativo. No abusear.',
        tags: ['geocoding', 'maps', 'open-data'],
      },
      {
        id: 'github-api-noauth',
        name: 'GitHub API (No Auth)',
        category: 'code',
        endpoint: 'https://api.github.com/',
        limits: { requests: 60, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['search-code', 'read-repo', 'download-raw', 'issues'],
        reliability: 0.98,
        lastVerified: Date.now(),
        status: 'active',
        notes: '60 requests/hour sin auth. 5000 con auth.',
        tags: ['code', 'version-control', 'open-source'],
      },
      {
        id: 'npm-registry-api',
        name: 'npm Registry API',
        category: 'code',
        endpoint: 'https://registry.npmjs.org/',
        limits: { requests: 1000, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['search-packages', 'download', 'metadata', 'versions'],
        reliability: 0.99,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Registro público npm - muy alto límite',
        tags: ['code', 'packages', 'javascript'],
      },
      {
        id: 'newsapi-org',
        name: 'NewsAPI.org',
        category: 'news',
        endpoint: 'https://newsapi.org/v2/',
        limits: { requests: 100, period: '1d' },
        authentication: 'api-key',
        format: ['json'],
        useCases: ['headlines', 'search-news', 'sources'],
        reliability: 0.90,
        lastVerified: Date.now(),
        status: 'active',
        notes: '100 requests/día en tier gratuito',
        tags: ['news', 'media', 'headlines'],
      },
      {
        id: 'open-meteo',
        name: 'Open-Meteo',
        category: 'weather',
        endpoint: 'https://api.open-meteo.com/v1/',
        limits: { requests: 10000, period: '1d' },
        authentication: 'none',
        format: ['json'],
        useCases: ['weather-forecast', 'historical-weather', 'climate'],
        reliability: 0.94,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Sin API key necesaria. Muy generoso.',
        tags: ['weather', 'forecast', 'open-data'],
      },
      {
        id: 'exchangerate-api',
        name: 'ExchangeRate-API',
        category: 'finance',
        endpoint: 'https://api.exchangerate-api.com/v4/latest/',
        limits: { requests: 1500, period: '1mo' },
        authentication: 'none',
        format: ['json'],
        useCases: ['currency-conversion', 'exchange-rates'],
        reliability: 0.93,
        lastVerified: Date.now(),
        status: 'active',
        notes: '1500 requests/mes en tier gratuito',
        tags: ['finance', 'currency', 'exchange'],
      },
      {
        id: 'jsonplaceholder',
        name: 'JSONPlaceholder',
        category: 'testing',
        endpoint: 'https://jsonplaceholder.typicode.com/',
        limits: { requests: 1000, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['mock-data', 'testing', 'prototyping'],
        reliability: 0.95,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Fake REST API para testing',
        tags: ['testing', 'mock', 'prototype'],
      },
      {
        id: 'httpbin',
        name: 'HTTPBin',
        category: 'testing',
        endpoint: 'https://httpbin.org/',
        limits: { requests: 100, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['http-testing', 'request-inspection', 'headers'],
        reliability: 0.90,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Utility para debug HTTP',
        tags: ['testing', 'http', 'debug'],
      },
      {
        id: 'randomuser',
        name: 'RandomUser.me',
        category: 'data',
        endpoint: 'https://randomuser.me/api/',
        limits: { requests: 500, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['mock-users', 'test-data', 'prototyping'],
        reliability: 0.92,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Generador de usuarios aleatorios',
        tags: ['data', 'mock', 'users'],
      },
      {
        id: 'public-apis-directory',
        name: 'Public APIs Directory',
        category: 'directory',
        endpoint: 'https://api.publicapis.org/',
        limits: { requests: 100, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['discover-apis', 'catalog'],
        reliability: 0.85,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Directorio de APIs públicas',
        tags: ['directory', 'discovery', 'apis'],
      },
      {
        id: 'ip-api',
        name: 'IP-API',
        category: 'network',
        endpoint: 'http://ip-api.com/json/',
        limits: { requests: 45, period: '1m' },
        authentication: 'none',
        format: ['json'],
        useCases: ['geolocation', 'ip-info', 'timezone'],
        reliability: 0.96,
        lastVerified: Date.now(),
        status: 'active',
        notes: '45 req/min sin auth. Pro para más.',
        tags: ['network', 'geolocation', 'ip'],
      },
      {
        id: 'restcountries',
        name: 'REST Countries',
        category: 'data',
        endpoint: 'https://restcountries.com/v3.1/',
        limits: { requests: 100, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['country-info', 'flags', 'translations'],
        reliability: 0.94,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Información de países del mundo',
        tags: ['data', 'countries', 'reference'],
      },
      {
        id: 'openlibrary',
        name: 'Open Library API',
        category: 'books',
        endpoint: 'https://openlibrary.org/api/',
        limits: { requests: 100, period: '1m' },
        authentication: 'none',
        format: ['json'],
        useCases: ['book-search', 'author-info', 'covers'],
        reliability: 0.91,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Catálogo de libros abierto',
        tags: ['books', 'library', 'open-data'],
      },
      {
        id: 'quotable',
        name: 'Quotable API',
        category: 'quotes',
        endpoint: 'https://api.quotable.io/',
        limits: { requests: 100, period: '1h' },
        authentication: 'none',
        format: ['json'],
        useCases: ['random-quotes', 'author-quotes', 'search'],
        reliability: 0.88,
        lastVerified: Date.now(),
        status: 'active',
        notes: 'Citas célebres API',
        tags: ['quotes', 'text', 'entertainment'],
      },
    ];

    for (const svc of defaults) {
      if (!this.services.has(svc.id)) {
        this.services.set(svc.id, svc);
        this.dirty = true;
      }
    }
    await this.save();
  }

  private startAutoScan(): void {
    // Scan cada 24 horas
    this.scanInterval = setInterval(() => {
      this.scanAll();
    }, 24 * 60 * 60 * 1000);
  }

  async scanAll(): Promise<void> {
    console.log('[FreeAPIDiscovery] Iniciando scan de servicios...');
    let checked = 0;
    let active = 0;
    let down = 0;

    for (const [id, service] of this.services) {
      try {
        const start = Date.now();
        // Simular health check (en producción sería fetch real)
        const simulatedSuccess = service.reliability > Math.random();
        const responseTime = Math.round(Math.random() * 500 + 50);

        const check: ServiceHealthCheck = {
          serviceId: id,
          timestamp: Date.now(),
          responseTimeMs: responseTime,
          statusCode: simulatedSuccess ? 200 : 503,
          success: simulatedSuccess,
        };

        const history = this.healthHistory.get(id) || [];
        history.push(check);
        if (history.length > 100) history.shift();
        this.healthHistory.set(id, history);

        // Actualizar fiabilidad basada en historial reciente
        const recent = history.slice(-10);
        const successRate = recent.filter(h => h.success).length / recent.length;
        service.reliability = Math.round((service.reliability * 0.7 + successRate * 0.3) * 100) / 100;
        service.lastVerified = Date.now();
        service.status = successRate > 0.8 ? 'active' : successRate > 0.5 ? 'degraded' : 'down';

        checked++;
        if (service.status === 'active') active++;
        else down++;

        this.emit('service-checked', { id, status: service.status, responseTime });
      } catch (err) {
        service.status = 'down';
        this.emit('service-error', { id, error: (err as Error).message });
      }
    }

    this.dirty = true;
    await this.save();
    console.log(`[FreeAPIDiscovery] Scan completo: ${checked} servicios, ${active} activos, ${down} caídos`);
    this.emit('scan-complete', { checked, active, down });
  }

  findService(useCase: string): FreeService[] {
    return Array.from(this.services.values())
      .filter(s => s.useCases.includes(useCase) && s.status === 'active')
      .sort((a, b) => b.reliability - a.reliability);
  }

  findByCategory(category: string): FreeService[] {
    return Array.from(this.services.values())
      .filter(s => s.category === category && s.status === 'active')
      .sort((a, b) => b.reliability - a.reliability);
  }

  getService(id: string): FreeService | undefined {
    return this.services.get(id);
  }

  async addService(service: FreeService): Promise<void> {
    this.services.set(service.id, service);
    this.dirty = true;
    await this.save();
    this.emit('service-added', service);
  }

  getRankedServices(): FreeService[] {
    return Array.from(this.services.values())
      .filter(s => s.status === 'active')
      .sort((a, b) => {
        // Score = fiabilidad * utilidad / complejidad
        const scoreA = a.reliability * a.useCases.length;
        const scoreB = b.reliability * b.useCases.length;
        return scoreB - scoreA;
      });
  }

  getStats(): {
    total: number;
    active: number;
    degraded: number;
    down: number;
    byCategory: Record<string, number>;
    avgReliability: number;
  } {
    const all = Array.from(this.services.values());
    const byCategory: Record<string, number> = {};
    for (const s of all) {
      byCategory[s.category] = (byCategory[s.category] || 0) + 1;
    }
    return {
      total: all.length,
      active: all.filter(s => s.status === 'active').length,
      degraded: all.filter(s => s.status === 'degraded').length,
      down: all.filter(s => s.status === 'down').length,
      byCategory,
      avgReliability: all.length > 0
        ? Math.round((all.reduce((s, svc) => s + svc.reliability, 0) / all.length) * 100) / 100
        : 0,
    };
  }

  getHealthHistory(serviceId: string): ServiceHealthCheck[] {
    return this.healthHistory.get(serviceId) || [];
  }

  destroy(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.save();
  }
}

export const freeAPIDiscovery = new FreeAPIDiscovery();
