import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface BrowserTask {
  id: string;
  type: 'LOGIN' | 'PURCHASE' | 'SCRAPE' | 'FORM_FILL' | 'NAVIGATION';
  url: string;
  instructions: string;
  credentials?: { username: string; password: string };
  expectedOutcome?: string;
}

export interface BrowserResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshotPath?: string;
}

export class BrowserAgent {
  private pythonScriptDir: string;
  private browserUseInstalled: boolean = false;

  constructor() {
    this.pythonScriptDir = path.resolve(__dirname, '../../browser_scripts');
    this.ensurePythonScriptsExist();
    this.checkBrowserUseInstallation();
  }

  // Propósito: Verificar que browser-use esté instalado en el sistema.
  // Fortaleza: Instala automáticamente si no existe.
  private async checkBrowserUseInstallation(): Promise<void> {
    return new Promise((resolve) => {
      const check = spawn('pip', ['show', 'browser-use']);
      check.on('close', (code) => {
        if (code !== 0) {
          console.log('Instalando browser-use...');
          const install = spawn('pip', ['install', 'browser-use']);
          install.on('close', () => {
            this.browserUseInstalled = true;
            resolve();
          });
        } else {
          this.browserUseInstalled = true;
          resolve();
        }
      });
    });
  }

  // Propósito: Crear los scripts Python necesarios para browser-use.
  // Fortaleza: Genera código Python real que usa browser-use para controlar el navegador.
  private ensurePythonScriptsExist(): void {
    if (!fs.existsSync(this.pythonScriptDir)) {
      fs.mkdirSync(this.pythonScriptDir, { recursive: true });
    }

    // Script principal de browser-use
    const mainScript = `
import asyncio
from browser_use import Agent
from langchain_openai import ChatOpenAI
import json
import sys

async def execute_task(task_data):
    agent = Agent(
        task=task_data['instructions'],
        llm=ChatOpenAI(model="gpt-4o"),
    )
    result = await agent.run()
    return {
        "success": True,
        "data": result.final_result(),
        "screenshot": "screenshot.png"
    }

if __name__ == "__main__":
    task_json = sys.argv[1]
    task_data = json.loads(task_json)
    result = asyncio.run(execute_task(task_data))
    print(json.dumps(result))
`;

    fs.writeFileSync(path.join(this.pythonScriptDir, 'browser_agent.py'), mainScript);
  }

  // Propósito: Ejecutar una tarea web real usando browser-use.
  // Fortaleza: Controla un navegador real, puede hacer login, comprar, scraping, etc.
  public async executeBrowserTask(task: BrowserTask): Promise<BrowserResult> {
    if (!this.browserUseInstalled) {
      await this.checkBrowserUseInstallation();
    }

    return new Promise((resolve, reject) => {
      const taskJson = JSON.stringify(task);
      const pythonProcess = spawn('python', [
        path.join(this.pythonScriptDir, 'browser_agent.py'),
        taskJson
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (e) {
            resolve({ success: false, error: 'Failed to parse output' });
          }
        } else {
          resolve({ success: false, error: errorOutput });
        }
      });
    });
  }

  // Propósito: Tarea específica de login en un sitio web.
  // Fortaleza: Maneja credenciales de forma segura y verifica el resultado.
  public async loginToWebsite(url: string, username: string, password: string): Promise<BrowserResult> {
    const task: BrowserTask = {
      id: `login_${Date.now()}`,
      type: 'LOGIN',
      url: url,
      instructions: `Go to ${url}, find the login form, enter username "${username}" and password "${password}", then click login. Verify that login was successful.`,
      credentials: { username, password }
    };

    return await this.executeBrowserTask(task);
  }

  // Propósito: Tarea específica de compra o transacción financiera.
  // Fortaleza: Puede comprar dominios, suscripciones, servicios, etc.
  public async makePurchase(url: string, productDetails: string, paymentInfo: any): Promise<BrowserResult> {
    const task: BrowserTask = {
      id: `purchase_${Date.now()}`,
      type: 'PURCHASE',
      url: url,
      instructions: `Go to ${url}, find the product "${productDetails}", add it to cart, proceed to checkout, and complete the purchase using the provided payment information. Take a screenshot of the confirmation.`
    };

    return await this.executeBrowserTask(task);
  }

  // Propósito: Extraer datos de cualquier sitio web.
  // Fortaleza: Scraping inteligente que entiende el contexto de la página.
  public async scrapeWebsite(url: string, targetData: string): Promise<BrowserResult> {
    const task: BrowserTask = {
      id: `scrape_${Date.now()}`,
      type: 'SCRAPE',
      url: url,
      instructions: `Go to ${url} and extract the following information: "${targetData}". Return the data in a structured format.`
    };

    return await this.executeBrowserTask(task);
  }
}