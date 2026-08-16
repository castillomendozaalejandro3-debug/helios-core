import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { configManager } from '../config/ConfigManager.js';

interface VaultEntry {
  value: string;
  metadata: {
    createdAt: string;
    lastAccessed?: string;
    accessCount: number;
  };
}

export class SecureVault {
  private vaultPath: string;
  private masterKey: Buffer;
  private cache: Map<string, VaultEntry> = new Map();
  private dirty = false;

  constructor() {
    const stateDir = configManager.stateDir;
    this.vaultPath = resolve(stateDir, 'vault.enc');
    const masterKeyStr = configManager.config.HELIOS_MASTER_KEY;
    this.masterKey = scryptSync(masterKeyStr, 'helios-salt-v1', 32);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.vaultPath)) {
      mkdirSync(dirname(this.vaultPath), { recursive: true });
      this.dirty = true;
      return;
    }
    try {
      const encrypted = readFileSync(this.vaultPath);
      if (encrypted.length < 32) throw new Error('Vault corrupto');
      const iv = encrypted.slice(0, 16);
      const authTag = encrypted.slice(16, 32);
      const ciphertext = encrypted.slice(32);
      const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      const data = JSON.parse(decrypted);
      for (const [key, entry] of Object.entries(data)) {
        this.cache.set(key, entry as VaultEntry);
      }
    } catch (e) {
      console.warn('Vault corrupto o clave incorrecta, creando nuevo');
      this.cache.clear();
      this.dirty = true;
    }
  }

  save(): void {
    if (!this.dirty) return;
    const data: Record<string, VaultEntry> = {};
    for (const [key, entry] of this.cache) {
      data[key] = entry;
    }
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    const output = Buffer.concat([iv, authTag, encrypted]);
    mkdirSync(dirname(this.vaultPath), { recursive: true });
    writeFileSync(this.vaultPath, output);
    this.dirty = false;
  }

  set(key: string, value: string): void {
    const entry: VaultEntry = {
      value,
      metadata: {
        createdAt: new Date().toISOString(),
        accessCount: 0,
      },
    };
    this.cache.set(key, entry);
    this.dirty = true;
  }

  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (entry) {
      entry.metadata.accessCount++;
      entry.metadata.lastAccessed = new Date().toISOString();
    }
    return entry?.value;
  }

  delete(key: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) this.dirty = true;
    return existed;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  getStats(): { totalEntries: number; totalAccesses: number } {
    let totalAccesses = 0;
    for (const entry of this.cache.values()) {
      totalAccesses += entry.metadata.accessCount;
    }
    return {
      totalEntries: this.cache.size,
      totalAccesses,
    };
  }
}

export const secureVault = new SecureVault();
