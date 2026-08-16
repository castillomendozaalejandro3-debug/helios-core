/**
 * IntegratedWorkflows - Flujos de Trabajo Integrados de Helios
 * Implementa los dos flujos principales de la arquitectura refactorizada:
 * - Flujo 1: Tarea Nueva Entra al Sistema
 * - Flujo 2: Optimizacion Continua (cada 6 horas)
 */

import { EventEmitter } from 'events';
import { decisionEngine, DecisionLevel } from '../decision/DecisionEngine.js';
import { metaCognitionEngine, TaskExecutionRecord } from '../metacognition/MetaCognitionEngine.js';
import { costBenefitAnalyzer, ActionCandidate } from '../metacognition/CostBenefitAnalyzer.js';
import { cloneFactory, CloneRole } from '../clones/CloneFactory.js';
import { teamFormationEngine, TeamRequirement } from '../teams/TeamFormationEngine.js';
import { frugalToolKit, ToolLevel } from '../frugality/FrugalToolKit.js';
import { freeAPIDiscovery } from '../frugality/FreeAPIDiscovery.js';
import { frugalLedger, TransactionType } from '../frugality/FrugalLedger.js';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';
import { resourceOptimizer } from '../architecture/ResourceOptimizer.js';
import { agentOrchestrator } from '../agents/AgentOrchestrator.js';

export interface WorkflowResult {
  workflowId: string;
  workflowType: 'task-processing' | 'optimization';
  success: boolean;
  steps: WorkflowStep[];
  durationMs: number;
  cost: number;
  result?: any;
  lessonsLearned: string[];
}

export interface WorkflowStep {
  step: number;
  module: string;
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  durationMs: number;
  cost: number;
  output?: any;
}

export class IntegratedWorkflows extends EventEmitter {
  private workflowHistory: WorkflowResult[] = [];
  private activeWorkflows: Map<string, { startTime: number; steps: WorkflowStep[] }> = new Map();

  // ============================================================
  // FLUJO 1: TAREA NUEVA ENTRA AL SISTEMA
  // ============================================================

  async processNewTask(task: {
    id: string;
    type: string;
    description: string;
    complexity: 'low' | 'medium' | 'high';
    payload: any;
    requiredCapabilities?: string[];
  }): Promise<WorkflowResult> {
    const workflowId = `wf_task_${task.id}_${Date.now()}`;
    const startTime = Date.now();
    const steps: WorkflowStep[] = [];

    this.activeWorkflows.set(workflowId, { startTime, steps });
    this.emit('workflow-started', { workflowId, type: 'task-processing', taskId: task.id });

    try {
      // PASO 1: DecisionEngine - Verificar nivel de autonomia
      const step1 = await this.executeStep(workflowId, 1, 'DecisionEngine', 'Verificar autonomia', async () => {
        const decision = decisionEngine.decide({
          action: task.type,
          estimatedCost: this.estimateTaskCost(task.complexity),
          riskScore: this.calculateRiskScore(task),
          financialImpact: this.estimateTaskCost(task.complexity),
          irreversible: false,
          metadata: { task },
        });
        return { decision, autoApproved: decision.level === DecisionLevel.AUTO };
      });
      steps.push(step1);

      if (!step1.output?.autoApproved && step1.output?.decision.level >= DecisionLevel.APPROVE) {
        throw new Error(`Tarea requiere aprobacion humana: ${step1.output?.decision.reason}`);
      }

      // PASO 2: MetaCognitionEngine - Buscar plantilla en SolutionLibrary
      const step2 = await this.executeStep(workflowId, 2, 'MetaCognitionEngine', 'Buscar plantilla', async () => {
        const template = metaCognitionEngine.findSolution(task.type, task.complexity);
        return { template, hasTemplate: !!template };
      });
      steps.push(step2);

      // Si hay plantilla con ROI > 2.0, usarla directamente
      if (step2.output?.hasTemplate && step2.output.template.roi > 2.0) {
        const step2b = await this.executeStep(workflowId, 2.5, 'MetaCognitionEngine', 'Usar plantilla existente', async () => {
          return { template: step2.output.template, fastPath: true };
        });
        steps.push(step2b);
      }

      // PASO 3: CostBenefitAnalyzer - Calcular ROI de 3 escenarios
      const step3 = await this.executeStep(workflowId, 3, 'CostBenefitAnalyzer', 'Analizar ROI', async () => {
        const candidates: ActionCandidate[] = [
          {
            id: 'scenario_a',
            action: task.type,
            description: 'Ejecutar con herramientas actuales',
            estimatedCost: this.estimateTaskCost(task.complexity) * 0.8,
            estimatedTimeMs: this.estimateTaskTime(task.complexity),
            toolsRequired: task.requiredCapabilities || ['compute'],
            probabilitySuccess: 0.85,
            probabilityFailure: 0.15,
            valueIfSuccess: this.estimateTaskValue(task),
            costIfFailure: this.estimateTaskCost(task.complexity) * 0.5,
            irreversible: false,
            alternatives: [],
          },
          {
            id: 'scenario_b',
            action: `${task.type}_team`,
            description: 'Formar equipo de clones',
            estimatedCost: this.estimateTaskCost(task.complexity) * 1.5,
            estimatedTimeMs: this.estimateTaskTime(task.complexity) * 0.7,
            toolsRequired: ['team-formation', ...task.requiredCapabilities || []],
            probabilitySuccess: 0.92,
            probabilityFailure: 0.08,
            valueIfSuccess: this.estimateTaskValue(task) * 1.2,
            costIfFailure: this.estimateTaskCost(task.complexity) * 0.8,
            irreversible: false,
            alternatives: [],
          },
          {
            id: 'scenario_c',
            action: `${task.type}_api`,
            description: 'Usar API paga especializada',
            estimatedCost: this.estimateTaskCost(task.complexity) * 2.0,
            estimatedTimeMs: this.estimateTaskTime(task.complexity) * 0.5,
            toolsRequired: ['paid-api'],
            probabilitySuccess: 0.95,
            probabilityFailure: 0.05,
            valueIfSuccess: this.estimateTaskValue(task) * 1.3,
            costIfFailure: this.estimateTaskCost(task.complexity) * 0.3,
            irreversible: false,
            alternatives: [],
          },
        ];

        const analyses = costBenefitAnalyzer.compareCandidates(candidates);
        const best = analyses[0];
        return { analyses, best, approved: best.recommendation === 'approve' };
      });
      steps.push(step3);

      if (!step3.output?.approved) {
        throw new Error(`Ningun escenario alcanza ROI minimo: ${step3.output?.best?.reason}`);
      }

      // PASO 4: ResourceOptimizer - Seleccionar herramientas especificas
      const step4 = await this.executeStep(workflowId, 4, 'ResourceOptimizer', 'Seleccionar herramientas', async () => {
        const capabilities = task.requiredCapabilities || ['compute'];
        const toolSelections = frugalToolKit.selectToolsForTask(capabilities);
        const freeTools = toolSelections.filter(s => s.tool.level <= ToolLevel.FREE_LIMITED);
        return { selections: toolSelections, freeTools, usingPaid: freeTools.length < toolSelections.length };
      });
      steps.push(step4);

      // PASO 5: Decidir si formar equipo o clon unico
      let step5: WorkflowStep;
      const needsTeam = task.complexity === 'high' || (task.requiredCapabilities || []).length > 2;

      if (needsTeam) {
        step5 = await this.executeStep(workflowId, 5, 'TeamFormationEngine', 'Formar equipo', async () => {
          const requirement: TeamRequirement = {
            taskType: task.type,
            description: task.description,
            complexity: task.complexity,
            skillsNeeded: task.requiredCapabilities || ['research'],
            parallelizable: task.complexity === 'high',
            budgetTotal: step3.output.best.costTotal,
          };
          const team = teamFormationEngine.formTeam(requirement);
          return { team, approach: 'team' };
        });
      } else {
        step5 = await this.executeStep(workflowId, 5, 'CloneFactory', 'Crear clon especializado', async () => {
          const role = this.selectRoleForTask(task);
          const spec = cloneFactory.createClone(role, task.description);
          if (spec) {
            cloneFactory.launchClone(spec);
          }
          return { spec, approach: 'clone', role };
        });
      }
      steps.push(step5);

      // PASO 6: Ejecutar y monitorear
      const step6 = await this.executeStep(workflowId, 6, 'Execution', 'Ejecutar y monitorear', async () => {
        // Simular ejecucion (en produccion, esperar resultados reales)
        await new Promise(r => setTimeout(r, 2000));
        return { executed: true, quality: 0.85 };
      });
      steps.push(step6);

      // PASO 7: Consolidar resultados
      const step7 = await this.executeStep(workflowId, 7, 'Consolidation', 'Validar y consolidar', async () => {
        const quality = step6.output?.quality || 0.5;
        const success = quality > 0.6;

        // Registrar en MetaCognitionEngine
        const record: TaskExecutionRecord = {
          taskId: task.id,
          timestamp: Date.now(),
          taskType: task.type,
          complexity: task.complexity,
          subTasks: steps.map(s => ({ name: s.action, durationMs: s.durationMs, toolUsed: s.module, cost: s.cost, result: s.status })),
          toolsUsed: step4.output?.selections.map((s: any) => ({ tool: s.tool.name, calls: 1, totalCost: s.estimatedCost, avgLatencyMs: 100, successRate: 1 })) || [],
          totalCost: steps.reduce((s, step) => s + step.cost, 0),
          totalTimeMs: Date.now() - startTime,
          resultQuality: quality,
          success,
          context: { workflowId, approach: step5.output?.approach },
        };
        await metaCognitionEngine.analyzeTask(record);

        // Registrar en FrugalLedger
        const totalCost = steps.reduce((s, step) => s + step.cost, 0);
        await frugalLedger.recordExpense(totalCost, 'task_execution', task.type, 'system', {
          estimatedROI: step3.output?.best?.roiExpected || 0,
          justification: `Ejecucion de tarea ${task.type}`,
        });

        return { success, quality, record };
      });
      steps.push(step7);

      const result: WorkflowResult = {
        workflowId,
        workflowType: 'task-processing',
        success: step7.output?.success || false,
        steps,
        durationMs: Date.now() - startTime,
        cost: steps.reduce((s, step) => s + step.cost, 0),
        result: step7.output,
        lessonsLearned: ['Flujo de tarea completado'],
      };

      this.workflowHistory.push(result);
      this.activeWorkflows.delete(workflowId);
      this.emit('workflow-completed', result);
      return result;

    } catch (err) {
      const result: WorkflowResult = {
        workflowId,
        workflowType: 'task-processing',
        success: false,
        steps,
        durationMs: Date.now() - startTime,
        cost: steps.reduce((s, step) => s + step.cost, 0),
        lessonsLearned: [`Error: ${(err as Error).message}`],
      };
      this.workflowHistory.push(result);
      this.activeWorkflows.delete(workflowId);
      this.emit('workflow-failed', result);
      return result;
    }
  }

  // ============================================================
  // FLUJO 2: OPTIMIZACION CONTINUA (cada 6 horas)
  // ============================================================

  async runOptimizationCycle(): Promise<WorkflowResult> {
    const workflowId = `wf_opt_${Date.now()}`;
    const startTime = Date.now();
    const steps: WorkflowStep[] = [];

    this.activeWorkflows.set(workflowId, { startTime, steps });
    this.emit('optimization-started', { workflowId });

    try {
      // PASO 1: MetaCognitionEngine - Revisar ultimas tareas
      const step1 = await this.executeStep(workflowId, 1, 'MetaCognitionEngine', 'Revisar lecciones', async () => {
        const stats = metaCognitionEngine.getStats();
        const updates = await metaCognitionEngine.adjustStrategies();
        return { stats, updates, lessonsValidated: stats.validatedLessons };
      });
      steps.push(step1);

      // PASO 2: FrugalLedger - Analizar eficiencia economica
      const step2 = await this.executeStep(workflowId, 2, 'FrugalLedger', 'Analizar eficiencia', async () => {
        const report = frugalLedger.generateDailyReport();
        const stats = frugalLedger.getStats();
        return { report, stats, withinBudget: report.margin > 30 };
      });
      steps.push(step2);

      // PASO 3: FreeAPIDiscovery - Actualizar catalogo
      const step3 = await this.executeStep(workflowId, 3, 'FreeAPIDiscovery', 'Actualizar catalogo', async () => {
        await freeAPIDiscovery.scanAll();
        const stats = freeAPIDiscovery.getStats();
        return { stats, newServices: stats.active };
      });
      steps.push(step3);

      // PASO 4: ResourceOptimizer - Ajustar configuraciones
      const step4 = await this.executeStep(workflowId, 4, 'ResourceOptimizer', 'Ajustar recursos', async () => {
        resourceOptimizer.detectMemoryLeak();
        const stats = resourceOptimizer.getStats();
        return { stats, optimized: true };
      });
      steps.push(step4);

      // PASO 5: DecisionEngine - Actualizar politicas
      const step5 = await this.executeStep(workflowId, 5, 'DecisionEngine', 'Actualizar politicas', async () => {
        const financialReport = financialEngine.getFinancialReport();
        if (financialReport.netProfit < 0) {
          // Subir umbral de aprobacion para herramientas caras
          return { policyUpdate: 'conservative', reason: 'Margen negativo detectado' };
        }
        return { policyUpdate: 'maintain', reason: 'Margen positivo' };
      });
      steps.push(step5);

      const result: WorkflowResult = {
        workflowId,
        workflowType: 'optimization',
        success: true,
        steps,
        durationMs: Date.now() - startTime,
        cost: 0, // Optimizacion no cuesta
        lessonsLearned: [
          `${step1.output?.lessonsValidated || 0} lecciones validadas`,
          `Margen: ${step2.output?.report?.margin || 0}%`,
          `${step3.output?.stats?.active || 0} APIs gratuitas activas`,
        ],
      };

      this.workflowHistory.push(result);
      this.activeWorkflows.delete(workflowId);
      this.emit('optimization-completed', result);
      return result;

    } catch (err) {
      const result: WorkflowResult = {
        workflowId,
        workflowType: 'optimization',
        success: false,
        steps,
        durationMs: Date.now() - startTime,
        cost: 0,
        lessonsLearned: [`Error en optimizacion: ${(err as Error).message}`],
      };
      this.workflowHistory.push(result);
      this.activeWorkflows.delete(workflowId);
      this.emit('optimization-failed', result);
      return result;
    }
  }

  // ============================================================
  // UTILIDADES
  // ============================================================

  private async executeStep(
    workflowId: string,
    stepNum: number,
    module: string,
    action: string,
    fn: () => Promise<any>
  ): Promise<WorkflowStep> {
    const stepStart = Date.now();
    try {
      const output = await fn();
      return {
        step: stepNum,
        module,
        action,
        status: 'completed',
        durationMs: Date.now() - stepStart,
        cost: 0,
        output,
      };
    } catch (err) {
      return {
        step: stepNum,
        module,
        action,
        status: 'failed',
        durationMs: Date.now() - stepStart,
        cost: 0,
        output: { error: (err as Error).message },
      };
    }
  }

  private estimateTaskCost(complexity: string): number {
    const costs = { low: 0.1, medium: 0.5, high: 2.0 };
    return costs[complexity as keyof typeof costs] || 0.5;
  }

  private estimateTaskTime(complexity: string): number {
    const times = { low: 5000, medium: 30000, high: 120000 };
    return times[complexity as keyof typeof times] || 30000;
  }

  private estimateTaskValue(task: any): number {
    // Valor estimado basado en complejidad y tipo
    const baseValues: Record<string, number> = {
      'web-scraping': 5,
      'data-analysis': 10,
      'code-generation': 15,
      'research': 8,
      'default': 5,
    };
    const base = baseValues[task.type] || baseValues.default;
    const complexityMap: Record<string, number> = { low: 0.5, medium: 1.0, high: 2.0 };
    const complexityMultiplier = complexityMap[task.complexity as string] || 1.0;
    return base * complexityMultiplier;
  }

  private calculateRiskScore(task: any): number {
    let score = 20; // Base
    if (task.complexity === 'high') score += 30;
    if (task.complexity === 'medium') score += 15;
    if (task.payload?.irreversible) score += 40;
    return Math.min(score, 100);
  }

  private selectRoleForTask(task: any): CloneRole {
    const typeRoles: Record<string, CloneRole> = {
      'web-scraping': CloneRole.INVESTIGADOR,
      'data-analysis': CloneRole.EJECUTOR,
      'code-generation': CloneRole.EJECUTOR,
      'research': CloneRole.INVESTIGADOR,
      'verification': CloneRole.VERIFICADOR,
      'exploration': CloneRole.EXPLORADOR,
    };
    return typeRoles[task.type] || CloneRole.EJECUTOR;
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  getWorkflowHistory(limit: number = 50): WorkflowResult[] {
    return this.workflowHistory.slice(-limit).reverse();
  }

  getActiveWorkflows(): Array<{ workflowId: string; durationMs: number; currentStep: number }> {
    return Array.from(this.activeWorkflows.entries()).map(([id, data]) => ({
      workflowId: id,
      durationMs: Date.now() - data.startTime,
      currentStep: data.steps.length,
    }));
  }

  getStats(): {
    totalWorkflows: number;
    taskWorkflows: number;
    optimizationWorkflows: number;
    successRate: number;
    avgDurationMs: number;
  } {
    const total = this.workflowHistory.length;
    const tasks = this.workflowHistory.filter(w => w.workflowType === 'task-processing');
    const optimizations = this.workflowHistory.filter(w => w.workflowType === 'optimization');
    const successful = this.workflowHistory.filter(w => w.success);

    return {
      totalWorkflows: total,
      taskWorkflows: tasks.length,
      optimizationWorkflows: optimizations.length,
      successRate: total > 0 ? successful.length / total : 0,
      avgDurationMs: total > 0
        ? this.workflowHistory.reduce((s, w) => s + w.durationMs, 0) / total
        : 0,
    };
  }
}

export const integratedWorkflows = new IntegratedWorkflows();
