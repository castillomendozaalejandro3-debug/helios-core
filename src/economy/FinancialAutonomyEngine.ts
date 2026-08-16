/**
 * FinancialAutonomyEngine - Capa 6: Economia Autonoma
 * Gestiona ledger, balance, transferencias al humano, y auto-sostenibilidad.
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';

interface LedgerEntry {
  id: string;
  timestamp: number;
  type: 'income' | 'expense' | 'transfer' | 'fee';
  amount: number;
  description: string;
  category: string;
  metadata?: Record<string, any>;
}

interface FinancialReport {
  balance: number;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  pendingTransfers: number;
  lastTransfer: number;
  reserveRatio: number;
}

export class FinancialAutonomyEngine extends EventEmitter {
  private ledgerPath: string;
  private entries: LedgerEntry[] = [];
  private balance: number;
  private minimumBalance: number;
  private humanCutPercent: number;
  private lastTransferTime: number = 0;
  private dirty = false;

  constructor() {
    super();
    this.ledgerPath = resolve(configManager.config.HELIOS_LEDGER_PATH);
    this.balance = configManager.config.HELIOS_INITIAL_BALANCE;
    this.minimumBalance = configManager.config.HELIOS_MINIMUM_BALANCE;
    this.humanCutPercent = configManager.config.HELIOS_HUMAN_CUT_PERCENT;
    this.load();
  }

  private load(): void {
    if (existsSync(this.ledgerPath)) {
      try {
        const data = JSON.parse(readFileSync(this.ledgerPath, 'utf-8'));
        this.entries = data.entries || [];
        this.balance = data.balance ?? this.balance;
        this.lastTransferTime = data.lastTransferTime ?? 0;
        this.recalculateBalance();
      } catch {
        console.warn('Ledger corrupto, inicializando nuevo');
      }
    }
  }

  private save(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.ledgerPath), { recursive: true });
    const data = JSON.stringify({
      entries: this.entries,
      balance: this.balance,
      lastTransferTime: this.lastTransferTime,
      updatedAt: Date.now(),
    }, null, 2);
    
    // Retry logic for file locking
    let retries = 5;
    while (retries > 0) {
      try {
        writeFileSync(this.ledgerPath, data);
        this.dirty = false;
        break;
      } catch (err: any) {
        if ((err.code === 'EAGAIN' || err.code === 'EBUSY') && retries > 1) {
          retries--;
          const start = Date.now();
          while (Date.now() - start < 20) { /* busy wait 20ms */ }
          continue;
        }
        throw err;
      }
    }
  }

  private recalculateBalance(): void {
    this.balance = this.entries.reduce((acc, e) => {
      if (e.type === 'income') return acc + e.amount;
      if (e.type === 'expense' || e.type === 'transfer' || e.type === 'fee') return acc - e.amount;
      return acc;
    }, configManager.config.HELIOS_INITIAL_BALANCE);
  }

  recordIncome(amount: number, description: string, category: string, metadata?: Record<string, any>): void {
    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'income',
      amount,
      description,
      category,
      metadata,
    };
    this.entries.push(entry);
    this.balance += amount;
    this.dirty = true;
    this.save();
    this.emit('income-recorded', { amount, description, newBalance: this.balance });
  }

  recordExpense(amount: number, description: string, category: string, metadata?: Record<string, any>): void {
    if (this.balance - amount < this.minimumBalance) {
      this.emit('insufficient-funds', { requested: amount, available: this.balance, minimum: this.minimumBalance });
      throw new Error(`Fondos insuficientes: $${this.balance} disponible, $${amount} requerido`);
    }

    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'expense',
      amount,
      description,
      category,
      metadata,
    };
    this.entries.push(entry);
    this.balance -= amount;
    this.dirty = true;
    this.save();
    this.emit('expense-recorded', { amount, description, newBalance: this.balance });
  }

  executeHumanTransfer(): { amount: number; timestamp: number } | null {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (now - this.lastTransferTime < oneDay) return null;
    if (this.balance <= this.minimumBalance * 2) return null;

    const excess = this.balance - this.minimumBalance * 2;
    const transferAmount = excess * (this.humanCutPercent / 100);
    
    if (transferAmount < 10) return null;

    const entry: LedgerEntry = {
      id: crypto.randomUUID(),
      timestamp: now,
      type: 'transfer',
      amount: transferAmount,
      description: 'Transferencia automatica al humano',
      category: 'human-payout',
    };
    this.entries.push(entry);
    this.balance -= transferAmount;
    this.lastTransferTime = now;
    this.dirty = true;
    this.save();

    this.emit('human-transfer', { amount: transferAmount, balance: this.balance });
    return { amount: transferAmount, timestamp: now };
  }

  getFinancialReport(): FinancialReport {
    const income = this.entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0);
    const expenses = this.entries.filter(e => e.type === 'expense' || e.type === 'fee').reduce((s, e) => s + e.amount, 0);
    const transfers = this.entries.filter(e => e.type === 'transfer').reduce((s, e) => s + e.amount, 0);
    
    return {
      balance: Math.round(this.balance * 100) / 100,
      totalIncome: Math.round(income * 100) / 100,
      totalExpenses: Math.round(expenses * 100) / 100,
      netProfit: Math.round((income - expenses - transfers) * 100) / 100,
      pendingTransfers: transfers,
      lastTransfer: this.lastTransferTime,
      reserveRatio: this.balance > 0 ? Math.round((this.minimumBalance / this.balance) * 100) : 0,
    };
  }

  getLedger(limit: number = 100): LedgerEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  isSustainable(): boolean {
    return this.balance >= this.minimumBalance;
  }

  getEfficiencyScore(): number {
    const report = this.getFinancialReport();
    if (report.totalIncome === 0) return 0;
    return Math.round((report.netProfit / report.totalIncome) * 100);
  }
}

export const financialEngine = new FinancialAutonomyEngine();
