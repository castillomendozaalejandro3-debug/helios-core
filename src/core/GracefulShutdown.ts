/**
 * GracefulShutdown - Manejo elegante de cierre del sistema
 * Captura SIGTERM/SIGINT, cierra conexiones, persiste estado, y sale limpio.
 * Previene perdida de datos y corrupcion en reinicios.
 */

import { EventEmitter } from 'events';

export interface ShutdownHook {
  name: string;
  priority: number; // Mayor = se ejecuta primero
  handler: () => Promise<void> | void;
}

export class GracefulShutdown extends EventEmitter {
  private shuttingDown = false;
  private readonly timeoutMs: number;
  private hooks: ShutdownHook[] = [];
  private startTime = Date.now();

  constructor(timeoutMs = 30000) {
    super();
    this.timeoutMs = timeoutMs;
    this.setupHandlers();
  }

  // ----------------------------------------------------------
  // REGISTRO DE HOOKS
  // ----------------------------------------------------------

  register(hook: ShutdownHook): void {
    this.hooks.push(hook);
    this.hooks.sort((a, b) => b.priority - a.priority);
  }

  unregister(name: string): void {
    this.hooks = this.hooks.filter(h => h.name !== name);
  }

  // ----------------------------------------------------------
  // HANDLERS DE SENALES
  // ----------------------------------------------------------

  private setupHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
      console.error('[GracefulShutdown] Uncaught exception:', err);
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[GracefulShutdown] Unhandled rejection at:', promise, 'reason:', reason);
      this.shutdown('unhandledRejection');
    });

    // Capturar SIGUSR2 para PM2 graceful reload
    process.on('SIGUSR2', () => this.shutdown('SIGUSR2'));
  }

  // ----------------------------------------------------------
  // SHUTDOWN
  // ----------------------------------------------------------

  async shutdown(signal: string): Promise<void> {
    if (this.shuttingDown) {
      console.log('[GracefulShutdown] Shutdown already in progress, ignoring', signal);
      return;
    }
    this.shuttingDown = true;

    const uptime = Date.now() - this.startTime;
    console.log(`[GracefulShutdown] Received ${signal}, uptime: ${uptime}ms, starting graceful shutdown...`);
    this.emit('shutdown-start', { signal, uptime });

    const timeout = setTimeout(() => {
      console.error('[GracefulShutdown] Timeout exceeded, forcing exit');
      this.emit('shutdown-timeout', { signal, elapsed: this.timeoutMs });
      process.exit(1);
    }, this.timeoutMs);

    const results: Array<{ name: string; success: boolean; elapsed: number; error?: string }> = [];

    for (const hook of this.hooks) {
      const hookStart = Date.now();
      try {
        await Promise.race([
          Promise.resolve(hook.handler()),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(`Hook ${hook.name} timeout`)), 5000)
          ),
        ]);
        results.push({ name: hook.name, success: true, elapsed: Date.now() - hookStart });
      } catch (err: any) {
        console.error(`[GracefulShutdown] Hook ${hook.name} failed:`, err.message);
        results.push({ name: hook.name, success: false, elapsed: Date.now() - hookStart, error: err.message });
      }
    }

    clearTimeout(timeout);

    const totalElapsed = Date.now() - this.startTime;
    const summary = {
      signal,
      uptime: totalElapsed,
      hooksExecuted: results.length,
      hooksFailed: results.filter(r => !r.success).length,
      results,
    };

    console.log('[GracefulShutdown] Clean exit, summary:', JSON.stringify(summary, null, 2));
    this.emit('shutdown-complete', summary);
    process.exit(0);
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  getHooks(): ShutdownHook[] {
    return [...this.hooks];
  }
}

export const gracefulShutdown = new GracefulShutdown();
