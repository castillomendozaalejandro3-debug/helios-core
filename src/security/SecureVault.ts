import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface Credential {
  id: string; // ej: 'stripe_api_key', 'google_login'
  type: 'API_KEY' | 'LOGIN' | 'PAYMENT' | 'TOKEN';
  data: Record<string, string>; // ej: { username: '...', password: '...' } o { key: '...' }
}

export class SecureVault {
  private vaultPath: string;
  private encryptionKey: Buffer;
  private algorithm: string = 'aes-256-gcm';

  constructor() {
    this.vaultPath = path.resolve(__dirname, '../../.helios_vault.enc');
    this.encryptionKey = this.getOrGenerateMasterKey();
  }

  // Propósito: Obtener la clave maestra de las variables de entorno o generar una nueva si es el primer arranque.
  private getOrGenerateMasterKey(): Buffer {
    // 1. Leer process.env.HELIOS_MASTER_KEY
    const envKey = process.env.HELIOS_MASTER_KEY;
    
    // 2. Si existe, convertirla a Buffer (asegurando que sea de 32 bytes).
    if (envKey) {
      const keyBuffer = Buffer.from(envKey, 'hex');
      if (keyBuffer.length === 32) {
        return keyBuffer;
      } else {
        throw new Error('HELIOS_MASTER_KEY debe ser una cadena hexadecimal de 64 caracteres (32 bytes)');
      }
    }
    
    // 3. Si no existe, generar una con crypto.randomBytes(32), guardarla en un archivo .env.local seguro e instruirla al usuario.
    const newKey = crypto.randomBytes(32);
    const keyHex = newKey.toString('hex');
    
    // Crear archivo .env.local con la clave
    const envLocalPath = path.resolve(__dirname, '../../.env.local');
    if (!fs.existsSync(envLocalPath)) {
      fs.writeFileSync(envLocalPath, `HELIOS_MASTER_KEY=${keyHex}\n`, 'utf-8');
    }
    
    return newKey;
  }

  // Propósito: Guardar una credencial encriptada en el disco.
  public storeCredential(credential: Credential): void {
    // 1. Leer el vault existente (si hay) y desencriptarlo.
    let vaultData: Credential[] = [];
    if (fs.existsSync(this.vaultPath)) {
      const encryptedData = fs.readFileSync(this.vaultPath);
      const decryptedData = this.decrypt(encryptedData);
      vaultData = JSON.parse(decryptedData.toString('utf-8'));
    }
    
    // 2. Añadir o actualizar la nueva credencial.
    const existingIndex = vaultData.findIndex(c => c.id === credential.id);
    if (existingIndex !== -1) {
      vaultData[existingIndex] = credential;
    } else {
      vaultData.push(credential);
    }
    
    // 3. Encriptar todo el objeto con AES-256-GCM usando this.encryptionKey.
    const vaultJson = JSON.stringify(vaultData);
    const encryptedVault = this.encrypt(Buffer.from(vaultJson, 'utf-8'));
    
    // 4. Guardar el buffer encriptado en this.vaultPath.
    fs.writeFileSync(this.vaultPath, encryptedVault);
  }

  // Propósito: Recuperar y desencriptar una credencial específica para su uso en memoria.
  public getCredential(id: string): Credential | null {
    // 1. Leer y desencriptar el archivo del vault.
    if (!fs.existsSync(this.vaultPath)) {
      return null;
    }
    
    const encryptedData = fs.readFileSync(this.vaultPath);
    const decryptedData = this.decrypt(encryptedData);
    const vaultData: Credential[] = JSON.parse(decryptedData.toString('utf-8'));
    
    // 2. Buscar la credencial por su ID.
    const credential = vaultData.find(c => c.id === id);
    
    // 3. Retornar el objeto desencriptado.
    return credential || null;
  }

  // Propósito: Borrar una credencial del vault.
  public deleteCredential(id: string): void {
    // 1. Desencriptar, filtrar el ID, encriptar y guardar.
    if (!fs.existsSync(this.vaultPath)) {
      return;
    }
    
    const encryptedData = fs.readFileSync(this.vaultPath);
    const decryptedData = this.decrypt(encryptedData);
    const vaultData: Credential[] = JSON.parse(decryptedData.toString('utf-8'));
    
    const filteredVault = vaultData.filter(c => c.id !== id);
    const vaultJson = JSON.stringify(filteredVault);
    const encryptedVault = this.encrypt(Buffer.from(vaultJson, 'utf-8'));
    
    fs.writeFileSync(this.vaultPath, encryptedVault);
  }

  // Métodos auxiliares de encriptación/desencriptación
  private encrypt(data: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv, { authTagLength: 16 });
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decrypt(encryptedData: Buffer): Buffer {
    const iv = encryptedData.slice(0, 12);
    const authTag = encryptedData.slice(12, 28);
    const data = encryptedData.slice(28);
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv, { authTagLength: 16 });
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}