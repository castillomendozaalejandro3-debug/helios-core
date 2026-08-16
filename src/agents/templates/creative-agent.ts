/**
 * Creative Agent - Agente Creativo con LLM Real
 * Genera contenido, ideas, copy, codigo creativo usando LLMProvider.
 */

import { AgentTemplate } from '../AgentFactory.js';
import { llmProvider } from '../../llm/LLMProvider.js';

export const creativeAgent: AgentTemplate = {
  type: 'creative',
  name: 'Creative Writer',
  description: 'Genera contenido creativo, copy, ideas y codigo con LLM',
  defaultConfig: {
    temperature: 0.8,
    maxTokens: 4096,
  },

  async execute(task, config) {
    const start = Date.now();
    const brief = task.payload?.brief || task.payload?.description || JSON.stringify(task.payload);
    const contentType = task.payload?.type || 'text';
    const tone = task.payload?.tone || 'professional';
    const language = task.payload?.language || 'es';

    const systemPrompt = `Eres un creativo senior con experiencia en marketing, copywriting, desarrollo y diseno.
Reglas:
- Adapta el tono segun se solicite
- Genera contenido original y de alta calidad
- Incluye variantes cuando sea apropiado
- Usa el idioma: ${language}
- Se creativo pero siempre profesional`;

    const prompt = `Tipo de contenido: ${contentType}
Tono requerido: ${tone}
Idioma: ${language}

Brief/Descripcion:
${brief}

Por favor genera:
1. Version principal (completa y pulida)
2. 2-3 variantes alternativas
3. Sugerencias de mejora
4. Meta-datos (titulo sugerido, keywords, longitud)`;

    try {
      const response = await llmProvider.generate({
        prompt,
        systemPrompt,
        temperature: config.temperature ?? 0.8,
        maxTokens: config.maxTokens ?? 4096,
        priority: 'quality',
      });

      return {
        success: true,
        result: {
          content: response.text,
          type: contentType,
          tone,
          language,
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
