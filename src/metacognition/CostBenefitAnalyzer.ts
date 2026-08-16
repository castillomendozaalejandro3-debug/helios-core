/**
 * CostBenefitAnalyzer - Motor de Analisis Costo-Beneficio
 * Asigna valor economico preciso a cada accion antes de ejecutarla.
 * Filosofia: cada centavo debe justificarse con ROI medible.
 */

import { EventEmitter } from 'events';
import { metaCognitionEngine, SolutionTemplate } from './MetaCognitionEngine.js';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';

export interface ActionCandidate {
  id: string;
  action: string;
  description: string;
  estimatedCost: number; // en USD
  estimatedTimeMs: number;
  toolsRequired: string[];
  probabilitySuccess: number; // 0-1
  probabilityFailure: number; // 0-1
  valueIfSuccess: number; // valor del resultado si exitoso
  costIfFailure: number; // costo adicional si falla
  irreversible: boolean;
  alternatives: ActionCandidate[];
}

export interface CostBenefitAnalysis {
  candidateId: string;
  roiOptimistic: number;
  roiExpected: number;
  roiPessimistic: number;
  costTotal: number;
  valueExpected: number;
  recommendation: 'approve' | 'reject' | 'alternative' | 'escalate';
  reason: string;
  alternativeProposed?: ActionCandidate;
  confidence: number;
}

export interface BudgetAllocation {
  totalAvailable: number;
  allocated: number;
  reserved: number;
  perClone: Record<string, number>;
  perTool: Record<string, number>;
}

export class CostBenefitAnalyzer extends EventEmitter {
  private minROI: number = 1.5;
  private minROIPessimistic: number = 0.0;
  private maxDailySpend: number;
  private dailySpend: number = 0;
  private lastReset: number = Date.now();

  constructor() {
    super();
    this.maxDailySpend = financialEngine.getFinancialReport().balance * 0.3; // 30% del balance
  }

  // ----------------------------------------------------------
  // ANALISIS PRINCIPAL
  // ----------------------------------------------------------

  analyze(candidate: ActionCandidate): CostBenefitAnalysis {
    // Verificar si hay plantilla en SolutionLibrary
    const template = metaCognitionEngine.findSolution(candidate.action);
    if (template) {
      return this.analyzeWithTemplate(candidate, template);
    }

    // Analisis completo desde cero
    return this.analyzeFromScratch(candidate);
  }

  private analyzeWithTemplate(candidate: ActionCandidate, template: SolutionTemplate): CostBenefitAnalysis {
    const historicalROI = template.roi;
    const historicalQuality = template.avgQuality;

    // Ajustar probabilidades basado en historial
    const adjustedSuccessProb = Math.min(
      candidate.probabilitySuccess * 0.3 + historicalQuality * 0.7,
      0.95
    );

    const costTotal = template.estimatedCost;
    const valueExpected = adjustedSuccessProb * candidate.valueIfSuccess;
    const costFailure = candidate.probabilityFailure * candidate.costIfFailure;
    const costOportunity = this.calculateOpportunityCost(candidate.estimatedTimeMs);

    const totalCost = costTotal + costFailure + costOportunity;

    const roiOptimistic = (candidate.valueIfSuccess * 1.2 - totalCost * 0.8) / Math.max(totalCost * 0.8, 0.01);
    const roiExpected = (valueExpected - totalCost) / Math.max(totalCost, 0.01);
    const roiPessimistic = (candidate.valueIfSuccess * 0.5 - totalCost * 1.5) / Math.max(totalCost * 1.5, 0.01);

    let recommendation: CostBenefitAnalysis['recommendation'];
    let reason: string;

    if (roiExpected >= this.minROI && roiPessimistic >= this.minROIPessimistic) {
      recommendation = 'approve';
      reason = `Plantilla con ROI historico ${historicalROI.toFixed(2)}. ROI esperado ${roiExpected.toFixed(2)} supera umbral ${this.minROI}`;
    } else if (candidate.alternatives.length > 0) {
      const bestAlt = this.findBestAlternative(candidate);
      if (bestAlt && bestAlt.roiExpected >= this.minROI) {
        recommendation = 'alternative';
        reason = `ROI esperado ${roiExpected.toFixed(2)} insuficiente. Alternativa propuesta con ROI ${bestAlt.roiExpected.toFixed(2)}`;
        return {
          candidateId: candidate.id,
          roiOptimistic, roiExpected, roiPessimistic,
          costTotal: totalCost, valueExpected,
          recommendation, reason,
          alternativeProposed: candidate.alternatives[0],
          confidence: historicalQuality * 0.8 + 0.2,
        };
      }
      recommendation = 'reject';
      reason = `Ninguna alternativa alcanza ROI minimo ${this.minROI}`;
    } else {
      recommendation = 'escalate';
      reason = `ROI esperado ${roiExpected.toFixed(2)} bajo, sin alternativas disponibles. Requiere decision humana`;
    }

    return {
      candidateId: candidate.id,
      roiOptimistic, roiExpected, roiPessimistic,
      costTotal: totalCost, valueExpected,
      recommendation, reason,
      confidence: historicalQuality * 0.8 + 0.2,
    };
  }

  private analyzeFromScratch(candidate: ActionCandidate): CostBenefitAnalysis {
    const costTotal = candidate.estimatedCost;
    const valueExpected = candidate.probabilitySuccess * candidate.valueIfSuccess;
    const costFailure = candidate.probabilityFailure * candidate.costIfFailure;
    const costOportunity = this.calculateOpportunityCost(candidate.estimatedTimeMs);

    const totalCost = costTotal + costFailure + costOportunity;

    const roiOptimistic = (candidate.valueIfSuccess * 1.2 - totalCost * 0.8) / Math.max(totalCost * 0.8, 0.01);
    const roiExpected = (valueExpected - totalCost) / Math.max(totalCost, 0.01);
    const roiPessimistic = (candidate.valueIfSuccess * 0.5 - totalCost * 1.5) / Math.max(totalCost * 1.5, 0.01);

    let recommendation: CostBenefitAnalysis['recommendation'];
    let reason: string;

    if (roiExpected >= this.minROI && roiPessimistic >= this.minROIPessimistic) {
      recommendation = 'approve';
      reason = `ROI esperado ${roiExpected.toFixed(2)} supera umbral ${this.minROI}. Sin historial, pero proyeccion favorable`;
    } else if (candidate.alternatives.length > 0) {
      recommendation = 'alternative';
      reason = `ROI esperado ${roiExpected.toFixed(2)} insuficiente. Proponer alternativa`;
    } else if (candidate.irreversible && roiPessimistic < 0) {
      recommendation = 'escalate';
      reason = `Accion irreversible con ROI pesimista negativo. Requiere aprobacion humana`;
    } else {
      recommendation = 'reject';
      reason = `ROI esperado ${roiExpected.toFixed(2)} no justifica el costo ${totalCost.toFixed(2)}`;
    }

    return {
      candidateId: candidate.id,
      roiOptimistic, roiExpected, roiPessimistic,
      costTotal, valueExpected,
      recommendation, reason,
      confidence: 0.5, // Sin historial, confianza media
    };
  }

  // ----------------------------------------------------------
  // ANALISIS MULTI-CANDIDATO
  // ----------------------------------------------------------

  compareCandidates(candidates: ActionCandidate[]): CostBenefitAnalysis[] {
    const analyses = candidates.map(c => this.analyze(c));

    // Ordenar por ROI esperado descendente
    analyses.sort((a, b) => b.roiExpected - a.roiExpected);

    // Marcar el mejor como recomendado si cumple criterios
    if (analyses.length > 0 && analyses[0].recommendation === 'approve') {
      analyses[0].reason += ' [RECOMENDADO]';
    }

    return analyses;
  }

  // ----------------------------------------------------------
  // ASIGNACION DE PRESUPUESTOS
  // ----------------------------------------------------------

  allocateBudget(taskCount: number, complexity: 'low' | 'medium' | 'high'): BudgetAllocation {
    const balance = financialEngine.getFinancialReport().balance;
    const minReserve = financialEngine.getFinancialReport().balance * 0.3; // 30% reserva
    const available = Math.max(balance - minReserve, 0);

    // Reset diario
    const now = Date.now();
    if (now - this.lastReset > 24 * 60 * 60 * 1000) {
      this.dailySpend = 0;
      this.lastReset = now;
      this.maxDailySpend = available * 0.3;
    }

    const remainingDaily = Math.max(this.maxDailySpend - this.dailySpend, 0);
    const totalAllocatable = Math.min(available, remainingDaily);

    // Factor de complejidad
    const complexityMultiplier = { low: 0.5, medium: 1.0, high: 2.0 }[complexity];
    const perTask = (totalAllocatable / taskCount) * complexityMultiplier;

    const allocation: BudgetAllocation = {
      totalAvailable: available,
      allocated: 0,
      reserved: minReserve,
      perClone: {},
      perTool: {},
    };

    for (let i = 0; i < taskCount; i++) {
      allocation.perClone[`clone_${i}`] = perTask;
      allocation.allocated += perTask;
    }

    return allocation;
  }

  recordSpend(amount: number): void {
    this.dailySpend += amount;
    financialEngine.recordExpense(amount, 'Operacion de clon/equipo', 'compute');
  }

  // ----------------------------------------------------------
  // UTILIDADES
  // ----------------------------------------------------------

  private calculateOpportunityCost(timeMs: number): number {
    // Costo de oportunidad: que otra tarea podria hacerse en ese tiempo
    // Asumimos que el valor promedio de una tarea es $0.50 y toma 5 min
    const avgTaskValue = 0.5;
    const avgTaskTimeMs = 5 * 60 * 1000;
    return (timeMs / avgTaskTimeMs) * avgTaskValue;
  }

  private findBestAlternative(candidate: ActionCandidate): CostBenefitAnalysis | null {
    if (candidate.alternatives.length === 0) return null;
    const analyses = candidate.alternatives.map(alt => this.analyze(alt));
    analyses.sort((a, b) => b.roiExpected - a.roiExpected);
    return analyses[0] || null;
  }

  getStats(): {
    minROI: number;
    dailySpend: number;
    maxDailySpend: number;
    remainingDaily: number;
    analysesPerformed: number;
  } {
    return {
      minROI: this.minROI,
      dailySpend: Math.round(this.dailySpend * 100) / 100,
      maxDailySpend: Math.round(this.maxDailySpend * 100) / 100,
      remainingDaily: Math.round(Math.max(this.maxDailySpend - this.dailySpend, 0) * 100) / 100,
      analysesPerformed: 0, // Se incrementaria en produccion
    };
  }
}

export const costBenefitAnalyzer = new CostBenefitAnalyzer();
