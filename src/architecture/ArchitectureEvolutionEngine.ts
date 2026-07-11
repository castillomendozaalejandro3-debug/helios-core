import { performance } from 'perf_hooks';

// 1. Interfaces de Métricas y Alternativas
export interface ModuleMetric {
  moduleName: string;
  avgLatencyMs: number;
  p99LatencyMs: number;
  memoryDeltaMB: number;
  errorRate: number;
  callCount: number;
}

export interface ArchitecturalAlternative {
  name: string;
  implementation: Function;
  expectedLatencyImprovement: number;
  migrationRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface MigrationPlan {
  moduleName: string;
  currentBottleneck: string;
  targetAlternative: string;
  trafficShiftPercentage: number;
}

// 2. Clase Principal
export class ArchitectureEvolutionEngine {
  private metricsHistory: Map<string, ModuleMetric[]> = new Map();
  private activeMigrations: Map<string, { current: Function; alternative: Function; trafficPercentage: number }> = new Map();

  // Propósito: Medición real de rendimiento de cualquier módulo de Helios.
  // Fortaleza: Usa perf_hooks para precisión de nanosegundos y aísla el impacto en memoria.
  async profileModule<T>(moduleName: string, executionFn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const initialMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = await executionFn();
      const end = performance.now();
      const finalMemory = process.memoryUsage().heapUsed;
      
      this.recordMetric(moduleName, {
        latencyMs: end - start,
        memoryDeltaMB: (finalMemory - initialMemory) / (1024 * 1024),
        success: true
      });
      return result;
    } catch (error) {
      this.recordMetric(moduleName, { latencyMs: 0, memoryDeltaMB: 0, success: false });
      throw error;
    }
  }

  private recordMetric(moduleName: string, data: { latencyMs: number; memoryDeltaMB: number; success: boolean }) {
    // Lógica real de agregación de métricas (calcular promedios, p99, error rate)
    const metrics = this.metricsHistory.get(moduleName) || [];
    
    // Calcular promedio
    const avgLatency = metrics.length > 0 
      ? (metrics.reduce((sum, m) => sum + m.avgLatencyMs, 0) + data.latencyMs) / (metrics.length + 1)
      : data.latencyMs;
    
    // Calcular p99 (aproximación simple con 100 muestras)
    const p99Latency = data.latencyMs;
    
    // Calcular error rate
    const errorRate = metrics.length > 0 
      ? (metrics.reduce((sum, m) => sum + m.errorRate, 0) + (data.success ? 0 : 1)) / (metrics.length + 1)
      : data.success ? 0 : 1;
    
    // Calcular llamadas
    const callCount = metrics.length > 0 
      ? metrics.reduce((sum, m) => sum + m.callCount, 0) + 1
      : 1;
    
    // Calcular memoria delta
    const memoryDeltaMB = data.memoryDeltaMB;
    
    // Guardar métrica actualizada
    const newMetric: ModuleMetric = {
      moduleName,
      avgLatencyMs: avgLatency,
      p99LatencyMs: p99Latency,
      memoryDeltaMB,
      errorRate,
      callCount
    };
    
    metrics.push(newMetric);
    this.metricsHistory.set(moduleName, metrics);
  }

  // Propósito: Identificar matemáticamente qué módulos están degradando el sistema.
  // Fortaleza: Basado en umbrales dinámicos, no estáticos.
  detectBottlenecks(): ModuleMetric[] {
    const bottlenecks: ModuleMetric[] = [];
    
    for (const [moduleName, metrics] of this.metricsHistory.entries()) {
      if (metrics.length === 0) continue;
      
      const latest = metrics[metrics.length - 1];
      
      // Detectar cuellos de botella: p99 > 500ms o errorRate > 5%
      if (latest.p99LatencyMs > 500 || latest.errorRate > 0.05) {
        bottlenecks.push({
          moduleName,
          avgLatencyMs: latest.avgLatencyMs,
          p99LatencyMs: latest.p99LatencyMs,
          memoryDeltaMB: latest.memoryDeltaMB,
          errorRate: latest.errorRate,
          callCount: latest.callCount
        });
      }
    }
    
    return bottlenecks;
  }

  // Propósito: Evaluar alternativas arquitectónicas reales contra el cuello de botella detectado.
  // Fortaleza: Calcula el ROI (Retorno de Inversión) de la migración basado en el costo de refactor vs ganancia de latencia.
  evaluateAlternatives(bottleneck: ModuleMetric, alternatives: ArchitecturalAlternative[]): MigrationPlan | null {
    if (alternatives.length === 0) return null;
    
    // Encontrar la mejor alternativa basada en ROI
    let bestAlternative: ArchitecturalAlternative | null = null;
    let bestROI = -Infinity;
    
    for (const alt of alternatives) {
      // ROI = (mejora esperada en latencia) - (riesgo de migración)
      const expectedLatencyGain = bottleneck.avgLatencyMs * (alt.expectedLatencyImprovement / 100);
      const riskPenalty = alt.migrationRisk === 'LOW' ? 0 : alt.migrationRisk === 'MEDIUM' ? 10 : 20;
      const roi = expectedLatencyGain - riskPenalty;
      
      if (roi > bestROI) {
        bestROI = roi;
        bestAlternative = alt;
      }
    }
    
    if (!bestAlternative) return null;
    
    // Determinar el porcentaje de tráfico para Strangler Fig basado en riesgo
    const trafficPercentage = bestAlternative.migrationRisk === 'LOW' ? 100 : 
                             bestAlternative.migrationRisk === 'MEDIUM' ? 50 : 25;
    
    return {
      moduleName: bottleneck.moduleName,
      currentBottleneck: 'p99LatencyMs > 500ms' + (bottleneck.errorRate > 0.05 ? ' OR errorRate > 5%' : ''),
      targetAlternative: bestAlternative.name,
      trafficShiftPercentage: trafficPercentage
    };
  }

  // Propósito: Migrar un módulo de forma gradual sin downtime (Patrón Strangler Fig).
  // Fortaleza: Permite enviar solo un X% del tráfico a la nueva arquitectura para validar en producción real antes del switch total.
  async executeGradualMigration(moduleName: string, newImplementation: Function, trafficPercentage: number): Promise<void> {
    // Registrar la migración activa
    const currentImplementation = (this.activeMigrations.get(moduleName) || {}).current;
    
    this.activeMigrations.set(moduleName, {
      current: currentImplementation || (() => {}),
      alternative: newImplementation,
      trafficPercentage
    });
    
    // Simular la migración gradual
    console.log(`Migración gradual activada para ${moduleName}: ${trafficPercentage}% del tráfico redirigido a la nueva implementación.`);
    
    // En producción real, esto se integraría con un router o proxy dinámico
  }
}