/**
 * boot-test.ts - Prueba de arranque
 */

import { configManager } from './config/ConfigManager.js';
import { systemReadiness } from './core/SystemReadiness.js';

async function bootTest(): Promise<void> {
  console.log('HELIOS BOOT TEST\n');
  try {
    console.log('1. Validando configuracion...');
    configManager.validateCritical();
    console.log('   OK Config valida');

    console.log('2. Ejecutando SystemReadiness...');
    const { ready, checks } = await systemReadiness.runAll();
    console.log(`   ${ready ? 'OK' : 'FAIL'} ${checks.length} checks`);

    console.log('3. Cargando modulos...');
    await import('./memory/MemoryEngine.js');
    await import('./decision/DecisionEngine.js');
    await import('./economy/FinancialAutonomyEngine.js');
    await import('./safeguards/Safeguards.js');
    await import('./agents/AgentFactory.js');
    console.log('   OK Modulos cargados');

    console.log('\nBOOT TEST EXITOSO - Ejecuta: npx tsx src/main.ts');
    process.exit(0);
  } catch (err) {
    console.error('\nBOOT TEST FALLIDO:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

bootTest();
