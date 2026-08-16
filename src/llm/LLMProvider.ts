/**
 * LLMProvider - Motor de Lenguaje Unificado para Helios
 * Prioridad: Ollama local (gratis) → OpenRouter (barato) → OpenAI (fallback)
 * Integrado con FrugalToolKit para seleccion automatica del modelo mas economico.
 */

import { EventEmitter } from 'events';
import { configManager } from '../config/ConfigManager.js';
import { frugalToolKit, ToolLevel } from '../frugality/FrugalToolKit.js';
import { frugalLedger, TransactionType } from '../frugality/FrugalLedger.js';
import { tokenEstimator } from './TokenEstimator.js';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  priority?: 'speed' | 'quality' | 'cost';
}

export interface LLMResponse {
  text: string;
  model: string;
  provider: 'ollama' | 'openrouter' | 'openai' | 'local';
  tokensUsed: number;
  cost: number;
  latencyMs: number;
  cached?: boolean;
}

export interface ModelConfig {
  name: string;
  provider: 'ollama' | 'openrouter' | 'openai';
  contextWindow: number;
  costPer1KInput: number;
  costPer1KOutput: number;
  capabilities: string[];
  local: boolean;
}

export class LLMProvider extends EventEmitter {
  private cache: Map<string, { response: LLMResponse; timestamp: number }> = new Map();
  private cacheTtlMs = 5 * 60 * 1000; // 5 min cache
  private requestLog: Array<{ timestamp: number; provider: string; model: string; cost: number; latency: number; success: boolean }> = [];

  private models: ModelConfig[] = [
    // Ollama local - GRATIS
    { name: 'llama3.2', provider: 'ollama', contextWindow: 128000, costPer1KInput: 0, costPer1KOutput: 0, capabilities: ['chat', 'code', 'analysis'], local: true },
    { name: 'mistral', provider: 'ollama', contextWindow: 32000, costPer1KInput: 0, costPer1KOutput: 0, capabilities: ['chat', 'code', 'summarization'], local: true },
    { name: 'codellama', provider: 'ollama', contextWindow: 16000, costPer1KInput: 0, costPer1KOutput: 0, capabilities: ['code', 'completion'], local: true },
    { name: 'phi4', provider: 'ollama', contextWindow: 128000, costPer1KInput: 0, costPer1KOutput: 0, capabilities: ['chat', 'reasoning', 'analysis'], local: true },
    { name: 'qwen2.5-coder:14b', provider: 'ollama', contextWindow: 128000, costPer1KInput: 0, costPer1KOutput: 0, capabilities: ['code', 'completion', 'analysis'], local: true },
    { name: 'deepseek-coder:6.7b', provider: 'ollama', contextWindow: 16000, costPer1KInput: 0, costPer1KOutput: 0, capabilities: ['code', 'completion'], local: true },
    // OpenRouter - BARATO
    { name: 'meta-llama/llama-3.1-8b-instruct', provider: 'openrouter', contextWindow: 128000, costPer1KInput: 0.0001, costPer1KOutput: 0.0002, capabilities: ['chat', 'code', 'analysis'], local: false },
    { name: 'google/gemma-2-9b-it', provider: 'openrouter', contextWindow: 8000, costPer1KInput: 0.0001, costPer1KOutput: 0.0002, capabilities: ['chat', 'summarization'], local: false },
    { name: 'nousresearch/hermes-3-llama-3.1-405b', provider: 'openrouter', contextWindow: 128000, costPer1KInput: 0.0005, costPer1KOutput: 0.001, capabilities: ['chat', 'reasoning', 'code'], local: false },
    { name: 'deepseek/deepseek-chat', provider: 'openrouter', contextWindow: 64000, costPer1KInput: 0.00014, costPer1KOutput: 0.00028, capabilities: ['chat', 'code', 'reasoning'], local: false },
    // OpenAI - Fallback (caro)
    { name: 'gpt-4o-mini', provider: 'openai', contextWindow: 128000, costPer1KInput: 0.00015, costPer1KOutput: 0.0006, capabilities: ['chat', 'code', 'vision', 'analysis'], local: false },
    { name: 'gpt-4o', provider: 'openai', contextWindow: 128000, costPer1KInput: 0.0025, costPer1KOutput: 0.01, capabilities: ['chat', 'code', 'vision', 'reasoning'], local: false },
  ];

  // ----------------------------------------------------------
  // SELECCION INTELIGENTE DE MODELO
  // ----------------------------------------------------------

  private selectModel(request: LLMRequest): ModelConfig {
    const priority = request.priority || 'cost';
    const required = request.model;

    // Si se especifico un modelo exacto
    if (required) {
      const exact = this.models.find(m => m.name === required);
      if (exact) return exact;
    }

    // Filtrar por capacidades necesarias
    const candidates = this.models.filter(m => {
      if (request.maxTokens && m.contextWindow < request.maxTokens) return false;
      return true;
    });

    // Ordenar segun prioridad
    if (priority === 'cost') {
      // Preferir local gratis primero
      return candidates.sort((a, b) => {
        if (a.local && !b.local) return -1;
        if (!a.local && b.local) return 1;
        return (a.costPer1KInput + a.costPer1KOutput) - (b.costPer1KInput + b.costPer1KOutput);
      })[0] || this.models[0];
    }

    if (priority === 'quality') {
      return candidates.sort((a, b) => b.contextWindow - a.contextWindow)[0] || this.models[0];
    }

    // speed: modelos pequenos
    return candidates.sort((a, b) => a.contextWindow - b.contextWindow)[0] || this.models[0];
  }

  // ----------------------------------------------------------
  // GENERACION
  // ----------------------------------------------------------

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const start = Date.now();
    const model = this.selectModel(request);

    // Pre-estimar costo antes de llamar
    const preEstimate = tokenEstimator.estimateRequest(
      request.prompt,
      request.systemPrompt,
      request.maxTokens || 500,
      model.name
    );
    const preCost = tokenEstimator.calculateCost(preEstimate, model.costPer1KInput, model.costPer1KOutput);

    // Verificar cache
    const cacheKey = this.hashRequest(request);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      this.emit('cache-hit', { model: model.name, savedCost: preCost });
      return { ...cached.response, cached: true };
    }

    // Log frugal: registrar intencion de usar LLM
    const toolSel = frugalToolKit.selectTool('text-generation');
    if (toolSel && toolSel.tool.level <= ToolLevel.FREE_WEB) {
      frugalToolKit.logUsage(toolSel.tool.name, 0, true);
    }

    let response: LLMResponse;

    try {
      if (model.provider === 'ollama') {
        response = await this.callOllama(request, model);
      } else if (model.provider === 'openrouter') {
        response = await this.callOpenRouter(request, model);
      } else {
        response = await this.callOpenAI(request, model);
      }

      // Registrar costo real vs estimado en ledger
      const actualCost = response.cost;
      const costVariance = actualCost - preCost;
      if (actualCost > 0) {
        await frugalLedger.recordExpense(
          actualCost,
          'api_call',
          'llm_' + model.provider,
          model.provider,
          {
            estimatedROI: 2.0,
            justification: `LLM ${model.name} para: ${request.prompt.substring(0, 50)}...`,
            metadata: {
              model: model.name,
              tokensUsed: response.tokensUsed,
              estimatedTokens: preEstimate.totalTokens,
              costVariance: Math.round(costVariance * 100000) / 100000,
            },
          }
        );
      }

      // Guardar en cache
      this.cache.set(cacheKey, { response, timestamp: Date.now() });
      if (this.cache.size > 1000) {
        const first = this.cache.keys().next().value;
        if (first) this.cache.delete(first);
      }

      this.logRequest(model.provider, model.name, response.cost, Date.now() - start, true);
      this.emit('generation-complete', {
        model: model.name,
        cost: response.cost,
        latency: response.latencyMs,
        estimatedCost: preCost,
        costVariance,
      });

      return response;
    } catch (err) {
      this.logRequest(model.provider, model.name, 0, Date.now() - start, false);
      this.emit('generation-error', { model: model.name, error: (err as Error).message });

      // Fallback al siguiente modelo mas barato
      const fallback = this.models.find(m => m.name !== model.name && (m.local || m.costPer1KInput < 0.001));
      if (fallback) {
        this.emit('fallback', { from: model.name, to: fallback.name });
        return this.generate({ ...request, model: fallback.name });
      }

      throw err;
    }
  }

  // ----------------------------------------------------------
  // PROVEEDORES
  // ----------------------------------------------------------

  private async callOllama(request: LLMRequest, model: ModelConfig): Promise<LLMResponse> {
    const ollamaUrl = configManager.config.LOCAL_LLM_ENDPOINT || 'http://localhost:11434';
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.name,
        prompt: request.systemPrompt ? `[SYSTEM] ${request.systemPrompt}\n\n${request.prompt}` : request.prompt,
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 2048,
        },
      }),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json() as any;

    return {
      text: data.response || '',
      model: model.name,
      provider: 'ollama',
      tokensUsed: data.eval_count || Math.ceil((request.prompt.length + (data.response?.length || 0)) / 4),
      cost: 0,
      latencyMs: Date.now(),
    };
  }

  private async callOpenRouter(request: LLMRequest, model: ModelConfig): Promise<LLMResponse> {
    const apiKey = configManager.config.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OpenRouter API key no configurada');

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://helios.ai',
        'X-Title': 'Helios AI',
      },
      body: JSON.stringify({
        model: model.name,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.prompt },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || Math.ceil((request.prompt.length + text.length) / 4);
    const cost = (tokens / 1000) * (model.costPer1KInput + model.costPer1KOutput);

    return {
      text,
      model: model.name,
      provider: 'openrouter',
      tokensUsed: tokens,
      cost: Math.round(cost * 100000) / 100000,
      latencyMs: Date.now(),
    };
  }

  private async callOpenAI(request: LLMRequest, model: ModelConfig): Promise<LLMResponse> {
    const apiKey = configManager.config.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key no configurada');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.name,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.prompt },
        ],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json() as any;
    const text = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || Math.ceil((request.prompt.length + text.length) / 4);
    const cost = (tokens / 1000) * (model.costPer1KInput + model.costPer1KOutput);

    return {
      text,
      model: model.name,
      provider: 'openai',
      tokensUsed: tokens,
      cost: Math.round(cost * 100000) / 100000,
      latencyMs: Date.now(),
    };
  }

  // ----------------------------------------------------------
  // UTILIDADES
  // ----------------------------------------------------------

  private hashRequest(req: LLMRequest): string {
    const str = `${req.prompt}|${req.systemPrompt || ''}|${req.model || ''}|${req.temperature || 0.7}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private logRequest(provider: string, model: string, cost: number, latency: number, success: boolean): void {
    this.requestLog.push({ timestamp: Date.now(), provider, model, cost, latency, success });
    if (this.requestLog.length > 5000) this.requestLog = this.requestLog.slice(-2500);
  }

  getStats(): {
    totalRequests: number;
    avgLatency: number;
    totalCost: number;
    cacheHitRate: number;
    byProvider: Record<string, { requests: number; cost: number; successRate: number }>;
    models: ModelConfig[];
  } {
    const total = this.requestLog.length;
    const recent = this.requestLog.slice(-100);
    const avgLatency = recent.length > 0 ? recent.reduce((s, r) => s + r.latency, 0) / recent.length : 0;
    const totalCost = this.requestLog.reduce((s, r) => s + r.cost, 0);
    const cacheHits = recent.filter(r => r.cost === 0 && r.latency < 10).length;

    const byProvider: Record<string, { requests: number; cost: number; successRate: number }> = {};
    for (const r of this.requestLog) {
      if (!byProvider[r.provider]) byProvider[r.provider] = { requests: 0, cost: 0, successRate: 0 };
      byProvider[r.provider].requests++;
      byProvider[r.provider].cost += r.cost;
    }
    for (const p of Object.keys(byProvider)) {
      const provEntries = this.requestLog.filter(r => r.provider === p);
      byProvider[p].successRate = provEntries.filter(r => r.success).length / provEntries.length;
    }

    return {
      totalRequests: total,
      avgLatency: Math.round(avgLatency),
      totalCost: Math.round(totalCost * 10000) / 10000,
      cacheHitRate: recent.length > 0 ? cacheHits / recent.length : 0,
      byProvider,
      models: this.models,
    };
  }

  getModels(): ModelConfig[] {
    return [...this.models];
  }

  getAvailableModels(): ModelConfig[] {
    return [...this.models];
  }

  async testConnection(): Promise<{ ollama: boolean; openrouter: boolean; openai: boolean }> {
    const results = { ollama: false, openrouter: false, openai: false };

    // Test Ollama
    try {
      const ollamaUrl = configManager.config.LOCAL_LLM_ENDPOINT || 'http://localhost:11434';
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      results.ollama = res.ok;
    } catch { /* ignore */ }

    // Test OpenRouter
    try {
      const apiKey = configManager.config.OPENROUTER_API_KEY;
      if (apiKey) {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        results.openrouter = res.ok;
      }
    } catch { /* ignore */ }

    // Test OpenAI
    try {
      const apiKey = configManager.config.OPENAI_API_KEY;
      if (apiKey) {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(5000),
        });
        results.openai = res.ok;
      }
    } catch { /* ignore */ }

    return results;
  }
}

export const llmProvider = new LLMProvider();
