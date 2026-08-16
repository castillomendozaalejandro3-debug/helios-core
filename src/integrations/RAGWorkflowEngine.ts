/**
 * RAGWorkflowEngine - Capa 4: Percepcion y Accion
 * Ingesta documentos, chunking, busqueda vectorial y ejecucion de DAGs (workflows).
 */

import { EventEmitter } from 'events';
import { memoryEngine, MemoryType } from '../memory/MemoryEngine.js';

interface Document {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

interface Chunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
}

interface Workflow {
  id: string;
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  type: 'ingest' | 'chunk' | 'embed' | 'retrieve' | 'generate';
  config: Record<string, any>;
  dependsOn?: string[];
}

export class RAGWorkflowEngine extends EventEmitter {
  private documents: Map<string, Document> = new Map();
  private chunks: Map<string, Chunk> = new Map();
  private workflows: Map<string, Workflow> = new Map();

  async ingestDocument(content: string, metadata: Record<string, any> = {}): Promise<string> {
    const id = crypto.randomUUID();
    const doc: Document = { id, content, metadata };
    this.documents.set(id, doc);

    const chunks = this.chunk(content, 500);
    for (const chunkContent of chunks) {
      const chunkId = crypto.randomUUID();
      this.chunks.set(chunkId, {
        id: chunkId,
        documentId: id,
        content: chunkContent,
      });
    }

    await memoryEngine.store(MemoryType.SEMANTIC, content, {
      importance: 0.7,
      tags: ['document', ...(metadata.tags || [])],
    });

    this.emit('document-ingested', { id, chunks: chunks.length });
    return id;
  }

  private chunk(text: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }

  async retrieve(query: string, topK: number = 5): Promise<Array<{ chunk: Chunk; score: number }>> {
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = Array.from(this.chunks.values()).map(chunk => ({
      chunk,
      score: queryWords.filter(w => chunk.content.toLowerCase().includes(w)).length,
    }));

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  createWorkflow(steps: WorkflowStep[]): string {
    const id = crypto.randomUUID();
    this.workflows.set(id, { id, steps });
    return id;
  }

  async executeWorkflow(workflowId: string, input: any): Promise<any> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} no encontrado`);

    const results: Record<string, any> = { input };

    for (const step of workflow.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!(dep in results)) throw new Error(`Dependencia ${dep} no resuelta`);
        }
      }

      const result = await this.executeStep(step, results);
      results[step.id] = result;
    }

    return results;
  }

  private async executeStep(step: WorkflowStep, context: Record<string, any>): Promise<any> {
    switch (step.type) {
      case 'ingest':
        return this.ingestDocument(step.config.content, step.config.metadata);
      case 'chunk':
        return this.chunk(step.config.text, step.config.size || 500);
      case 'retrieve':
        return this.retrieve(step.config.query, step.config.topK);
      case 'generate':
        return `Generado basado en: ${JSON.stringify(context)}`;
      default:
        return null;
    }
  }
}

export const ragWorkflowEngine = new RAGWorkflowEngine();
