/**
 * FrugalToolKit - Jerarquía de Preferencia de Herramientas
 * Maximiza uso de recursos gratuitos antes de cualquier gasto.
 * Nivel 1: Gratuito Local | Nivel 2: Gratuito Web | Nivel 3: Gratuito con Límites
 * Nivel 4: Pagado por Uso | Nivel 5: Pagado Fijo
 */

import { EventEmitter } from 'events';

export enum ToolLevel {
  FREE_LOCAL = 1,
  FREE_WEB = 2,
  FREE_LIMITED = 3,
  PAID_PER_USE = 4,
  PAID_FIXED = 5,
}

export interface ToolEntry {
  name: string;
  level: ToolLevel;
  category: string;
  costPerUse: number;
  costFixed: number;
  reliability: number; // 0-1
  capabilities: string[];
  rateLimit?: { requests: number; period: string };
  requiresAuth: boolean;
  localOnly: boolean;
  notes?: string;
}

export interface ToolSelection {
  tool: ToolEntry;
  reason: string;
  estimatedCost: number;
  fallback?: ToolEntry;
}

export class FrugalToolKit extends EventEmitter {
  private catalog: Map<string, ToolEntry> = new Map();
  private usageLog: Array<{ toolName: string; timestamp: number; cost: number; success: boolean }> = [];

  constructor() {
    super();
    this.initializeCatalog();
  }

  private initializeCatalog(): void {
    // NIVEL 1: GRATUITO LOCAL
    this.registerTool({
      name: 'node-local',
      level: ToolLevel.FREE_LOCAL,
      category: 'compute',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.99,
      capabilities: ['processing', 'file-io', 'crypto', 'json-parse'],
      requiresAuth: false,
      localOnly: true,
      notes: 'Procesamiento nativo Node.js',
    });

    this.registerTool({
      name: 'ollama-local',
      level: ToolLevel.FREE_LOCAL,
      category: 'llm',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.85,
      capabilities: ['text-generation', 'summarization', 'classification'],
      requiresAuth: false,
      localOnly: true,
      notes: 'Modelos locales via Ollama',
    });

    this.registerTool({
      name: 'sqlite-local',
      level: ToolLevel.FREE_LOCAL,
      category: 'database',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.98,
      capabilities: ['query', 'storage', 'indexing'],
      requiresAuth: false,
      localOnly: true,
      notes: 'Base de datos local SQLite',
    });

    this.registerTool({
      name: 'fs-cache',
      level: ToolLevel.FREE_LOCAL,
      category: 'cache',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.95,
      capabilities: ['read', 'write', 'ttl'],
      requiresAuth: false,
      localOnly: true,
      notes: 'Cache en disco local',
    });

    this.registerTool({
      name: 'heuristics',
      level: ToolLevel.FREE_LOCAL,
      category: 'logic',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.80,
      capabilities: ['pattern-matching', 'rule-evaluation', 'scoring'],
      requiresAuth: false,
      localOnly: true,
      notes: 'Reglas y heurísticas simples',
    });

    // NIVEL 2: GRATUITO WEB
    this.registerTool({
      name: 'wikipedia-api',
      level: ToolLevel.FREE_WEB,
      category: 'knowledge',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.95,
      capabilities: ['search', 'extract', 'summarize'],
      rateLimit: { requests: 200, period: '1h' },
      requiresAuth: false,
      localOnly: false,
      notes: 'Wikipedia REST API',
    });

    this.registerTool({
      name: 'openstreetmap-nominatim',
      level: ToolLevel.FREE_WEB,
      category: 'geocoding',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.92,
      capabilities: ['geocode', 'reverse-geocode', 'search'],
      rateLimit: { requests: 1, period: '1s' },
      requiresAuth: false,
      localOnly: false,
      notes: 'Requiere User-Agent identificativo',
    });

    this.registerTool({
      name: 'github-api',
      level: ToolLevel.FREE_WEB,
      category: 'code',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.95,
      capabilities: ['search-code', 'read-repo', 'download-raw'],
      rateLimit: { requests: 60, period: '1h' },
      requiresAuth: false,
      localOnly: false,
      notes: 'GitHub API sin auth (60 req/h)',
    });

    this.registerTool({
      name: 'npm-registry',
      level: ToolLevel.FREE_WEB,
      category: 'code',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.97,
      capabilities: ['search-packages', 'download', 'metadata'],
      requiresAuth: false,
      localOnly: false,
      notes: 'Registro npm público',
    });

    this.registerTool({
      name: 'rss-feeds',
      level: ToolLevel.FREE_WEB,
      category: 'data',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.88,
      capabilities: ['fetch', 'parse', 'monitor'],
      requiresAuth: false,
      localOnly: false,
      notes: 'Feeds RSS/Atom públicos',
    });

    this.registerTool({
      name: 'web-scraping',
      level: ToolLevel.FREE_WEB,
      category: 'data',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.75,
      capabilities: ['extract-html', 'parse-dom', 'follow-links'],
      requiresAuth: false,
      localOnly: false,
      notes: 'Scraping respetuoso con robots.txt',
    });

    // NIVEL 3: GRATUITO CON LIMITES
    this.registerTool({
      name: 'openrouter-free',
      level: ToolLevel.FREE_LIMITED,
      category: 'llm',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.80,
      capabilities: ['text-generation', 'chat', 'completion'],
      rateLimit: { requests: 20, period: '1h' },
      requiresAuth: true,
      localOnly: false,
      notes: 'OpenRouter tier gratuito',
    });

    this.registerTool({
      name: 'serpapi-free',
      level: ToolLevel.FREE_LIMITED,
      category: 'search',
      costPerUse: 0,
      costFixed: 0,
      reliability: 0.85,
      capabilities: ['web-search', 'news', 'images'],
      rateLimit: { requests: 100, period: '1mo' },
      requiresAuth: true,
      localOnly: false,
      notes: 'SerpAPI tier gratuito (100/mes)',
    });

    // NIVEL 4: PAGADO POR USO
    this.registerTool({
      name: 'openai-gpt4',
      level: ToolLevel.PAID_PER_USE,
      category: 'llm',
      costPerUse: 0.03,
      costFixed: 0,
      reliability: 0.95,
      capabilities: ['text-generation', 'code', 'analysis', 'reasoning'],
      requiresAuth: true,
      localOnly: false,
      notes: 'GPT-4 via OpenAI API',
    });

    this.registerTool({
      name: 'claude-api',
      level: ToolLevel.PAID_PER_USE,
      category: 'llm',
      costPerUse: 0.008,
      costFixed: 0,
      reliability: 0.94,
      capabilities: ['text-generation', 'code', 'long-context'],
      requiresAuth: true,
      localOnly: false,
      notes: 'Claude via Anthropic API',
    });

    this.registerTool({
      name: 'openrouter-paid',
      level: ToolLevel.PAID_PER_USE,
      category: 'llm',
      costPerUse: 0.005,
      costFixed: 0,
      reliability: 0.90,
      capabilities: ['text-generation', 'routing', 'multi-model'],
      requiresAuth: true,
      localOnly: false,
      notes: 'OpenRouter con créditos',
    });

    // NIVEL 5: PAGADO FIJO
    this.registerTool({
      name: 'aws-ec2',
      level: ToolLevel.PAID_FIXED,
      category: 'infrastructure',
      costPerUse: 0,
      costFixed: 50,
      reliability: 0.99,
      capabilities: ['compute', 'storage', 'networking'],
      requiresAuth: true,
      localOnly: false,
      notes: 'Instancia EC2 mensual',
    });
  }

  registerTool(tool: ToolEntry): void {
    this.catalog.set(tool.name, tool);
  }

  /**
   * Selecciona la mejor herramienta para una capacidad requerida,
   * priorizando siempre las gratuitas primero.
   */
  selectTool(capability: string, minReliability: number = 0.7): ToolSelection | null {
    const candidates = Array.from(this.catalog.values())
      .filter(t => t.capabilities.includes(capability) && t.reliability >= minReliability)
      .sort((a, b) => a.level - b.level || b.reliability - a.reliability);

    if (candidates.length === 0) return null;

    const best = candidates[0];
    const fallback = candidates.find(c => c.level === best.level && c.name !== best.name) 
      || candidates.find(c => c.level > best.level);

    const selection: ToolSelection = {
      tool: best,
      reason: `Nivel ${best.level} (${ToolLevel[best.level]}): ${best.name} - fiabilidad ${(best.reliability * 100).toFixed(0)}%, costo $${best.costPerUse + best.costFixed}`,
      estimatedCost: best.costPerUse + best.costFixed,
    };

    if (fallback) {
      selection.fallback = fallback;
    }

    this.emit('tool-selected', { capability, selection });
    return selection;
  }

  /**
   * Selecciona múltiples herramientas para una tarea compleja,
   * devolviendo un plan de ejecución ordenado por nivel de frugalidad.
   */
  selectToolsForTask(capabilities: string[]): ToolSelection[] {
    const selections: ToolSelection[] = [];
    for (const cap of capabilities) {
      const sel = this.selectTool(cap);
      if (sel) selections.push(sel);
    }
    // Ordenar por nivel (más frugal primero)
    selections.sort((a, b) => a.tool.level - b.tool.level);
    return selections;
  }

  logUsage(toolName: string, cost: number, success: boolean): void {
    this.usageLog.push({ toolName, timestamp: Date.now(), cost, success });
    if (this.usageLog.length > 10000) this.usageLog = this.usageLog.slice(-5000);
    this.emit('usage-logged', { toolName, cost, success });
  }

  getToolsByLevel(level: ToolLevel): ToolEntry[] {
    return Array.from(this.catalog.values()).filter(t => t.level === level);
  }

  getToolsByCategory(category: string): ToolEntry[] {
    return Array.from(this.catalog.values()).filter(t => t.category === category);
  }

  /**
   * Calcula métricas de frugalidad del sistema.
   */
  getFrugalMetrics(): {
    totalTools: number;
    freeTools: number;
    paidTools: number;
    frugalRatio: number;
    totalSpent: number;
    totalSavings: number;
    avgCostPerUse: number;
  } {
    const all = Array.from(this.catalog.values());
    const free = all.filter(t => t.level <= ToolLevel.FREE_LIMITED);
    const paid = all.filter(t => t.level >= ToolLevel.PAID_PER_USE);
    
    const recentUsage = this.usageLog.slice(-100);
    const totalSpent = recentUsage.reduce((s, u) => s + u.cost, 0);
    const paidUsage = recentUsage.filter(u => {
      const tool = this.catalog.get(u.toolName);
      return tool && tool.level >= ToolLevel.PAID_PER_USE;
    });
    const paidSpent = paidUsage.reduce((s, u) => s + u.cost, 0);
    
    // Estimación de ahorro: si hubiera usado solo herramientas pagadas
    const estimatedPaidCost = recentUsage.length * 0.01; // $0.01 promedio por uso pagado
    const savings = Math.max(0, estimatedPaidCost - paidSpent);

    return {
      totalTools: all.length,
      freeTools: free.length,
      paidTools: paid.length,
      frugalRatio: all.length > 0 ? free.length / all.length : 0,
      totalSpent: Math.round(totalSpent * 100) / 100,
      totalSavings: Math.round(savings * 100) / 100,
      avgCostPerUse: recentUsage.length > 0 ? Math.round((totalSpent / recentUsage.length) * 10000) / 10000 : 0,
    };
  }

  getCatalog(): ToolEntry[] {
    return Array.from(this.catalog.values());
  }

  getUsageStats(): {
    totalUses: number;
    byTool: Record<string, { uses: number; totalCost: number; successRate: number }>;
  } {
    const byTool: Record<string, { uses: number; totalCost: number; successRate: number }> = {};
    
    for (const entry of this.usageLog) {
      if (!byTool[entry.toolName]) {
        byTool[entry.toolName] = { uses: 0, totalCost: 0, successRate: 0 };
      }
      byTool[entry.toolName].uses++;
      byTool[entry.toolName].totalCost += entry.cost;
    }

    for (const [name, stats] of Object.entries(byTool)) {
      const toolEntries = this.usageLog.filter(u => u.toolName === name);
      const successes = toolEntries.filter(u => u.success).length;
      stats.successRate = toolEntries.length > 0 ? successes / toolEntries.length : 0;
    }

    return { totalUses: this.usageLog.length, byTool };
  }
}

export const frugalToolKit = new FrugalToolKit();
