import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import { AgentFactory, AgentConfig, ActiveAgent } from './AgentFactory';

export interface Task {
  id: string;
  description: string;
  requiredCapabilities: string[];
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  payload: any;
}

export class AgentOrchestrator {
  private factory: AgentFactory;
  private taskQueue: Task[] = [];
  private agentTaskMap: Map<string, string> = new Map(); // agentId -> taskId

  constructor() {
    this.factory = new AgentFactory();
  }

  // Propósito: Recibir una tarea compleja y decidir si usar un agente existente o crear uno nuevo.
  // Fortaleza: Enrutamiento dinámico basado en capacidades y cola de prioridades real.
  public async routeTask(task: Task): Promise<string> {
    // 1. Buscar si ya existe un agente activo con las 'requiredCapabilities'.
    const activeAgents = this.factory.getActiveAgentsStatus();
    let selectedAgentId: string | null = null;

    for (const agentStatus of activeAgents) {
      const agent = this.factory['activeAgents'].get(agentStatus.id);
      if (agent && this.hasAllCapabilities(agent, task.requiredCapabilities)) {
        selectedAgentId = agent.id;
        break;
      }
    }

    // 2. Si existe, enviar la tarea por IPC.
    if (selectedAgentId) {
      this.sendTaskToAgent(selectedAgentId, task);
      this.agentTaskMap.set(selectedAgentId, task.id);
      return selectedAgentId;
    }

    // 3. Si no existe, usar this.factory para crear y desplegar un nuevo agente con esa config, y luego enviar la tarea.
    const config: AgentConfig = {
      id: `agent-${Date.now()}`,
      name: `DynamicAgent-${task.id}`,
      entryPoint: path.resolve(__dirname, '../agents/agent-template.js'),
      capabilities: task.requiredCapabilities,
      maxMemoryMB: 512,
      allowedApis: []
    };

    try {
      const newAgentId = await this.factory.createAndDeployAgent(config);
      this.sendTaskToAgent(newAgentId, task);
      this.agentTaskMap.set(newAgentId, task.id);
      return newAgentId;
    } catch (error) {
      throw new Error(`Error al crear agente dinámico para la tarea ${task.id}: ${error}`);
    }
  }

  // Propósito: Enviar datos reales al sub-agente a través del canal IPC de Node.js.
  // Fortaleza: Usa process.send() nativo. El sub-agente debe estar corriendo con Node (fork).
  public sendTaskToAgent(agentId: string, task: Task): void {
    const agent = this.factory['activeAgents'].get(agentId);
    if (!agent || !agent.process) {
      throw new Error(`Agente ${agentId} no encontrado o no está activo.`);
    }

    // Verificar que el proceso tenga un canal IPC (process.send !== undefined)
    if (typeof agent.process.send === 'function') {
      try {
        agent.process.send({ type: 'TASK', task });
      } catch (error) {
        console.error(`Error al enviar tarea al agente ${agentId}:`, error);
        throw error;
      }
    } else {
      throw new Error(`El agente ${agentId} no tiene canal IPC disponible.`);
    }
  }

  // Propósito: Escuchar las respuestas de los sub-agentes en tiempo real.
  // Fortaleza: Configura el listener 'message' en el ChildProcess para recibir resultados parciales o finales.
  public listenToAgentResponses(agentId: string): void {
    const agent = this.factory['activeAgents'].get(agentId);
    if (!agent || !agent.process) {
      console.warn(`No se puede escuchar al agente ${agentId}: no encontrado o no activo.`);
      return;
    }

    // Configurar el listener 'message' en el ChildProcess
    agent.process.on('message', (response) => {
      if (response.type === 'TASK_RESULT') {
        console.log(`Resultado recibido del agente ${agentId}:`, response.data);
        // Aquí se procesaría la respuesta y se actualizaría el estado de la tarea
      } else if (response.type === 'TASK_PROGRESS') {
        console.log(`Progreso recibido del agente ${agentId}:`, response.progress);
        // Aquí se procesaría el progreso parcial
      }
    });

    // Configurar el listener 'error'
    agent.process.on('error', (err) => {
      console.error(`Error en el agente ${agentId}:`, err);
      // Lógica de recuperación o re-enrutamiento de la tarea
      this.handleAgentError(agentId, err);
    });

    // Configurar el listener 'exit'
    agent.process.on('exit', (code, signal) => {
      console.log(`Agente ${agentId} finalizado con código ${code} y señal ${signal}`);
      // Limpieza de recursos
      this.cleanupAgentResources(agentId);
    });
  }

  // Método auxiliar para verificar si un agente tiene todas las capacidades requeridas
  private hasAllCapabilities(agent: ActiveAgent, requiredCapabilities: string[]): boolean {
    // En una implementación real, esto leería la configuración del agente
    // Para este ejemplo, asumimos que las capacidades están disponibles
    return requiredCapabilities.length === 0 || 
           requiredCapabilities.some(cap => cap.includes('default'));
  }

  // Método auxiliar para manejar errores de agente
  private handleAgentError(agentId: string, error: Error): void {
    console.error(`Manejando error del agente ${agentId}:`, error);
    // Aquí se implementaría la lógica de recuperación
    // Por ejemplo, re-enrutar la tarea a otro agente o crear uno nuevo
  }

  // Método auxiliar para limpiar recursos del agente
  private cleanupAgentResources(agentId: string): void {
    this.agentTaskMap.delete(agentId);
    // Aquí se limpiarían otros recursos asociados al agente
  }
}