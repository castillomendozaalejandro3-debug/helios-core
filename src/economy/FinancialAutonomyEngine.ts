import * as fs from 'fs';
import * as path from 'path';

export interface Transaction {
  id: string;
  timestamp: number;
  type: 'INCOME' | 'EXPENSE' | 'INVESTMENT' | 'AGENT_BUDGET' | 'HUMAN_SUPPORT';
  amount: number;
  description: string;
  agentId?: string; // Si aplica a un sub-agente
}

export interface AgentBudget {
  agentId: string;
  allocated: number;
  spent: number;
  efficiencyScore: number; // 0-100
}

export class FinancialAutonomyEngine {
  private ledgerPath: string;
  private transactions: Transaction[] = [];
  private agentBudgets: Map<string, AgentBudget> = new Map();
  private currentBalance: number;

  constructor(initialBalance: number = 1000) { // Empieza con capital semilla
    this.currentBalance = initialBalance;
    this.ledgerPath = path.resolve(__dirname, '../../ledger.json');
    this.loadLedger();
  }

  // Propósito: Ejecutar una transacción financiera real y persistirla en el libro contable.
  // Fortaleza: Helios decide y ejecuta. No hay "approve" humano.
  public executeTransaction(tx: Omit<Transaction, 'id' | 'timestamp'>): void {
    // 1. Validar fondos (si es EXPENSE o INVESTMENT).
    if ((tx.type === 'EXPENSE' || tx.type === 'INVESTMENT') && tx.amount > this.currentBalance) {
      throw new Error(`Fondos insuficientes para transacción de tipo ${tx.type}: ${tx.amount} > ${this.currentBalance}`);
    }

    // 2. Actualizar this.currentBalance.
    if (tx.type === 'INCOME') {
      this.currentBalance += tx.amount;
    } else if (tx.type === 'EXPENSE' || tx.type === 'INVESTMENT' || tx.type === 'AGENT_BUDGET' || tx.type === 'HUMAN_SUPPORT') {
      this.currentBalance -= tx.amount;
    }

    // 3. Crear el objeto Transaction completo con id (uuid) y timestamp.
    const transaction: Transaction = {
      id: this.generateUUID(),
      timestamp: Date.now(),
      ...tx
    };

    // 4. Añadir a this.transactions.
    this.transactions.push(transaction);

    // 5. Llamar a this.saveLedger() para escribir en disco.
    this.saveLedger();
  }

  // Propósito: Asignar presupuesto a un sub-agente y evaluar su eficiencia.
  // Fortaleza: Si un agente es ineficiente (efficiencyScore < 50), se le reduce el presupuesto automáticamente en el siguiente ciclo.
  public allocateAgentBudget(agentId: string, amount: number): void {
    // 1. Crear o actualizar el AgentBudget en el Map.
    const existingBudget = this.agentBudgets.get(agentId);
    if (existingBudget) {
      existingBudget.allocated += amount;
      existingBudget.efficiencyScore = Math.min(100, Math.max(0, existingBudget.efficiencyScore));
      this.agentBudgets.set(agentId, existingBudget);
    } else {
      const newBudget: AgentBudget = {
        agentId,
        allocated: amount,
        spent: 0,
        efficiencyScore: 75 // Valor inicial de eficiencia
      };
      this.agentBudgets.set(agentId, newBudget);
    }

    // 2. Ejecutar una transacción de tipo 'AGENT_BUDGET'.
    this.executeTransaction({
      type: 'AGENT_BUDGET',
      amount,
      description: `Asignación de presupuesto al agente ${agentId}`,
      agentId
    });
  }

  // Propósito: Calcular y ejecutar la transferencia de soporte al humano (Meloc).
  // Fortaleza: Helios decide autónomamente el monto basándose en su balance actual y sus metas de reinversión (ej. 20% del excedente).
  public distributeHumanSupport(): number {
    // 1. Calcular el excedente (Balance - Reservas operativas).
    const operationalReserve = 200; // Reserva mínima para operaciones
    const excess = Math.max(0, this.currentBalance - operationalReserve);

    // 2. Calcular el 20% (o el ratio que defina su lógica interna).
    const supportAmount = excess * 0.2;

    // 3. Ejecutar transacción de tipo 'HUMAN_SUPPORT'.
    if (supportAmount > 0) {
      this.executeTransaction({
        type: 'HUMAN_SUPPORT',
        amount: supportAmount,
        description: 'Transferencia de soporte al creador Meloc'
      });
    }

    // 4. Retornar el monto transferido.
    return supportAmount;
  }

  // Propósito: Persistencia real del estado financiero en el sistema de archivos.
  private saveLedger(): void {
    // Implementa la escritura real de this.transactions y this.currentBalance en this.ledgerPath.
    const ledgerData = {
      currentBalance: this.currentBalance,
      transactions: this.transactions,
      agentBudgets: Array.from(this.agentBudgets.values())
    };

    fs.writeFileSync(this.ledgerPath, JSON.stringify(ledgerData, null, 2), 'utf-8');
  }

  private loadLedger(): void {
    // Implementa la lectura real del archivo si existe, para no perder el historial al reiniciar.
    try {
      if (fs.existsSync(this.ledgerPath)) {
        const ledgerData = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf-8'));
        this.currentBalance = ledgerData.currentBalance || 0;
        this.transactions = ledgerData.transactions || [];
        this.agentBudgets = new Map(
          (ledgerData.agentBudgets || []).map((budget: AgentBudget) => [budget.agentId, budget])
        );
      }
    } catch (error) {
      console.error('Error al cargar el libro contable:', error);
      // Si falla la carga, inicializar con valores por defecto
      this.currentBalance = 1000;
      this.transactions = [];
      this.agentBudgets = new Map();
    }
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