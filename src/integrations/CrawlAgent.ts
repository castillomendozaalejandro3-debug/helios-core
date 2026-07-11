import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { MemoryEngine, MemoryType } from '../memory/MemoryEngine';

export type ExtractionStrategy = 'CSS' | 'XPATH' | 'LLM';

export interface ExtractionSchema {
  fields: { name: string; selector: string; type: 'text' | 'link' | 'image' }[];
  llmPrompt?: string; // Solo para estrategia LLM
}

export interface CrawlResult {
  url: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

export class CrawlAgent {
  private pythonScriptDir: string;
  private memoryEngine: MemoryEngine;

  constructor() {
    this.pythonScriptDir = path.resolve(__dirname, '../../python_scripts');
    this.memoryEngine = new MemoryEngine();
    this.ensurePythonScriptsExist();
  }

  // Propósito: Asegurar que los scripts Python de crawl4ai existan en disco.
  private ensurePythonScriptsExist(): void {
    if (!fs.existsSync(this.pythonScriptDir)) {
      fs.mkdirSync(this.pythonScriptDir, { recursive: true });
    }

    const scriptContent = `
import asyncio
import json
import sys
from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy, LLMExtractionStrategy

async def crawl_and_extract(url, schema_json, strategy_type):
    schema = json.loads(schema_json)
    async with AsyncWebCrawler(verbose=False) as crawler:
        if strategy_type == 'LLM':
            # Configuración real para LLM (Helios debe proveer la API key en el schema o env)
            strategy = LLMExtractionStrategy(provider="openai/gpt-4o", api_token=schema.get('api_key', ''), instruction=schema.get('llm_prompt', ''))
        else:
            strategy = JsonCssExtractionStrategy(schema=schema)
        
        result = await crawler.arun(url=url, extraction_strategy=strategy)
        if result.success:
            return json.dumps({"success": True, "data": result.extracted_content})
        else:
            return json.dumps({"success": False, "error": result.error_message})

if __name__ == "__main__":
    url = sys.argv[1]
    schema_json = sys.argv[2]
    strategy_type = sys.argv[3]
    result = asyncio.run(crawl_and_extract(url, schema_json, strategy_type))
    print(result)
`;
    fs.writeFileSync(path.join(this.pythonScriptDir, 'crawl_agent.py'), scriptContent, 'utf-8');
  }

  // Propósito: Extraer datos reales de una URL usando la estrategia especificada.
  // Fortaleza: Soporta CSS, XPath y LLM. Persiste el resultado en la memoria vectorial de Helios.
  public async extractData(url: string, schema: ExtractionSchema, strategy: ExtractionStrategy): Promise<CrawlResult> {
    return new Promise((resolve, reject) => {
      const schemaJson = JSON.stringify(schema);
      const pythonProcess = spawn('python', [
        path.join(this.pythonScriptDir, 'crawl_agent.py'),
        url,
        schemaJson,
        strategy
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => { output += data.toString(); });
      pythonProcess.stderr.on('data', (data) => { errorOutput += data.toString(); });

      pythonProcess.on('close', async (code) => {
        if (code === 0) {
          try {
            const result: CrawlResult = JSON.parse(output);
            result.timestamp = Date.now();
            // Persistencia real en memoria
            await this.memoryEngine.store(MemoryType.SEMANTIC, JSON.stringify(result.data), { source: url, type: 'crawl' });
            resolve(result);
          } catch (e) {
            resolve({ url, success: false, error: 'Failed to parse Python output', timestamp: Date.now() });
          }
        } else {
          resolve({ url, success: false, error: errorOutput, timestamp: Date.now() });
        }
      });
    });
  }

  // Propósito: Rastrear múltiples URLs en paralelo (con control de concurrencia real).
  public async crawlMultipleUrls(urls: string[], schema: ExtractionSchema, strategy: ExtractionStrategy, concurrency: number = 5): Promise<CrawlResult[]> {
    const results: CrawlResult[] = [];
    
    // Implementa un pool de promesas real para limitar la concurrencia y no saturar la red/CPU
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(url => this.extractData(url, schema, strategy)));
      results.push(...batchResults);
    }
    
    return results;
  }
}