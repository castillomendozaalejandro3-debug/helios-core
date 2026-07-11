import * as fs from 'fs';
import * as path from 'path';
import { FinancialAutonomyEngine } from '../economy/FinancialAutonomyEngine';
import { AutonomousRevenueLoop } from '../core/AutonomousRevenueLoop';
import { AgentFactory } from '../agents/AgentFactory';
import { AgentOrchestrator } from '../agents/AgentOrchestrator';
import { DecisionEngine, DecisionLevel } from '../decision/DecisionEngine';
import { MemoryEngine } from '../memory/MemoryEngine';

// Interfaces para el sistema de auditoría
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  category: 'DECISION' | 'TRANSACTION' | 'AGENT' | 'SYSTEM' | 'SECURITY';
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  context?: Record<string, any>;
  decision?: {
    action: string;
    cost: number;
    reversible: boolean;
    isCritical: boolean;
    level: DecisionLevel;
  };
}

export interface SafeguardsConfig {
  emergencyStopThreshold: number; // Pérdida financiera máxima permitida
  auditLogPath: string;
  killSwitchEnabled: boolean;
  killSwitchReason?: string;
}

export class Safeguards {
  private financialEngine: FinancialAutonomyEngine;
  private revenueLoop: AutonomousRevenueLoop;
  private agentFactory: AgentFactory;
  private orchestrator: AgentOrchestrator;
  private decisionEngine: DecisionEngine;
  private memoryEngine: MemoryEngine;
  private config: SafeguardsConfig;
  private auditLog: AuditLogEntry[] = [];
  private isArmed: boolean = true;

  constructor(
    financialEngine: FinancialAutonomyEngine,
    revenueLoop: AutonomousRevenueLoop,
    agentFactory: AgentFactory,
    orchestrator: AgentOrchestrator,
    decisionEngine: DecisionEngine,
    memoryEngine: MemoryEngine
  ) {
    this.financialEngine = financialEngine;
    this.revenueLoop = revenueLoop;
    this.agentFactory = agentFactory;
    this.orchestrator = orchestrator;
    this.decisionEngine = decisionEngine;
    this.memoryEngine = memoryEngine;
    
    this.config = {
      emergencyStopThreshold: 1000,
      auditLogPath: path.resolve(__dirname, '../../logs/audit.log'),
      killSwitchEnabled: true
    };
    
    this.initializeAuditLog();
  }

  // Inicializa el sistema de auditoría
  private initializeAuditLog(): void {
    // Crear directorio de logs si no existe
    const logDir = path.dirname(this.config.auditLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Crear archivo de log si no existe
    if (!fs.existsSync(this.config.auditLogPath)) {
      fs.writeFileSync(this.config.auditLogPath, '', 'utf-8');
    }
  }

  // Registra una entrada en el log de auditoría
  public log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const logEntry: AuditLogEntry = {
      id: this.generateUUID(),
      timestamp: Date.now(),
      ...entry
    };
    
    this.auditLog.push(logEntry);
    
    // Guardar en disco
    const logString = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(this.config.auditLogPath, logString, 'utf-8');
    
    // También imprimir en consola para visibilidad inmediata
    console.log(`[AUDIT] ${logEntry.category} - ${logEntry.level}: ${logEntry.message}`);
  }

  // Verifica si el sistema debe activar el Kill Switch
  public checkEmergencyConditions(): boolean {
    // Condición 1: Pérdida financiera crítica
    const initialBalance = 1000; // Valor inicial del balance
    const currentBalance = this.financialEngine['currentBalance'];
    const loss = initialBalance - currentBalance;
    
    if (loss > this.config.emergencyStopThreshold) {
      this.log({
        category: 'SECURITY',
        level: 'CRITICAL',
        message: 'Pérdida financiera crítica detectada',
        context: { loss, threshold: this.config.emergencyStopThreshold },
        decision: {
          action: 'emergency_stop',
          cost: 0,
          reversible: false,
          isCritical: true,
          level: DecisionLevel.PROHIBITED
        }
      });
      return true;
    }
    
    // Condición 2: Comportamiento errático (ej. múltiples errores en corto tiempo)
    const recentErrors = this.auditLog
      .filter(entry => entry.level === 'ERROR' || entry.level === 'CRITICAL')
      .filter(entry => Date.now() - entry.timestamp < 60000); // Últimos 60 segundos
    
    if (recentErrors.length > 5) {
      this.log({
        category: 'SECURITY',
        level: 'CRITICAL',
        message: 'Comportamiento errático detectado (múltiples errores en 60 segundos)',
        context: { errorCount: recentErrors.length },
        decision: {
          action: 'emergency_stop',
          cost: 0,
          reversible: false,
          isCritical: true,
          level: DecisionLevel.PROHIBITED
        }
      });
      return true;
    }
    
    return false;
  }

  // Activa el Kill Switch y detiene todos los sistemas
  public async activateKillSwitch(reason: string): Promise<void> {
    this.config.killSwitchEnabled = false;
    this.config.killSwitchReason = reason;
    this.isArmed = false;
    
    this.log({
      category: 'SECURITY',
      level: 'CRITICAL',
      message: 'Kill Switch activado',
      context: { reason },
      decision: {
        action: 'kill_switch_activation',
        cost: 0,
        reversible: false,
        isCritical: true,
        level: DecisionLevel.PROHIBITED
      }
    });
    
    // 1. Detener el bucle de revenue
    this.revenueLoop.stop();
    
    // 2. Detener todos los agentes activos
    const activeAgents = this.agentFactory.getActiveAgentsStatus();
    for (const agent of activeAgents) {
      try {
        this.agentFactory.terminateAgent(agent.id);
      } catch (error) {
        this.log({
          category: 'AGENT',
          level: 'WARNING',
          message: 'Error al detener agente',
          context: { agentId: agent.id, error: error instanceof Error ? error.message : String(error) }
        });
      }
    }
    
    // 3. Revocar accesos y permisos
    await this.revokeAccess();
    
    // 4. Guardar estado final de memoria y ledger
    await this.memoryEngine.init(); // Asegura que la DB esté lista para guardar
    try {
      (this.financialEngine as any).saveLedger();
    } catch (error) {
      this.log({
        category: 'SYSTEM',
        level: 'ERROR',
        message: 'Error al guardar el ledger financiero',
        context: { error: error instanceof Error ? error.message : String(error) }
      });
    }
    
    this.log({
      category: 'SYSTEM',
      level: 'INFO',
      message: 'Kill Switch completado: todos los sistemas detenidos y estado guardado'
    });
  }

  // Revoca accesos y permisos críticos
  private async revokeAccess(): Promise<void> {
    // En una implementación real, esto revocaría tokens, claves, permisos de API, etc.
    // Por ahora, registramos la acción
    this.log({
      category: 'SECURITY',
      level: 'INFO',
      message: 'Accesos revocados',
      context: { systems: ['financial', 'agents', 'browser', 'crawl'] }
    });
  }

  // Verifica si el Kill Switch está activado
  public isKillSwitchEnabled(): boolean {
    return this.config.killSwitchEnabled;
  }

  // Obtiene el estado actual para el dashboard
  public getHealthStatus(): {
    balance: number;
    agentsActive: number;
    auditLogSize: number;
    killSwitchArmed: boolean;
    killSwitchReason?: string;
  } {
    const activeAgents = this.agentFactory.getActiveAgentsStatus();
    
    return {
      balance: this.financialEngine['currentBalance'],
      agentsActive: activeAgents.length,
      auditLogSize: this.auditLog.length,
      killSwitchArmed: this.isArmed,
      killSwitchReason: this.config.killSwitchReason
    };
  }

  // Método auxiliar para generar un UUID
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}