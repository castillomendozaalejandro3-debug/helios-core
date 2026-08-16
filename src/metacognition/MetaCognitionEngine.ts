/**
 * MetaCognitionEngine - Capa de Meta-Cognicion y Auto-Mejora
 * Analiza cada tarea completada, extrae lecciones, ajusta estrategias,
 * y mantiene una biblioteca de soluciones reutilizables.
 */

import { EventEmitter } from 'events';
import { existsSync, mkdirSync, readFileSync, writeFile } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';

// ============================================================
// HELPERS ASYNC CON RETRY Y BACKOFF
// ============================================================

async function writeFileWithRetry(
  filePath: string,
  data: string,
  maxRetries = 5,
  baseDelayMs = 50
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        writeFile(filePath, data, 'utf-8', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      return;
    } catch (err: any) {
      const isRetryable = err.code === 'EAGAIN' || err.code === 'EBUSY' || err.code === 'EMFILE';
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 50;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

// ============================================================
// TIPOS
// ============================================================

export interface TaskExecutionRecord {
  taskId: string;
  timestamp: number;
  taskType: string;
  complexity: 'low' | 'medium' | 'high';
  subTasks: SubTaskRecord[];
  toolsUsed: ToolUsageRecord[];
  totalCost: number;
  totalTimeMs: number;
  resultQuality: number; // 0-1
  success: boolean;
  context: Record<string, any>;
}

export interface SubTaskRecord {
  name: string;
  durationMs: number;
  toolUsed: string;
  cost: number;
  result: string;
}

export interface ToolUsageRecord {
  tool: string;
  calls: number;
  totalCost: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface Lesson {
  id: string;
  condition: string; // cuando se aplica
  action: string; // que hacer
  expectedResult: string; // resultado esperado
  validityScore: number; // 0-1, basado en reproduccion
  occurrences: number; // cuantas veces se ha visto
  successCount: number; // cuantas veces funciono
  failureCount: number; // cuantas veces fallo
  contexts: string[]; // dominios donde aplica
  createdAt: number;
  lastValidated: number;
}

export interface SolutionTemplate {
  id: string;
  name: string;
  domain: string; // ej: "web-scraping", "data-analysis"
  complexity: 'low' | 'medium' | 'high';
  toolsRequired: string[];
  estimatedCost: number;
  estimatedTimeMs: number;
  avgQuality: number; // calidad promedio de resultados
  roi: number; // retorno historico
  steps: SolutionStep[];
  parameters: Record<string, { type: string; default: any; description: string }>;
  lessonsLinked: string[]; // IDs de lecciones que sustentan
  usageCount: number;
  lastUsed: number;
  createdAt: number;
}

export interface SolutionStep {
  order: number;
  action: string;
  tool: string;
  parameters: Record<string, any>;
  expectedOutput: string;
  fallback?: string; // que hacer si falla
}

export interface StrategyUpdate {
  targetModule: string;
  parameter: string;
  oldValue: any;
  newValue: any;
  reason: string;
  confidence: number;
}

// ============================================================
// META-COGNITION ENGINE
// ============================================================

export class MetaCognitionEngine extends EventEmitter {
  private stateDir: string;
  private lessons: Map<string, Lesson> = new Map();
  private solutions: Map<string, SolutionTemplate> = new Map();
  private taskHistory: TaskExecutionRecord[] = [];
  private strategyUpdates: StrategyUpdate[] = [];
  private dirty = false;

  constructor() {
    super();
    this.stateDir = resolve(configManager.stateDir, 'metacognition');
    this.load();
  }

  // ----------------------------------------------------------
  // PERSISTENCIA
  // ----------------------------------------------------------

  private load(): void {
    const lessonsPath = resolve(this.stateDir, 'lessons.json');
    const solutionsPath = resolve(this.stateDir, 'solutions.json');
    const historyPath = resolve(this.stateDir, 'history.json');

    if (existsSync(lessonsPath)) {
      try {
        const data = JSON.parse(readFileSync(lessonsPath, 'utf-8'));
        for (const l of data) this.lessons.set(l.id, l);
      } catch { /* ignorar */ }
    }
    if (existsSync(solutionsPath)) {
      try {
        const data = JSON.parse(readFileSync(solutionsPath, 'utf-8'));
        for (const s of data) this.solutions.set(s.id, s);
      } catch { /* ignorar */ }
    }
    if (existsSync(historyPath)) {
      try {
        this.taskHistory = JSON.parse(readFileSync(historyPath, 'utf-8'));
      } catch { /* ignorar */ }
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      ensureDir(this.stateDir);
      await Promise.all([
        writeFileWithRetry(
          resolve(this.stateDir, 'lessons.json'),
          JSON.stringify(Array.from(this.lessons.values()), null, 2)
        ),
        writeFileWithRetry(
          resolve(this.stateDir, 'solutions.json'),
          JSON.stringify(Array.from(this.solutions.values()), null, 2)
        ),
        writeFileWithRetry(
          resolve(this.stateDir, 'history.json'),
          JSON.stringify(this.taskHistory.slice(-1000), null, 2)
        ),
      ]);
      this.dirty = false;
    } catch (err) {
      console.error('[MetaCognitionEngine] Error al persistir:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // TASK ANALYZER
  // ----------------------------------------------------------

  async analyzeTask(record: TaskExecutionRecord): Promise<void> {
    this.taskHistory.push(record);
    if (this.taskHistory.length > 2000) this.taskHistory = this.taskHistory.slice(-1000);
    this.dirty = true;

    // Extraer lecciones de la tarea
    this.extractLessons(record);

    // Si la tarea fue exitosa y reutilizable, crear/actualizar plantilla
    if (record.success && record.resultQuality > 0.7) {
      this.updateOrCreateSolution(record);
    }

    await this.save();
    this.emit('task-analyzed', { taskId: record.taskId, lessonsExtracted: true });
  }

  // ----------------------------------------------------------
  // LESSON EXTRACTOR
  // ----------------------------------------------------------

  private extractLessons(record: TaskExecutionRecord): void {
    // Leccion 1: Secuencia de herramientas exitosa
    if (record.success && record.toolsUsed.length > 1) {
      const toolSequence = record.toolsUsed.map(t => t.tool).join(' -> ');
      const lessonId = this.hashLesson(`seq:${toolSequence}:${record.taskType}`);

      const existing = this.lessons.get(lessonId);
      if (existing) {
        existing.occurrences++;
        existing.successCount++;
        existing.validityScore = existing.successCount / existing.occurrences;
        existing.lastValidated = Date.now();
      } else {
        this.lessons.set(lessonId, {
          id: lessonId,
          condition: `Tarea tipo ${record.taskType} con complejidad ${record.complexity}`,
          action: `Usar secuencia de herramientas: ${toolSequence}`,
          expectedResult: 'Completar tarea exitosamente',
          validityScore: 1.0,
          occurrences: 1,
          successCount: 1,
          failureCount: 0,
          contexts: [record.taskType],
          createdAt: Date.now(),
          lastValidated: Date.now(),
        });
      }
      this.dirty = true;
    }

    // Leccion 2: Herramienta especifica con buen ROI
    for (const tool of record.toolsUsed) {
      if (tool.successRate > 0.8 && tool.totalCost < record.totalCost * 0.3) {
        const lessonId = this.hashLesson(`tool:${tool.tool}:${record.taskType}`);
        const existing = this.lessons.get(lessonId);
        if (existing) {
          existing.occurrences++;
          existing.successCount++;
          existing.validityScore = existing.successCount / existing.occurrences;
          existing.lastValidated = Date.now();
        } else {
          this.lessons.set(lessonId, {
            id: lessonId,
            condition: `Tarea tipo ${record.taskType}`,
            action: `Usar herramienta ${tool.tool} como primera opcion`,
            expectedResult: `Alta tasa de exito (${(tool.successRate * 100).toFixed(0)}%) con bajo costo`,
            validityScore: tool.successRate,
            occurrences: 1,
            successCount: 1,
            failureCount: 0,
            contexts: [record.taskType],
            createdAt: Date.now(),
            lastValidated: Date.now(),
          });
        }
        this.dirty = true;
      }
    }

    // Leccion 3: Tarea fallida - que NO hacer
    if (!record.success) {
      const failedTools = record.toolsUsed.filter(t => t.successRate < 0.5);
      for (const tool of failedTools) {
        const lessonId = this.hashLesson(`avoid:${tool.tool}:${record.taskType}`);
        const existing = this.lessons.get(lessonId);
        if (existing) {
          existing.occurrences++;
          existing.failureCount++;
          existing.validityScore = existing.successCount / existing.occurrences;
          existing.lastValidated = Date.now();
        } else {
          this.lessons.set(lessonId, {
            id: lessonId,
            condition: `Tarea tipo ${record.taskType}`,
            action: `EVITAR herramienta ${tool.tool} - buscar alternativa`,
            expectedResult: 'Evitar fallo repetido',
            validityScore: 0.0,
            occurrences: 1,
            successCount: 0,
            failureCount: 1,
            contexts: [record.taskType],
            createdAt: Date.now(),
            lastValidated: Date.now(),
          });
        }
        this.dirty = true;
      }
    }
  }

  // ----------------------------------------------------------
  // STRATEGY ADJUSTER
  // ----------------------------------------------------------

  async adjustStrategies(): Promise<StrategyUpdate[]> {
    const updates: StrategyUpdate[] = [];

    // Ajustar pesos de herramientas basado en lecciones
    const toolLessons = Array.from(this.lessons.values()).filter(l =>
      l.action.includes('Usar herramienta') && l.validityScore > 0.75 && l.occurrences >= 3
    );

    for (const lesson of toolLessons) {
      const toolMatch = lesson.action.match(/Usar herramienta (\S+)/);
      if (toolMatch) {
        const tool = toolMatch[1];
        updates.push({
          targetModule: 'ResourceOptimizer',
          parameter: `tool_priority_${tool}`,
          oldValue: 'default',
          newValue: 'high',
          reason: `Leccion validada: ${tool} tiene ${(lesson.validityScore * 100).toFixed(0)}% exito en ${lesson.occurrences} ocurrencias`,
          confidence: lesson.validityScore,
        });
      }
    }

    // Ajustar timeouts basado en tiempos historicos
    const avgTimes = this.calculateAverageTimes();
    for (const [taskType, avgTime] of Object.entries(avgTimes)) {
      updates.push({
        targetModule: 'CloneFactory',
        parameter: `timeout_${taskType}`,
        oldValue: 'default',
        newValue: Math.round(avgTime * 3), // 3x el promedio
        reason: `Tiempo promedio observado: ${avgTime}ms`,
        confidence: 0.85,
      });
    }

    this.strategyUpdates.push(...updates);
    if (this.strategyUpdates.length > 500) {
      this.strategyUpdates = this.strategyUpdates.slice(-250);
    }
    this.dirty = true;
    await this.save();

    this.emit('strategies-adjusted', { count: updates.length });
    return updates;
  }

  // ----------------------------------------------------------
  // SOLUTION LIBRARY
  // ----------------------------------------------------------

  private updateOrCreateSolution(record: TaskExecutionRecord): void {
    const solutionId = this.hashSolution(record.taskType, record.complexity);
    const existing = this.solutions.get(solutionId);

    if (existing) {
      // Actualizar estadisticas
      existing.usageCount++;
      existing.lastUsed = Date.now();
      existing.avgQuality = (existing.avgQuality * (existing.usageCount - 1) + record.resultQuality) / existing.usageCount;
      existing.estimatedCost = (existing.estimatedCost * (existing.usageCount - 1) + record.totalCost) / existing.usageCount;
      existing.estimatedTimeMs = (existing.estimatedTimeMs * (existing.usageCount - 1) + record.totalTimeMs) / existing.usageCount;
      existing.roi = this.calculateROI(existing);
    } else {
      // Crear nueva plantilla
      const steps: SolutionStep[] = record.subTasks.map((st, i) => ({
        order: i + 1,
        action: st.name,
        tool: st.toolUsed,
        parameters: {},
        expectedOutput: st.result,
      }));

      this.solutions.set(solutionId, {
        id: solutionId,
        name: `Plantilla para ${record.taskType}`,
        domain: record.taskType,
        complexity: record.complexity,
        toolsRequired: record.toolsUsed.map(t => t.tool),
        estimatedCost: record.totalCost,
        estimatedTimeMs: record.totalTimeMs,
        avgQuality: record.resultQuality,
        roi: record.resultQuality / Math.max(record.totalCost, 0.01),
        steps,
        parameters: {},
        lessonsLinked: [],
        usageCount: 1,
        lastUsed: Date.now(),
        createdAt: Date.now(),
      });
    }
    this.dirty = true;
  }

  findSolution(taskType: string, complexity?: string): SolutionTemplate | undefined {
    const candidates = Array.from(this.solutions.values()).filter(s =>
      s.domain === taskType && (!complexity || s.complexity === complexity)
    );

    if (candidates.length === 0) return undefined;

    // Ordenar por ROI y calidad
    candidates.sort((a, b) => {
      const scoreA = a.roi * 0.5 + a.avgQuality * 0.3 + (a.usageCount > 5 ? 0.2 : 0);
      const scoreB = b.roi * 0.5 + b.avgQuality * 0.3 + (b.usageCount > 5 ? 0.2 : 0);
      return scoreB - scoreA;
    });

    return candidates[0];
  }

  getSolutionsByDomain(domain: string): SolutionTemplate[] {
    return Array.from(this.solutions.values())
      .filter(s => s.domain === domain || s.domain.includes(domain))
      .sort((a, b) => b.roi - a.roi);
  }

  // ----------------------------------------------------------
  // METRICAS
  // ----------------------------------------------------------

  getStats(): {
    totalLessons: number;
    validatedLessons: number;
    totalSolutions: number;
    totalTasksAnalyzed: number;
    avgLessonValidity: number;
    avgSolutionROI: number;
    strategyUpdates: number;
  } {
    const lessons = Array.from(this.lessons.values());
    const solutions = Array.from(this.solutions.values());

    return {
      totalLessons: lessons.length,
      validatedLessons: lessons.filter(l => l.validityScore > 0.75 && l.occurrences >= 3).length,
      totalSolutions: solutions.length,
      totalTasksAnalyzed: this.taskHistory.length,
      avgLessonValidity: lessons.length > 0
        ? lessons.reduce((s, l) => s + l.validityScore, 0) / lessons.length
        : 0,
      avgSolutionROI: solutions.length > 0
        ? solutions.reduce((s, sol) => s + sol.roi, 0) / solutions.length
        : 0,
      strategyUpdates: this.strategyUpdates.length,
    };
  }

  getLessons(limit: number = 50): Lesson[] {
    return Array.from(this.lessons.values())
      .sort((a, b) => b.validityScore - a.validityScore)
      .slice(0, limit);
  }

  getSolutions(limit: number = 50): SolutionTemplate[] {
    return Array.from(this.solutions.values())
      .sort((a, b) => b.roi - a.roi)
      .slice(0, limit);
  }

  // ----------------------------------------------------------
  // UTILIDADES
  // ----------------------------------------------------------

  private hashLesson(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `lesson_${Math.abs(hash).toString(36)}`;
  }

  private hashSolution(taskType: string, complexity: string): string {
    return `sol_${taskType.replace(/\s+/g, '_')}_${complexity}`;
  }

  private calculateROI(solution: SolutionTemplate): number {
    return solution.avgQuality / Math.max(solution.estimatedCost, 0.01);
  }

  private calculateAverageTimes(): Record<string, number> {
    const times: Record<string, number[]> = {};
    for (const record of this.taskHistory.slice(-100)) {
      if (!times[record.taskType]) times[record.taskType] = [];
      times[record.taskType].push(record.totalTimeMs);
    }

    const result: Record<string, number> = {};
    for (const [type, vals] of Object.entries(times)) {
      result[type] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return result;
  }
}

export const metaCognitionEngine = new MetaCognitionEngine();
