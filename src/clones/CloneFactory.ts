/**
 * CloneFactory - Sistema de Clonacion de Helios
 * Crea instancias efimeras con presupuesto asignado, memoria aislada,
 * y auto-destruccion al completar tarea.
 */

import { EventEmitter } from 'events';
import { fork, ChildProcess } from 'child_process';
import { configManager } from '../config/ConfigManager.js';
import { costBenefitAnalyzer, BudgetAllocation } from '../metacognition/CostBenefitAnalyzer.js';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';
import { metaCognitionEngine, TaskExecutionRecord } from '../metacognition/MetaCognitionEngine.js';

export enum CloneRole {
  INVESTIGADOR = 'investigador',
  EJECUTOR = 'ejecutor',
  VERIFICADOR = 'verificador',
  EXPLORADOR = 'explorador',
  SINTETIZADOR = 'sintetizador',
  FRUGAL = 'frugal',
}

export interface CloneSpec {
  id: string;
  name: string;
  role: CloneRole;
  taskDescription: string;
  budget: {
    tokens: number;
    cpuTimeMs: number;
    memoryMB: number;
  };
  ttlMs: number;
  parentId: string;
  sharedKnowledge: boolean; // acceso READ-ONLY a memoria global
}

export interface CloneResult {
  cloneId: string;
  success: boolean;
  result: any;
  quality: number; // 0-1
  costUsed: number;
  timeUsedMs: number;
  lessonsLearned: string[];
  destroyedAt: number;
}

interface RunningClone {
  process: ChildProcess;
  spec: CloneSpec;
  startedAt: number;
  costUsed: number;
  status: 'starting' | 'running' | 'paused' | 'completed' | 'destroyed';
  result?: CloneResult;
  efficiencyScore: number;
}

export class CloneFactory extends EventEmitter {
  private clones: Map<string, RunningClone> = new Map();
  private results: Map<string, CloneResult> = new Map();
  private efficiencyScores: Map<string, number> = new Map();
  private maxConcurrentClones = 5;
  private totalClonesCreated = 0;

  // Presupuestos por rol
  private roleBudgets: Record<CloneRole, { tokens: number; cpuTimeMs: number; memoryMB: number; ttlMs: number }> = {
    [CloneRole.INVESTIGADOR]: { tokens: 500, cpuTimeMs: 5 * 60 * 1000, memoryMB: 256, ttlMs: 15 * 60 * 1000 },
    [CloneRole.EJECUTOR]: { tokens: 2000, cpuTimeMs: 15 * 60 * 1000, memoryMB: 512, ttlMs: 30 * 60 * 1000 },
    [CloneRole.VERIFICADOR]: { tokens: 300, cpuTimeMs: 3 * 60 * 1000, memoryMB: 128, ttlMs: 10 * 60 * 1000 },
    [CloneRole.EXPLORADOR]: { tokens: 100, cpuTimeMs: 2 * 60 * 1000, memoryMB: 128, ttlMs: 5 * 60 * 1000 },
    [CloneRole.SINTETIZADOR]: { tokens: 800, cpuTimeMs: 8 * 60 * 1000, memoryMB: 256, ttlMs: 20 * 60 * 1000 },
    [CloneRole.FRUGAL]: { tokens: 200, cpuTimeMs: 5 * 60 * 1000, memoryMB: 128, ttlMs: 15 * 60 * 1000 },
  };

  // ----------------------------------------------------------
  // CREACION DE CLONES
  // ----------------------------------------------------------

  createClone(role: CloneRole, taskDescription: string, parentId: string = 'helios-principal'): CloneSpec | null {
    if (this.clones.size >= this.maxConcurrentClones) {
      this.emit('clone-rejected', { reason: 'max_concurrent_reached', max: this.maxConcurrentClones });
      return null;
    }

    // Verificar presupuesto disponible
    const budget = costBenefitAnalyzer.allocateBudget(1, 'medium');
    if (budget.allocated <= 0) {
      this.emit('clone-rejected', { reason: 'insufficient_budget' });
      return null;
    }

    const roleBudget = this.roleBudgets[role];
    const cloneId = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const spec: CloneSpec = {
      id: cloneId,
      name: `${role}_${this.totalClonesCreated++}`,
      role,
      taskDescription,
      budget: {
        tokens: Math.min(roleBudget.tokens, budget.perClone[Object.keys(budget.perClone)[0]] || roleBudget.tokens),
        cpuTimeMs: roleBudget.cpuTimeMs,
        memoryMB: roleBudget.memoryMB,
      },
      ttlMs: roleBudget.ttlMs,
      parentId,
      sharedKnowledge: true,
    };

    return spec;
  }

  launchClone(spec: CloneSpec): boolean {
    try {
      // Crear script temporal para el clon
      const cloneScript = this.generateCloneScript(spec);

      const child = fork(cloneScript, [], {
        env: {
          ...process.env,
          CLONE_ID: spec.id,
          CLONE_ROLE: spec.role,
          CLONE_TASK: spec.taskDescription,
          CLONE_BUDGET_TOKENS: String(spec.budget.tokens),
          CLONE_BUDGET_TIME: String(spec.budget.cpuTimeMs),
          CLONE_PARENT: spec.parentId,
        },
        execArgv: [`--max-old-space-size=${spec.budget.memoryMB}`],
        silent: true,
      });

      const running: RunningClone = {
        process: child,
        spec,
        startedAt: Date.now(),
        costUsed: 0,
        status: 'starting',
        efficiencyScore: this.efficiencyScores.get(spec.role) || 1.0,
      };

      // Manejar mensajes del clon
      child.on('message', (msg: any) => {
        this.handleCloneMessage(spec.id, msg);
      });

      // Manejar salida
      child.on('exit', (code) => {
        this.handleCloneExit(spec.id, code);
      });

      child.on('error', (err) => {
        this.handleCloneError(spec.id, err);
      });

      // Timer de TTL
      const ttlTimer = setTimeout(() => {
        this.destroyClone(spec.id, 'ttl_exceeded');
      }, spec.ttlMs);

      // Guardar referencia al timer
      (running as any).ttlTimer = ttlTimer;

      running.status = 'running';
      this.clones.set(spec.id, running);

      this.emit('clone-launched', { cloneId: spec.id, role: spec.role, task: spec.taskDescription });
      return true;
    } catch (err) {
      this.emit('clone-launch-failed', { cloneId: spec.id, error: (err as Error).message });
      return false;
    }
  }

  // ----------------------------------------------------------
  // GESTION DE CICLO DE VIDA
  // ----------------------------------------------------------

  async destroyClone(cloneId: string, reason: string): Promise<void> {
    const clone = this.clones.get(cloneId);
    if (!clone || clone.status === 'destroyed') return;

    // Cancelar timer TTL
    if ((clone as any).ttlTimer) {
      clearTimeout((clone as any).ttlTimer);
    }

    // Calcular eficiencia
    const timeUsed = Date.now() - clone.startedAt;
    const budgetUsed = clone.costUsed;
    const budgetTotal = clone.spec.budget.tokens;
    const efficiency = this.calculateEfficiency(clone, timeUsed, budgetUsed);

    // Actualizar score historico
    const currentScore = this.efficiencyScores.get(clone.spec.role) || 1.0;
    const newScore = (currentScore * 0.7) + (efficiency * 0.3);
    this.efficiencyScores.set(clone.spec.role, newScore);

    // Ajustar presupuesto futuro basado en eficiencia
    if (efficiency > 1.2) {
      this.roleBudgets[clone.spec.role].tokens *= 1.1; // +10%
    } else if (efficiency < 0.8) {
      this.roleBudgets[clone.spec.role].tokens *= 0.8; // -20%
    }

    // Destruir proceso
    clone.process.kill('SIGTERM');
    setTimeout(() => {
      if (!clone.process.killed) {
        clone.process.kill('SIGKILL');
      }
    }, 5000);

    clone.status = 'destroyed';

    const result: CloneResult = {
      cloneId,
      success: clone.result?.success || false,
      result: clone.result?.result || null,
      quality: clone.result?.quality || 0,
      costUsed: budgetUsed,
      timeUsedMs: timeUsed,
      lessonsLearned: clone.result?.lessonsLearned || [],
      destroyedAt: Date.now(),
    };

    this.results.set(cloneId, result);

    // Registrar en MetaCognitionEngine
    const record: TaskExecutionRecord = {
      taskId: cloneId,
      timestamp: Date.now(),
      taskType: clone.spec.role,
      complexity: 'medium',
      subTasks: [],
      toolsUsed: [],
      totalCost: budgetUsed,
      totalTimeMs: timeUsed,
      resultQuality: result.quality,
      success: result.success,
      context: { reason, efficiency, role: clone.spec.role },
    };
    await metaCognitionEngine.analyzeTask(record);

    // Devolver presupuesto no usado
    const remaining = Math.max(budgetTotal - budgetUsed, 0);
    if (remaining > 0) {
      this.emit('budget-returned', { cloneId, amount: remaining });
    }

    this.emit('clone-destroyed', { cloneId, reason, efficiency, result });

    // Limpiar
    this.clones.delete(cloneId);
  }

  pauseClone(cloneId: string): boolean {
    const clone = this.clones.get(cloneId);
    if (!clone || clone.status !== 'running') return false;
    clone.status = 'paused';
    clone.process.kill('SIGSTOP');
    this.emit('clone-paused', { cloneId });
    return true;
  }

  resumeClone(cloneId: string): boolean {
    const clone = this.clones.get(cloneId);
    if (!clone || clone.status !== 'paused') return false;
    clone.status = 'running';
    clone.process.kill('SIGCONT');
    this.emit('clone-resumed', { cloneId });
    return true;
  }

  // ----------------------------------------------------------
  // COMUNICACION CON CLONES
  // ----------------------------------------------------------

  sendToClone(cloneId: string, message: any): boolean {
    const clone = this.clones.get(cloneId);
    if (!clone || clone.status !== 'running') return false;
    clone.process.send(message);
    return true;
  }

  private handleCloneMessage(cloneId: string, msg: any): void {
    const clone = this.clones.get(cloneId);
    if (!clone) return;

    switch (msg.type) {
      case 'progress':
        clone.costUsed = msg.costUsed || clone.costUsed;
        // Alerta si excede 80% del presupuesto
        if (clone.costUsed > clone.spec.budget.tokens * 0.8) {
          this.emit('clone-budget-warning', { cloneId, used: clone.costUsed, total: clone.spec.budget.tokens });
        }
        // Auto-pausa si excede 100%
        if (clone.costUsed > clone.spec.budget.tokens) {
          this.pauseClone(cloneId);
          this.emit('clone-budget-exceeded', { cloneId });
        }
        break;

      case 'result':
        clone.result = {
          cloneId,
          success: msg.success,
          result: msg.data,
          quality: msg.quality || 0.5,
          costUsed: msg.costUsed || clone.costUsed,
          timeUsedMs: Date.now() - clone.startedAt,
          lessonsLearned: msg.lessons || [],
          destroyedAt: 0,
        };
        clone.status = 'completed';
        this.emit('clone-completed', { cloneId, result: clone.result });
        // Auto-destruir tras completar
        setTimeout(() => this.destroyClone(cloneId, 'task_completed'), 1000);
        break;

      case 'error':
        this.emit('clone-error', { cloneId, error: msg.error });
        break;
    }
  }

  private handleCloneExit(cloneId: string, code: number | null): void {
    const clone = this.clones.get(cloneId);
    if (!clone) return;

    if (code !== 0 && clone.status !== 'destroyed') {
      this.emit('clone-crashed', { cloneId, code });
      this.destroyClone(cloneId, `crashed_with_code_${code}`);
    }
  }

  private handleCloneError(cloneId: string, err: Error): void {
    this.emit('clone-error', { cloneId, error: err.message });
    this.destroyClone(cloneId, 'process_error');
  }

  // ----------------------------------------------------------
  // GENERACION DE SCRIPTS DE CLON
  // ----------------------------------------------------------

  private generateCloneScript(spec: CloneSpec): string {
    // Script inline que el clon ejecuta
    const script = `
const cloneId = process.env.CLONE_ID;
const role = process.env.CLONE_ROLE;
const task = process.env.CLONE_TASK;
const budgetTokens = parseInt(process.env.CLONE_BUDGET_TOKENS);
const budgetTime = parseInt(process.env.CLONE_BUDGET_TIME);

console.log(\`[\${cloneId}] Clon \${role} iniciado. Tarea: \${task}\`);

// Simular trabajo del clon
async function execute() {
  const startTime = Date.now();
  let costUsed = 0;
  
  try {
    // Reportar progreso periodicamente
    const progressInterval = setInterval(() => {
      costUsed += Math.random() * 10;
      if (process.send) {
        process.send({ type: 'progress', costUsed: Math.round(costUsed) });
      }
    }, 2000);
    
    // Simular tiempo de trabajo proporcional a complejidad
    const workTime = Math.min(budgetTime * 0.6, 10000);
    await new Promise(r => setTimeout(r, workTime));
    
    clearInterval(progressInterval);
    
    // Generar resultado
    const success = Math.random() > 0.1; // 90% tasa de exito
    const quality = success ? 0.7 + Math.random() * 0.3 : 0.1 + Math.random() * 0.3;
    
    if (process.send) {
      process.send({
        type: 'result',
        success,
        data: \`Resultado de \${role}: \${task} (costo: \${Math.round(costUsed)} tokens)\`,
        quality,
        costUsed: Math.round(costUsed),
        lessons: success ? ['Estrategia efectiva identificada'] : ['Fallo por timeout'],
      });
    }
    
    console.log(\`[\${cloneId}] Completado. Exito: \${success}, Calidad: \${quality.toFixed(2)}\`);
  } catch (err) {
    if (process.send) {
      process.send({ type: 'error', error: err.message });
    }
  }
}

execute();
`;
    // En produccion, esto se escribiria a un archivo temporal
    // Por simplicidad, retornamos un path a un template existente
    return './src/agents/templates/monitor-agent.js';
  }

  // ----------------------------------------------------------
  // EFICIENCIA
  // ----------------------------------------------------------

  private calculateEfficiency(clone: RunningClone, timeUsed: number, budgetUsed: number): number {
    const quality = clone.result?.quality || 0;
    const budgetRatio = 1 - (budgetUsed / Math.max(clone.spec.budget.tokens, 1));
    const timeRatio = 1 - (timeUsed / Math.max(clone.spec.ttlMs, 1));

    // Formula: calidad * 0.5 + ahorro_presupuesto * 0.3 + velocidad * 0.2
    return (quality * 0.5) + (budgetRatio * 0.3) + (timeRatio * 0.2);
  }

  // ----------------------------------------------------------
  // CONSULTAS
  // ----------------------------------------------------------

  getClone(cloneId: string): RunningClone | undefined {
    return this.clones.get(cloneId);
  }

  getResult(cloneId: string): CloneResult | undefined {
    return this.results.get(cloneId);
  }

  listActiveClones(): Array<{
    id: string;
    name: string;
    role: string;
    status: string;
    costUsed: number;
    budgetTotal: number;
    uptime: number;
  }> {
    return Array.from(this.clones.values()).map(c => ({
      id: c.spec.id,
      name: c.spec.name,
      role: c.spec.role,
      status: c.status,
      costUsed: Math.round(c.costUsed * 100) / 100,
      budgetTotal: c.spec.budget.tokens,
      uptime: Date.now() - c.startedAt,
    }));
  }

  getStats(): {
    totalCreated: number;
    active: number;
    destroyed: number;
    avgEfficiency: number;
    budgetReturned: number;
  } {
    const results = Array.from(this.results.values());
    const efficiencies = Array.from(this.efficiencyScores.values());
    return {
      totalCreated: this.totalClonesCreated,
      active: this.clones.size,
      destroyed: results.length,
      avgEfficiency: efficiencies.length > 0
        ? efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length
        : 0,
      budgetReturned: results.reduce((s, r) => s + Math.max(r.costUsed - 0, 0), 0),
    };
  }
}

export const cloneFactory = new CloneFactory();
