import { SystemReadiness } from './core/SystemReadiness';

async function main() {
  console.log('🚀 INICIANDO SECUENCIA DE ARRANQUE DE HELIOS...\n');
  
  try {
    const readiness = new SystemReadiness();
    const report = await readiness.runFullDiagnostic();
    
    console.log('📊 REPORTE DE ESTADO DEL SISTEMA:');
    console.log(JSON.stringify(report, null, 2));
    
    if (report.isReadyToLaunch) {
      console.log('\n✅ HELIOS CORE: ONLINE. Listo para operar.');
    } else {
      console.log('\n⚠️ HELIOS CORE: DEGRADED. Faltan configuraciones críticas.');
    }
  } catch (error) {
    console.error('FALLO CRÍTICO EN EL ARRANQUE:', error);
  }
}

main();