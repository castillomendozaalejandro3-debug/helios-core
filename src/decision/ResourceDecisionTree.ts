/**
 * ResourceDecisionTree - Arbol de Decision de Asignacion de Recursos
 * Implementa el flujo de decision completo para asignacion de recursos
 * segun la arquitectura refactorizada de Helios.
 */

import { EventEmitter } from 'events';
import { metaCognitionEngine, SolutionTemplate } from '../metacognition/MetaCognitionEngine.js';
import { costBenefitAnalyzer, CostBenefitAnalysis } from '../metacognition/CostBenefitAnalyzer.js';
import { frugalToolKit, ToolSelection } from '../frugality/FrugalToolKit.js';
import { freeAPIDiscovery } from '../frugality/FreeAPIDiscovery.js';
import { frugalLedger } from '../frugality/FrugalLedger.js';
import { financialEngine } from '../economy/FinancialAutonomyEngine.js';

export interface DecisionNode {
  id: string;
  question: string;
  condition: (context: DecisionContext) => boolean;
  yesAction: string;
  noAction: string;
  yesNode?: string;
  noNode?: string;
  result?: DecisionOutcome;
}

export interface DecisionContext {
  taskType: string;
  complexity: 'low' | 'medium' | 'high';
  description: string;
  requiredCapabilities: string[];
  budgetAvailable: number;
  isKnownTask: boolean;
  template?: SolutionTemplate;
  isComplex: boolean;
  hasFreeTools: boolean;
  roiAnalysis?: CostBenefitAnalysis;
}

export interface DecisionOutcome {
  action: 'use-template' | 'reevaluate' | 'form-team' | 'create-clone' | 'use-free-tools' | 'use-paid-api' | 'find-alternative' | 'reject' | 'escalate';
  reason: string;
  confidence: number;
  estimatedCost: number;
  estimatedTimeMs: number;
  tools?: ToolSelection[];
  template?: SolutionTemplate;
}

export interface DecisionPath {
  path: string[];
  outcome: DecisionOutcome;
  context: DecisionContext;
}

export class ResourceDecisionTree extends EventEmitter {
  private nodes: Map<string, DecisionNode> = new Map();

  constructor() {
    super();
    this.initializeTree();
  }

  private initializeTree(): void {
    // Nodo raiz: ¿Tarea conocida?
    this.nodes.set('root', {
      id: 'root',
      question: '¿La tarea es conocida? (existe en SolutionLibrary)',
      condition: (ctx) => ctx.isKnownTask && !!ctx.template,
      yesAction: 'Ir a evaluar plantilla',
      noAction: 'Ir a evaluar complejidad',
      yesNode: 'check-template-roi',
      noNode: 'check-complexity',
    });

    // Nodo: ¿ROI historico > 2.0?
    this.nodes.set('check-template-roi', {
      id: 'check-template-roi',
      question: '¿La plantilla tiene ROI historico > 2.0?',
      condition: (ctx) => !!ctx.template && ctx.template.roi > 2.0,
      yesAction: 'Usar plantilla directamente',
      noAction: 'Reevaluar con datos actuales',
      yesNode: 'use-template',
      noNode: 'reevaluate-template',
    });

    // Nodo: ¿Es compleja?
    this.nodes.set('check-complexity', {
      id: 'check-complexity',
      question: '¿La tarea requiere multiples habilidades?',
      condition: (ctx) => ctx.isComplex || ctx.complexity === 'high' || ctx.requiredCapabilities.length > 2,
      yesAction: 'Formar equipo de clones',
      noAction: 'Crear clon unico',
      yesNode: 'form-team',
      noNode: 'create-clone',
    });

    // Nodo: ¿Presupuesto suficiente?
    this.nodes.set('create-clone', {
      id: 'create-clone',
      question: '¿Hay presupuesto suficiente?',
      condition: (ctx) => ctx.budgetAvailable > this.estimateMinimumCost(ctx.complexity),
      yesAction: 'Verificar herramientas gratuitas',
      noAction: 'Rechazar o escalar',
      yesNode: 'check-free-tools',
      noNode: 'insufficient-budget',
    });

    // Nodo: ¿Herramientas gratuitas disponibles?
    this.nodes.set('check-free-tools', {
      id: 'check-free-tools',
      question: '¿Existen herramientas gratuitas para esta capacidad?',
      condition: (ctx) => ctx.hasFreeTools,
      yesAction: 'Usar herramientas gratuitas',
      noAction: 'Evaluar API paga',
      yesNode: 'use-free-tools',
      noNode: 'check-paid-api-roi',
    });

    // Nodo: ¿ROI API paga > 3.0?
    this.nodes.set('check-paid-api-roi', {
      id: 'check-paid-api-roi',
      question: '¿El ROI de la API paga es > 3.0?',
      condition: (ctx) => !!ctx.roiAnalysis && ctx.roiAnalysis.roiExpected > 3.0,
      yesAction: 'Usar API paga',
      noAction: 'Buscar alternativa',
      yesNode: 'use-paid-api',
      noNode: 'find-alternative',
    });

    // Nodos hoja (resultados finales)
    this.nodes.set('use-template', {
      id: 'use-template',
      question: 'RESULTADO: Usar plantilla existente',
      condition: () => true,
      yesAction: 'Ejecutar con parametros de plantilla',
      noAction: '',
      result: {
        action: 'use-template',
        reason: 'Plantilla con ROI historico validado > 2.0',
        confidence: 0.9,
        estimatedCost: 0.1,
        estimatedTimeMs: 5000,
      },
    });

    this.nodes.set('reevaluate-template', {
      id: 'reevaluate-template',
      question: 'RESULTADO: Reevaluar plantilla',
      condition: () => true,
      yesAction: 'Re-evaluar con condiciones actuales',
      noAction: '',
      result: {
        action: 'reevaluate',
        reason: 'Plantilla existe pero ROI historico bajo, requiere reevaluacion',
        confidence: 0.6,
        estimatedCost: 0.2,
        estimatedTimeMs: 10000,
      },
    });

    this.nodes.set('form-team', {
      id: 'form-team',
      question: 'RESULTADO: Formar equipo',
      condition: () => true,
      yesAction: 'Ensamblar equipo dinamico de clones',
      noAction: '',
      result: {
        action: 'form-team',
        reason: 'Tarea compleja requiere multiples habilidades y perspectivas',
        confidence: 0.85,
        estimatedCost: 2.0,
        estimatedTimeMs: 60000,
      },
    });

    this.nodes.set('use-free-tools', {
      id: 'use-free-tools',
      question: 'RESULTADO: Usar herramientas gratuitas',
      condition: () => true,
      yesAction: 'Maximizar uso de recursos gratuitos',
      noAction: '',
      result: {
        action: 'use-free-tools',
        reason: 'Herramientas gratuitas disponibles y suficientes',
        confidence: 0.8,
        estimatedCost: 0,
        estimatedTimeMs: 15000,
      },
    });

    this.nodes.set('use-paid-api', {
      id: 'use-paid-api',
      question: 'RESULTADO: Usar API paga',
      condition: () => true,
      yesAction: 'API paga justificada por alto ROI',
      noAction: '',
      result: {
        action: 'use-paid-api',
        reason: 'ROI > 3.0 justifica el costo de API paga',
        confidence: 0.75,
        estimatedCost: 1.0,
        estimatedTimeMs: 10000,
      },
    });

    this.nodes.set('find-alternative', {
      id: 'find-alternative',
      question: 'RESULTADO: Buscar alternativa',
      condition: () => true,
      yesAction: 'Buscar fuentes alternativas o redefinir tarea',
      noAction: '',
      result: {
        action: 'find-alternative',
        reason: 'Ninguna opcion alcanza ROI minimo, buscar alternativas',
        confidence: 0.5,
        estimatedCost: 0.1,
        estimatedTimeMs: 20000,
      },
    });

    this.nodes.set('insufficient-budget', {
      id: 'insufficient-budget',
      question: 'RESULTADO: Presupuesto insuficiente',
      condition: () => true,
      yesAction: 'Rechazar tarea o escalar a humano',
      noAction: '',
      result: {
        action: 'reject',
        reason: 'Presupuesto insuficiente para ejecutar tarea',
        confidence: 0.95,
        estimatedCost: 0,
        estimatedTimeMs: 0,
      },
    });
  }

  // ============================================================
  // EVALUACION DEL ARBOL
  // ============================================================

  evaluate(task: {
    taskType: string;
    complexity: 'low' | 'medium' | 'high';
    description: string;
    requiredCapabilities: string[];
  }): DecisionPath {
    const context = this.buildContext(task);
    const path: string[] = [];
    let currentNodeId = 'root';
    let iterations = 0;
    const maxIterations = 20;

    while (iterations < maxIterations) {
      const node = this.nodes.get(currentNodeId);
      if (!node) break;

      path.push(currentNodeId);

      // Si es nodo hoja (tiene resultado), retornar
      if (node.result) {
        const outcome = this.enrichOutcome(node.result, context);
        this.emit('decision-completed', { path, outcome, context });
        return { path, outcome, context };
      }

      // Evaluar condicion y seguir rama
      const conditionResult = node.condition(context);
      const nextNodeId = conditionResult ? node.yesNode : node.noNode;

      if (!nextNodeId) {
        // Nodo sin continuacion, usar resultado por defecto
        const defaultOutcome: DecisionOutcome = {
          action: 'escalate',
          reason: 'Flujo de decision incompleto, requiere escalacion',
          confidence: 0.3,
          estimatedCost: 0,
          estimatedTimeMs: 0,
        };
        return { path, outcome: defaultOutcome, context };
      }

      currentNodeId = nextNodeId;
      iterations++;
    }

    // Fallback por seguridad
    const fallbackOutcome: DecisionOutcome = {
      action: 'escalate',
      reason: 'Maximo de iteraciones alcanzado, escalando por seguridad',
      confidence: 0.2,
      estimatedCost: 0,
      estimatedTimeMs: 0,
    };
    return { path, outcome: fallbackOutcome, context };
  }

  // ============================================================
  // CONSTRUCCION DE CONTEXTO
  // ============================================================

  private buildContext(task: {
    taskType: string;
    complexity: 'low' | 'medium' | 'high';
    description: string;
    requiredCapabilities: string[];
  }): DecisionContext {
    // Verificar si existe plantilla
    const template = metaCognitionEngine.findSolution(task.taskType, task.complexity);
    const isKnownTask = !!template;

    // Verificar complejidad
    const isComplex = task.complexity === 'high' || task.requiredCapabilities.length > 2;

    // Verificar presupuesto
    const balance = financialEngine.getFinancialReport().balance;
    const minReserve = balance * 0.3;
    const budgetAvailable = Math.max(balance - minReserve, 0);

    // Verificar herramientas gratuitas
    const freeTools = frugalToolKit.selectToolsForTask(task.requiredCapabilities)
      .filter(s => s.tool.level <= 3); // FREE_LOCAL, FREE_WEB, FREE_LIMITED
    const hasFreeTools = freeTools.length > 0;

    // Analizar ROI si no hay plantilla
    let roiAnalysis: CostBenefitAnalysis | undefined;
    if (!isKnownTask) {
      const candidate = {
        id: 'task_eval',
        action: task.taskType,
        description: task.description,
        estimatedCost: this.estimateCost(task.complexity),
        estimatedTimeMs: this.estimateTime(task.complexity),
        toolsRequired: task.requiredCapabilities,
        probabilitySuccess: 0.85,
        probabilityFailure: 0.15,
        valueIfSuccess: this.estimateValue(task),
        costIfFailure: this.estimateCost(task.complexity) * 0.5,
        irreversible: false,
        alternatives: [],
      };
      roiAnalysis = costBenefitAnalyzer.analyze(candidate);
    }

    return {
      taskType: task.taskType,
      complexity: task.complexity,
      description: task.description,
      requiredCapabilities: task.requiredCapabilities,
      budgetAvailable,
      isKnownTask,
      template: template || undefined,
      isComplex,
      hasFreeTools,
      roiAnalysis,
    };
  }

  private enrichOutcome(base: DecisionOutcome, context: DecisionContext): DecisionOutcome {
    const enriched = { ...base };

    // Enriquecer con herramientas seleccionadas si aplica
    if (base.action === 'use-free-tools' || base.action === 'use-template') {
      enriched.tools = frugalToolKit.selectToolsForTask(context.requiredCapabilities);
    }

    // Enriquecer con plantilla si aplica
    if (base.action === 'use-template' && context.template) {
      enriched.template = context.template;
      enriched.estimatedCost = context.template.estimatedCost;
      enriched.estimatedTimeMs = context.template.estimatedTimeMs;
    }

    // Ajustar costo basado en complejidad
    if (base.action === 'form-team') {
      enriched.estimatedCost = this.estimateCost(context.complexity) * 1.5;
    }

    return enriched;
  }

  // ============================================================
  // ESTIMACIONES
  // ============================================================

  private estimateCost(complexity: string): number {
    const costs = { low: 0.1, medium: 0.5, high: 2.0 };
    return costs[complexity as keyof typeof costs] || 0.5;
  }

  private estimateTime(complexity: string): number {
    const times = { low: 5000, medium: 30000, high: 120000 };
    return times[complexity as keyof typeof times] || 30000;
  }

  private estimateValue(task: any): number {
    const baseValues: Record<string, number> = {
      'web-scraping': 5,
      'data-analysis': 10,
      'code-generation': 15,
      'research': 8,
      'default': 5,
    };
    const base = baseValues[task.taskType] || baseValues.default;
    const complexityMap: Record<string, number> = { low: 0.5, medium: 1.0, high: 2.0 };
    const multiplier = complexityMap[task.complexity as string] || 1.0;
    return base * multiplier;
  }

  private estimateMinimumCost(complexity: string): number {
    return this.estimateCost(complexity) * 0.5;
  }

  // ============================================================
  // VISUALIZACION DEL ARBOL
  // ============================================================

  getTreeVisualization(): string {
    const lines: string[] = [];
    lines.push('ARBOl DE DECISION DE ASIGNACION DE RECURSOS');
    lines.push('============================================');
    lines.push('');

    const traverse = (nodeId: string, prefix: string = '', isLast: boolean = true) => {
      const node = this.nodes.get(nodeId);
      if (!node) return;

      const connector = prefix === '' ? '' : isLast ? '└── ' : '├── ';
      const resultMarker = node.result ? ` [RESULTADO: ${node.result.action}]` : '';
      lines.push(`${prefix}${connector}${node.question}${resultMarker}`);

      if (node.yesNode) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        traverse(node.yesNode, newPrefix, !node.noNode);
      }
      if (node.noNode) {
        const newPrefix = prefix + (isLast ? '    ' : '│   ');
        traverse(node.noNode, newPrefix, true);
      }
    };

    traverse('root');
    return lines.join('\n');
  }

  getNodes(): DecisionNode[] {
    return Array.from(this.nodes.values());
  }

  getStats(): {
    totalNodes: number;
    resultNodes: number;
    decisionNodes: number;
    maxDepth: number;
  } {
    const all = Array.from(this.nodes.values());
    return {
      totalNodes: all.length,
      resultNodes: all.filter(n => !!n.result).length,
      decisionNodes: all.filter(n => !n.result).length,
      maxDepth: this.calculateMaxDepth('root'),
    };
  }

  private calculateMaxDepth(nodeId: string, currentDepth: number = 0): number {
    const node = this.nodes.get(nodeId);
    if (!node || node.result) return currentDepth;

    let maxDepth = currentDepth;
    if (node.yesNode) {
      maxDepth = Math.max(maxDepth, this.calculateMaxDepth(node.yesNode, currentDepth + 1));
    }
    if (node.noNode) {
      maxDepth = Math.max(maxDepth, this.calculateMaxDepth(node.noNode, currentDepth + 1));
    }
    return maxDepth;
  }
}

export const resourceDecisionTree = new ResourceDecisionTree();
