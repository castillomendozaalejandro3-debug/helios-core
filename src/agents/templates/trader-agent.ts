/**
 * Trader Agent - Agente de Trading con LLM Real
 * Analiza datos de mercado y genera recomendaciones usando LLMProvider.
 * NOTA: Este agente es puramente informativo/analitico. No ejecuta trades reales.
 */

import { AgentTemplate } from '../AgentFactory.js';
import { llmProvider } from '../../llm/LLMProvider.js';

export const traderAgent: AgentTemplate = {
  type: 'trader',
  name: 'Market Analyst',
  description: 'Analiza mercados y genera insights con LLM (solo analisis, no trades reales)',
  defaultConfig: {
    temperature: 0.2,
    maxTokens: 4096,
  },

  async execute(task, config) {
    const start = Date.now();
    const marketData = task.payload?.data || task.payload?.marketData || JSON.stringify(task.payload);
    const asset = task.payload?.asset || 'general';
    const timeframe = task.payload?.timeframe || '1d';
    const analysisType = task.payload?.analysisType || 'technical';

    const systemPrompt = `Eres un analista financiero cuantitativo senior. Tu trabajo es analizar datos de mercado y generar reportes de inversion.
DISCLAIMER: Este es un analisis puramente informativo. No constituye asesoria financiera.
Reglas:
- Usa lenguaje tecnico pero claro
- Incluye niveles de soporte/resistencia cuando aplique
- Menciona riesgos explicitamente
- NUNCA garantices retornos
- Se objetivo y basado en datos`;

    const prompt = `Activo: ${asset}
Timeframe: ${timeframe}
Tipo de analisis: ${analysisType}

Datos de mercado:
${typeof marketData === 'string' ? marketData.substring(0, 8000) : JSON.stringify(marketData).substring(0, 8000)}

Por favor proporciona:
1. Resumen del estado actual
2. Analisis tecnico (si aplica)
3. Analisis fundamental (si aplica)
4. Sentimiento de mercado
5. Niveles clave (soporte/resistencia)
6. Escenarios: alcista, neutral, bajista
7. Riesgos identificados
8. Recomendacion final (con disclaimer)`;

    try {
      const response = await llmProvider.generate({
        prompt,
        systemPrompt,
        temperature: config.temperature ?? 0.2,
        maxTokens: config.maxTokens ?? 4096,
        priority: 'quality',
      });

      return {
        success: true,
        result: {
          analysis: response.text,
          asset,
          timeframe,
          model: response.model,
          provider: response.provider,
          cost: response.cost,
          disclaimer: 'Este analisis es puramente informativo. No constituye asesoria financiera. Invertir conlleva riesgos.',
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
