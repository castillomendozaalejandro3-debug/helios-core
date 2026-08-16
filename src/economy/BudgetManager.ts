/**
 * BudgetManager - Sistema de Presupuestos Granulares
 * Control financiero por agente, clone, equipo y workflow.
 * Reglas de gasto configurables con proteccion automatica de reservas.
 * v2.2: Persistencia JSON + Batch writes + Logger estructurado
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, writeFile } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';
import { frugalLedger } from '../frugality/FrugalLedger.js';
import { logger } from '../core/Logger.js';

export interface Budget {
  ownerId: string;
  ownerType: 'agent' | 'clone' | 'team' | 'workflow' | 'system';
  total: number;
  spent: number;
  reserved: number;
  dailyLimit: number;
  dailySpent: number;
  lastReset: number;
  rules: BudgetRule[];
  metadata?: Record<string, any>;
  createdAt: number;
}

export interface BudgetRule {
  name: string;
  condition: (budget: Budget, amount: number) => boolean;
  action: 'block' | 'warn' | 'allow';
  message: string;
}

export interface SpendResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  transactionId?: string;
  remaining: number;
}

// ============================================================
// PERSISTENCIA BATCH
// ============================================================

async function writeFileWithRetry(
  filePath: string,
  data: string,
  maxRetries = 5,
  baseDelayMs = 50
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        writeFile(filePath, data, 'utf-8', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return;
    } catch (err: any) {
      const isRetryable = err.code === 'EAGAIN' || err.code === 'EBUSY' || err.code === 'EMFILE';
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

class BatchWriter {
  private pending = false;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;
  private readonly maxPendingOps: number;
  private pendingOps = 0;

  constructor(debounceMs = 5000, maxPendingOps = 20) {
    this.debounceMs = debounceMs;
    this.maxPendingOps = maxPendingOps;
  }

  schedule(writeFn: () => Promise<void>): void {
    this.pendingOps++;
    if (this.pendingOps >= this.maxPendingOps) {
      this.flush(writeFn);
      return;
    }
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.flush(writeFn), this.debounceMs);
  }

  private async flush(writeFn: () => Promise<void>): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    this.pendingOps = 0;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    try {
      await writeFn();
    } catch (err) {
      logger.error('[BudgetManager] Batch write failed', { error: String(err) });
    } finally {
      this.pending = false;
    }
  }

  async forceFlush(writeFn: () => Promise<void>): Promise<void> {
    await this.flush(writeFn);
  }

  destroy(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

// ============================================================
// BUDGET MANAGER
// ============================================================

export class BudgetManager extends EventEmitter {
  private budgets = new Map<string, Budget>();
  private dbPath: string;
  private dirty = false;
  private batchWriter: BatchWriter;

  private readonly defaultRules: BudgetRule[] = [
    {
      name: 'total-exceeded',
      condition: (b, amount) => b.spent + amount > b.total,
      action: 'block',
      message: 'Presupuesto total agotado',
    },
    {
      name: 'reserve-protection',
      condition: (b, amount) => b.spent + amount > b.total - b.reserved,
      action: 'warn',
      message: 'Reserva minima alcanzada - riesgo financiero',
    },
    {
      name: 'daily-limit',
      condition: (b, amount) => b.dailySpent + amount > b.dailyLimit,
      action: 'block',
      message: 'Limite diario excedido',
    },
    {
      name: 'negative-amount',
      condition: (_b, amount) => amount <= 0,
      action: 'block',
      message: 'Monto invalido',
    },
  ];

  constructor() {
    super();
    this.dbPath = resolve(configManager.stateDir, 'budgets.json');
    this.batchWriter = new BatchWriter(5000, 20);
    this.load();
  }

  // --- PERSISTENCIA ---

  private load(): void {
    if (!existsSync(this.dbPath)) {
      logger.info('[BudgetManager] No existe archivo de persistencia, iniciando vacio');
      return;
    }
    try {
      const raw = readFileSync(this.dbPath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const budget of data) {
          // Reconstruir funciones de reglas (no serializables)
          budget.rules = [...this.defaultRules];
          const key = `${budget.ownerType}:${budget.ownerId}`;
          this.budgets.set(key, budget);
        }
        logger.info(`[BudgetManager] ${data.length} presupuestos cargados desde disco`);
      }
    } catch (err) {
      logger.error('[BudgetManager] Error cargando presupuestos', { error: String(err) });
    }
  }

  async save(force = false): Promise<void> {
    if (!force && !this.dirty) return;
    const data = Array.from(this.budgets.values());
    mkdirSync(dirname(this.dbPath), { recursive: true });
    await writeFileWithRetry(this.dbPath, JSON.stringify(data, null, 2));
    this.dirty = false;
    logger.debug('[BudgetManager] Presupuestos guardados en disco', { count: data.length });
  }

  private scheduleSave(): void {
    this.dirty = true;
    this.batchWriter.schedule(() => this.save());
  }

  // ----------------------------------------------------------
  // CREACION DE PRESUPUESTOS
  // ----------------------------------------------------------

  createBudget(
    ownerId: string,
    ownerType: Budget['ownerType'],
    total: number,
    options: {
      reservedRatio?: number;
      dailyLimitRatio?: number;
      customRules?: BudgetRule[];
      metadata?: Record<string, any>;
    } = {}
  ): Budget {
    const key = `${ownerType}:${ownerId}`;
    const reservedRatio = options.reservedRatio ?? 0.3;
    const dailyLimitRatio = options.dailyLimitRatio ?? 0.1;

    const budget: Budget = {
      ownerId,
      ownerType,
      total: Math.max(0, total),
      spent: 0,
      reserved: total * reservedRatio,
      dailyLimit: total * dailyLimitRatio,
      dailySpent: 0,
      lastReset: Date.now(),
      rules: [...this.defaultRules, ...(options.customRules || [])],
      metadata: options.metadata,
      createdAt: Date.now(),
    };

    this.budgets.set(key, budget);
    this.scheduleSave();
    this.emit('budget-created', { ownerId, ownerType, total, reserved: budget.reserved });
    logger.info(`[BudgetManager] Presupuesto creado: ${key} = $${total}`);
    return budget;
  }

  // ----------------------------------------------------------
  // VALIDACION DE GASTO
  // ----------------------------------------------------------

  private resetDailyIfNeeded(budget: Budget): void {
    const oneDay = 24 * 60 * 60 * 1000;
    if (Date.now() - budget.lastReset > oneDay) {
      budget.dailySpent = 0;
      budget.lastReset = Date.now();
      this.emit('daily-reset', { ownerId: budget.ownerId, ownerType: budget.ownerType });
      this.scheduleSave();
    }
  }

  canSpend(ownerId: string, ownerType: string, amount: number): { allowed: boolean; reason?: string; warnings: string[] } {
    const key = `${ownerType}:${ownerId}`;
    const budget = this.budgets.get(key);
    if (!budget) return { allowed: true, warnings: [] };

    this.resetDailyIfNeeded(budget);

    const warnings: string[] = [];
    let blocked = false;
    let blockReason = '';

    for (const rule of budget.rules) {
      if (rule.condition(budget, amount)) {
        if (rule.action === 'block') {
          blocked = true;
          blockReason = rule.message;
        } else if (rule.action === 'warn') {
          warnings.push(rule.message);
        }
      }
    }

    if (blocked) {
      this.emit('spend-blocked', { ownerId, ownerType, amount, reason: blockReason });
      return { allowed: false, reason: blockReason, warnings };
    }

    return { allowed: true, warnings };
  }

  // ----------------------------------------------------------
  // EJECUCION DE GASTO
  // ----------------------------------------------------------

  async spend(ownerId: string, ownerType: string, amount: number, description: string): Promise<SpendResult> {
    const check = this.canSpend(ownerId, ownerType, amount);
    const key = `${ownerType}:${ownerId}`;
    const budget = this.budgets.get(key);

    if (!check.allowed) {
      this.emit('spend-rejected', { ownerId, ownerType, amount, reason: check.reason });
      return { allowed: false, reason: check.reason, warnings: check.warnings, remaining: budget ? budget.total - budget.spent : 0 };
    }

    if (budget) {
      budget.spent += amount;
      budget.dailySpent += amount;
    }

    let transactionId: string | undefined;
    try {
      await frugalLedger.recordExpense(
        amount,
        'budget_spend',
        `${ownerType}_${ownerId}`,
        ownerId,
        {
          estimatedROI: 1.5,
          justification: description,
          metadata: { ownerId, ownerType, budgetKey: key },
        }
      );
      const txs = frugalLedger.getTransactions(1);
      transactionId = txs[0]?.id;
    } catch {
      if (budget) {
        budget.spent -= amount;
        budget.dailySpent -= amount;
      }
      return { allowed: false, reason: 'Error al registrar en ledger', warnings: check.warnings, remaining: budget ? budget.total - budget.spent : 0 };
    }

    this.scheduleSave();
    const remaining = budget ? budget.total - budget.spent : 0;

    this.emit('spend-approved', {
      ownerId,
      ownerType,
      amount,
      remaining,
      warnings: check.warnings,
      transactionId,
    });

    return { allowed: true, warnings: check.warnings, transactionId, remaining };
  }

  // ----------------------------------------------------------
  // CONSULTAS
  // ----------------------------------------------------------

  getBudget(ownerId: string, ownerType: string): Budget | undefined {
    const budget = this.budgets.get(`${ownerType}:${ownerId}`);
    if (budget) this.resetDailyIfNeeded(budget);
    return budget;
  }

  getAllBudgets(): Budget[] {
    return Array.from(this.budgets.values()).map(b => {
      this.resetDailyIfNeeded(b);
      return b;
    });
  }

  getBudgetsByType(ownerType: Budget['ownerType']): Budget[] {
    return this.getAllBudgets().filter(b => b.ownerType === ownerType);
  }

  // ----------------------------------------------------------
  // ESTADISTICAS
  // ----------------------------------------------------------

  getStats(): {
    totalBudgets: number;
    totalAllocated: number;
    totalSpent: number;
    totalRemaining: number;
    activeWarnings: number;
    byType: Record<string, { count: number; allocated: number; spent: number }>;
    persisted: boolean;
  } {
    const budgets = this.getAllBudgets();
    const byType: Record<string, { count: number; allocated: number; spent: number }> = {};

    for (const b of budgets) {
      if (!byType[b.ownerType]) {
        byType[b.ownerType] = { count: 0, allocated: 0, spent: 0 };
      }
      byType[b.ownerType].count++;
      byType[b.ownerType].allocated += b.total;
      byType[b.ownerType].spent += b.spent;
    }

    return {
      totalBudgets: budgets.length,
      totalAllocated: budgets.reduce((s, b) => s + b.total, 0),
      totalSpent: budgets.reduce((s, b) => s + b.spent, 0),
      totalRemaining: budgets.reduce((s, b) => s + (b.total - b.spent), 0),
      activeWarnings: budgets.filter(b => b.spent >= b.total - b.reserved).length,
      byType,
      persisted: existsSync(this.dbPath),
    };
  }

  // ----------------------------------------------------------
  // GESTION
  // ----------------------------------------------------------

  releaseBudget(ownerId: string, ownerType: string): { released: boolean; remaining: number } {
    const key = `${ownerType}:${ownerId}`;
    const budget = this.budgets.get(key);
    if (!budget) return { released: false, remaining: 0 };

    const remaining = budget.total - budget.spent;
    this.budgets.delete(key);
    this.scheduleSave();
    this.emit('budget-released', { ownerId, ownerType, remaining });
    logger.info(`[BudgetManager] Presupuesto liberado: ${key}, remanente: $${remaining}`);
    return { released: true, remaining };
  }

  addToBudget(ownerId: string, ownerType: string, amount: number): boolean {
    const key = `${ownerType}:${ownerId}`;
    const budget = this.budgets.get(key);
    if (!budget) return false;

    budget.total += amount;
    this.scheduleSave();
    this.emit('budget-topped-up', { ownerId, ownerType, amount, newTotal: budget.total });
    return true;
  }

  // ----------------------------------------------------------
  // LIMPIEZA
  // ----------------------------------------------------------

  async destroy(): Promise<void> {
    await this.batchWriter.forceFlush(() => this.save(true));
    this.budgets.clear();
    this.removeAllListeners();
    this.batchWriter.destroy();
    logger.info('[BudgetManager] Destruido y datos persistidos');
  }
}

export const budgetManager = new BudgetManager();
