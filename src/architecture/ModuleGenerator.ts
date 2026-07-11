import * as fs from 'fs';
import * as path from 'path';
// Asume que DecisionEngine ya existe en el proyecto
import { DecisionEngine, DecisionLevel } from '../decision/DecisionEngine'; 

export interface ModuleMethod {
  name: string;
  signature: string; // ej: "async process(data: string): Promise<void>"
  implementation: string; // Cuerpo real de la función
}

export interface ModuleBlueprint {
  name: string;
  purpose: string;
  dependencies: string[];
  methods: ModuleMethod[];
}

export class ModuleGenerator {
  private decisionEngine: DecisionEngine;
  private modulesDir: string;

  constructor() {
    this.decisionEngine = new DecisionEngine();
    // Ruta real dentro del proyecto
    this.modulesDir = path.resolve(__dirname, '../modules'); 
    if (!fs.existsSync(this.modulesDir)) {
      fs.mkdirSync(this.modulesDir, { recursive: true });
    }
  }

  // Propósito: Generar y persistir un nuevo módulo en el sistema de archivos.
  // Fortaleza: Escribe código TS real, actualiza el index de registros y pasa por el filtro de seguridad.
  async generateModule(blueprint: ModuleBlueprint): Promise<string> {
    // 1. Validación de seguridad con DecisionEngine
    const decision = this.decisionEngine.evaluate({
      action: `Crear nuevo módulo: ${blueprint.name}`,
      cost: 0,
      reversible: true,
      isCritical: false
    });

    if (decision === DecisionLevel.PROHIBITED) {
      throw new Error(`Creación del módulo ${blueprint.name} bloqueada por políticas de seguridad.`);
    }

    // 2. Generación del código TypeScript real
    const code = this.buildTypeScriptCode(blueprint);
    const filePath = path.join(this.modulesDir, `${blueprint.name}.ts`);

    // 3. Escritura en disco
    fs.writeFileSync(filePath, code, 'utf-8');

    // 4. Actualización del registro global (src/modules/registry.ts)
    this.updateRegistry(blueprint.name);

    return filePath;
  }

  private buildTypeScriptCode(blueprint: ModuleBlueprint): string {
    // Generar imports
    const imports = blueprint.dependencies.length > 0 
      ? `import { ${blueprint.dependencies.join(', ')} } from '../dependencies';\n\n`
      : '\n';

    // Generar métodos
    const methods = blueprint.methods.map(m => 
      `  ${m.signature} {\n    ${m.implementation}\n  }`
    ).join('\n\n');

    // Generar código completo
    return `// Módulo generado automáticamente por Helios
// Propósito: ${blueprint.purpose}
// Fecha de generación: ${new Date().toISOString()}

${imports}export class ${blueprint.name} {
${methods}
}`;
  }

  private updateRegistry(moduleName: string): void {
    const registryPath = path.resolve(__dirname, '../modules/registry.ts');
    const registryDir = path.dirname(registryPath);
    
    // Crear directorio si no existe
    if (!fs.existsSync(registryDir)) {
      fs.mkdirSync(registryDir, { recursive: true });
    }
    
    // Leer el archivo de registro actual o crear uno nuevo
    let registryContent = '';
    if (fs.existsSync(registryPath)) {
      registryContent = fs.readFileSync(registryPath, 'utf-8');
    }
    
    // Verificar si ya existe la exportación
    const exportPattern = new RegExp(`export \\{ ${moduleName} \\} from './${moduleName}';`);
    if (exportPattern.test(registryContent)) {
      return; // Ya está registrado
    }
    
    // Agregar la nueva exportación al final del archivo
    const newExport = `export { ${moduleName} } from './${moduleName}';\n`;
    const updatedContent = registryContent + newExport;
    
    // Escribir el archivo de registro actualizado
    fs.writeFileSync(registryPath, updatedContent, 'utf-8');
  }
}