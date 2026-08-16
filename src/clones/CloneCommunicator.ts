/**
 * CloneCommunicator - Sistema de Mensajeria entre Clones
 * Mensajeria con TTL, broadcast, estadisticas de latencia y locks por canal.
 * v2.2: Mutex async por canal + Logger estructurado + Race-condition safe
 */

import { EventEmitter } from 'events';
import { logger } from '../core/Logger.js';

export interface CloneMessage {
  from: string;
  to: string;
  type: 'task' | 'result' | 'sync' | 'heartbeat' | 'budget-alert' | 'kill';
  payload: any;
  timestamp: number;
  ttl?: number;
  priority?: number;
}

export interface ChannelStats {
  channelId: string;
  messageCount: number;
  avgLatencyMs: number;
  lastActivity: number;
}

// ============================================================
// ASYNC MUTEX POR CANAL (sin dependencias externas)
// ============================================================

class AsyncLock {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

// ============================================================
// CLONE COMMUNICATOR
// ============================================================

export class CloneCommunicator extends EventEmitter {
  private channels = new Map<string, CloneMessage[]>();
  private locks = new Map<string, AsyncLock>();
  private globalLock = new AsyncLock();
  private maxHistory = 200;
  private messageCount = 0;
  private droppedCount = 0;
  private expiredCount = 0;
  private readonly defaultTTL = 30000;
  private log = logger.child('clone-comm');

  // --- LOCK HELPERS ---

  private getLock(cloneId: string): AsyncLock {
    if (!this.locks.has(cloneId)) {
      this.locks.set(cloneId, new AsyncLock());
    }
    return this.locks.get(cloneId)!;
  }

  private async withChannelLock<T>(cloneId: string, fn: () => T): Promise<T> {
    const lock = this.getLock(cloneId);
    await lock.acquire();
    try {
      return fn();
    } finally {
      lock.release();
    }
  }

  private async withGlobalLock<T>(fn: () => T): Promise<T> {
    await this.globalLock.acquire();
    try {
      return fn();
    } finally {
      this.globalLock.release();
    }
  }

  // ----------------------------------------------------------
  // ENVIO DE MENSAJES (thread-safe)
  // ----------------------------------------------------------

  async send(msg: CloneMessage): Promise<boolean> {
    const effectiveTTL = msg.ttl ?? this.defaultTTL;
    const now = Date.now();

    if (msg.timestamp + effectiveTTL < now) {
      this.expiredCount++;
      this.emit('message-expired', { msg, reason: 'ttl-exceeded' });
      this.log.warn(`Mensaje expirado: ${msg.type} de ${msg.from} a ${msg.to}`);
      return false;
    }

    return this.withChannelLock(msg.to, () => {
      if (!this.channels.has(msg.to)) {
        this.channels.set(msg.to, []);
      }

      const history = this.channels.get(msg.to)!;
      const insertIndex = history.findIndex(m => (m.priority ?? 5) < (msg.priority ?? 5));
      if (insertIndex === -1) {
        history.push(msg);
      } else {
        history.splice(insertIndex, 0, msg);
      }

      this.messageCount++;

      if (history.length > this.maxHistory) {
        const dropped = history.splice(0, history.length - this.maxHistory);
        this.droppedCount += dropped.length;
        this.emit('history-trimmed', { channel: msg.to, dropped: dropped.length });
        this.log.debug(`Historial recortado: ${msg.to} (-${dropped.length})`);
      }

      this.emit('message', msg);
      this.emit(`message-to-${msg.to}`, msg);

      return true;
    });
  }

  // ----------------------------------------------------------
  // RECEPCION DE MENSAJES (thread-safe)
  // ----------------------------------------------------------

  async receive(cloneId: string, clear = true, filterType?: CloneMessage['type']): Promise<CloneMessage[]> {
    return this.withChannelLock(cloneId, () => {
      const messages = this.channels.get(cloneId) || [];
      const now = Date.now();

      const valid = messages.filter(m => {
        const ttl = m.ttl ?? this.defaultTTL;
        if (m.timestamp + ttl < now) {
          this.expiredCount++;
          return false;
        }
        if (filterType && m.type !== filterType) return false;
        return true;
      });

      if (clear) {
        if (filterType) {
          this.channels.set(cloneId, messages.filter(m => m.type !== filterType));
        } else {
          this.channels.set(cloneId, []);
        }
      }

      return valid;
    });
  }

  async peek(cloneId: string, filterType?: CloneMessage['type']): Promise<CloneMessage[]> {
    return this.receive(cloneId, false, filterType);
  }

  // ----------------------------------------------------------
  // BROADCAST (thread-safe)
  // ----------------------------------------------------------

  async broadcast(
    from: string,
    type: CloneMessage['type'],
    payload: any,
    targets: string[],
    options: { ttl?: number; priority?: number } = {}
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const to of targets) {
      const success = await this.send({
        from,
        to,
        type,
        payload,
        timestamp: Date.now(),
        ttl: options.ttl,
        priority: options.priority,
      });
      if (success) sent++;
      else failed++;
    }

    this.emit('broadcast', { from, type, targets: targets.length, sent, failed });
    this.log.info(`Broadcast: ${sent}/${targets.length} enviados`);
    return { sent, failed };
  }

  // ----------------------------------------------------------
  // UTILIDADES
  // ----------------------------------------------------------

  async waitForMessage(cloneId: string, type?: CloneMessage['type'], timeoutMs = 5000): Promise<CloneMessage | null> {
    return new Promise((resolve) => {
      let resolved = false;

      const check = async () => {
        if (resolved) return;
        const msgs = await this.peek(cloneId, type);
        if (msgs.length > 0) {
          resolved = true;
          await this.receive(cloneId, true, type);
          resolve(msgs[0]);
          cleanup();
        }
      };

      check();

      const interval = setInterval(check, 100);
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
          cleanup();
        }
      }, timeoutMs);

      const onMessage = async () => {
        if (!resolved) await check();
      };

      this.on(`message-to-${cloneId}`, onMessage);

      const cleanup = () => {
        clearInterval(interval);
        clearTimeout(timeout);
        this.off(`message-to-${cloneId}`, onMessage);
      };
    });
  }

  // ----------------------------------------------------------
  // GESTION DE CANALES
  // ----------------------------------------------------------

  async clearChannel(cloneId: string): Promise<void> {
    await this.withChannelLock(cloneId, () => {
      const count = this.channels.get(cloneId)?.length || 0;
      this.channels.delete(cloneId);
      this.locks.delete(cloneId);
      this.emit('channel-cleared', { cloneId, messagesRemoved: count });
    });
  }

  getActiveChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  async getChannelStats(cloneId: string): Promise<ChannelStats> {
    return this.withChannelLock(cloneId, () => {
      const messages = this.channels.get(cloneId) || [];
      const now = Date.now();
      const latencies = messages.map(m => now - m.timestamp);
      return {
        channelId: cloneId,
        messageCount: messages.length,
        avgLatencyMs: latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : 0,
        lastActivity: messages.length > 0
          ? Math.max(...messages.map(m => m.timestamp))
          : 0,
      };
    });
  }

  // ----------------------------------------------------------
  // ESTADISTICAS
  // ----------------------------------------------------------

  async getStats(): Promise<{
    channels: number;
    totalMessages: number;
    dropped: number;
    expired: number;
    avgLatencyMs: number;
    channelStats: ChannelStats[];
    lockQueueDepth: number;
  }> {
    return this.withGlobalLock(() => {
      let totalLatency = 0;
      let totalMsgs = 0;
      const channelStats: ChannelStats[] = [];

      for (const [cloneId, msgs] of this.channels) {
        const stats = { ...this.getChannelStatsSync(cloneId) };
        channelStats.push(stats);
        totalLatency += stats.avgLatencyMs * stats.messageCount;
        totalMsgs += stats.messageCount;
      }

      let lockQueueDepth = 0;
      for (const lock of this.locks.values()) {
        lockQueueDepth += lock.queueLength;
      }

      return {
        channels: this.channels.size,
        totalMessages: this.messageCount,
        dropped: this.droppedCount,
        expired: this.expiredCount,
        avgLatencyMs: totalMsgs > 0 ? Math.round(totalLatency / totalMsgs) : 0,
        channelStats,
        lockQueueDepth,
      };
    });
  }

  private getChannelStatsSync(cloneId: string): ChannelStats {
    const messages = this.channels.get(cloneId) || [];
    const now = Date.now();
    const latencies = messages.map(m => now - m.timestamp);
    return {
      channelId: cloneId,
      messageCount: messages.length,
      avgLatencyMs: latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      lastActivity: messages.length > 0
        ? Math.max(...messages.map(m => m.timestamp))
        : 0,
    };
  }

  // ----------------------------------------------------------
  // LIMPIEZA
  // ----------------------------------------------------------

  async purgeExpired(): Promise<number> {
    return this.withGlobalLock(() => {
      let purged = 0;
      const now = Date.now();

      for (const [cloneId, msgs] of this.channels) {
        const valid = msgs.filter(m => {
          const ttl = m.ttl ?? this.defaultTTL;
          if (m.timestamp + ttl < now) {
            purged++;
            return false;
          }
          return true;
        });
        this.channels.set(cloneId, valid);
      }

      if (purged > 0) {
        this.emit('purge', { purged });
        this.log.info(`${purged} mensajes expirados purgados`);
      }

      return purged;
    });
  }

  destroy(): void {
    this.channels.clear();
    this.locks.clear();
    this.messageCount = 0;
    this.droppedCount = 0;
    this.expiredCount = 0;
    this.removeAllListeners();
    this.log.info('CloneCommunicator destruido');
  }
}

export const cloneCommunicator = new CloneCommunicator();
