/**
 * Analyzer Agent - Agente de Analisis con LLM Real
 * Analiza datos, textos, tendencias y genera insights usando LLMProvider.
 */

import { AgentTemplate } from '../AgentFactory.js';
import { llmProvider } from '../../llm/LLMProvider.js';

export const analyzerAgent: AgentTemplate = {
  type: 'analyzer',
  name: 'Data Analyst',
  description: 'Analiza datos y genera insights con LLM',
  defaultConfig: {
    temperature: 0.3,
    maxTokens: 4096,
  },

  async execute(task, config) {
    const start = Date.now();
    const data = task.payload?.data || task.payload?.text || JSON.stringify(task.payload);
    const analysisType = task.payload?.type || 'general';

    const systemPrompt = `Eres un analista de datos senior. Tu trabajo es analizar informacion y generar insights accionables.
Reglas:
- Se conciso pero completo
- Usa bullet points para hallazgos clave
- Incluye recomendaciones especificas
- Si hay datos numericos, calcula estadisticas basicas`;

    const prompt = `Analisis requerido: ${analysisType}

Datos a analizar:
${data.substring(0, 8000)}

Por favor proporciona:
1. Resumen ejecutivo (2-3 oraciones)
2. Hallazgos clave (bullet points)
3. Tendencias identificadas
4. Recomendaciones accionables
5. Riesgos o alertas`;

    try {
      const response = await llmProvider.generate({
        prompt,
        systemPrompt,
        temperature: config.temperature ?? 0.3,
        maxTokens: config.maxTokens ?? 4096,
        priority: 'quality',
      });

      return {
        success: true,
        result: {
          analysis: response.text,
          model: response.model,
          provider: response.provider,
          cost: response.cost,
          tokens: response.tokensUsed,
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
