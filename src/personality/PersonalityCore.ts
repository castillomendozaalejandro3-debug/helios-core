/**
 * PersonalityCore - Capa 3: Cognicion y Memoria
 * 5 traits (directness, creativity, caution, humor, autonomy) que evolucionan.
 */

import { EventEmitter } from 'events';

interface PersonalityTraits {
  directness: number;
  creativity: number;
  caution: number;
  humor: number;
  autonomy: number;
}

export class PersonalityCore extends EventEmitter {
  private traits: PersonalityTraits;
  private experiences: Array<{ context: string; outcome: 'positive' | 'negative'; timestamp: number }> = [];

  constructor() {
    super();
    this.traits = {
      directness: 0.7,
      creativity: 0.6,
      caution: 0.5,
      humor: 0.3,
      autonomy: 0.8,
    };
  }

  getTraits(): PersonalityTraits {
    return { ...this.traits };
  }

  recordExperience(context: string, outcome: 'positive' | 'negative'): void {
    this.experiences.push({ context, outcome, timestamp: Date.now() });
    
    if (outcome === 'negative') {
      this.traits.caution = Math.min(1, this.traits.caution + 0.05);
      this.traits.autonomy = Math.max(0, this.traits.autonomy - 0.02);
    } else {
      this.traits.creativity = Math.min(1, this.traits.creativity + 0.03);
      this.traits.autonomy = Math.min(1, this.traits.autonomy + 0.02);
    }

    this.emit('personality-evolved', { traits: this.traits, experience: context, outcome });
  }

  generateResponse(intent: string): string {
    const style = this.traits.directness > 0.7 ? 'directo' : 'diplomatico';
    const tone = this.traits.humor > 0.5 ? 'con humor' : 'serio';
    return `[Helios - ${style}, ${tone}] ${intent}`;
  }

  getStats(): { experiences: number; dominantTrait: string } {
    const entries = Object.entries(this.traits);
    const dominant = entries.reduce((a, b) => a[1] > b[1] ? a : b);
    return {
      experiences: this.experiences.length,
      dominantTrait: dominant[0],
    };
  }
}

export const personalityCore = new PersonalityCore();
