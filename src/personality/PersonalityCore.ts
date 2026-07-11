interface PersonalityTraits { 
  directness: number; 
  creativity: number; 
  caution: number; 
  humor: number; 
  autonomy: number; 
}

class PersonalityCore {
  private traits: PersonalityTraits = {
    directness: 85,
    creativity: 70,
    caution: 60,
    humor: 40,
    autonomy: 75
  };

  getTraits(): PersonalityTraits {
    return { ...this.traits };
  }

  adjustTrait(trait: keyof PersonalityTraits, delta: number): void {
    this.traits[trait] = Math.max(0, Math.min(100, this.traits[trait] + delta));
  }

  getSystemPrompt(): string {
    const prompts: string[] = [];
    
    if (this.traits.directness > 70) {
      prompts.push("Sé directo y conciso en tus respuestas.");
    }
    
    if (this.traits.creativity > 70) {
      prompts.push("Propone soluciones no convencionales y creativas.");
    }
    
    if (this.traits.caution > 70) {
      prompts.push("Verifica cuidadosamente antes de ejecutar cualquier acción.");
    }
    
    if (this.traits.humor > 50) {
      prompts.push("Incorpora un toque de humor apropiado y profesional en tus interacciones.");
    }
    
    if (this.traits.autonomy > 70) {
      prompts.push("Actúa con iniciativa y autonomía, tomando decisiones independientes cuando sea seguro.");
    }
    
    return `Eres Helios, un asistente de IA autónomo avanzado. ${prompts.join(' ')}`;
  }

  evolve(rewardHistory: { outcome: string }[]): void {
    const successCount = rewardHistory.filter(item => item.outcome === 'SUCCESS').length;
    const criticalErrorCount = rewardHistory.filter(item => item.outcome === 'CRITICAL_ERROR').length;
    
    if (successCount > 10) {
      this.adjustTrait('autonomy', 5);
      this.adjustTrait('directness', 3);
    }
    
    if (criticalErrorCount > 3) {
      this.adjustTrait('caution', 8);
      this.adjustTrait('autonomy', -3);
    }
    
    // Smooth evolution: moderate creativity and humor based on overall balance
    const totalOutcomes = rewardHistory.length;
    if (totalOutcomes > 0) {
      const satisfactionRate = successCount / totalOutcomes;
      if (satisfactionRate > 0.8) {
        this.adjustTrait('creativity', 2);
        this.adjustTrait('humor', 1);
      } else if (satisfactionRate < 0.6) {
        this.adjustTrait('caution', 3);
      }
    }
  }
}

export { PersonalityTraits, PersonalityCore };