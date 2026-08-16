/**
 * SelfRefactorer - Capa 2: Auto-Arquitectura
 * Analiza complejidad de codigo y propone refactorizaciones seguras.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, extname, relative } from 'path';

interface ComplexityReport {
  file: string;
  lines: number;
  functions: number;
  complexity: number;
  suggestions: string[];
}

export class SelfRefactorer {
  private srcDir: string;

  constructor(srcDir: string = './src') {
    this.srcDir = resolve(srcDir);
  }

  analyze(filePath?: string): ComplexityReport[] {
    const files = filePath ? [resolve(filePath)] : this.findTsFiles();
    const reports: ComplexityReport[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;
      const functions = (content.match(/(?:function|=>|async\s+\w+)\s*\(/g) || []).length;
      const classes = (content.match(/class\s+\w+/g) || []).length;
      const complexity = Math.round((functions + classes * 2) / Math.max(lines, 1) * 1000) / 10;
      const suggestions: string[] = [];
      if (lines > 300) suggestions.push('Considerar dividir en modulos mas pequenos');
      if (functions > 20) suggestions.push('Alta densidad de funciones, extraer utilidades');
      if (complexity > 15) suggestions.push('Complejidad elevada, simplificar logica');

      reports.push({ file: relative(this.srcDir, file), lines, functions, complexity, suggestions });
    }

    return reports.sort((a, b) => b.complexity - a.complexity);
  }

  generateRefactorPlan(): string {
    const reports = this.analyze();
    const highComplexity = reports.filter(r => r.complexity > 10 || r.lines > 250);
    let plan = `# Plan de Refactorizacion Helios\n\nGenerado: ${new Date().toISOString()}\n\n`;
    for (const report of highComplexity) {
      plan += `## ${report.file}\n- Lineas: ${report.lines}, Funciones: ${report.functions}, Complejidad: ${report.complexity}\n- Sugerencias:\n`;
      for (const s of report.suggestions) plan += `  - ${s}\n`;
      plan += `\n`;
    }
    return plan;
  }

  private findTsFiles(dir: string = this.srcDir): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = resolve(dir, entry);
      const stat = statSync(path);
      if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
        files.push(...this.findTsFiles(path));
      } else if (extname(entry) === '.ts' && !entry.endsWith('.d.ts')) {
        files.push(path);
      }
    }
    return files;
  }
}

export const selfRefactorer = new SelfRefactorer();
