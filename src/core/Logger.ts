/**
 * Logger.ts - Sistema de logging estructurado para Helios Core v2.2.0
 * Niveles: DEBUG < INFO < WARN < ERROR < FATAL
 * Features: timestamp ISO, modulo, requestId, correlacion, pretty/json output
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

type LogOutput = 'pretty' | 'json';

export class Logger {
  private static instance: Logger;
  private currentLevel: LogLevel;
  private output: LogOutput;
  private moduleName: string;
  private requestId?: string;

  private constructor(moduleName: string = 'helios', options: { level?: LogLevel; output?: LogOutput; requestId?: string } = {}) {
    this.moduleName = moduleName;
    this.currentLevel = options.level ?? this.resolveLevelFromEnv();
    this.output = options.output ?? (process.env.HELIOS_LOG_FORMAT === 'json' ? 'json' : 'pretty');
    this.requestId = options.requestId;
  }

  static getInstance(moduleName?: string, options?: { level?: LogLevel; output?: LogOutput; requestId?: string }): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(moduleName || 'helios', options);
    }
    return Logger.instance;
  }

  private resolveLevelFromEnv(): LogLevel {
    const env = process.env.HELIOS_LOG_LEVEL?.toUpperCase();
    switch (env) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'FATAL': return LogLevel.FATAL;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLevel;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatPretty(entry: LogEntry): string {
    const colors: Record<string, string> = {
      DEBUG: '\x1b[36m',
      INFO: '\x1b[32m',
      WARN: '\x1b[33m',
      ERROR: '\x1b[31m',
      FATAL: '\x1b[35m',
      RESET: '\x1b[0m',
    };
    const c = colors[entry.level] || '';
    const reset = colors.RESET;
    const reqId = entry.requestId ? ` [${entry.requestId}]` : '';
    const meta = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    return `${c}[${entry.timestamp}] [${entry.level}] [${entry.module}]${reqId} ${entry.message}${meta}${reset}`;
  }

  private formatJson(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  private write(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level: LogLevel[level],
      module: this.moduleName,
      message,
      requestId: this.requestId,
      metadata,
    };

    const formatted = this.output === 'json' ? this.formatJson(entry) : this.formatPretty(entry);

    if (level >= LogLevel.ERROR) {
      process.stderr.write(formatted + '\n');
    } else {
      process.stdout.write(formatted + '\n');
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.write(LogLevel.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.write(LogLevel.INFO, message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.write(LogLevel.WARN, message, metadata);
  }

  error(message: string, metadata?: Record<string, any>): void {
    this.write(LogLevel.ERROR, message, metadata);
  }

  fatal(message: string, metadata?: Record<string, any>): void {
    this.write(LogLevel.FATAL, message, metadata);
  }

  child(moduleName: string, requestId?: string): Logger {
    return new Logger(moduleName, {
      level: this.currentLevel,
      output: this.output,
      requestId: requestId || this.requestId,
    });
  }

  withRequestId(requestId: string): Logger {
    return this.child(this.moduleName, requestId);
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  static create(moduleName: string): Logger {
    return Logger.getInstance().child(moduleName);
  }
}

export const logger = Logger.getInstance('helios');
