/**
 * Monitor Agent - Agente de Monitoreo con LLM Real
 * Analiza logs, metricas y alertas, genera reportes usando LLMProvider.
 */

import { AgentTemplate } from '../AgentFactory.js';
import { llmProvider } from '../../llm/LLMProvider.js';

export const monitorAgent: AgentTemplate = {
  type: 'monitor',
  name: 'System Monitor',
  description: 'Monitorea sistemas y genera reportes con LLM',
  defaultConfig: {
    temperature: 0.1,
    maxTokens: 2048,
  },

  async execute(task, config) {
    const start = Date.now();
    const logs = task.payload?.logs || task.payload?.data || JSON.stringify(task.payload);
    const metricType = task.payload?.metricType || 'general';
    const threshold = task.payload?.threshold;

    const systemPrompt = `Eres un ingeniero de confiabilidad senior (SRE). Tu trabajo es analizar logs y metricas de sistemas.
Reglas:
- Identifica patrones anomalos
- Clasifica severidad: CRITICAL, WARNING, INFO
- Sugiere acciones correctivas especificas
- Prioriza por impacto en negocio
- Se conciso y accionable`;

    const prompt = `Tipo de metrica: ${metricType}
${threshold ? `Umbral configurado: ${threshold}` : ''}

Datos a analizar:
${typeof logs === 'string' ? logs.substring(0, 8000) : JSON.stringify(logs).substring(0, 8000)}

Por favor proporciona:
1. Estado general del sistema (salud %)
2. Anomalias detectadas (con severidad)
3. Tendencias (mejorando/estable/degradando)
4. Acciones recomendadas (priorizadas)
5. Alertas que deberian configurarse`;

    try {
      const response = await llmProvider.generate({
        prompt,
        systemPrompt,
        temperature: config.temperature ?? 0.1,
        maxTokens: config.maxTokens ?? 2048,
        priority: 'speed',
      });

      return {
        success: true,
        result: {
          report: response.text,
          metricType,
          model: response.model,
          provider: response.provider,
          cost: response.cost,
        },
        metadata: {
          duration: Date.now() - start,
          model: response.model,
        },
      };
    } catch (err) {
      return {
        success: false,
        result: { error: (err as Error).message },
        metadata: { duration: Date.now() - start },
      };
    }
  },
};
