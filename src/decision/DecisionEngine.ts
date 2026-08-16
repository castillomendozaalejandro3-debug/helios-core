import { EventEmitter } from 'events';
import { configManager } from '../config/ConfigManager.js';
import { memoryEngine } from '../memory/MemoryEngine.js';
import { rewardSystem } from '../learning/RewardSystem.js';

export enum DecisionLevel {
  AUTO = 0,
  NOTIFY = 1,
  APPROVE = 2,
  PROHIBITED = 3,
}

export interface DecisionContext {
  action: string;
  estimatedCost: number;
  riskScore: number;
  financialImpact: number;
  irreversible: boolean;
  metadata?: Record<string, any>;
}

export interface Decision {
  id: string;
  level: DecisionLevel;
  reason: string;
  razonamiento: string;
  timeoutMs?: number;
  requiresHuman?: boolean;
  timestamp: number;
  confidence: number;
}

export interface DecisionPolicy {
  actionType: string;
  maxAutoAmount: number;
  maxNotifyAmount: number;
  riskThreshold: number;
  requiresApproval: boolean;
}

export class DecisionEngine extends EventEmitter {
  private autonomyLevel: number;
  private decisions: Map<string, Decision> = new Map();
  private policies: Map<string, DecisionPolicy> = new Map();
  private decisionHistory: Array<{ context: DecisionContext; decision: Decision; outcome?: string }> = [];

  constructor() {
    super();
    this.autonomyLevel = configManager.autonomyLevel;
    this.initializePolicies();
  }

  private initializePolicies(): void {
    this.policies.set('financial_transfer', {
      actionType: 'financial_transfer',
      maxAutoAmount: 50,
      maxNotifyAmount: 500,
      riskThreshold: 30,
      requiresApproval: true,
    });
    this.policies.set('code_change', {
      actionType: 'code_change',
      maxAutoAmount: 0,
      maxNotifyAmount: 0,
      riskThreshold: 10,
      requiresApproval: true,
    });
    this.policies.set('service_purchase', {
      actionType: 'service_purchase',
      maxAutoAmount: 100,
      maxNotifyAmount: 1000,
      riskThreshold: 40,
      requiresApproval: false,
    });
    this.policies.set('data_access', {
      actionType: 'data_access',
      maxAutoAmount: 1000,
      maxNotifyAmount: 5000,
      riskThreshold: 60,
      requiresApproval: false,
    });
    this.policies.set('agent_creation', {
      actionType: 'agent_creation',
      maxAutoAmount: 0,
      maxNotifyAmount: 200,
      riskThreshold: 20,
      requiresApproval: true,
    });
  }

  decide(context: DecisionContext): Decision {
    const policy = this.policies.get(context.action) || this.getDefaultPolicy();
    const id = crypto.randomUUID();

    let level: DecisionLevel;
    let reason: string;
    let confidence: number;

    // Nivel 4 (PROHIBITED): Acciones irreversibles de alto impacto
    if (context.irreversible && context.financialImpact > 1000) {
      level = DecisionLevel.PROHIBITED;
      reason = 'Accion irreversible con alto impacto financiero requiere supervision humana directa';
      confidence = 0.95;
    }
    // Nivel 3 (APPROVE): Alto riesgo o impacto significativo
    else if (context.riskScore > policy.riskThreshold || context.financialImpact > policy.maxNotifyAmount) {
      level = DecisionLevel.APPROVE;
      reason = `Riesgo ${context.riskScore} supera umbral ${policy.riskThreshold} o impacto financiero significativo`;
      confidence = 0.8;
    }
    // Nivel 2 (NOTIFY): Impacto medio
    else if (context.financialImpact > policy.maxAutoAmount) {
      level = DecisionLevel.NOTIFY;
      reason = `Impacto financiero ${context.financialImpact} supera umbral auto ${policy.maxAutoAmount}`;
      confidence = 0.85;
    }
    // Nivel 1 (AUTO): Rutinario y reversible
    else {
      level = DecisionLevel.AUTO;
      reason = 'Accion rutinaria, reversible, dentro de limites predefinidos';
      confidence = 0.9;
    }

    // Ajustar segun nivel de autonomia del sistema
    if (this.autonomyLevel < 2 && level === DecisionLevel.AUTO) {
      level = DecisionLevel.NOTIFY;
      reason += ' (elevado por nivel de autonomia conservador)';
    }

    const decision: Decision = {
      id,
      level,
      reason,
      razonamiento: this.buildRazonamiento(context, policy, level),
      timeoutMs: level === DecisionLevel.NOTIFY ? 300000 : undefined,
      requiresHuman: level >= DecisionLevel.APPROVE,
      timestamp: Date.now(),
      confidence,
    };

    this.decisions.set(id, decision);
    this.decisionHistory.push({ context, decision });

    // Limitar historial
    if (this.decisionHistory.length > 1000) {
      this.decisionHistory = this.decisionHistory.slice(-500);
    }

    this.emit('decision-made', decision);

    // Aprendizaje: si decisiones similares fueron aprobadas frecuentemente, ajustar
    this.learnFromHistory(context, decision);

    return decision;
  }

  private buildRazonamiento(context: DecisionContext, policy: DecisionPolicy, level: DecisionLevel): string {
    const parts = [
      `Accion: ${context.action}`,
      `Costo estimado: $${context.estimatedCost}`,
      `Riesgo: ${context.riskScore}/100`,
      `Impacto financiero: $${context.financialImpact}`,
      `Irreversible: ${context.irreversible ? 'SI' : 'NO'}`,
      `Politica aplicada: ${policy.actionType}`,
      `Nivel asignado: ${DecisionLevel[level]}`,
      `Confianza: ${(context as any).confidence || 0.85}`,
    ];
    return parts.join(' | ');
  }

  private learnFromHistory(context: DecisionContext, decision: Decision): void {
    const similarDecisions = this.decisionHistory.filter(
      h => h.context.action === context.action && h.decision.level === DecisionLevel.APPROVE
    );

    if (similarDecisions.length > 10) {
      const approvedCount = similarDecisions.filter(h => h.outcome === 'approved').length;
      const approvalRate = approvedCount / similarDecisions.length;

      if (approvalRate > 0.9 && decision.level === DecisionLevel.APPROVE) {
        // Considerar elevar a NOTIFY en el futuro
        this.emit('threshold-suggestion', {
          action: context.action,
          suggestion: 'Considerar elevar a nivel NOTIFY',
          approvalRate,
        });
      }
    }
  }

  humanApprove(decisionId: string, approved: boolean, notes?: string): void {
    const decision = this.decisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} no encontrada`);
    }

    const historyEntry = this.decisionHistory.find(h => h.decision.id === decisionId);
    if (historyEntry) {
      historyEntry.outcome = approved ? 'approved' : 'rejected';
    }

    decision.razonamiento += ` | Humano: ${approved ? 'APROBADO' : 'RECHAZADO'}${notes ? ` (${notes})` : ''}`;

    this.emit('human-decision', { decisionId, approved, notes });

    // Recompensa o penalizacion al sistema
    if (approved) {
      rewardSystem.record('decision-engine', 'human-approval', 'success', { decisionId });
    } else {
      rewardSystem.record('decision-engine', 'human-rejection', 'failure', { decisionId });
    }
  }

  getDecision(id: string): Decision | undefined {
    return this.decisions.get(id);
  }

  getPendingDecisions(): Decision[] {
    return Array.from(this.decisions.values()).filter(d => d.requiresHuman && !d.razonamiento.includes('APROBADO') && !d.razonamiento.includes('RECHAZADO'));
  }

  getDecisionHistory(limit: number = 100): Array<{ context: DecisionContext; decision: Decision; outcome?: string }> {
    return this.decisionHistory.slice(-limit).reverse();
  }

  getStats(): {
    totalDecisions: number;
    autoCount: number;
    notifyCount: number;
    approveCount: number;
    prohibitedCount: number;
    pendingHuman: number;
  } {
    const all = Array.from(this.decisions.values());
    return {
      totalDecisions: all.length,
      autoCount: all.filter(d => d.level === DecisionLevel.AUTO).length,
      notifyCount: all.filter(d => d.level === DecisionLevel.NOTIFY).length,
      approveCount: all.filter(d => d.level === DecisionLevel.APPROVE).length,
      prohibitedCount: all.filter(d => d.level === DecisionLevel.PROHIBITED).length,
      pendingHuman: this.getPendingDecisions().length,
    };
  }

  private getDefaultPolicy(): DecisionPolicy {
    return {
      actionType: 'default',
      maxAutoAmount: 10,
      maxNotifyAmount: 100,
      riskThreshold: 50,
      requiresApproval: true,
    };
  }

  updatePolicy(actionType: string, updates: Partial<DecisionPolicy>): void {
    const existing = this.policies.get(actionType);
    if (existing) {
      this.policies.set(actionType, { ...existing, ...updates });
      this.emit('policy-updated', { actionType, updates });
    }
  }
}

export const decisionEngine = new DecisionEngine();
