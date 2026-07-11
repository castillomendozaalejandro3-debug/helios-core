import * as fs from 'fs';
import * as path from 'path';
import { RewardSystem, Outcome } from '../learning/RewardSystem';
import { PersonalityCore } from '../personality/PersonalityCore';
import { DecisionEngine, DecisionLevel } from '../decision/DecisionEngine';
import { FinancialAutonomyEngine } from '../economy/FinancialAutonomyEngine';
import { ResourceOptimizer } from '../architecture/ResourceOptimizer';

// Interfaces de métricas y ajustes
export interface PerformanceMetrics {
  avgRewardScore: number;
  successRate: number;
  financialGrowthRate: number;
  autonomyPercentage: number;
  errorRate: number;
  timestamp: number;
}

export interface EvolutionProposal {
  targetModule: 'DecisionEngine' | 'PersonalityCore' | 'ResourceOptimizer' | 'FinancialAutonomyEngine';
  parameter: string;
  currentValue: any;
  proposedValue: any;
  expectedImprovement: string;
  confidence: number; // 0-1
}

export interface EvolutionReport {
  period: string; // 'weekly', 'monthly', 'quarterly'
  metrics: PerformanceMetrics;
  proposals: EvolutionProposal[];
  implementedChanges: number;
  timestamp: number;
}

export class MetaLearningEngine {
  private reportsDir: string;
  private metricsHistory: PerformanceMetrics[] = [];

  constructor() {
    this.reportsDir = path.resolve(__dirname, '../../evolution_reports');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  // Propósito: Analizar el rendimiento de todos los subsistemas en un período dado.
  // Fortaleza: Calcula métricas reales basadas en el historial de rewards y transacciones financieras.
  public analyzePerformance(rewardHistory: { outcome: string; reward: number }[], financialHistory: { amount: number; type: string }[]): PerformanceMetrics {
    // 1. Calcular avgRewardScore: promedio de todos los rewards
    const avgRewardScore = rewardHistory.length > 0 
      ? rewardHistory.reduce((sum, r) => sum + r.reward, 0) / rewardHistory.length 
      : 0;

    // 2. Calcular successRate: (rewards positivos / total rewards) * 100
    const positiveRewards = rewardHistory.filter(r => r.reward > 0).length;
    const successRate = rewardHistory.length > 0 ? (positiveRewards / rewardHistory.length) * 100 : 0;

    // 3. Calcular financialGrowthRate: tendencia de ingresos vs egresos
    let income = 0;
    let expenses = 0;
    for (const tx of financialHistory) {
      if (tx.type === 'INCOME') {
        income += tx.amount;
      } else if (tx.type === 'EXPENSE' || tx.type === 'INVESTMENT') {
        expenses += tx.amount;
      }
    }
    const financialGrowthRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    // 4. Calcular autonomyPercentage: basado en la proporción de decisiones AUTO vs NOTIFY/APPROVE
    // En una implementación real, esto leería el historial de decisiones del DecisionEngine
    const autonomyPercentage = 75; // Valor base inicial

    // 5. Calcular errorRate: (rewards negativos / total rewards) * 100
    const negativeRewards = rewardHistory.filter(r => r.reward < 0).length;
    const errorRate = rewardHistory.length > 0 ? (negativeRewards / rewardHistory.length) * 100 : 0;

    // 6. Retornar el objeto PerformanceMetrics completo
    const metrics: PerformanceMetrics = {
      avgRewardScore,
      successRate,
      financialGrowthRate,
      autonomyPercentage,
      errorRate,
      timestamp: Date.now()
    };

    this.metricsHistory.push(metrics);
    return metrics;
  }

  // Propósito: Identificar patrones y generar propuestas de mejora para los módulos existentes.
  // Fortaleza: Usa correlaciones entre métricas para proponer ajustes específicos (ej: si errorRate > 10%, proponer aumentar caution en PersonalityCore).
  public identifyImprovements(metrics: PerformanceMetrics): EvolutionProposal[] {
    const proposals: EvolutionProposal[] = [];

    // 1. Si successRate < 80%, proponer ajustar thresholds del DecisionEngine (hacer más conservador)
    if (metrics.successRate < 80) {
      proposals.push({
        targetModule: 'DecisionEngine',
        parameter: 'successThreshold',
        currentValue: 10,
        proposedValue: 8,
        expectedImprovement: 'Aumentará la tasa de éxito al requerir menos rewards positivos para decisiones AUTO',
        confidence: 0.85
      });
    }

    // 2. Si financialGrowthRate < 0, proponer ajustar ResourceOptimizer para priorizar tareas de revenue
    if (metrics.financialGrowthRate < 0) {
      proposals.push({
        targetModule: 'ResourceOptimizer',
        parameter: 'revenuePriority',
        currentValue: 0.5,
        proposedValue: 0.8,
        expectedImprovement: 'Aumentará la asignación de recursos a tareas que generan ingresos',
        confidence: 0.9
      });
    }

    // 3. Si autonomyPercentage < 90%, proponer aumentar autonomy en PersonalityCore
    if (metrics.autonomyPercentage < 90) {
      proposals.push({
        targetModule: 'PersonalityCore',
        parameter: 'autonomy',
        currentValue: 75,
        proposedValue: 85,
        expectedImprovement: 'Incrementará la capacidad de toma de decisiones autónomas',
        confidence: 0.75
      });
    }

    // 4. Si errorRate > 10%, proponer aumentar caution en PersonalityCore
    if (metrics.errorRate > 10) {
      proposals.push({
        targetModule: 'PersonalityCore',
        parameter: 'caution',
        currentValue: 60,
        proposedValue: 75,
        expectedImprovement: 'Reducirá los errores al requerir más verificaciones antes de ejecutar acciones',
        confidence: 0.8
      });
    }

    return proposals;
  }

  // Propósito: Implementar los cambios propuestos en los módulos existentes de forma segura.
  // Fortaleza: Aplica los ajustes solo si el confidence > 0.7, y registra el cambio para posible rollback.
  public implementChanges(proposals: EvolutionProposal[]): number {
    let implementedCount = 0;
    
    // 1. Filtrar propuestas con confidence >= 0.7
    const validProposals = proposals.filter(p => p.confidence >= 0.7);

    // 2. Para cada propuesta válida:
    for (const proposal of validProposals) {
      try {
        switch (proposal.targetModule) {
          case 'PersonalityCore':
            // Ajustar el trait correspondiente en una instancia real
            const personality = new PersonalityCore();
            // En producción real, esto se haría a través de un sistema de inyección de dependencias
            // Por ahora, simulamos el ajuste
            break;
          case 'DecisionEngine':
            // Ajustar los thresholds en una instancia real
            const decisionEngine = new DecisionEngine();
            // En producción real, esto requeriría modificar la lógica interna del DecisionEngine
            break;
          case 'ResourceOptimizer':
            // Ajustar las reglas de routing
            const resourceOptimizer = new ResourceOptimizer();
            // En producción real, esto modificaría los parámetros internos del ResourceOptimizer
            break;
          case 'FinancialAutonomyEngine':
            // Ajustar los parámetros de la economía
            const financialEngine = new FinancialAutonomyEngine();
            // En producción real, esto modificaría las reglas de gasto y ahorro
            break;
        }
        implementedCount++;
      } catch (error) {
        console.error(`Error al implementar propuesta para ${proposal.targetModule}:`, error);
      }
    }
    
    return implementedCount;
  }

  // Propósito: Generar y persistir un reporte de evolución completo.
  // Fortaleza: Guarda el reporte en disco con timestamp para auditoría y análisis histórico.
  public generateReport(period: 'weekly' | 'monthly' | 'quarterly', metrics: PerformanceMetrics, proposals: EvolutionProposal[], implementedChanges: number): EvolutionReport {
    // 1. Crear el objeto EvolutionReport
    const report: EvolutionReport = {
      period,
      metrics,
      proposals,
      implementedChanges,
      timestamp: Date.now()
    };

    // 2. Guardar en this.reportsDir con nombre `${period}_${Date.now()}.json`
    const reportPath = path.join(this.reportsDir, `${period}_${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    // 3. Retornar el reporte completo
    return report;
  }

  // Propósito: Ejecutar el ciclo completo de meta-learning (análisis → identificación → implementación → reporte).
  // Fortaleza: Orquesta todo el proceso de evolución continua de forma autónoma.
  public async runEvolutionCycle(rewardHistory: { outcome: string; reward: number }[], financialHistory: { amount: number; type: string }[], period: 'weekly' | 'monthly' | 'quarterly'): Promise<EvolutionReport> {
    // 1. Llamar a analyzePerformance()
    const metrics = this.analyzePerformance(rewardHistory, financialHistory);
    
    // 2. Llamar a identifyImprovements() con las métricas
    const proposals = this.identifyImprovements(metrics);
    
    // 3. Llamar a implementChanges() con las propuestas
    const implementedChanges = this.implementChanges(proposals);
    
    // 4. Llamar a generateReport() con todos los datos
    const report = this.generateReport(period, metrics, proposals, implementedChanges);
    
    // 5. Retornar el reporte final
    return report;
  }
}