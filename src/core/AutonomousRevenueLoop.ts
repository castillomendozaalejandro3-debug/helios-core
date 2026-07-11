import { FinancialAutonomyEngine } from '../economy/FinancialAutonomyEngine';
import { CrawlAgent, ExtractionSchema } from '../integrations/CrawlAgent';
import { BrowserAgent } from '../integrations/BrowserAgent';
import { AgentOrchestrator, Task } from '../agents/AgentOrchestrator';
import { RevenueEngine, ExternalContract } from '../integrations/RevenueEngine';

export class AutonomousRevenueLoop {
  private financialEngine: FinancialAutonomyEngine;
  private crawlAgent: CrawlAgent;
  private browserAgent: BrowserAgent;
  private orchestrator: AgentOrchestrator;
  private revenueEngine: RevenueEngine;
  private loopInterval: NodeJS.Timeout | null = null;
  private readonly MINIMUM_BALANCE_THRESHOLD = 500; // USD. Si baja de esto, busca trabajo.

  constructor() {
    this.financialEngine = new FinancialAutonomyEngine();
    this.crawlAgent = new CrawlAgent();
    this.browserAgent = new BrowserAgent();
    this.orchestrator = new AgentOrchestrator();
    this.revenueEngine = new RevenueEngine();
  }

  // Propósito: Iniciar el bucle de supervivencia económica.
  // Fortaleza: Corre en segundo plano, evaluando la salud financiera cada X tiempo.
  public start(intervalMs: number = 3600000): void { // Cada 1 hora por defecto
    if (this.loopInterval) return;
    this.loopInterval = setInterval(() => this.evaluateAndAct(), intervalMs);
    // Ejecutar inmediatamente al iniciar
    this.evaluateAndAct(); 
  }

  public stop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }

  // Propósito: Lógica central de decisión económica.
  private async evaluateAndAct(): Promise<void> {
    // 1. Obtener balance real del FinancialAutonomyEngine.
    const currentBalance = this.financialEngine['currentBalance'];
    
    // 2. Si balance < MINIMUM_BALANCE_THRESHOLD, llamar a this.findAndExecuteOpportunity().
    if (currentBalance < this.MINIMUM_BALANCE_THRESHOLD) {
      await this.findAndExecuteOpportunity();
    }
    
    // 3. Si balance es saludable, llamar a this.distributeProfits() (transferir dinero a Meloc).
    else {
      await this.distributeProfits();
    }
  }

  // Propósito: Buscar, ejecutar y cobrar una oportunidad real en la web.
  // Fortaleza: Usa CrawlAgent para encontrar tareas (ej. bug bounties, freelancing APIs), BrowserAgent para aplicar, y Orchestrator para hacer el trabajo técnico.
  private async findAndExecuteOpportunity(): Promise<void> {
    // 1. Usar this.crawlAgent.extractData() para escanear URLs de fuentes de ingresos predefinidas (ej. plataformas de automatización, APIs de bounty).
    const urls = [
      'https://www.upwork.com',
      'https://www.fiverr.com',
      'https://hackerone.com',
      'https://bugcrowd.com'
    ];
    
    const schema: ExtractionSchema = {
      fields: [
        { name: 'title', selector: 'h1, h2, h3, .title, .job-title', type: 'text' },
        { name: 'description', selector: '.description, .job-description, p', type: 'text' },
        { name: 'price', selector: '.price, .rate, .budget', type: 'text' },
        { name: 'link', selector: 'a[href]', type: 'link' }
      ]
    };
    
    try {
      const results = await this.crawlAgent.crawlMultipleUrls(urls, schema, 'CSS', 3);
      
      // 2. Analizar los datos extraídos para encontrar una tarea que coincida con las capacidades de Helios.
      for (const result of results) {
        if (result.success && result.data && Array.isArray(result.data)) {
          for (const job of result.data) {
            const title = job.title?.toLowerCase() || '';
            const description = job.description?.toLowerCase() || '';
            
            // Buscar oportunidades que coincidan con las capacidades de Helios
            if ((title.includes('automation') || title.includes('ai') || title.includes('agent')) && 
                (description.includes('api') || description.includes('integration') || description.includes('security'))) {
              
              // 3. Si encuentra una oportunidad válida:
              //    a. Crear un ExternalContract en this.revenueEngine.
              const contractId = this.revenueEngine.createContract(
                'external-client',
                'AUTOMATION',
                parseFloat(job.price?.replace(/[^0-9.]/g, '')) || 100,
                job.link
              );
              
              //    b. Usar this.browserAgent.loginToWebsite() o navigate() para postularse/iniciar la tarea.
              //       (En producción real, se usaría browserAgent para aplicar a la oportunidad)
              
              //    c. Usar this.orchestrator.routeTask() para que los sub-agentes ejecuten el trabajo técnico.
              const task: Task = {
                id: `task-${Date.now()}`,
                description: `Ejecutar la tarea de automatización para ${job.title}`,
                requiredCapabilities: ['automation', 'api', 'security'],
                priority: 'HIGH',
                payload: { job: job }
              };
              
              try {
                const agentId = await this.orchestrator.routeTask(task);
                console.log(`Tarea asignada al agente: ${agentId}`);
              } catch (error) {
                console.error('Error al asignar la tarea al agente:', error);
              }
              
              //    d. Usar this.revenueEngine.processPayment() para cobrar.
              try {
                const paymentSuccess = await this.revenueEngine.processPayment(contractId);
                console.log(`Pago procesado para el contrato ${contractId}: ${paymentSuccess}`);
              } catch (error) {
                console.error('Error al procesar el pago:', error);
              }
              
              return;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error al buscar oportunidades:', error);
    }
  }

  // Propósito: Distribuir las ganancias al humano (Meloc) de forma autónoma.
  private async distributeProfits(): Promise<void> {
    // 1. Llamar a this.financialEngine.distributeHumanSupport().
    const supportAmount = this.financialEngine.distributeHumanSupport();
    
    // 2. Registrar la transferencia en el ledger.
    console.log(`Distribución de ganancias a Meloc: $${supportAmount}`);
  }
}