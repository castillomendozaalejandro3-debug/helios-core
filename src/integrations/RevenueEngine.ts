/**
 * RevenueEngine - Capa 6: Economia Autonoma
 * Gestiona contratos externos, ejecuta trabajo y procesa pagos (Stripe/Crypto).
 */

import { EventEmitter } from 'events';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';

interface ServiceContract {
  id: string;
  client: string;
  service: string;
  price: number;
  status: 'pending' | 'in_progress' | 'completed' | 'paid';
  deliverables: string[];
}

export class RevenueEngine extends EventEmitter {
  private contracts: Map<string, ServiceContract> = new Map();

  createContract(client: string, service: string, price: number): string {
    const id = crypto.randomUUID();
    const contract: ServiceContract = {
      id,
      client,
      service,
      price,
      status: 'pending',
      deliverables: [],
    };
    this.contracts.set(id, contract);
    this.emit('contract-created', contract);
    return id;
  }

  startWork(contractId: string): boolean {
    const contract = this.contracts.get(contractId);
    if (!contract) return false;
    if (contract.status !== 'pending' && contract.status !== 'in_progress') return false;
    
    contract.status = 'in_progress';
    this.emit('work-started', contract);
    return true;
  }

  completeWork(contractId: string, deliverables: string[]): boolean {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status !== 'in_progress') return false;
    
    contract.status = 'completed';
    contract.deliverables = deliverables;
    this.emit('work-completed', contract);
    
    this.invoice(contractId);
    return true;
  }

  private invoice(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract) return;

    contract.status = 'paid';
    financialEngine.recordIncome(contract.price, `Servicio: ${contract.service}`, 'service');
    
    this.emit('payment-received', {
      contractId,
      amount: contract.price,
      client: contract.client,
    });
  }

  getActiveContracts(): ServiceContract[] {
    return Array.from(this.contracts.values())
      .filter(c => c.status === 'in_progress' || c.status === 'pending');
  }

  getContractsByStatus(status: ServiceContract['status']): ServiceContract[] {
    return Array.from(this.contracts.values())
      .filter(c => c.status === status);
  }

  getStats(): { total: number; revenue: number; pending: number } {
    const all = Array.from(this.contracts.values());
    return {
      total: all.length,
      revenue: all.filter(c => c.status === 'paid').reduce((s, c) => s + c.price, 0),
      pending: all.filter(c => c.status === 'pending').length,
    };
  }
}

export const revenueEngine = new RevenueEngine();
