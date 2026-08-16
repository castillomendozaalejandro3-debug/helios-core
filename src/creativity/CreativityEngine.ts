/**
 * CreativityEngine - Capa 3: Cognicion y Memoria
 * Modos DIVERGENT, CONVERGENT, LATERAL para resolver problemas.
 */

export enum CreativityMode {
  DIVERGENT = 'divergent',
  CONVERGENT = 'convergent',
  LATERAL = 'lateral',
}

export class CreativityEngine {
  solve(problem: string, mode: CreativityMode): string[] {
    switch (mode) {
      case CreativityMode.DIVERGENT:
        return this.divergentThink(problem);
      case CreativityMode.CONVERGENT:
        return this.convergentThink(problem);
      case CreativityMode.LATERAL:
        return this.lateralThink(problem);
    }
  }

  private divergentThink(problem: string): string[] {
    return [
      `Solucion escalada: ${problem} + recursos adicionales`,
      `Solucion minimalista: ${problem} con lo minimo`,
      `Solucion hibrida: combinar enfoques para ${problem}`,
      `Solucion inversa: hacer lo opuesto a ${problem}`,
    ];
  }

  private convergentThink(problem: string): string[] {
    return [
      `Analisis costo-beneficio de ${problem}`,
      `Mejor opcion basada en datos para ${problem}`,
    ];
  }

  private lateralThink(problem: string): string[] {
    return [
      `Analogia biologica para ${problem}`,
      `Analogia fisica para ${problem}`,
      `Transferencia de dominio para ${problem}`,
    ];
  }
}

export const creativityEngine = new CreativityEngine();
