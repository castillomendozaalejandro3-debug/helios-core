enum ThinkingMode { DIVERGENT, CONVERGENT, LATERAL }

interface Problem { 
  description: string; 
  constraints: string[]; 
}

interface Solution { 
  approach: string; 
  mode: ThinkingMode; 
  confidence: number; 
}

class CreativityEngine {
  solve(problem: Problem, mode: ThinkingMode): Solution[] {
    switch (mode) {
      case ThinkingMode.DIVERGENT:
        return [
          { approach: `Enfoque 1: ${problem.description} con enfoque alternativo`, mode, confidence: 0.6 },
          { approach: `Enfoque 2: ${problem.description} con solución modular`, mode, confidence: 0.6 },
          { approach: `Enfoque 3: ${problem.description} con integración de tecnologías emergentes`, mode, confidence: 0.6 }
        ];
      case ThinkingMode.CONVERGENT:
        return [
          { approach: `Solución óptima para ${problem.description} después de análisis exhaustivo`, mode, confidence: 0.9 }
        ];
      case ThinkingMode.LATERAL:
        return [
          { approach: `Solución no convencional para ${problem.description} inspirada en principios de diseño de sistemas complejos`, mode, confidence: 0.7 }
        ];
      default:
        return [
          { approach: `Enfoque estándar para ${problem.description}`, mode: ThinkingMode.CONVERGENT, confidence: 0.5 }
        ];
    }
  }

  evaluateSolutions(solutions: Solution[]): Solution {
    return solutions.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }
}

export { ThinkingMode, Problem, Solution, CreativityEngine };