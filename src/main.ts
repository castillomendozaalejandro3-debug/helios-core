import { ConfigManager } from './config/ConfigManager';
import { SystemReadiness } from './core/SystemReadiness';
import { AutonomousRevenueLoop } from './core/AutonomousRevenueLoop';

async function main() {
  console.log('🚀 INICIANDO SECUENCIA DE ARRANQUE DE HELIOS...\n');
  
  try {
    // Ejecutar diagnóstico de sistema antes de iniciar el loop
    const readiness = new SystemReadiness();
    const report = await readiness.runFullDiagnostic();
    
    console.log('📊 REPORTE DE ESTADO DEL SISTEMA:');
    console.log(`- Listo para lanzar: ${report.isReadyToLaunch ? '✅ SÍ' : '❌ NO'}`);
    console.log(`- Timestamp: ${report.timestamp.toISOString()}`);
    
    // Mostrar estado de cada módulo
    Object.entries(report.modules).forEach(([module, result]) => {
      const statusEmoji = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌';
      console.log(`- ${module}: ${statusEmoji} ${result.message}`);
      if (result.details) {
        console.log(`  Detalles: ${result.details}`);
      }
    });
    
    if (!report.isReadyToLaunch) {
      console.log('\n❌ HELIOS CORE: DETENIDO. Fallos críticos detectados en el diagnóstico.');
      console.log('Errores encontrados:');
      report.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
      console.log('\nPor favor, revise la configuración y los servicios requeridos antes de reiniciar.');
      process.exit(1);
    }
    
    console.log('\n✅ HELIOS CORE: ONLINE. Iniciando el AutonomousRevenueLoop...');
    
    // Iniciar el loop de ingresos autónomos
    const revenueLoop = new AutonomousRevenueLoop();
    await revenueLoop.start();
    
  } catch (error) {
    console.error('FALLO CRÍTICO EN EL ARRANQUE:', error);
    process.exit(1);
  }
}

main();