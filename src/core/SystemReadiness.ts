import { configManager } from '../config/ConfigManager.js';
import { secureVault } from '../security/SecureVault.js';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

interface ReadinessCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  durationMs: number;
}

export class SystemReadiness {
  private checks: ReadinessCheck[] = [];

  async runAll(): Promise<{ ready: boolean; checks: ReadinessCheck[] }> {
    console.log('Helios SystemReadiness - Iniciando diagnostico...');
    this.checks = [];

    await this.check('Config Valid', () => {
      configManager.validateCritical();
      return 'Configuracion validada';
    });

    await this.check('State Directory', () => {
      const dir = configManager.stateDir;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      return `Directorio de estado: ${dir}`;
    });

    await this.check('SecureVault', () => {
      secureVault.set('_test_key_', 'test_value');
      const value = secureVault.get('_test_key_');
      secureVault.delete('_test_key_');
      if (value !== 'test_value') throw new Error('Vault no funciona');
      secureVault.save();
      return `Vault operativo (${secureVault.getStats().totalEntries} entradas)`;
    });

    await this.check('Memory', () => {
      const used = process.memoryUsage();
      const mb = Math.round(used.heapTotal / 1024 / 1024);
      if (mb > 8192) throw new Error(`Memoria insuficiente: ${mb}MB`);
      return `${mb}MB heap disponible`;
    });

    await this.check('Node Version', () => {
      const v = process.version;
      const major = parseInt(v.slice(1).split('.')[0]);
      if (major < 20) throw new Error(`Node ${v} < 20 requerido`);
      return `Node.js ${v}`;
    });

    const failed = this.checks.filter(c => c.status === 'fail');
    const ready = failed.length === 0;

    console.log(`${ready ? 'OK' : 'FALLIDO'} SystemReadiness: ${ready ? 'LISTO' : 'FALLIDO'}`);
    for (const check of this.checks) {
      const icon = check.status === 'pass' ? 'OK' : check.status === 'warn' ? 'WARN' : 'FAIL';
      console.log(`  ${icon} ${check.name}: ${check.message} (${check.durationMs}ms)`);
    }

    if (!ready) {
      throw new Error(`Helios NO PUEDE ARRANCAR: ${failed.map(f => f.name).join(', ')}`);
    }

    return { ready, checks: this.checks };
  }

  private async check(name: string, fn: () => string | Promise<string>): Promise<void> {
    const start = Date.now();
    try {
      const message = await fn();
      this.checks.push({ name, status: 'pass', message, durationMs: Date.now() - start });
    } catch (err) {
      this.checks.push({
        name,
        status: 'fail',
        message: (err as Error).message,
        durationMs: Date.now() - start,
      });
    }
  }
}

export const systemReadiness = new SystemReadiness();
