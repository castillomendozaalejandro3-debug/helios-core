/**
 * HealthDashboard - Capa 7: Monitoreo de Salud del Sistema
 * Metricas en tiempo real, deteccion de anomalias, reportes de salud.
 */

import { EventEmitter } from 'events';
import { configManager } from '../config/ConfigManager.js';
import { memoryEngine } from '../memory/MemoryEngine.js';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';
import { agentFactory } from '../agents/AgentFactory.js';
import { safeguards } from './Safeguards.js';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

interface SystemStatus {
  helios: {
    version: string;
    uptime: number;
    autonomyLevel: number;
    healthy: boolean;
  };
  financial: {
    balance: number;
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
  };
  agents: {
    total: number;
    running: number;
    crashed: number;
    stopped: number;
  };
  memory: {
    episodic: number;
    semantic: number;
    procedural: number;
    emotional: number;
    meta: number;
  };
  safeguards: {
    active: boolean;
    killSwitch: boolean;
    auditEntries: number;
  };
  system: {
    memory: NodeJS.MemoryUsage;
    nodeVersion: string;
    platform: string;
    cpuUsage: number;
  };
  checks: HealthCheck[];
}

export class HealthDashboard extends EventEmitter {
  private checks: HealthCheck[] = [];
  private startTime: number = Date.now();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.startMonitoring();
  }

  private startMonitoring(): void {
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, configManager.config.HELIOS_HEALTH_CHECK_INTERVAL_MS);
  }

  private runHealthChecks(): void {
    this.checks = [];

    // Check 1: Memoria
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapLimitMB = configManager.config.HELIOS_AGENT_MEMORY_LIMIT_MB * 2;
    this.addCheck('memory', heapUsedMB, heapLimitMB, 'Uso de memoria heap');

    // Check 2: Balance financiero
    const finReport = financialEngine.getFinancialReport();
    this.addCheck('financial', finReport.balance, configManager.config.HELIOS_MINIMUM_BALANCE, 'Balance financiero');

    // Check 3: Agentes caidos
    const agents = agentFactory.listAgents();
    const crashedCount = agents.filter(a => a.status === 'crashed').length;
    this.addCheck('agents', crashedCount, 2, 'Agentes caidos', true);

    // Check 4: Kill switch
    this.addCheck('safeguards', safeguards.isKillSwitchActive() ? 1 : 0, 1, 'Kill switch activo', true);

    // Check 5: Event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1e6;
      this.addCheck('eventloop', lag, 100, 'Lag del event loop (ms)');
    });

    const degraded = this.checks.filter(c => c.status === 'degraded').length;
    const critical = this.checks.filter(c => c.status === 'critical').length;

    if (critical > 0) {
      this.emit('health-critical', { checks: this.checks.filter(c => c.status === 'critical') });
    } else if (degraded > 0) {
      this.emit('health-degraded', { checks: this.checks.filter(c => c.status === 'degraded') });
    }
  }

  private addCheck(name: string, value: number, threshold: number, message: string, inverse: boolean = false): void {
    let status: HealthCheck['status'];
    if (inverse) {
      status = value >= threshold ? 'critical' : value >= threshold * 0.5 ? 'degraded' : 'healthy';
    } else {
      status = value >= threshold ? 'critical' : value >= threshold * 0.8 ? 'degraded' : 'healthy';
    }

    this.checks.push({
      name,
      status,
      value: Math.round(value * 100) / 100,
      threshold,
      message,
      timestamp: Date.now(),
    });
  }

  getHealth(): { healthy: boolean; checks: HealthCheck[] } {
    const critical = this.checks.filter(c => c.status === 'critical').length;
    return {
      healthy: critical === 0,
      checks: this.checks,
    };
  }

  getStatus(): SystemStatus {
    const finReport = financialEngine.getFinancialReport();
    const agents = agentFactory.listAgents();
    const memStats = memoryEngine.getStats();
    const safeStats = safeguards.getStats();
    const health = this.getHealth();

    return {
      helios: {
        version: '1.0.0',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        autonomyLevel: configManager.autonomyLevel,
        healthy: health.healthy,
      },
      financial: finReport,
      agents: {
        total: agents.length,
        running: agents.filter(a => a.status === 'running').length,
        crashed: agents.filter(a => a.status === 'crashed').length,
        stopped: agents.filter(a => a.status === 'stopped').length,
      },
      memory: {
        episodic: memStats.byType?.episodic || 0,
        semantic: memStats.byType?.semantic || 0,
        procedural: memStats.byType?.procedural || 0,
        emotional: memStats.byType?.emotional || 0,
        meta: memStats.byType?.meta || 0,
      },
      safeguards: {
        active: safeStats.active,
        killSwitch: safeStats.killSwitch,
        auditEntries: safeStats.auditEntries,
      },
      system: {
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform,
        cpuUsage: process.cpuUsage().user / 1e6,
      },
      checks: this.checks,
    };
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const healthDashboard = new HealthDashboard();
