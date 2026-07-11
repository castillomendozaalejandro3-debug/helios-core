enum RefactorStatus { SAFE, RISKY, CRITICAL }

interface CodeModule { 
  name: string; 
  path: string; 
  lines: number; 
  complexity: number; 
  lastModified: number; 
}

interface RefactorProposal { 
  module: string; 
  suggestion: string; 
  estimatedImprovement: string; 
  status: RefactorStatus; 
}

class SelfRefactorer {
  analyzeModule(module: CodeModule): RefactorProposal {
    let suggestion = '';
    let estimatedImprovement = '';
    let status: RefactorStatus = RefactorStatus.SAFE;

    if (module.lines > 500) {
      suggestion = `Dividir ${module.name} en submódulos para mejorar mantenibilidad.`;
      estimatedImprovement = 'Reducción de complejidad y mejora en tiempo de desarrollo.';
      status = RefactorStatus.SAFE;
    } else if (module.complexity > 10) {
      suggestion = `Simplificar lógica en ${module.name} para reducir complejidad ciclomática.`;
      estimatedImprovement = 'Mayor claridad y reducción de errores potenciales.';
      status = RefactorStatus.RISKY;
    } else if (module.name.includes('core') || 
               module.name.includes('decision') || 
               module.name.includes('memory')) {
      suggestion = `No refactorizar ${module.name} sin aprobación humana.`;
      estimatedImprovement = 'Protección de módulos críticos del sistema.';
      status = RefactorStatus.CRITICAL;
    } else {
      suggestion = `No se identificaron oportunidades de refactorización para ${module.name}.`;
      estimatedImprovement = 'Mantenimiento del estado actual.';
      status = RefactorStatus.SAFE;
    }

    return {
      module: module.name,
      suggestion,
      estimatedImprovement,
      status
    };
  }

  executeRefactor(proposal: RefactorProposal): void {
    switch (proposal.status) {
      case RefactorStatus.CRITICAL:
        console.error(`Refactorización bloqueada: módulo crítico requiere aprobación humana.`);
        break;
      case RefactorStatus.RISKY:
        console.warn(`Refactorización riesgosa. Creando backup...`);
        break;
      case RefactorStatus.SAFE:
        console.log(`Aplicando refactorización segura...`);
        break;
      default:
        console.warn(`Estado de refactorización desconocido: ${proposal.status}`);
    }
  }

  rollback(): void {
    console.log(`Restaurando versión anterior del módulo...`);
  }
}

export { RefactorStatus, CodeModule, RefactorProposal, SelfRefactorer };