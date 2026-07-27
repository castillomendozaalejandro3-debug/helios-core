import { ConfigManager } from '../config/ConfigManager';
import { SecureVault } from '../security/SecureVault';
import { MemoryEngine } from '../memory/MemoryEngine';
import { FinancialAutonomyEngine } from '../economy/FinancialAutonomyEngine';

interface DiagnosticResult {
  status: 'OK' | 'ERROR' | 'WARNING';
  message: string;
  details?: any;
}

interface SystemReadinessReport {
  isReadyToLaunch: boolean;
  timestamp: Date;
  modules: {
    config: DiagnosticResult;
    secureVault: DiagnosticResult;
    memory: DiagnosticResult;
    financial: DiagnosticResult;
  };
  errors: string[];
}

class SystemReadiness {
  private configManager: ConfigManager;
  private secureVault: SecureVault;
  private memoryEngine: MemoryEngine;
  private financialEngine: FinancialAutonomyEngine;

  constructor() {
    this.configManager = ConfigManager.getInstance();
    this.secureVault = new SecureVault();
    this.memoryEngine = new MemoryEngine();
    this.financialEngine = new FinancialAutonomyEngine();
  }

  async runFullDiagnostic(): Promise<SystemReadinessReport> {
    const report: SystemReadinessReport = {
      isReadyToLaunch: true,
      timestamp: new Date(),
      modules: {
        config: { status: 'OK', message: 'ConfigManager cargado correctamente' },
        secureVault: { status: 'OK', message: 'SecureVault inicializado correctamente' },
        memory: { status: 'OK', message: 'MemoryEngine inicializado correctamente' },
        financial: { status: 'OK', message: 'FinancialAutonomyEngine inicializado correctamente' }
      },
      errors: []
    };

    // Diagnóstico de Configuración
    try {
      const securityConfig = this.configManager.getSecurityConfig();
      if (!securityConfig.masterKey || securityConfig.masterKey.trim() === '') {
        throw new Error('HELIOS_MASTER_KEY no está configurado o está vacío');
      }
    } catch (error) {
      report.modules.config = {
        status: 'ERROR',
        message: 'Error en la configuración del sistema',
        details: error instanceof Error ? error.message : String(error)
      };
      report.errors.push(`Configuración: ${report.modules.config.details}`);
      report.isReadyToLaunch = false;
    }

    // Diagnóstico de SecureVault
    try {
      // Intentar desencriptar un valor de prueba
      const testValue = 'test-encryption-check';
      const encrypted = await this.secureVault.encrypt(testValue);
      const decrypted = await this.secureVault.decrypt(encrypted);
      if (decrypted !== testValue) {
        throw new Error('Fallo en la operación de encriptación/desencriptación');
      }
    } catch (error) {
      report.modules.secureVault = {
        status: 'ERROR',
        message: 'Error en SecureVault',
        details: error instanceof Error ? error.message : String(error)
      };
      report.errors.push(`SecureVault: ${report.modules.secureVault.details}`);
      report.isReadyToLaunch = false;
    }

    // Diagnóstico de Memoria (LanceDB)
    try {
      // Intentar inicializar y hacer una consulta de prueba
      await this.memoryEngine.initialize();
      // Hacer una consulta de prueba ligera
      const testQuery = 'test-readiness-check';
      const results = await this.memoryEngine.search(testQuery, 1);
      if (!Array.isArray(results)) {
        throw new Error('Formato inesperado de resultados de búsqueda');
      }
    } catch (error) {
      report.modules.memory = {
        status: 'ERROR',
        message: 'Error en MemoryEngine',
        details: error instanceof Error ? error.message : String(error)
      };
      report.errors.push(`MemoryEngine: ${report.modules.memory.details}`);
      report.isReadyToLaunch = false;
    }

    // Diagnóstico Financiero
    try {
      // Intentar leer el ledger y verificar el balance
      const ledger = await this.financialEngine.getLedger();
      if (!ledger || typeof ledger.balance !== 'number') {
        throw new Error('Ledger no válido o balance no numérico');
      }
    } catch (error) {
      report.modules.financial = {
        status: 'ERROR',
        message: 'Error en FinancialAutonomyEngine',
        details: error instanceof Error ? error.message : String(error)
      };
      report.errors.push(`FinancialEngine: ${report.modules.financial.details}`);
      report.isReadyToLaunch = false;
    }

    return report;
  }
}

export { SystemReadiness, SystemReadinessReport };