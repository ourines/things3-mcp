// ABOUTME: Structured logging system with multiple log levels and formats
// ABOUTME: Supports JSON and text output with file logging capabilities

import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../config.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export class Logger {
  private static instance: Logger;
  private static sharedFileStream: fs.WriteStream | undefined;
  private static fileStreamInitialized = false;
  private config = getConfig().log;
  private context?: string;

  private readonly levelMap: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR
  };

  private constructor(context?: string) {
    if (context) {
      this.context = context;
    }

    // Set up shared file logging once
    if (!Logger.fileStreamInitialized && this.config.file) {
      Logger.fileStreamInitialized = true;
      const logDir = path.dirname(this.config.file);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      Logger.sharedFileStream = fs.createWriteStream(this.config.file, {
        flags: 'a',
        encoding: 'utf8'
      });
    }
  }

  /**
   * Get the root logger singleton (no context)
   */
  static getInstance(): Logger;
  /**
   * Create a child logger with the given context.
   * Shares the file stream with the root logger.
   */
  static getInstance(context: string): Logger;
  static getInstance(context?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }

    if (context) {
      return new Logger(context);
    }

    return Logger.instance;
  }

  /**
   * Create a child logger with context
   */
  child(context: string): Logger {
    return new Logger(context);
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | string, data?: Record<string, unknown>): void {
    let errorData: { message: string; stack?: string; code?: string } | undefined;
    if (error instanceof Error) {
      errorData = { message: error.message };
      if (error.stack) errorData.stack = error.stack;
      const code = (error as Error & { code?: string }).code;
      if (code) errorData.code = code;
    } else if (error) {
      errorData = { message: String(error) };
    }
    
    this.log(LogLevel.ERROR, message, data, errorData);
  }

  /**
   * Check if a log level is enabled
   */
  isLevelEnabled(level: LogLevel): boolean {
    const configLevel = this.levelMap[this.config.level];
    return configLevel !== undefined && level >= configLevel;
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: { message: string; stack?: string; code?: string }): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message
    };
    
    // Add optional fields only if they exist
    if (this.context) entry.context = this.context;
    if (data !== undefined) entry.data = data;
    if (error !== undefined) entry.error = error;
    
    // Remove undefined fields
    Object.keys(entry).forEach(key => {
      if (entry[key as keyof LogEntry] === undefined) {
        delete entry[key as keyof LogEntry];
      }
    });
    
    // Format and output
    const formatted = this.format(entry);
    this.output(formatted);
  }

  /**
   * Format log entry
   */
  private format(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }
    
    // Text format
    const parts = [
      entry.timestamp,
      `[${entry.level}]`
    ];
    
    if (entry.context) {
      parts.push(`[${entry.context}]`);
    }
    
    parts.push(entry.message);
    
    if (entry.data) {
      parts.push(JSON.stringify(entry.data));
    }
    
    if (entry.error) {
      parts.push(`Error: ${entry.error.message}`);
      if (entry.error.stack) {
        parts.push(`\n${entry.error.stack}`);
      }
    }
    
    return parts.join(' ');
  }

  /**
   * Output formatted log
   */
  private output(formatted: string): void {
    // Skip console output during integration tests to keep output clean
    // Unit tests still need console output for assertions
    if (process.env['NODE_ENV'] !== 'integration-test') {
      // Console output - write to stderr for MCP compatibility
      console.error(formatted);
    }
    
    // File output
    if (Logger.sharedFileStream) {
      Logger.sharedFileStream.write(formatted + '\n');
    }
  }

  /**
   * Flush any pending writes
   */
  async flush(): Promise<void> {
    if (Logger.sharedFileStream) {
      return new Promise((resolve) => {
        Logger.sharedFileStream!.end(() => resolve());
        Logger.sharedFileStream = undefined;
        Logger.fileStreamInitialized = false;
      });
    }
  }
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string): Logger {
  return Logger.getInstance(context);
}

/**
 * Log request/response for MCP operations
 */
export class RequestLogger {
  private logger: Logger;
  
  constructor(context: string = 'MCP') {
    this.logger = createLogger(context);
  }
  
  /**
   * Log incoming request
   */
  logRequest(method: string, params: Record<string, unknown>): void {
    this.logger.info(`Request: ${method}`, { params });
  }
  
  /**
   * Log successful response
   */
  logResponse(method: string, result: unknown, duration: number): void {
    this.logger.info(`Response: ${method}`, { 
      duration: `${duration}ms`,
      result: this.truncateResult(result)
    });
  }
  
  /**
   * Log error response
   */
  logError(method: string, error: Error, duration: number): void {
    this.logger.error(`Error: ${method}`, error, { 
      duration: `${duration}ms` 
    });
  }
  
  /**
   * Truncate large results for logging
   */
  private truncateResult(result: unknown): unknown {
    if (Array.isArray(result) && result.length > 10) {
      return {
        _truncated: true,
        length: result.length,
        sample: result.slice(0, 10)
      };
    }
    
    if (typeof result === 'string' && result.length > 1000) {
      return result.substring(0, 1000) + '... (truncated)';
    }
    
    return result;
  }
}

// Export singleton instances
export const logger = Logger.getInstance();
export const requestLogger = new RequestLogger();
