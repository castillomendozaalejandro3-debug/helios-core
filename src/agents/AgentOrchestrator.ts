/**
 * AgentOrchestrator - Capa 5: Multi-Agente
 * Enruta tareas por capacidades y comunica via IPC nativo (child_process.fork).
 */

import { EventEmitter } from 'events';
import { agentFactory, AgentSpec } from './AgentFactory.js';

interface Task {
  id: string;
  type: string;
  priority: number;
  payload: any;
  requiredCapabilities: string[];
}

export class AgentOrchestrator extends EventEmitter {
  private taskQueue: Task[] = [];
  private assignments: Map<string, string> = new Map();

  submitTask(task: Omit<Task, 'id'>): string {
    const id = crypto.randomUUID();
    const fullTask: Task = { ...task, id };
    this.taskQueue.push(fullTask);
    
    this.taskQueue.sort((a, b) => b.priority - a.priority);
    
    this.emit('task-submitted', fullTask);
    this.processQueue();
    return id;
  }

  private processQueue(): void {
    const availableAgents = agentFactory.listAgents().filter(a => a.status === 'running');
    
    for (const task of this.taskQueue) {
      if (this.assignments.has(task.id)) continue;

      const bestAgent = this.findBestAgent(task, availableAgents);
      if (bestAgent) {
        this.assignments.set(task.id, bestAgent);
        agentFactory.executeTask(bestAgent, { type: task.type, priority: task.priority, payload: task.payload, requiredCapabilities: task.requiredCapabilities });
        this.emit('task-assigned', { taskId: task.id, agentId: bestAgent });
      }
    }

    this.taskQueue = this.taskQueue.filter(t => !this.assignments.has(t.id));
  }

  private findBestAgent(task: Task, agents: any[]): string | undefined {
    for (const agent of agents) {
      if (task.requiredCapabilities.includes(agent.type)) {
        return agent.id;
      }
    }
    return agents[0]?.id;
  }

  completeTask(taskId: string, result: any): void {
    this.assignments.delete(taskId);
    this.emit('task-completed', { taskId, result });
    this.processQueue();
  }

  stop(): void {
    this.taskQueue = [];
    this.assignments.clear();
    this.emit('orchestrator-stopped');
  }

  getQueueStatus(): { pending: number; assigned: number } {
    return {
      pending: this.taskQueue.length,
      assigned: this.assignments.size,
    };
  }
}

export const agentOrchestrator = new AgentOrchestrator();
