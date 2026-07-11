import { MemoryEngine } from './memory/MemoryEngine';
import { DecisionEngine } from './decision/DecisionEngine';
import { PersonalityCore } from './personality/PersonalityCore';
import { HealthMonitor } from './monitoring/HealthMonitor';
import { FinancialAutonomyEngine } from './economy/FinancialAutonomyEngine';
import { AutonomousRevenueLoop } from './core/AutonomousRevenueLoop';
import { Safeguards } from './safeguards/Safeguards';
import { HealthDashboard } from './safeguards/HealthDashboard';
import { MemoryEngine } from './memory/MemoryEngine';
import { DecisionEngine } from './decision/DecisionEngine';
import { PersonalityCore } from './personality/PersonalityCore';
import { HealthMonitor } from './monitoring/HealthMonitor';
import { FinancialAutonomyEngine } from './economy/FinancialAutonomyEngine';
import { AutonomousRevenueLoop } from './core/AutonomousRevenueLoop';
import { Safeguards } from './safeguards/Safeguards';
import { HealthDashboard } from './safeguards/HealthDashboard';

class Helios {
  private memory: MemoryEngine;
  private decision: DecisionEngine;
  private personality: PersonalityCore;
  private health: HealthMonitor;
  private finance: FinancialAutonomyEngine;
  private revenueLoop: AutonomousRevenueLoop;
  private safeguards: Safeguards;
  private healthDashboard: HealthDashboard;

  constructor() {
    // Inicialización de los núcleos reales
    this.memory = new MemoryEngine();
    this.decision = new DecisionEngine();
    this.personality = new PersonalityCore();
    this.health = new HealthMonitor();
    this.finance = new FinancialAutonomyEngine();
    this.revenueLoop = new AutonomousRevenueLoop();
    
    // Inicialización de la capa de seguridad
    const agentFactory = new (require('./agents/AgentFactory').AgentFactory)();
    const orchestrator = new (require('./agents/AgentOrchestrator').AgentOrchestrator)();
    this.safeguards = new Safeguards(
      this.finance,
      this.revenueLoop,
      agentFactory,
      orchestrator,
      this.decision,
      this.memory
    );
    
    this.healthDashboard = new HealthDashboard(this.safeguards);
  }

  // Propósito: Iniciar todos los subsistemas de Helios.
  public async boot(): Promise<void> {
    // 1. Inicializar la base de datos vectorial (LanceDB)
    await this.memory.init();
    
    // 2. Cargar personalidad y estado financiero desde disco
    // (Lógica real de carga de estado si aplica)
    
    // 3. Arrancar el bucle de supervivencia económica
    this.revenueLoop.start(3600000); // Evaluar cada 1 hora
    
    // 4. Iniciar el dashboard de salud
    this.healthDashboard.startMonitoring(30000);
    
    // 5. Configurar el apagado seguro
    this.setupGracefulShutdown();
  }

  // Propósito: Apagar Helios de forma segura sin corromper el ledger ni la memoria.
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`Recibido ${signal}, iniciando apagado seguro...`);
      
      // 1. Verificar condiciones de emergencia antes de apagar
      if (this.safeguards.checkEmergencyConditions()) {
        await this.safeguards.activateKillSwitch(`Emergencia detectada al recibir ${signal}`);
      }
      
      // 2. Detener el bucle de revenue
      this.revenueLoop.stop();
      
      // 3. Forzar guardado del ledger financiero en disco
      // El FinancialAutonomyEngine ya guarda automáticamente en cada transacción
      // Pero forzamos un guardado final para asegurar el estado
      try {
        // Accedemos al método privado de guardado del ledger
        (this.finance as any).saveLedger();
      } catch (error) {
        console.error('Error al guardar el ledger financiero:', error);
      }
      
      // 4. Cerrar conexiones de la base de datos (LanceDB)
      try {
        // En LanceDB, no hay un método explícito de cierre, pero podemos intentar liberar recursos
        // En una implementación real, esto interactuaría con el cliente de LanceDB
      } catch (error) {
        console.error('Error al cerrar conexiones de LanceDB:', error);
      }
      
      console.log('Helios apagado correctamente.');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

// Instancia y arranque real
const helios = new Helios();
helios.boot().catch(err => {
  console.error('Error al iniciar Helios:', err);
  process.exit(1);
});
