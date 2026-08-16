/**
 * FrugalLedger - Contabilidad Estricta de Helios
 * Registra cada centavo con ROI estimado y real, análisis de eficiencia,
 * y reportes automáticos con proyecciones.
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, writeFile } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';

// ============================================================
// HELPERS ASYNC CON RETRY Y BACKOFF
// ============================================================

async function writeFileWithRetry(
  path: string,
  data: string,
  maxRetries = 5,
  baseDelayMs = 50
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        writeFile(path, data, 'utf-8', (err) => {
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

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  INVESTMENT = 'investment',
  SAVINGS = 'savings',
}

export interface Transaction {
  id: string;
  timestamp: number;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  subcategory: string;
  entity: string;
  taskId?: string;
  cloneId?: string;
  estimatedROI: number;
  actualROI?: number;
  alternativeConsidered?: string;
  justification: string;
  approvedBy: 'auto' | 'human' | 'principal';
  metadata?: Record<string, any>;
}

export interface DailyReport {
  date: string;
  income: number;
  expenses: number;
  investments: number;
  savings: number;
  netBalance: number;
  margin: number;
  freeToolsUsed: number;
  paidToolsUsed: number;
  cloneEfficiency: number;
  lessonsApplied: number;
  apisAvoided: number;
  alerts: string[];
  projection: {
    breakEvenDays: number;
    reserveDays: number;
    trend: 'improving' | 'stable' | 'degrading';
  };
}

export interface SpendingRule {
  name: string;
  condition: (ledger: FrugalLedger) => boolean;
  action: 'block' | 'warn' | 'allow';
  message: string;
}

export class FrugalLedger extends EventEmitter {
  private ledgerPath: string;
  private transactions: Transaction[] = [];
  private balance: number;
  private minimumReserve: number;
  private dailySpendingLimit: number;
  private dailySpent: number = 0;
  private lastReset: number = Date.now();
  private dirty = false;

  // Reglas de gasto
  private rules: SpendingRule[] = [
    {
      name: '70/30 Rule',
      condition: (l) => l.getDailyPaidRatio() > 0.30,
      action: 'block',
      message: 'Máximo 30% del presupuesto diario en APIs pagadas excedido',
    },
    {
      name: 'ROI Mínimo',
      condition: (l) => false, // Evaluado por llamada
      action: 'block',
      message: 'Ninguna API paga sin ROI estimado > 1.5',
    },
    {
      name: 'Reserva Mínima',
      condition: (l) => l.getReserveCoverage() < 14,
      action: 'warn',
      message: 'Reserva por debajo de 14 días de operación',
    },
    {
      name: 'Alternativa Obligatoria',
      condition: (l) => false, // Evaluado por llamada
      action: 'block',
      message: 'Documentar alternativa gratis antes de pagar',
    },
  ];

  constructor() {
    super();
    this.ledgerPath = resolve(configManager.stateDir, 'frugal-ledger.json');
    this.balance = configManager.config.HELIOS_INITIAL_BALANCE;
    this.minimumReserve = this.balance * 0.3;
    this.dailySpendingLimit = this.balance * 0.1; // 10% diario máximo
    this.load();
  }

  private load(): void {
    if (existsSync(this.ledgerPath)) {
      try {
        const data = JSON.parse(readFileSync(this.ledgerPath, 'utf-8'));
        this.transactions = data.transactions || [];
        this.balance = data.balance ?? this.balance;
        this.dailySpent = data.dailySpent ?? 0;
        this.lastReset = data.lastReset ?? Date.now();
        this.recalculateBalance();
      } catch {
        console.warn('[FrugalLedger] Ledger corrupto, inicializando nuevo');
      }
    }
  }

  private async save(): Promise<void> {
    if (!this.dirty) return;
    ensureDir(this.ledgerPath);
    const data = JSON.stringify({
      transactions: this.transactions,
      balance: this.balance,
      dailySpent: this.dailySpent,
      lastReset: this.lastReset,
      updatedAt: Date.now(),
    }, null, 2);
    await writeFileWithRetry(this.ledgerPath, data);
    this.dirty = false;
  }

  private recalculateBalance(): void {
    this.balance = this.transactions.reduce((acc, t) => {
      if (t.type === TransactionType.INCOME) return acc + t.amount;
      if (t.type === TransactionType.EXPENSE || t.type === TransactionType.INVESTMENT) return acc - t.amount;
      return acc;
    }, configManager.config.HELIOS_INITIAL_BALANCE);
  }

  private resetDailyIfNeeded(): void {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    if (now - this.lastReset > oneDay) {
      this.dailySpent = 0;
      this.lastReset = now;
      this.dailySpendingLimit = this.balance * 0.1;
      this.dirty = true;
      this.save().catch(() => {});
    }
  }

  // ----------------------------------------------------------
  // REGISTRO DE TRANSACCIONES
  // ----------------------------------------------------------

  async recordIncome(
    amount: number,
    category: string,
    subcategory: string,
    entity: string,
    options: {
      taskId?: string;
      justification?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const tx: Transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: TransactionType.INCOME,
      amount,
      currency: configManager.config.HELIOS_CURRENCY,
      category,
      subcategory,
      entity,
      taskId: options.taskId,
      estimatedROI: 0,
      justification: options.justification || `Ingreso: ${category}`,
      approvedBy: 'auto',
      metadata: options.metadata,
    };

    this.transactions.push(tx);
    this.balance += amount;
    this.dirty = true;
    await this.save();

    this.emit('income-recorded', { amount, newBalance: this.balance, category });
  }

  async recordExpense(
    amount: number,
    category: string,
    subcategory: string,
    entity: string,
    options: {
      taskId?: string;
      cloneId?: string;
      estimatedROI?: number;
      alternativeConsidered?: string;
      justification?: string;
      approvedBy?: 'auto' | 'human' | 'principal';
      metadata?: Record<string, any>;
    } = {}
  ): Promise<{ approved: boolean; reason?: string; transaction?: Transaction }> {
    this.resetDailyIfNeeded();

    // Verificar reglas
    const estimatedROI = options.estimatedROI ?? 0;
    if (estimatedROI < 1.5 && amount > 0) {
      return {
        approved: false,
        reason: `ROI estimado ${estimatedROI.toFixed(2)} < 1.5. Requiere justificación adicional.`,
      };
    }

    if (this.dailySpent + amount > this.dailySpendingLimit) {
      return {
        approved: false,
        reason: `Límite diario excedido: $${this.dailySpent.toFixed(2)} + $${amount.toFixed(2)} > $${this.dailySpendingLimit.toFixed(2)}`,
      };
    }

    if (this.balance - amount < this.minimumReserve) {
      return {
        approved: false,
        reason: `Reserva mínima protegida: balance $${this.balance.toFixed(2)} - reserva $${this.minimumReserve.toFixed(2)}`,
      };
    }

    const tx: Transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: TransactionType.EXPENSE,
      amount,
      currency: configManager.config.HELIOS_CURRENCY,
      category,
      subcategory,
      entity,
      taskId: options.taskId,
      cloneId: options.cloneId,
      estimatedROI,
      alternativeConsidered: options.alternativeConsidered || 'Ninguna documentada',
      justification: options.justification || `Gasto: ${category}`,
      approvedBy: options.approvedBy || 'auto',
      metadata: options.metadata,
    };

    this.transactions.push(tx);
    this.balance -= amount;
    this.dailySpent += amount;
    this.dirty = true;
    await this.save();

    this.emit('expense-recorded', { amount, newBalance: this.balance, category, entity });
    return { approved: true, transaction: tx };
  }

  async recordInvestment(
    amount: number,
    category: string,
    subcategory: string,
    entity: string,
    options: {
      estimatedROI?: number;
      justification?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<{ approved: boolean; reason?: string; transaction?: Transaction }> {
    if ((options.estimatedROI ?? 0) < 2.0) {
      return {
        approved: false,
        reason: `Inversión requiere ROI estimado >= 2.0. Proporcionado: ${(options.estimatedROI ?? 0).toFixed(2)}`,
      };
    }

    const tx: Transaction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: TransactionType.INVESTMENT,
      amount,
      currency: configManager.config.HELIOS_CURRENCY,
      category,
      subcategory,
      entity,
      estimatedROI: options.estimatedROI ?? 0,
      justification: options.justification || `Inversión: ${category}`,
      approvedBy: 'principal',
      metadata: options.metadata,
    };

    this.transactions.push(tx);
    this.balance -= amount;
    this.dirty = true;
    await this.save();

    this.emit('investment-recorded', { amount, category, entity });
    return { approved: true, transaction: tx };
  }

  async updateActualROI(transactionId: string, actualROI: number): Promise<void> {
    const tx = this.transactions.find(t => t.id === transactionId);
    if (tx) {
      tx.actualROI = actualROI;
      this.dirty = true;
      await this.save();
      this.emit('roi-updated', { transactionId, estimated: tx.estimatedROI, actual: actualROI });
    }
  }

  // ----------------------------------------------------------
  // REPORTES
  // ----------------------------------------------------------

  generateDailyReport(): DailyReport {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const today = new Date().toISOString().split('T')[0];

    const todayTx = this.transactions.filter(t =>
      new Date(t.timestamp).toISOString().split('T')[0] === today
    );

    const income = todayTx.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
    const expenses = todayTx.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);
    const investments = todayTx.filter(t => t.type === TransactionType.INVESTMENT).reduce((s, t) => s + t.amount, 0);
    const savings = income - expenses - investments;

    const margin = income > 0 ? Math.round((savings / income) * 1000) / 10 : 0;

    // Contar herramientas usadas
    const freeToolsUsed = todayTx.filter(t =>
      t.category === 'api_call' && t.amount === 0
    ).length;
    const paidToolsUsed = todayTx.filter(t =>
      t.category === 'api_call' && t.amount > 0
    ).length;

    // Calcular eficiencia de clones
    const cloneTx = todayTx.filter(t => t.cloneId);
    const cloneEfficiency = cloneTx.length > 0
      ? cloneTx.filter(t => (t.actualROI ?? 0) > 1.0).length / cloneTx.length
      : 0;

    // Lecciones aplicadas (transacciones con alternativa documentada)
    const lessonsApplied = todayTx.filter(t =>
      t.alternativeConsidered && t.alternativeConsidered !== 'Ninguna documentada'
    ).length;

    // APIs evitadas
    const apisAvoided = todayTx.filter(t =>
      t.alternativeConsidered && t.alternativeConsidered.includes('gratis')
    ).length;

    // Alertas
    const alerts: string[] = [];
    if (this.getDailyPaidRatio() > 0.25) {
      alerts.push('⚠️  Cercano al límite de 30% en APIs pagadas');
    }
    if (this.getReserveCoverage() < 14) {
      alerts.push('⚠️  Reserva por debajo de 14 días');
    }
    if (margin < 30) {
      alerts.push('⚠️  Margen bajo (< 30%)');
    }
    if (alerts.length === 0) {
      alerts.push('✅  Todas las métricas dentro de parámetros');
    }

    // Proyecciones
    const avgDailyExpense = this.getAverageDailyExpense();
    const reserveDays = avgDailyExpense > 0 ? Math.floor(this.balance / avgDailyExpense) : 999;
    const breakEvenDays = this.calculateBreakEven();

    // Tendencia
    const last7Days = this.getLastNDaysNet(7);
    const prev7Days = this.getLastNDaysNet(14).slice(0, 7);
    const trend: DailyReport['projection']['trend'] =
      last7Days.reduce((a, b) => a + b, 0) > prev7Days.reduce((a, b) => a + b, 0) * 1.1
        ? 'improving'
        : last7Days.reduce((a, b) => a + b, 0) < prev7Days.reduce((a, b) => a + b, 0) * 0.9
          ? 'degrading'
          : 'stable';

    return {
      date: today,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      investments: Math.round(investments * 100) / 100,
      savings: Math.round(savings * 100) / 100,
      netBalance: Math.round(this.balance * 100) / 100,
      margin,
      freeToolsUsed,
      paidToolsUsed,
      cloneEfficiency: Math.round(cloneEfficiency * 100) / 100,
      lessonsApplied,
      apisAvoided,
      alerts,
      projection: {
        breakEvenDays,
        reserveDays,
        trend,
      },
    };
  }

  // ----------------------------------------------------------
  // MÉTRICAS Y UTILIDADES
  // ----------------------------------------------------------

  getDailyPaidRatio(): number {
    this.resetDailyIfNeeded();
    const todayPaid = this.transactions
      .filter(t => {
        const txDay = new Date(t.timestamp).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        return txDay === today && t.type === TransactionType.EXPENSE && t.amount > 0;
      })
      .reduce((s, t) => s + t.amount, 0);
    return this.dailySpendingLimit > 0 ? todayPaid / this.dailySpendingLimit : 0;
  }

  getReserveCoverage(): number {
    const avgDaily = this.getAverageDailyExpense();
    return avgDaily > 0 ? Math.floor(this.balance / avgDaily) : 999;
  }

  private getAverageDailyExpense(days: number = 30): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = this.transactions.filter(t => t.timestamp > cutoff && t.type === TransactionType.EXPENSE);
    const total = recent.reduce((s, t) => s + t.amount, 0);
    return total / days;
  }

  private getLastNDaysNet(days: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dayTx = this.transactions.filter(t =>
        new Date(t.timestamp).toISOString().split('T')[0] === date
      );
      const income = dayTx.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
      const expenses = dayTx.filter(t => t.type === TransactionType.EXPENSE || t.type === TransactionType.INVESTMENT).reduce((s, t) => s + t.amount, 0);
      result.push(income - expenses);
    }
    return result;
  }

  private calculateBreakEven(): number {
    const avgIncome = this.getAverageDailyIncome();
    const avgExpense = this.getAverageDailyExpense();
    if (avgIncome <= avgExpense) return 999;
    const accumulated = this.transactions.reduce((acc, t) => {
      if (t.type === TransactionType.INCOME) return acc + t.amount;
      if (t.type === TransactionType.EXPENSE || t.type === TransactionType.INVESTMENT) return acc - t.amount;
      return acc;
    }, 0);
    if (accumulated >= 0) return 0;
    return Math.ceil(Math.abs(accumulated) / (avgIncome - avgExpense));
  }

  private getAverageDailyIncome(days: number = 30): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const recent = this.transactions.filter(t => t.timestamp > cutoff && t.type === TransactionType.INCOME);
    const total = recent.reduce((s, t) => s + t.amount, 0);
    return total / days;
  }

  getBalance(): number {
    return Math.round(this.balance * 100) / 100;
  }

  getTransactions(limit: number = 100, type?: TransactionType): Transaction[] {
    let txs = [...this.transactions];
    if (type) txs = txs.filter(t => t.type === type);
    return txs.slice(-limit).reverse();
  }

  getStats(): {
    balance: number;
    totalIncome: number;
    totalExpenses: number;
    totalInvestments: number;
    netProfit: number;
    dailySpent: number;
    dailyLimit: number;
    reserveCoverage: number;
    transactionCount: number;
  } {
    const income = this.transactions.filter(t => t.type === TransactionType.INCOME).reduce((s, t) => s + t.amount, 0);
    const expenses = this.transactions.filter(t => t.type === TransactionType.EXPENSE).reduce((s, t) => s + t.amount, 0);
    const investments = this.transactions.filter(t => t.type === TransactionType.INVESTMENT).reduce((s, t) => s + t.amount, 0);

    return {
      balance: this.getBalance(),
      totalIncome: Math.round(income * 100) / 100,
      totalExpenses: Math.round(expenses * 100) / 100,
      totalInvestments: Math.round(investments * 100) / 100,
      netProfit: Math.round((income - expenses - investments) * 100) / 100,
      dailySpent: Math.round(this.dailySpent * 100) / 100,
      dailyLimit: Math.round(this.dailySpendingLimit * 100) / 100,
      reserveCoverage: this.getReserveCoverage(),
      transactionCount: this.transactions.length,
    };
  }

  async destroy(): Promise<void> {
    await this.save();
  }
}

export const frugalLedger = new FrugalLedger();
