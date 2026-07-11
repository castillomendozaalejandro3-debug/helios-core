interface SystemMetrics { 
  cpuUsage: number; 
  memoryUsage: number; 
  apiLatency: number; 
  errorRate: number; 
  timestamp: number; 
}

enum HealthStatus { 
  HEALTHY = 'healthy', 
  DEGRADED = 'degraded', 
  CRITICAL = 'critical' 
}

class HealthMonitor {
  checkHealth(metrics: SystemMetrics): HealthStatus {
    if (metrics.errorRate > 20 || metrics.memoryUsage > 90) {
      return HealthStatus.CRITICAL;
    }
    
    if (metrics.apiLatency > 2000 || metrics.errorRate > 5) {
      return HealthStatus.DEGRADED;
    }
    
    return HealthStatus.HEALTHY;
  }

  autoRepair(status: HealthStatus): void {
    if (status === HealthStatus.DEGRADED) {
      console.warn('Sistema degradado. Reiniciando módulos no críticos...');
    }
    
    if (status === HealthStatus.CRITICAL) {
      console.error('Fallo crítico. Activando modelo backup y notificando...');
    }
  }
}

export { SystemMetrics, HealthStatus, HealthMonitor };