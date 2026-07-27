import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenvConfig({ path: '.env' });

// Define validation schemas for different configuration sections
const SecurityConfigSchema = z.object({
  HELIOS_MASTER_KEY: z.string().min(1, 'HELIOS_MASTER_KEY is required'),
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required'),
  AWS_ACCESS_KEY_ID: z.string().min(1, 'AWS_ACCESS_KEY_ID is required'),
  AWS_SECRET_ACCESS_KEY: z.string().min(1, 'AWS_SECRET_ACCESS_KEY is required')
});

const BrowserConfigSchema = z.object({
  BROWSER_USE_PROXY: z.string().optional(),
  BROWSER_USE_HEADLESS: z.string().default('true').transform(val => val.toLowerCase() === 'true')
});

const FinancialConfigSchema = z.object({
  FINANCIAL_DEFAULT_CURRENCY: z.string().default('USD'),
  FINANCIAL_MINIMUM_BALANCE: z.string().default('500').transform(val => parseFloat(val))
});

const SecurityMonitoringConfigSchema = z.object({
  SECURITY_AUDIT_LEVEL: z.string().default('HIGH'),
  MONITORING_ENABLED: z.string().default('true').transform(val => val.toLowerCase() === 'true')
});

const LLMConfigSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  // Additional LLM configuration variables can be added here
});

// Define TypeScript interfaces
export interface SecurityConfig {
  HELIOS_MASTER_KEY: string;
  STRIPE_SECRET_KEY: string;
  OPENAI_API_KEY: string;
  GITHUB_TOKEN: string;
  GOOGLE_API_KEY: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
}

export interface BrowserConfig {
  BROWSER_USE_PROXY?: string;
  BROWSER_USE_HEADLESS: boolean;
}

export interface FinancialConfig {
  FINANCIAL_DEFAULT_CURRENCY: string;
  FINANCIAL_MINIMUM_BALANCE: number;
}

export interface SecurityMonitoringConfig {
  SECURITY_AUDIT_LEVEL: string;
  MONITORING_ENABLED: boolean;
}

export interface LLMConfig {
  OPENROUTER_API_KEY: string;
}

export interface Config {
  security: SecurityConfig;
  browser: BrowserConfig;
  financial: FinancialConfig;
  securityMonitoring: SecurityMonitoringConfig;
  llm: LLMConfig;
}

// Singleton class for configuration management
class ConfigManager {
  private static instance: ConfigManager;
  private config: Config;

  private constructor() {
    // Validate and parse environment variables
    const securityConfig = SecurityConfigSchema.safeParse(process.env);
    const browserConfig = BrowserConfigSchema.safeParse(process.env);
    const financialConfig = FinancialConfigSchema.safeParse(process.env);
    const securityMonitoringConfig = SecurityMonitoringConfigSchema.safeParse(process.env);
    const llmConfig = LLMConfigSchema.safeParse(process.env);

    // Check for validation errors
    if (!securityConfig.success) {
      throw new Error(`Configuration validation error in SecurityConfig: ${securityConfig.error.message}`);
    }
    if (!browserConfig.success) {
      throw new Error(`Configuration validation error in BrowserConfig: ${browserConfig.error.message}`);
    }
    if (!financialConfig.success) {
      throw new Error(`Configuration validation error in FinancialConfig: ${financialConfig.error.message}`);
    }
    if (!securityMonitoringConfig.success) {
      throw new Error(`Configuration validation error in SecurityMonitoringConfig: ${securityMonitoringConfig.error.message}`);
    }
    if (!llmConfig.success) {
      throw new Error(`Configuration validation error in LLMConfig: ${llmConfig.error.message}`);
    }

    this.config = {
      security: securityConfig.data,
      browser: browserConfig.data,
      financial: financialConfig.data,
      securityMonitoring: securityMonitoringConfig.data,
      llm: llmConfig.data
    };
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  // Typed access methods for different configuration sections
  public getSecurityConfig(): SecurityConfig {
    return this.config.security;
  }

  public getBrowserConfig(): BrowserConfig {
    return this.config.browser;
  }

  public getFinancialConfig(): FinancialConfig {
    return this.config.financial;
  }

  public getSecurityMonitoringConfig(): SecurityMonitoringConfig {
    return this.config.securityMonitoring;
  }

  public getLLMConfig(): LLMConfig {
    return this.config.llm;
  }

  // Generic method to get any configuration value (for advanced use cases)
  public get<T>(key: string): T | undefined {
    // This is a simplified implementation - in production, you might want a more sophisticated path-based access
    // For now, we'll just return undefined for safety
    return undefined;
  }

  // Method to get all configuration (for debugging purposes only - should not be used in production)
  public getAllConfig(): Config {
    // Return a deep copy to prevent accidental mutation
    return JSON.parse(JSON.stringify(this.config)) as Config;
  }
}

// Export the singleton instance
export const ConfigManagerInstance = ConfigManager.getInstance();

// Export the class for testing purposes
export { ConfigManager };