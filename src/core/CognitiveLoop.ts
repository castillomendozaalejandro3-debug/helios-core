import { PersonalityCore } from '../personality/PersonalityCore';
import { CreativityEngine } from '../creativity/CreativityEngine';
import { SelfImprovementEngine } from '../learning/SelfImprovementEngine';

class CognitiveLoop {
  personality: PersonalityCore;
  creativity: CreativityEngine;
  improvement: SelfImprovementEngine;

  constructor() {
    this.personality = new PersonalityCore();
    this.creativity = new CreativityEngine();
    this.improvement = new SelfImprovementEngine();
  }

  async process(input: string): Promise<string> {
    const systemPrompt = this.personality.getSystemPrompt();
    
    // Determinar si requiere solución compleja (solo si contiene palabras clave de resolución)
    const requiresComplexSolution = input.toLowerCase().includes('resolver') || 
                                   input.toLowerCase().includes('solucionar') || 
                                   input.toLowerCase().includes('optimizar') ||
                                   input.toLowerCase().includes('mejorar');
    
    let response = '';
    
    if (requiresComplexSolution) {
      // Usar CreativityEngine para generar soluciones
      const problem = {
        description: input,
        constraints: []
      };
      
      const solutions = this.creativity.solve(problem, 'CONVERGENT');
      const bestSolution = this.creativity.evaluateSolutions(solutions);
      
      response = `🔍 Solución propuesta: ${bestSolution.approach}`;
      
      // Registrar la interacción en el sistema de mejora
      this.improvement.trackImprovement(
        'solution_generation', 
        0, 
        1, 
        `Generación de solución para: ${input}`
      );
    } else {
      // Respuesta estándar basada en el sistema de personalidad
      response = `💬 ${systemPrompt}\n\n${input}`;
    }
    
    return response;
  }
}

export { CognitiveLoop };