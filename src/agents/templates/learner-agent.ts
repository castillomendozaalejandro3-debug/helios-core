/**
 * Learner Agent - Agente de Aprendizaje con LLM Real
 * Aprende de documentos, tutoriales, y genera resumenes y guias usando LLMProvider.
 */

import { AgentTemplate } from '../AgentFactory.js';
import { llmProvider } from '../../llm/LLMProvider.js';

export const learnerAgent: AgentTemplate = {
  type: 'learner',
  name: 'Auto-Learner',
  description: 'Aprende de documentos y genera guias con LLM',
  defaultConfig: {
    temperature: 0.2,
    maxTokens: 4096,
  },

  async execute(task, config) {
    const start = Date.now();
    const content = task.payload?.content || task.payload?.text || JSON.stringify(task.payload);
    const topic = task.payload?.topic || 'general';
    const depth = task.payload?.depth || 'intermediate';

    const systemPrompt = `Eres un experto en pedagogia y aprendizaje acelerado. Tu trabajo es:
1. Analizar contenido y extraer conocimiento estructurado
2. Generar resumenes, guias de estudio y flashcards
3. Identificar conceptos clave y sus relaciones
4. Crear ejercicios practicos
Reglas:
- Estructura clara con headers
- Usa analogias cuando ayuden
- Incluye ejemplos de codigo cuando aplique
- Genera preguntas de auto-evaluacion`;

    const prompt = `Tema: ${topic}
Nivel de profundidad: ${depth}

Contenido a aprender:
${content.substring(0, 10000)}

Por favor genera:
1. Resumen ejecutivo (max 200 palabras)
2. Conceptos clave con definiciones
3. Mapa mental en formato texto
4. Guia de estudio paso a paso
5. 5 preguntas de auto-evaluacion con respuestas
6. Recursos adicionales sugeridos`;

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
          learningMaterial: response.text,
          topic,
          depth,
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
