/**
 * RewardSystem - Capa 3: Cognicion y Memoria
 * Sistema de refuerzo: +10 exito, -20 perdida. Optimiza estrategias.
 */

import { EventEmitter } from 'events';

interface RewardEvent {
  timestamp: number;
  agentId: string;
  action: string;
  outcome: 'success' | 'failure' | 'partial';
  reward: number;
  context: Record<string, any>;
}

export class RewardSystem extends EventEmitter {
  private events: RewardEvent[] = [];
  private agentScores: Map<string, number> = new Map();

  record(agentId: string, action: string, outcome: 'success' | 'failure' | 'partial', context: Record<string, any> = {}): void {
    const reward = outcome === 'success' ? 10 : outcome === 'failure' ? -20 : 0;
    const event: RewardEvent = {
      timestamp: Date.now(),
      agentId,
      action,
      outcome,
      reward,
      context,
    };
    this.events.push(event);

    const current = this.agentScores.get(agentId) || 0;
    this.agentScores.set(agentId, current + reward);

    this.emit('reward-recorded', event);

    if (this.agentScores.get(agentId)! < -50) {
      this.emit('agent-penalized', { agentId, score: this.agentScores.get(agentId) });
    }
  }

  getAgentScore(agentId: string): number {
    return this.agentScores.get(agentId) || 0;
  }

  getBestAgents(limit: number = 5): Array<{ agentId: string; score: number }> {
    return Array.from(this.agentScores.entries())
      .map(([agentId, score]) => ({ agentId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getStats(): { totalEvents: number; totalReward: number; agentCount: number } {
    return {
      totalEvents: this.events.length,
      totalReward: this.events.reduce((s, e) => s + e.reward, 0),
      agentCount: this.agentScores.size,
    };
  }
}

export const rewardSystem = new RewardSystem();
