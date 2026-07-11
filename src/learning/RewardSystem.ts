enum Outcome { 
  SUCCESS, 
  USER_SATISFIED, 
  RECOVERABLE_ERROR, 
  CRITICAL_ERROR, 
  LOSS 
}

class RewardSystem {
  private score: number = 0;
  private history: { action: string, reward: number }[] = [];

  evaluate(outcome: Outcome): number {
    let reward = 0;
    
    switch (outcome) {
      case Outcome.SUCCESS:
        reward = 10;
        break;
      case Outcome.USER_SATISFIED:
        reward = 5;
        break;
      case Outcome.RECOVERABLE_ERROR:
        reward = -5;
        break;
      case Outcome.CRITICAL_ERROR:
        reward = -10;
        break;
      case Outcome.LOSS:
        reward = -20;
        break;
    }
    
    this.score += reward;
    this.history.push({ action: 'unknown', reward });
    this.optimizeStrategy();
    
    return reward;
  }

  private optimizeStrategy(): void {
    if (this.score < -50) {
      console.warn('Estrategia ineficiente. Activando modelo backup...');
    }
  }

  getScore(): number {
    return this.score;
  }
}

export { Outcome, RewardSystem };