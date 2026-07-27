import * as dotenv from 'dotenv';

// Cargar variables de entorno desde el archivo .env
dotenv.config();

// Interfaces para tipado estricto
interface SecurityConfig {
  masterKey: string;
  vaultPath: string;
  encryptionAlgorithm: string;
}

interface LLMConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
}

interface FinancialConfig {
  stripeSecretKey: string;
  revenueThreshold: number;
  currency: string;
}

interface BrowserConfig {
  headless: boolean;
  defaultTimeout: number;
  userAgent: string;
}

// Configuración global
interface HeliosConfig {
  security: SecurityConfig;
  llm: LLMConfig;
  financial: FinancialConfig;
  browser: BrowserConfig;
}

// Validación de variables críticas
const validateRequiredEnv = (key: string, value: string | undefined): void => {
  if (!value || value.trim() === '') {
    throw new Error(`Variable de entorno requerida faltante: ${key}`);
  }
};

// Validación de formato numérico
const validateNumericEnv = (key: string, value: string | undefined): number => {
  if (!value || value.trim() === '') {
    throw new Error(`Variable de entorno numérica requerida faltante: ${key}`);
  }
  const num = parseFloat(value);
  if (isNaN(num)) {
    throw new Error(`Variable de entorno numérica inválida: ${key} = ${value}`);
  }
  return num;
};

// Clase singleton para el gestor de configuración
class ConfigManager {
  private static instance: ConfigManager;
  private config: HeliosConfig;

  private constructor() {
    // Validar variables críticas
    validateRequiredEnv('HELIOS_MASTER_KEY', process.env.HELIOS_MASTER_KEY);
    validateRequiredEnv('OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY);
    validateRequiredEnv('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY);

    // Construir la configuración
    this.config = {
      security: {
        masterKey: process.env.HELIOS_MASTER_KEY!,
        vaultPath: process.env.VAULT_PATH || './vault',
        encryptionAlgorithm: process.env.ENCRYPTION_ALGORITHM || 'AES-256-GCM'
      },
      llm: {
        provider: process.env.LLM_PROVIDER || 'openai',
        model: process.env.LLM_MODEL || 'gpt-4',
        apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY!,
        baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
        temperature: validateNumericEnv('LLM_TEMPERATURE', process.env.LLM_TEMPERATURE) || 0.7,
        maxTokens: validateNumericEnv('LLM_MAX_TOKENS', process.env.LLM_MAX_TOKENS) || 4096
      },
      financial: {
        stripeSecretKey: process.env.STRIPE_SECRET_KEY!,
        revenueThreshold: validateNumericEnv('REVENUE_THRESHOLD', process.env.REVENUE_THRESHOLD) || 1000.0,
        currency: process.env.CURRENCY || 'USD'
      },
      browser: {
        headless: process.env.BROWSER_HEADLESS === 'true',
        defaultTimeout: validateNumericEnv('BROWSER_TIMEOUT', process.env.BROWSER_TIMEOUT) || 30000,
        userAgent: process.env.BROWSER_USER_AGENT || 'Helios Browser Agent'
      }
    };
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  getSecurityConfig(): SecurityConfig {
    return this.config.security;
  }

  getLLMConfig(): LLMConfig {
    return this.config.llm;
  }

  getFinancialConfig(): FinancialConfig {
    return this.config.financial;
  }

  getBrowserConfig(): BrowserConfig {
    return this.config.browser;
  }
}

export { ConfigManager, SecurityConfig, LLMConfig, FinancialConfig, BrowserConfig };