/**
 * AgentFactory - Fabrica de Agentes con LLM Real
 * Los agentes ahora usan LLMProvider para procesamiento real.
 */

import { EventEmitter } from 'events';
import { analyzerAgent } from './templates/analyzer-agent.js';
import { creativeAgent } from './templates/creative-agent.js';
import { learnerAgent } from './templates/learner-agent.js';
import { monitorAgent } from './templates/monitor-agent.js';
import { scraperAgent } from './templates/scraper-agent.js';
import { traderAgent } from './templates/trader-agent.js';

export interface AgentSpec {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  status: 'idle' | 'running' | 'stopped' | 'crashed';
  completedTasks: number;
  failedTasks: number;
  score: number;
  createdAt: number;
}

export interface AgentTask {
  type: string;
  priority: number;
  payload: Record<string, any>;
  requiredCapabilities?: string[];
}

export interface AgentResult {
  success: boolean;
  result: any;
  metadata: Record<string, any>;
}

export interface AgentTemplate {
  type: string;
  name: string;
  description: string;
  defaultConfig: Record<string, any>;
  execute(task: AgentTask, config: Record<string, any>): Promise<AgentResult>;
}

export class AgentFactory extends EventEmitter {
  private templates: Map<string, AgentTemplate> = new Map();
  private agents: Map<string, AgentSpec> = new Map();
  private agentResults: Map<string, AgentResult[]> = new Map();

  constructor() {
    super();
    this.registerTemplate(analyzerAgent);
    this.registerTemplate(creativeAgent);
    this.registerTemplate(learnerAgent);
    this.registerTemplate(monitorAgent);
    this.registerTemplate(scraperAgent);
    this.registerTemplate(traderAgent);
  }

  registerTemplate(template: AgentTemplate): void {
    this.templates.set(template.type, template);
  }

  createAgent(name: string, type: string, options: Record<string, any> = {}): AgentSpec {
    const template = this.templates.get(type);
    if (!template) throw new Error(`Agent template '${type}' no encontrado`);

    const spec: AgentSpec = {
      id: crypto.randomUUID(),
      name,
      type,
      config: { ...template.defaultConfig, ...options },
      status: 'idle',
      completedTasks: 0,
      failedTasks: 0,
      score: 0,
      createdAt: Date.now(),
    };

    this.agents.set(spec.id, spec);
    this.agentResults.set(spec.id, []);
    this.emit('agent-created', spec);
    return spec;
  }

  startAgent(spec: AgentSpec): boolean {
    const agent = this.agents.get(spec.id);
    if (!agent) return false;
    agent.status = 'running';
    this.emit('agent-started', agent);
    return true;
  }

  stopAgent(id: string): boolean {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.status = 'stopped';
    this.emit('agent-stopped', agent);
    return true;
  }

  async executeTask(agentId: string, task: AgentTask): Promise<AgentResult> {
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, result: { error: 'Agente no encontrado' }, metadata: {} };

    const template = this.templates.get(agent.type);
    if (!template) return { success: false, result: { error: 'Template no encontrado' }, metadata: {} };

    agent.status = 'running';
    this.emit('task-started', { agentId, task });

    try {
      const result = await template.execute(task, agent.config);

      if (result.success) {
        agent.completedTasks++;
        agent.score += 10;
      } else {
        agent.failedTasks++;
        agent.score -= 5;
      }

      const results = this.agentResults.get(agentId) || [];
      results.push(result);
      if (results.length > 100) results.shift();
      this.agentResults.set(agentId, results);

      agent.status = 'idle';
      this.emit('task-completed', { agentId, result });
      return result;
    } catch (err) {
      agent.status = 'crashed';
      agent.failedTasks++;
      agent.score -= 20;
      this.emit('agent-crashed', { agentId, error: (err as Error).message });
      return { success: false, result: { error: (err as Error).message }, metadata: {} };
    }
  }

  listAgents(): AgentSpec[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): AgentSpec | undefined {
    return this.agents.get(id);
  }

  getResults(agentId: string): AgentResult[] {
    return this.agentResults.get(agentId) || [];
  }

  getStats(): {
    totalAgents: number;
    activeAgents: number;
    completedTasks: number;
    failedTasks: number;
    averageScore: number;
    byType: Record<string, number>;
  } {
    const all = Array.from(this.agents.values());
    const byType: Record<string, number> = {};
    for (const a of all) {
      byType[a.type] = (byType[a.type] || 0) + 1;
    }
    return {
      totalAgents: all.length,
      activeAgents: all.filter(a => a.status === 'running').length,
      completedTasks: all.reduce((s, a) => s + a.completedTasks, 0),
      failedTasks: all.reduce((s, a) => s + a.failedTasks, 0),
      averageScore: all.length > 0 ? all.reduce((s, a) => s + a.score, 0) / all.length : 0,
      byType,
    };
  }
}

export const agentFactory = new AgentFactory();
