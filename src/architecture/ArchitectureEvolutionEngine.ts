/**
 * ArchitectureEvolutionEngine - Capa 2: Auto-Arquitectura
 * Usa perf_hooks para detectar cuellos de botella y migrar modulos (Strangler Fig).
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

interface PerformanceSnapshot {
  timestamp: number;
  moduleName: string;
  avgLatencyMs: number;
  throughput: number;
  memoryMB: number;
}

interface MigrationPlan {
  from: string;
  to: string;
  strategy: 'strangler-fig' | 'parallel-run' | 'blue-green';
  reason: string;
  estimatedRisk: 'low' | 'medium' | 'high';
}

export class ArchitectureEvolutionEngine extends EventEmitter {
  private snapshots: Map<string, PerformanceSnapshot[]> = new Map();
  private maxSnapshots = 100;

  record(moduleName: string, operation: () => void): void {
    const start = performance.now();
    const memBefore = process.memoryUsage().heapUsed;

    operation();

    const latency = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed;
    const memoryMB = (memAfter - memBefore) / 1024 / 1024;

    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      moduleName,
      avgLatencyMs: latency,
      throughput: 1000 / Math.max(latency, 1),
      memoryMB: Math.max(0, memoryMB),
    };

    const history = this.snapshots.get(moduleName) || [];
    history.push(snapshot);
    if (history.length > this.maxSnapshots) history.shift();
    this.snapshots.set(moduleName, history);

    this.detectBottleneck(moduleName, history);
  }

  private detectBottleneck(moduleName: string, history: PerformanceSnapshot[]): void {
    if (history.length < 10) return;
    const recent = history.slice(-10);
    const older = history.slice(0, 10);
    const recentAvg = recent.reduce((a, b) => a + b.avgLatencyMs, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b.avgLatencyMs, 0) / older.length;

    if (recentAvg > olderAvg * 2) {
      this.emit('bottleneck-detected', {
        moduleName,
        degradation: Math.round((recentAvg / olderAvg - 1) * 100),
        suggestion: this.generateMigrationPlan(moduleName, recentAvg),
      });
    }
  }

  generateMigrationPlan(moduleName: string, latency: number): MigrationPlan {
    return {
      from: moduleName,
      to: `${moduleName}-v2`,
      strategy: latency > 1000 ? 'strangler-fig' : 'parallel-run',
      reason: `Latencia degradada a ${Math.round(latency)}ms`,
      estimatedRisk: latency > 5000 ? 'high' : latency > 1000 ? 'medium' : 'low',
    };
  }

  getHealthReport(): Record<string, { trend: 'improving' | 'stable' | 'degrading'; avgLatency: number }> {
    const report: Record<string, { trend: 'improving' | 'stable' | 'degrading'; avgLatency: number }> = {};
    for (const [name, history] of this.snapshots) {
      if (history.length < 2) {
        // Include modules with at least 1 snapshot
        if (history.length >= 1) {
          report[name] = {
            trend: 'stable',
            avgLatency: Math.round(history[0].avgLatencyMs * 100) / 100,
          };
        }
        continue;
      }
      const firstHalf = history.slice(0, Math.floor(history.length / 2));
      const secondHalf = history.slice(Math.floor(history.length / 2));
      const firstAvg = firstHalf.reduce((a, b) => a + b.avgLatencyMs, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b.avgLatencyMs, 0) / secondHalf.length;
      
      report[name] = {
        trend: secondAvg < firstAvg * 0.9 ? 'improving' : secondAvg > firstAvg * 1.1 ? 'degrading' : 'stable',
        avgLatency: Math.round(secondAvg * 100) / 100,
      };
    }
    return report;
  }
}

export const evolutionEngine = new ArchitectureEvolutionEngine();
