/**
 * TokenEstimator - Estimacion precisa de tokens y costos LLM
 * Heuristicas por idioma, modelo, y contexto. Integrado con FrugalLedger.
 */

export interface TokenEstimate {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  model: string;
}

export interface ModelPricing {
  name: string;
  family: string;
  costPer1KInput: number;
  costPer1KOutput: number;
  contextWindow: number;
  local: boolean;
}

export class TokenEstimator {
  private readonly charRatios: Record<string, Record<string, number>> = {
    default: { en: 4.0, es: 2.5, fr: 3.0, de: 3.2, it: 3.1, pt: 2.7, zh: 1.5, ja: 1.5, ko: 1.8, ar: 2.2, ru: 2.4 },
    gpt4:    { en: 4.0, es: 2.8, fr: 3.2, de: 3.4, it: 3.3, pt: 2.9, zh: 1.8, ja: 1.8, ko: 2.0, ar: 2.4, ru: 2.6 },
    llama:   { en: 3.8, es: 2.3, fr: 2.8, de: 3.0, it: 2.9, pt: 2.5, zh: 1.4, ja: 1.4, ko: 1.6, ar: 2.1, ru: 2.3 },
    mistral: { en: 4.2, es: 2.6, fr: 3.1, de: 3.3, it: 3.2, pt: 2.8, zh: 1.6, ja: 1.6, ko: 1.9, ar: 2.3, ru: 2.5 },
    qwen:    { en: 3.5, es: 2.2, fr: 2.6, de: 2.8, it: 2.7, pt: 2.4, zh: 1.3, ja: 1.3, ko: 1.5, ar: 2.0, ru: 2.2 },
    deepseek:{ en: 3.9, es: 2.4, fr: 2.9, de: 3.1, it: 3.0, pt: 2.6, zh: 1.5, ja: 1.5, ko: 1.7, ar: 2.2, ru: 2.4 },
  };

  private readonly modelFamilies: Record<string, string> = {
    'llama3.2': 'llama', 'mistral': 'mistral', 'codellama': 'llama', 'phi4': 'llama',
    'qwen2.5-coder:14b': 'qwen', 'deepseek-coder:6.7b': 'deepseek',
    'meta-llama/llama-3.1-8b-instruct': 'llama', 'google/gemma-2-9b-it': 'llama',
    'nousresearch/hermes-3-llama-3.1-405b': 'llama', 'deepseek/deepseek-chat': 'deepseek',
    'gpt-4o-mini': 'gpt4', 'gpt-4o': 'gpt4',
  };

  detectLanguage(text: string): string {
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
    if (/[àâçéèêëïîôùûü]/.test(text)) return 'fr';
    if (/[äöüß]/.test(text)) return 'de';
    if (/[àèéìòù]/.test(text)) return 'it';
    if (/[ãõç]/.test(text)) return 'pt';
    return 'en';
  }

  estimate(text: string, modelName: string = 'default', language?: string): number {
    const family = this.modelFamilies[modelName] || 'default';
    const lang = language || this.detectLanguage(text);
    const ratio = this.charRatios[family]?.[lang] || this.charRatios.default[lang] || 4.0;
    return Math.max(1, Math.ceil(text.length / ratio));
  }

  estimateRequest(
    prompt: string,
    systemPrompt: string = '',
    expectedOutputLength: number = 500,
    modelName: string = 'default'
  ): Omit<TokenEstimate, 'estimatedCost' | 'model'> {
    const inputTokens = this.estimate(prompt + systemPrompt, modelName);
    const outputTokens = this.estimate('x'.repeat(expectedOutputLength), modelName);
    return {
      inputTokens,
      estimatedOutputTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  calculateCost(
    estimate: Omit<TokenEstimate, 'estimatedCost' | 'model'>,
    costPer1KInput: number,
    costPer1KOutput: number
  ): number {
    const inputCost = (estimate.inputTokens / 1000) * costPer1KInput;
    const outputCost = (estimate.estimatedOutputTokens / 1000) * costPer1KOutput;
    return Math.round((inputCost + outputCost) * 100000) / 100000;
  }

  recommendModel(
    prompt: string,
    options: {
      minQuality?: 'low' | 'medium' | 'high';
      maxBudget?: number;
      requireLocal?: boolean;
      preferredProvider?: string;
    } = {},
    availableModels: Array<{ name: string; family?: string; costPer1KInput: number; costPer1KOutput: number; contextWindow: number; local: boolean }>
  ): { model: any; estimate: TokenEstimate; cost: number; savingsVsExpensive: number } | null {
    const candidates = availableModels
      .filter(m => !options.requireLocal || m.local)
      .filter(m => !options.preferredProvider || (m.family || this.modelFamilies[m.name] || 'unknown') === options.preferredProvider)
      .map(m => {
        const estimate = this.estimateRequest(prompt, '', 500, m.name);
        const cost = this.calculateCost(estimate, m.costPer1KInput, m.costPer1KOutput);
        return { model: m, estimate: { ...estimate, estimatedCost: cost, model: m.name }, cost };
      })
      .filter(c => !options.maxBudget || c.cost <= options.maxBudget)
      .sort((a, b) => a.cost - b.cost);

    if (candidates.length === 0) return null;

    const cheapest = candidates[0];
    const mostExpensive = candidates[candidates.length - 1];
    const savingsVsExpensive = mostExpensive.cost > 0
      ? Math.round(((mostExpensive.cost - cheapest.cost) / mostExpensive.cost) * 100)
      : 0;

    return { ...cheapest, savingsVsExpensive };
  }
}

export const tokenEstimator = new TokenEstimator();
