import { spawn, ChildProcess, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { DecisionEngine, DecisionLevel } from '../decision/DecisionEngine';

export interface AgentConfig {
  id: string;
  name: string;
  entryPoint: string; // Ruta al script .ts/.js del agente
  capabilities: string[];
  maxMemoryMB: number;
  allowedApis: string[];
}

export interface ActiveAgent {
  id: string;
  process: ChildProcess;
  pid: number;
  startTime: number;
  status: 'running' | 'stopped' | 'error';
}

export class AgentFactory {
  private decisionEngine: DecisionEngine;
  private activeAgents: Map<string, ActiveAgent> = new Map();
  private agentsDir: string;

  constructor() {
    this.decisionEngine = new DecisionEngine();
    this.agentsDir = path.resolve(__dirname, '../deployed_agents');
    if (!fs.existsSync(this.agentsDir)) {
      fs.mkdirSync(this.agentsDir, { recursive: true });
    }
  }

  // Propósito: Validar, persistir la configuración y lanzar el proceso real del sub-agente.
  // Fortaleza: Aislamiento real de procesos, límites de recursos y registro en disco.
  public async createAndDeployAgent(config: AgentConfig): Promise<string> {
    // 1. Validación de seguridad
    const decision = this.decisionEngine.evaluate({
      action: `Desplegar sub-agente: ${config.name}`,
      cost: 0,
      reversible: true,
      isCritical: false
    });

    if (decision === DecisionLevel.PROHIBITED) {
      throw new Error(`Despliegue del agente ${config.name} bloqueado.`);
    }

    // 2. Persistencia de configuración real en disco
    const agentDir = path.join(this.agentsDir, config.id);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

    // 3. Inicialización del proceso real
    // Determinar si el entryPoint es TypeScript o JavaScript
    const isTypeScript = config.entryPoint.endsWith('.ts');
    
    // Construir los argumentos para el proceso
    let args: string[] = [];
    let executable = 'node';
    
    if (isTypeScript) {
      // Para TypeScript, necesitamos un loader o compilar primero
      // Usamos spawnSync para verificar si ts-node está disponible
      const tsNodeCheck = spawnSync('npx', ['ts-node', '--version'], { encoding: 'utf-8' });
      
      if (tsNodeCheck.status === 0) {
        args = ['--loader', 'ts-node/esm', config.entryPoint];
      } else {
        // Intentar compilar primero con tsc
        const compileResult = spawnSync('npx', ['tsc', config.entryPoint], { encoding: 'utf-8' });
        if (compileResult.status !== 0) {
          throw new Error(`Error al compilar el agente ${config.name}: ${compileResult.stderr}`);
        }
        // Usar el archivo compilado
        const jsPath = config.entryPoint.replace(/\.ts$/, '.js');
        args = [jsPath];
      }
    } else {
      args = [config.entryPoint];
    }

    // Iniciar el proceso del agente
    const agentProcess = spawn(executable, args, {
      cwd: agentDir,
      env: {
        ...process.env,
        HELIOS_AGENT_ID: config.id,
        HELIOS_AGENT_CONFIG: path.join(agentDir, 'config.json')
      },
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    // Manejar eventos del proceso
    agentProcess.on('error', (err) => {
      console.error(`Error al iniciar el agente ${config.id}:`, err);
      this.activeAgents.delete(config.id);
    });

    agentProcess.on('exit', (code, signal) => {
      console.log(`Agente ${config.id} finalizado con código ${code} y señal ${signal}`);
      this.activeAgents.delete(config.id);
    });

    // Registrar el agente activo
    const activeAgent: ActiveAgent = {
      id: config.id,
      process: agentProcess,
      pid: agentProcess.pid,
      startTime: Date.now(),
      status: 'running'
    };

    this.activeAgents.set(config.id, activeAgent);

    return config.id;
  }

  // Propósito: Detener un sub-agente de forma segura (SIGTERM).
  public terminateAgent(agentId: string): void {
    const agent = this.activeAgents.get(agentId);
    if (!agent || !agent.process || !agent.process.pid) {
      throw new Error(`Agente ${agentId} no encontrado o ya detenido.`);
    }

    try {
      // Enviar señal SIGTERM para detención gracia
      process.kill(agent.process.pid, 'SIGTERM');
      console.log(`Agente ${agentId} recibió SIGTERM.`);
    } catch (error) {
      console.error(`Error al enviar SIGTERM al agente ${agentId}:`, error);
      // Si falla SIGTERM, intentar SIGKILL
      try {
        process.kill(agent.process.pid, 'SIGKILL');
        console.log(`Agente ${agentId} recibió SIGKILL.`);
      } catch (killError) {
        console.error(`Error al enviar SIGKILL al agente ${agentId}:`, killError);
      }
    }
  }

  // Propósito: Obtener el estado real de todos los agentes activos.
  public getActiveAgentsStatus(): { id: string; pid: number; status: string }[] {
    const statuses: { id: string; pid: number; status: string }[] = [];
    
    for (const [id, agent] of this.activeAgents.entries()) {
      let status = agent.status;
      // Verificar si el proceso sigue vivo
      try {
        process.kill(agent.pid, 0);
      } catch (error) {
        status = 'error';
      }
      
      statuses.push({
        id,
        pid: agent.pid,
        status
      });
    }
    
    return statuses;
  }
}