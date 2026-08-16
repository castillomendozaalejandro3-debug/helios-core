import { config } from 'dotenv';
import { z } from 'zod';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ConfigSchema = z.object({
  HELIOS_MASTER_KEY: z.string().min(16),
  HELIOS_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  HELIOS_GATEWAY_PORT: z.coerce.number().default(3000),
  HELIOS_GATEWAY_HOST: z.string().default('0.0.0.0'),
  HELIOS_GATEWAY_TOKEN: z.string().min(8),
  LOCAL_LLM_ENDPOINT: z.string().default('http://localhost:11434'),
  LOCAL_LLM_MODEL: z.string().default('llama3.2'),
  OPENROUTER_API_KEY: z.string().optional(),
  HELIOS_STATE_DIR: z.string().default('./.helios'),
  HELIOS_LEDGER_PATH: z.string().default('./.helios/ledger.db'),
  HELIOS_INITIAL_BALANCE: z.coerce.number().default(1000),
  HELIOS_MINIMUM_BALANCE: z.coerce.number().default(500),
  HELIOS_HUMAN_CUT_PERCENT: z.coerce.number().min(0).max(100).default(20),
  HELIOS_CURRENCY: z.string().default('USD'),
  HELIOS_AUTONOMY_LEVEL: z.coerce.number().min(0).max(4).default(4),
  HELIOS_MAX_LOSS_KILL_SWITCH: z.coerce.number().default(1000),
  HELIOS_MAX_AGENTS: z.coerce.number().default(10),
  HELIOS_AGENT_MEMORY_LIMIT_MB: z.coerce.number().default(512),
  HELIOS_HEALTH_CHECK_INTERVAL_MS: z.coerce.number().default(30000),
  HELIOS_AUDIT_RETENTION_DAYS: z.coerce.number().default(365),
  STRIPE_SECRET_KEY: z.string().optional(),
  CRYPTO_WALLET_SEED: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type HeliosConfig = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private static instance: ConfigManager;
  private _config: HeliosConfig;

  private constructor() {
    const envPaths = [
      resolve(process.cwd(), '.env'),
      resolve(process.cwd(), '../.env'),
      resolve(process.env.HELIOS_STATE_DIR || './.helios', '.env'),
    ];
    for (const path of envPaths) {
      if (existsSync(path)) {
        config({ path, override: false });
        break;
      }
    }
    const result = ConfigSchema.safeParse(process.env);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Helios FATAL - Config invalida:\n${errors.join('\n')}`);
    }
    this._config = result.data;
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  get config(): HeliosConfig {
    return this._config;
  }

  get stateDir(): string {
    return resolve(this._config.HELIOS_STATE_DIR);
  }

  get autonomyLevel(): number {
    return this._config.HELIOS_AUTONOMY_LEVEL;
  }

  validateCritical(): void {
    if (!this._config.HELIOS_MASTER_KEY || this._config.HELIOS_MASTER_KEY.length < 16) {
      throw new Error('HELIOS_MASTER_KEY requerida (min 16 chars)');
    }
    if (!this._config.HELIOS_GATEWAY_TOKEN || this._config.HELIOS_GATEWAY_TOKEN.length < 8) {
      throw new Error('HELIOS_GATEWAY_TOKEN requerida (min 8 chars)');
    }
  }
}

export const configManager = ConfigManager.getInstance();
