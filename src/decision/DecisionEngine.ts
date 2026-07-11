enum DecisionLevel { AUTO, NOTIFY, APPROVE, PROHIBITED }

interface DecisionContext { 
  action: string, 
  cost: number, 
  reversible: boolean, 
  isCritical: boolean 
}

class DecisionEngine {
  evaluate(context: DecisionContext): DecisionLevel {
    if (context.isCritical && context.cost > 1000) {
      return DecisionLevel.PROHIBITED;
    }
    
    if (context.cost < 100 && context.reversible) {
      return DecisionLevel.AUTO;
    }
    
    if ((context.cost >= 100 && context.cost <= 500) || 
        (!context.reversible && !context.isCritical)) {
      return DecisionLevel.NOTIFY;
    }
    
    if (context.cost > 500 || context.isCritical) {
      return DecisionLevel.APPROVE;
    }
    
    return DecisionLevel.PROHIBITED;
  }
}

export { DecisionLevel, DecisionContext, DecisionEngine };