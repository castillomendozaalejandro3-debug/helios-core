interface ImprovementLog { 
  timestamp: number; 
  metric: string; 
  previousValue: number; 
  newValue: number; 
  actionTaken: string; 
}

class SelfImprovementEngine {
  private logs: ImprovementLog[] = [];

  trackImprovement(metric: string, previous: number, current: number, action: string): void {
    this.logs.push({
      timestamp: Date.now(),
      metric,
      previousValue: previous,
      newValue: current,
      actionTaken: action
    });
  }

  analyzeTrends(): string[] {
    if (this.logs.length === 0) {
      return ["No hay datos disponibles para análisis de tendencias."];
    }

    const insights: string[] = [];
    const recentLogs = this.logs.slice(-10); // Últimos 10 logs

    // Analizar latencia
    const latencyLogs = recentLogs.filter(log => log.metric.includes('latency') || log.metric.includes('apiLatency'));
    if (latencyLogs.length > 0) {
      const avgLatency = latencyLogs.reduce((sum, log) => sum + log.newValue, 0) / latencyLogs.length;
      if (avgLatency > 2000) {
        insights.push("La latencia promedio ha superado los 2000ms. Sugiero optimizar consultas y revisar caché.");
      }
    }

    // Analizar uso de memoria
    const memoryLogs = recentLogs.filter(log => log.metric.includes('memoryUsage'));
    if (memoryLogs.length > 0) {
      const recentMemory = memoryLogs.slice(-5);
      const memoryTrend = recentMemory.reduce((sum, log) => sum + log.newValue, 0) / recentMemory.length;
      if (memoryTrend > 85) {
        insights.push("El uso de memoria está por encima del 85%. Sugiero revisar fugas de memoria y optimizar estructuras de datos.");
      }
    }

    // Analizar tasa de errores
    const errorLogs = recentLogs.filter(log => log.metric.includes('errorRate'));
    if (errorLogs.length > 0) {
      const recentErrors = errorLogs.slice(-5);
      const errorTrend = recentErrors.reduce((sum, log) => sum + log.newValue, 0) / recentErrors.length;
      if (errorTrend > 20) {
        insights.push("La tasa de errores ha superado el 20%. Sugiero revisar manejo de errores y validaciones de entrada.");
      }
    }

    // Analizar tiempo de respuesta
    const responseLogs = recentLogs.filter(log => log.metric.includes('responseTime'));
    if (responseLogs.length > 0) {
      const recentResponse = responseLogs.slice(-5);
      const responseTrend = recentResponse.reduce((sum, log) => sum + log.newValue, 0) / recentResponse.length;
      if (responseTrend > 5000) {
        insights.push("El tiempo de respuesta promedio ha superado los 5000ms. Sugiero revisar integraciones externas y optimizar código crítico.");
      }
    }

    // Si no hay insights, generar uno genérico
    if (insights.length === 0) {
      insights.push("No se detectaron tendencias significativas en los últimos registros. Continuar monitoreando.");
    }

    return insights;
  }

  applyMicroOptimizations(): void {
    console.log('Aplicando micro-optimizaciones basadas en tendencias...');
  }
}

export { ImprovementLog, SelfImprovementEngine };