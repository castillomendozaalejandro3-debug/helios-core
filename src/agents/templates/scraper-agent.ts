/**
 * Scraper Agent - Agente de Extraccion Web con LLM Real
 * Usa RPABrowser para navegar y LLMProvider para extraer y estructurar datos.
 */

import { AgentTemplate } from '../AgentFactory.js';
import { llmProvider } from '../../llm/LLMProvider.js';
import { rpaBrowser } from '../../integrations/RPABrowser.js';

export const scraperAgent: AgentTemplate = {
  type: 'scraper',
  name: 'Web Scraper',
  description: 'Extrae y estructura datos de la web usando RPA + LLM',
  defaultConfig: {
    temperature: 0.1,
    maxTokens: 4096,
  },

  async execute(task, config) {
    const start = Date.now();
    const url = task.payload?.url;
    const selector = task.payload?.selector;
    const extractionGoal = task.payload?.goal || 'extraer datos estructurados';

    if (!url) {
      return { success: false, result: { error: 'URL requerida' }, metadata: { duration: 0 } };
    }

    try {
      // Paso 1: Extraer HTML via RPA
      let rawData: string;
      if (selector) {
        const extractResult = await rpaBrowser.extract(url, selector);
        rawData = JSON.stringify(extractResult.data);
      } else {
        const scrapeResult = await rpaBrowser.scrapeStatic(url);
        rawData = scrapeResult.data?.html || '';
      }

      // Paso 2: Procesar con LLM
      const systemPrompt = `Eres un extractor de datos web experto. Tu trabajo es analizar HTML o datos crudos y extraer informacion estructurada en formato JSON.
Reglas:
- Devuelve SIEMPRE un JSON valido
- Identifica entidades, atributos y relaciones
- Limpia y normaliza los datos
- Si hay fechas, conviertelas a ISO 8601`;

      const prompt = `Objetivo de extraccion: ${extractionGoal}

Datos crudos extraidos de ${url}:
${rawData.substring(0, 10000)}

Extrae la informacion en formato JSON con la siguiente estructura:
{
  "entities": [{"type": "...", "name": "...", "attributes": {}}],
  "relationships": [],
  "summary": "...",
  "dataQuality": "high|medium|low"
}`;

      const response = await llmProvider.generate({
        prompt,
        systemPrompt,
        temperature: config.temperature ?? 0.1,
        maxTokens: config.maxTokens ?? 4096,
        priority: 'cost',
      });

      let structuredData;
      try {
        structuredData = JSON.parse(response.text);
      } catch {
        structuredData = { raw: response.text, parseError: true };
      }

      return {
        success: true,
        result: {
          data: structuredData,
          url,
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
