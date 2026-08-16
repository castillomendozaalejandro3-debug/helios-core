/**
 * ResourceOptimizer - Capa 2: Auto-Arquitectura
 * Optimiza uso de memoria, caches, seleccion de modelos, y compresion.
 */

import { EventEmitter } from 'events';
import { configManager } from '../config/ConfigManager.js';

interface CacheEntry {
  key: string;
  value: any;
  size: number;
  hits: number;
  createdAt: number;
  lastAccessed: number;
  ttl: number;
}

interface ResourceStats {
  memoryUsedMB: number;
  cacheHitRate: number;
  cacheSize: number;
  apiCallsLastHour: number;
  estimatedCostLastHour: number;
  optimizationsApplied: number;
}

export class ResourceOptimizer extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map();
  private maxCacheSizeMB: number;
  private apiCallLog: Array<{ timestamp: number; endpoint: string; cost: number }> = [];
  private optimizationCount = 0;
  private memorySnapshots: number[] = [];

  constructor() {
    super();
    this.maxCacheSizeMB = configManager.config.HELIOS_AGENT_MEMORY_LIMIT_MB;
    this.startCleanupInterval();
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
      this.pruneOldApiCalls();
      this.detectMemoryLeak();
    }, 300000); // Cada 5 minutos
  }

  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hits++;
    entry.lastAccessed = now;
    return entry.value;
  }

  set(key: string, value: any, ttlMs: number = 300000): void {
    const size = this.estimateSize(value);
    const currentCacheSize = this.getCurrentCacheSizeMB();

    // Eviction si estamos cerca del limite
    if (currentCacheSize + size / 1024 / 1024 > this.maxCacheSizeMB * 0.9) {
      this.evictLRU();
    }

    this.cache.set(key, {
      key,
      value,
      size,
      hits: 0,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      ttl: ttlMs,
    });
  }

  logApiCall(endpoint: string, cost: number = 0): void {
    this.apiCallLog.push({
      timestamp: Date.now(),
      endpoint,
      cost,
    });
  }

  selectModelForTask(task: string, complexity: 'low' | 'medium' | 'high'): { model: string; estimatedCost: number; latency: string } {
    switch (complexity) {
      case 'low':
        return { model: 'local-llm', estimatedCost: 0, latency: 'rapida' };
      case 'medium':
        return { model: 'openrouter-mixtral', estimatedCost: 0.002, latency: 'media' };
      case 'high':
        return { model: 'openrouter-claude', estimatedCost: 0.02, latency: 'lenta' };
      default:
        return { model: 'local-llm', estimatedCost: 0, latency: 'rapida' };
    }
  }

  detectMemoryLeak(): boolean {
    const currentHeap = process.memoryUsage().heapUsed / 1024 / 1024;
    this.memorySnapshots.push(currentHeap);
    if (this.memorySnapshots.length > 50) this.memorySnapshots.shift();

    if (this.memorySnapshots.length < 10) return false;

    // Regresion lineal simple
    const n = this.memorySnapshots.length;
    const sumX = this.memorySnapshots.reduce((a, b, i) => a + i, 0);
    const sumY = this.memorySnapshots.reduce((a, b) => a + b, 0);
    const sumXY = this.memorySnapshots.reduce((a, b, i) => a + i * b, 0);
    const sumX2 = this.memorySnapshots.reduce((a, b, i) => a + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    if (slope > 5) { // Mas de 5MB por snapshot
      this.emit('memory-leak-detected', { slope, currentHeap, snapshots: this.memorySnapshots });
      this.optimizationCount++;
      return true;
    }
    return false;
  }

  compressData(data: string): { compressed: string; ratio: number } {
    // Compresion simple RLE para demostracion
    let compressed = '';
    let count = 1;
    for (let i = 1; i <= data.length; i++) {
      if (data[i] === data[i - 1] && count < 255) {
        count++;
      } else {
        compressed += count > 3 ? `${data[i - 1]}${count}` : data[i - 1].repeat(count);
        count = 1;
      }
    }
    const ratio = data.length > 0 ? Math.round((1 - compressed.length / data.length) * 100) : 0;
    return { compressed, ratio };
  }

  getStats(): ResourceStats {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const recentCalls = this.apiCallLog.filter(c => now - c.timestamp < oneHour);
    const totalHits = Array.from(this.cache.values()).reduce((s, e) => s + e.hits, 0);
    const totalAccesses = totalHits + this.cache.size;

    return {
      memoryUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      cacheHitRate: totalAccesses > 0 ? Math.round((totalHits / totalAccesses) * 100) : 0,
      cacheSize: this.cache.size,
      apiCallsLastHour: recentCalls.length,
      estimatedCostLastHour: Math.round(recentCalls.reduce((s, c) => s + c.cost, 0) * 1000) / 1000,
      optimizationsApplied: this.optimizationCount,
    };
  }

  private estimateSize(value: any): number {
    return JSON.stringify(value).length * 2; // Aproximacion en bytes
  }

  private getCurrentCacheSizeMB(): number {
    return Array.from(this.cache.values()).reduce((s, e) => s + e.size, 0) / 1024 / 1024;
  }

  private evictLRU(): void {
    let oldest: CacheEntry | undefined;
    let oldestTime = Infinity;
    for (const entry of this.cache.values()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldest = entry;
      }
    }
    if (oldest) {
      this.cache.delete(oldest.key);
      this.emit('cache-evicted', { key: oldest.key, reason: 'LRU' });
    }
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.emit('cache-cleaned', { count: cleaned });
    }
  }

  private pruneOldApiCalls(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.apiCallLog = this.apiCallLog.filter(c => c.timestamp > cutoff);
  }
}

export const resourceOptimizer = new ResourceOptimizer();
