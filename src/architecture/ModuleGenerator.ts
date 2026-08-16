/**
 * ModuleGenerator - Capa 2: Auto-Arquitectura
 * Escribe modulos TypeScript reales en disco y los registra en el sistema.
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

export interface ModuleTemplate {
  name: string;
  layer: string;
  description: string;
  exports: string[];
}

export class ModuleGenerator {
  private srcDir: string;

  constructor(srcDir: string = './src') {
    this.srcDir = resolve(srcDir);
  }

  generate(template: ModuleTemplate): string {
    const dir = resolve(this.srcDir, template.layer);
    const filePath = resolve(dir, `${template.name}.ts`);
    
    mkdirSync(dir, { recursive: true });

    const content = this.buildTemplate(template);
    writeFileSync(filePath, content);
    
    return filePath;
  }

  private buildTemplate(t: ModuleTemplate): string {
    const exportsStr = t.exports.map(e => `export const ${e} = {};`).join('\n');
    
    return `/**
 * ${t.name} - Capa: ${t.layer}
 * ${t.description}
 * Generado automaticamente por Helios ModuleGenerator
 */

${exportsStr}

export default { ${t.exports.join(', ')} };
`;
  }

  generateFromSpec(spec: { layer: string; name: string; purpose: string; methods: string[] }): string {
    const className = spec.name.charAt(0).toUpperCase() + spec.name.slice(1);
    const methodStr = spec.methods.map(m => 
`  ${m}(): void {
    // TODO: Implementar ${m}
  }`).join('\n');

    const content = `/**
 * ${className} - ${spec.layer}
 * ${spec.purpose}
 * Auto-generado por Helios
 */

export class ${className} {
${methodStr}
}

export const ${spec.name} = new ${className}();
`;

    const dir = resolve(this.srcDir, spec.layer);
    const filePath = resolve(dir, `${className}.ts`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content);
    
    return filePath;
  }
}

export const moduleGenerator = new ModuleGenerator();
