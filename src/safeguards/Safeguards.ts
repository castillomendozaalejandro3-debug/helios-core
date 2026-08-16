/**
 * Safeguards - Capa 7: Seguridad y Control Humano
 * Kill switch, niveles de autonomia progresiva, auditoria completa.
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';

export enum AutonomyLevel {
  LEVEL_0 = 0, // Aprobacion explicita para todo
  LEVEL_1 = 1, // Actua y notifica, veto posible
  LEVEL_2 = 2, // Automatico con excepciones
  LEVEL_3 = 3, // Independiente, reporte semanal
  LEVEL_4 = 4, // Total autonomia, humano como consultor
}

interface AuditEntry {
  id: string;
  timestamp: number;
  module: string;
  action: string;
  level: AutonomyLevel;
  decision?: string;
  reason?: string;
  outcome?: string;
  metadata?: Record<string, any>;
}

interface KillSwitchEvent {
  triggeredAt: number;
  reason: string;
  source: string;
  metadata?: Record<string, any>;
}

export class Safeguards extends EventEmitter {
  private auditPath: string;
  private auditLog: AuditEntry[] = [];
  private killSwitchActive = false;
  private killSwitchHistory: KillSwitchEvent[] = [];
  private currentAutonomyLevel: AutonomyLevel;
  private maxLossKillSwitch: number;
  private dirty = false;

  constructor() {
    super();
    this.auditPath = resolve(configManager.stateDir, 'audit.json');
    this.currentAutonomyLevel = configManager.config.HELIOS_AUTONOMY_LEVEL as AutonomyLevel;
    this.maxLossKillSwitch = configManager.config.HELIOS_MAX_LOSS_KILL_SWITCH;
    this.load();
  }

  private load(): void {
    if (existsSync(this.auditPath)) {
      try {
        const data = JSON.parse(readFileSync(this.auditPath, 'utf-8'));
        this.auditLog = data.auditLog || [];
        this.killSwitchHistory = data.killSwitchHistory || [];
        this.killSwitchActive = data.killSwitchActive || false;
      } catch {
        console.warn('Audit log corrupto, inicializando nuevo');
      }
    }
  }

  private save(): void {
    if (!this.dirty) return;
    mkdirSync(dirname(this.auditPath), { recursive: true });
    writeFileSync(this.auditPath, JSON.stringify({
      auditLog: this.auditLog,
      killSwitchHistory: this.killSwitchHistory,
      killSwitchActive: this.killSwitchActive,
      updatedAt: Date.now(),
    }, null, 2));
    this.dirty = false;
  }

  log(module: string, action: string, level: AutonomyLevel, decision?: string, reason?: string, outcome?: string, metadata?: Record<string, any>): void {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      module,
      action,
      level,
      decision,
      reason,
      outcome,
      metadata,
    };
    this.auditLog.push(entry);
    if (this.auditLog.length > 10000) this.auditLog = this.auditLog.slice(-5000);
    this.dirty = true;
    this.save();
    this.emit('audit-entry', entry);
  }

  triggerKillSwitch(reason: string, metadata?: Record<string, any>): void {
    if (this.killSwitchActive) return;
    
    this.killSwitchActive = true;
    const event: KillSwitchEvent = {
      triggeredAt: Date.now(),
      reason,
      source: metadata?.by || 'system',
      metadata,
    };
    this.killSwitchHistory.push(event);
    this.dirty = true;
    this.save();

    this.emit('kill-switch', event);
    console.error(`\n🚨 KILL SWITCH ACTIVADO: ${reason}\n`);
  }

  resetKillSwitch(by: string): void {
    this.killSwitchActive = false;
    this.log('safeguards', 'kill-switch-reset', this.currentAutonomyLevel, undefined, `Reset por ${by}`);
    this.emit('kill-switch-reset', { by, timestamp: Date.now() });
  }

  isKillSwitchActive(): boolean {
    return this.killSwitchActive;
  }

  getAutonomyLevel(): AutonomyLevel {
    return this.currentAutonomyLevel;
  }

  setAutonomyLevel(level: AutonomyLevel, reason: string): void {
    const oldLevel = this.currentAutonomyLevel;
    this.currentAutonomyLevel = level;
    this.log('safeguards', 'autonomy-level-change', level, `Nivel ${oldLevel} -> ${level}`, reason);
    this.emit('autonomy-level-changed', { oldLevel, newLevel: level, reason });
  }

  checkFinancialKillSwitch(currentLoss: number): boolean {
    if (currentLoss >= this.maxLossKillSwitch) {
      this.triggerKillSwitch(`Perdida maxima excedida: $${currentLoss} >= $${this.maxLossKillSwitch}`, { loss: currentLoss });
      return true;
    }
    return false;
  }

  getAuditLog(filters?: { module?: string; since?: string }): { entries: AuditEntry[]; total: number } {
    let entries = [...this.auditLog];
    if (filters?.module) {
      entries = entries.filter(e => e.module === filters.module);
    }
    if (filters?.since) {
      const sinceTime = new Date(filters.since).getTime();
      entries = entries.filter(e => e.timestamp >= sinceTime);
    }
    return { entries: entries.slice(-500).reverse(), total: entries.length };
  }

  getStats(): {
    active: boolean;
    killSwitch: boolean;
    autonomyLevel: number;
    auditEntries: number;
    killSwitchActivations: number;
  } {
    return {
      active: !this.killSwitchActive,
      killSwitch: this.killSwitchActive,
      autonomyLevel: this.currentAutonomyLevel,
      auditEntries: this.auditLog.length,
      killSwitchActivations: this.killSwitchHistory.length,
    };
  }

  requiresHumanApproval(actionRisk: number, financialImpact: number): boolean {
    switch (this.currentAutonomyLevel) {
      case AutonomyLevel.LEVEL_0:
        return true;
      case AutonomyLevel.LEVEL_1:
        return actionRisk > 50 || financialImpact > 100;
      case AutonomyLevel.LEVEL_2:
        return actionRisk > 80 || financialImpact > 1000;
      case AutonomyLevel.LEVEL_3:
        return actionRisk > 95 || financialImpact > 10000;
      case AutonomyLevel.LEVEL_4:
        return false;
      default:
        return true;
    }
  }
}

export const safeguards = new Safeguards();
