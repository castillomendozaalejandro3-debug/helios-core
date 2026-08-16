import { existsSync, mkdirSync, readFileSync, writeFile } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';
import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';

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

export enum MemoryType {
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
  EMOTIONAL = 'emotional',
  META = 'meta',
}

interface MemoryEntry {
  id: string;
  type: MemoryType;
  content: string;
  metadata: {
    createdAt: string;
    importance: number;
    accessCount: number;
    lastAccessed?: string;
    tags: string[];
    emotionalValence?: number;
    context?: string;
  };
}

interface EpisodicMemory extends MemoryEntry {
  metadata: MemoryEntry['metadata'] & {
    participants: string[];
    location?: string;
    outcome: string;
  };
}

// ============================================================
// LRU CACHE NODE PARA EVICCION EFICIENTE
// ============================================================

interface LRUNode {
  id: string;
  type: MemoryType;
  prev: LRUNode | null;
  next: LRUNode | null;
}

class LRUCache {
  private head: LRUNode | null = null;
  private tail: LRUNode | null = null;
  private map = new Map<string, LRUNode>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  touch(id: string, type: MemoryType): void {
    const existing = this.map.get(id);
    if (existing) {
      this.removeNode(existing);
    }
    const node: LRUNode = { id, type, prev: null, next: null };
    this.addToFront(node);
    this.map.set(id, node);

    if (this.map.size > this.maxSize) {
      this.evictLRU();
    }
  }

  remove(id: string): void {
    const node = this.map.get(id);
    if (node) {
      this.removeNode(node);
      this.map.delete(id);
    }
  }

  getEvictionCandidate(): { id: string; type: MemoryType } | null {
    return this.tail ? { id: this.tail.id, type: this.tail.type } : null;
  }

  private addToFront(node: LRUNode): void {
    node.next = this.head;
    node.prev = null;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private removeNode(node: LRUNode): void {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (this.head === node) this.head = node.next;
    if (this.tail === node) this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private evictLRU(): void {
    if (this.tail) {
      this.removeNode(this.tail);
      this.map.delete(this.tail.id);
    }
  }

  get size(): number {
    return this.map.size;
  }

  clear(): void {
    this.head = null;
    this.tail = null;
    this.map.clear();
  }
}

// ============================================================
// BATCH WRITE DEBOUNCE
// ============================================================

class BatchWriter {
  private pending = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private readonly maxPendingOps: number;
  private pendingOps = 0;

  constructor(debounceMs = 5000, maxPendingOps = 50) {
    this.debounceMs = debounceMs;
    this.maxPendingOps = maxPendingOps;
  }

  schedule(writeFn: () => Promise<void>): void {
    this.pendingOps++;

    if (this.pendingOps >= this.maxPendingOps) {
      this.flush(writeFn);
      return;
    }

    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.flush(writeFn), this.debounceMs);
  }

  private async flush(writeFn: () => Promise<void>): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    this.pendingOps = 0;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    try {
      await writeFn();
    } catch (err) {
      logger.error('[MemoryEngine] Batch write failed', { error: String(err) });
    } finally {
      this.pending = false;
    }
  }

  async forceFlush(writeFn: () => Promise<void>): Promise<void> {
    await this.flush(writeFn);
  }

  destroy(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

// ============================================================
// MEMORY ENGINE
// ============================================================

export class MemoryEngine extends EventEmitter {
  private dbPath: string;
  private entries: Map<string, MemoryEntry[]> = new Map();
  private initialized = false;
  private consolidationInterval: ReturnType<typeof setInterval> | null = null;

  // --- LIMITES Y LRU ---
  private readonly MAX_ENTRIES_PER_TYPE = 10000;
  private readonly MAX_TOTAL_ENTRIES = 50000;
  private readonly lru: LRUCache;
  private totalCount = 0;

  // --- BATCH WRITES ---
  private readonly batchWriter: BatchWriter;
  private dirty = false;

  // --- METRICS ---
  private evictedCount = 0;
  private batchSaves = 0;
  private immediateSaves = 0;

  constructor() {
    super();
    this.dbPath = resolve(configManager.stateDir, 'memory.json');
    this.lru = new LRUCache(this.MAX_TOTAL_ENTRIES);
    this.batchWriter = new BatchWriter(5000, 50);
    this.load();
  }

  private load(): void {
    if (existsSync(this.dbPath)) {
      try {
        const data = JSON.parse(readFileSync(this.dbPath, 'utf-8'));
        for (const [key, val] of Object.entries(data)) {
          const list = val as MemoryEntry[];
          this.entries.set(key, list);
          for (const entry of list) {
            this.lru.touch(entry.id, entry.type);
            this.totalCount++;
          }
        }
      } catch {
        /* ignorar */
      }
    }
    for (const type of Object.values(MemoryType)) {
      if (!this.entries.has(type)) this.entries.set(type, []);
    }
  }

  async save(force = false): Promise<void> {
    if (!force && !this.dirty) return;

    const data: Record<string, MemoryEntry[]> = {};
    for (const [key, val] of this.entries) data[key] = val;
    ensureDir(dirname(this.dbPath));
    await writeFileWithRetry(this.dbPath, JSON.stringify(data, null, 2));
    this.dirty = false;
    this.batchSaves++;
  }

  private scheduleSave(): void {
    this.dirty = true;
    this.batchWriter.schedule(() => this.save());
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.initialized = true;
    this.consolidationInterval = setInterval(() => this.consolidate(), 3600000);
    logger.info('MemoryEngine inicializado', {
      types: Object.values(MemoryType).length,
      totalEntries: this.totalCount,
      maxPerType: this.MAX_ENTRIES_PER_TYPE,
      maxTotal: this.MAX_TOTAL_ENTRIES,
    });
  }

  // --- EVICCION LRU ---

  private evictIfNeeded(type: MemoryType): void {
    const list = this.entries.get(type) || [];

    // Evict por tipo
    if (list.length > this.MAX_ENTRIES_PER_TYPE) {
      const toRemove = list.length - this.MAX_ENTRIES_PER_TYPE;
      const sorted = [...list].sort((a, b) => {
        const scoreA = this.computeEvictionScore(a);
        const scoreB = this.computeEvictionScore(b);
        return scoreA - scoreB;
      });
      const evictedIds = new Set(sorted.slice(0, toRemove).map(e => e.id));
      const filtered = list.filter(e => !evictedIds.has(e.id));
      this.entries.set(type, filtered);
      for (const id of evictedIds) {
        this.lru.remove(id);
        this.totalCount--;
      }
      this.evictedCount += toRemove;
      this.emit('memory-evicted', { type, count: toRemove, reason: 'per-type-limit' });
    }

    // Evict global si excede total
    while (this.totalCount > this.MAX_TOTAL_ENTRIES) {
      const candidate = this.lru.getEvictionCandidate();
      if (!candidate) break;
      const globalList = this.entries.get(candidate.type) || [];
      const filtered = globalList.filter(e => e.id !== candidate.id);
      if (filtered.length < globalList.length) {
        this.entries.set(candidate.type, filtered);
        this.lru.remove(candidate.id);
        this.totalCount--;
        this.evictedCount++;
        this.emit('memory-evicted', { type: candidate.type, count: 1, reason: 'global-limit' });
      } else {
        this.lru.remove(candidate.id);
      }
    }
  }

  private computeEvictionScore(entry: MemoryEntry): number {
    const ageMs = Date.now() - new Date(entry.metadata.createdAt).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const accessScore = entry.metadata.accessCount * 0.1;
    const importanceScore = entry.metadata.importance * 10;
    return ageDays - accessScore - importanceScore;
  }

  async store(type: MemoryType, content: string, options: {
    importance?: number;
    tags?: string[];
    emotionalValence?: number;
    context?: string;
  } = {}): Promise<string> {
    const id = crypto.randomUUID();
    const entry: MemoryEntry = {
      id,
      type,
      content,
      metadata: {
        createdAt: new Date().toISOString(),
        importance: options.importance ?? 0.5,
        accessCount: 0,
        tags: options.tags ?? [],
        emotionalValence: options.emotionalValence,
        context: options.context,
      },
    };

    const list = this.entries.get(type) || [];
    list.push(entry);
    this.entries.set(type, list);
    this.totalCount++;
    this.lru.touch(id, type);

    this.evictIfNeeded(type);
    this.scheduleSave();

    this.emit('memory-stored', { id, type, content: content.substring(0, 100) });
    return id;
  }

  async retrieve(type: MemoryType, query?: string, limit: number = 10): Promise<MemoryEntry[]> {
    const list = this.entries.get(type) || [];
    let results = [...list];

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(e =>
        e.content.toLowerCase().includes(q) ||
        e.metadata.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    results.sort((a, b) => {
      const scoreA = a.metadata.importance * 0.6 + (a.metadata.accessCount * 0.01);
      const scoreB = b.metadata.importance * 0.6 + (b.metadata.accessCount * 0.01);
      return scoreB - scoreA;
    });

    for (const r of results.slice(0, limit)) {
      r.metadata.accessCount++;
      r.metadata.lastAccessed = new Date().toISOString();
      this.lru.touch(r.id, r.type);
    }
    this.scheduleSave();

    return results.slice(0, limit);
  }

  async searchSemantic(query: string, limit: number = 5): Promise<Array<{ entry: MemoryEntry; score: number }>> {
    const allEntries: MemoryEntry[] = [];
    for (const list of this.entries.values()) {
      allEntries.push(...list);
    }

    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = allEntries.map(entry => {
      const contentWords = entry.content.toLowerCase().split(/\s+/);
      const tagMatches = entry.metadata.tags.filter(t =>
        queryWords.some(q => t.toLowerCase().includes(q))
      ).length;
      const contentMatches = contentWords.filter(w =>
        queryWords.some(q => w.includes(q))
      ).length;
      const score = (contentMatches / Math.max(contentWords.length, 1)) * 0.7 + (tagMatches * 0.3);
      return { entry, score };
    });

    const top = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    for (const { entry } of top) {
      this.lru.touch(entry.id, entry.type);
    }
    return top;
  }

  async consolidate(): Promise<void> {
    logger.info('MemoryEngine: Consolidando memoria...');
    let removed = 0;

    for (const [type, list] of this.entries) {
      const now = Date.now();
      const filtered = list.filter(entry => {
        const age = now - new Date(entry.metadata.createdAt).getTime();
        const maxAge = 30 * 24 * 60 * 60 * 1000;
        const isObsolete = age > maxAge && entry.metadata.accessCount < 2 && entry.metadata.importance < 0.3;
        if (isObsolete) {
          removed++;
          this.lru.remove(entry.id);
          this.totalCount--;
        }
        return !isObsolete;
      });
      this.entries.set(type, filtered);
    }

    if (removed > 0) {
      logger.info(`MemoryEngine: ${removed} entradas obsoletas eliminadas`);
      await this.save(true);
      this.emit('memory-consolidated', { removed });
    }
  }

  getStats(): {
    total: number;
    byType: Record<string, number>;
    totalAccesses: number;
    limits: { maxPerType: number; maxTotal: number };
    evicted: number;
    batchSaves: number;
    immediateSaves: number;
  } {
    let total = 0;
    let totalAccesses = 0;
    const byType: Record<string, number> = {};

    for (const [type, list] of this.entries) {
      total += list.length;
      byType[type] = list.length;
      totalAccesses += list.reduce((s, e) => s + e.metadata.accessCount, 0);
    }

    return {
      total,
      byType,
      totalAccesses,
      limits: { maxPerType: this.MAX_ENTRIES_PER_TYPE, maxTotal: this.MAX_TOTAL_ENTRIES },
      evicted: this.evictedCount,
      batchSaves: this.batchSaves,
      immediateSaves: this.immediateSaves,
    };
  }

  async getById(id: string): Promise<MemoryEntry | undefined> {
    for (const list of this.entries.values()) {
      const found = list.find(e => e.id === id);
      if (found) {
        found.metadata.accessCount++;
        found.metadata.lastAccessed = new Date().toISOString();
        this.lru.touch(found.id, found.type);
        this.scheduleSave();
        return found;
      }
    }
    return undefined;
  }

  destroy(): void {
    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
      this.consolidationInterval = null;
    }
    this.batchWriter.destroy();
  }
}

export const memoryEngine = new MemoryEngine();
