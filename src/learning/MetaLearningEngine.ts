/**
 * MetaLearningEngine - Capa 3: Cognicion y Memoria
 * Analiza rendimiento global y auto-ajusta hiperparametros de otros modulos.
 */

import { EventEmitter } from 'events';

interface HyperParameter {
  name: string;
  value: number;
  min: number;
  max: number;
  module: string;
}

export class MetaLearningEngine extends EventEmitter {
  private parameters: Map<string, HyperParameter> = new Map();
  private performanceHistory: number[] = [];

  register(module: string, name: string, initial: number, min: number, max: number): void {
    this.parameters.set(`${module}.${name}`, { name, value: initial, min, max, module });
  }

  adjust(module: string, name: string, performanceDelta: number): void {
    const key = `${module}.${name}`;
    const param = this.parameters.get(key);
    if (!param) return;

    const learningRate = 0.1;
    const newValue = param.value + learningRate * performanceDelta * (param.max - param.min);
    param.value = Math.max(param.min, Math.min(param.max, newValue));

    this.emit('parameter-adjusted', { module, name, oldValue: param.value, newValue });
  }

  optimizeAll(performanceMetric: number): void {
    this.performanceHistory.push(performanceMetric);
    if (this.performanceHistory.length > 100) this.performanceHistory.shift();

    const trend = this.calculateTrend();
    
    for (const [key, param] of this.parameters) {
      if (trend === 'improving') {
        this.adjust(param.module, param.name, 0.1);
      } else if (trend === 'degrading') {
        this.adjust(param.module, param.name, -0.2);
      }
    }
  }

  private calculateTrend(): 'improving' | 'stable' | 'degrading' {
    if (this.performanceHistory.length < 10) return 'stable';
    const recent = this.performanceHistory.slice(-5);
    const older = this.performanceHistory.slice(-10, -5);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    if (recentAvg > olderAvg * 1.1) return 'improving';
    if (recentAvg < olderAvg * 0.9) return 'degrading';
    return 'stable';
  }

  getParameters(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, param] of this.parameters) {
      result[key] = param.value;
    }
    return result;
  }
}

export const metaLearningEngine = new MetaLearningEngine();
