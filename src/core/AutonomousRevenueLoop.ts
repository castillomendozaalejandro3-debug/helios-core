/**
 * AutonomousRevenueLoop - Capa 6: Economia Autonoma
 * El corazon financiero. Si el balance baja de $500, busca trabajo, lo ejecuta y cobra solo.
 */

import { EventEmitter } from 'events';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';
import { revenueEngine } from '../integrations/RevenueEngine.js';
import { decisionEngine } from '../decision/DecisionEngine.js';

export class AutonomousRevenueLoop extends EventEmitter {
  private active = false;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.active) return;
    this.active = true;
    
    this.checkInterval = setInterval(() => {
      this.evaluateAndAct();
    }, 60000);

    console.log('AutonomousRevenueLoop iniciado');
  }

  stop(): void {
    this.active = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private evaluateAndAct(): void {
    const report = financialEngine.getFinancialReport();
    
    if (report.balance < 500) {
      console.log(`Balance bajo ($${report.balance}), buscando trabajo...`);
      
      const decision = decisionEngine.decide({
        action: 'seek_work',
        estimatedCost: 0,
        riskScore: 30,
        financialImpact: 100,
        irreversible: false,
      });

      if (decision.level === 0) {
        this.seekWork();
      }
    }

    const transfer = financialEngine.executeHumanTransfer();
    if (transfer) {
      console.log(`Transferencia automatica: $${transfer.amount}`);
    }
  }

  private seekWork(): void {
    const contractId = revenueEngine.createContract(
      'marketplace',
      'data_processing',
      50 + Math.random() * 200
    );
    
    revenueEngine.startWork(contractId);
    
    setTimeout(() => {
      revenueEngine.completeWork(contractId, ['report.json', 'analysis.csv']);
    }, 5000 + Math.random() * 10000);
  }

  getStatus(): { active: boolean; lastCheck: number } {
    return { active: this.active, lastCheck: Date.now() };
  }
}

export const revenueLoop = new AutonomousRevenueLoop();
