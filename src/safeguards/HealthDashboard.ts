import * as fs from 'fs';
import * as path from 'path';
import { Safeguards } from './Safeguards';

// Interfaz para el estado del dashboard
export interface HealthStatus {
  balance: number;
  agentsActive: number;
  auditLogSize: number;
  killSwitchArmed: boolean;
  killSwitchReason?: string;
  timestamp: number;
}

export class HealthDashboard {
  private safeguards: Safeguards;
  private dashboardPath: string;

  constructor(safeguards: Safeguards) {
    this.safeguards = safeguards;
    this.dashboardPath = path.resolve(__dirname, '../../logs/health-status.json');
    
    // Crear directorio si no existe
    const logDir = path.dirname(this.dashboardPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Inicializar el archivo de estado
    this.updateStatus();
  }

  // Actualiza el estado del dashboard en disco
  public updateStatus(): void {
    const status = this.safeguards.getHealthStatus();
    const healthStatus: HealthStatus = {
      ...status,
      timestamp: Date.now()
    };
    
    try {
      fs.writeFileSync(this.dashboardPath, JSON.stringify(healthStatus, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error al actualizar el dashboard de salud:', error);
    }
  }

  // Obtiene el estado actual del dashboard
  public getStatus(): HealthStatus {
    try {
      if (fs.existsSync(this.dashboardPath)) {
        const content = fs.readFileSync(this.dashboardPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('Error al leer el dashboard de salud:', error);
    }
    
    // Estado por defecto si no se puede leer
    return {
      balance: 0,
      agentsActive: 0,
      auditLogSize: 0,
      killSwitchArmed: true,
      timestamp: Date.now()
    };
  }

  // Actualiza el estado periódicamente
  public startMonitoring(intervalMs: number = 30000): void { // Cada 30 segundos
    setInterval(() => {
      this.updateStatus();
    }, intervalMs);
    
    // Actualizar inmediatamente
    this.updateStatus();
  }
}