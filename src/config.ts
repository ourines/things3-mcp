// ABOUTME: Configuration management system with environment variable support
// ABOUTME: Centralizes all configuration settings with validation and defaults

import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenvConfig();

interface TimeoutConfig {
  applescript: number;
  operation: number;
}

interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  file?: string | undefined;
}

export interface Config {
  // Server settings
  server: {
    name: string;
    version: string;
  };

  // Timeout settings
  timeouts: TimeoutConfig;

  // Delay settings (milliseconds)
  delays: {
    urlScheme: number;      // Delay after URL scheme execution (default: 2000)
    todoSearch: number;     // Delay before searching for created TODO (default: 500)
  };

  // Logging settings
  log: LogConfig;

  // Feature flags
  features: {
    errorCorrection: boolean;
    autoLaunchThings3: boolean;
    validateTags: boolean;
  };
}

/**
 * Parse boolean environment variable
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Parse integer environment variable
 */
function parseInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse log level
 */
function parseLogLevel(value: string | undefined): Config['log']['level'] {
  const validLevels = ['debug', 'info', 'warn', 'error'];
  const level = value?.toLowerCase();
  return validLevels.includes(level || '') ? level as Config['log']['level'] : 'info';
}

/**
 * Get package version
 */
function getVersion(): string {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return packageData.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const env = process.env;
  return {
    server: {
      name: env['MCP_SERVER_NAME'] || 'things3-mcp-server',
      version: getVersion()
    },

    timeouts: {
      applescript: parseInt(env['TIMEOUT_APPLESCRIPT'], 30000), // 30 seconds
      operation: parseInt(env['TIMEOUT_OPERATION'], 60000) // 60 seconds
    },

    delays: {
      urlScheme: parseInt(env['DELAY_URL_SCHEME'], 2000),
      todoSearch: parseInt(env['DELAY_TODO_SEARCH'], 500),
    },

    log: {
      level: parseLogLevel(env['LOG_LEVEL']),
      format: env['LOG_FORMAT'] === 'json' ? 'json' : 'text',
      file: env['LOG_FILE']
    },

    features: {
      errorCorrection: parseBoolean(env['FEATURE_ERROR_CORRECTION'], true),
      autoLaunchThings3: parseBoolean(env['FEATURE_AUTO_LAUNCH'], true),
      validateTags: parseBoolean(env['FEATURE_VALIDATE_TAGS'], true)
    }
  };
}

/**
 * Validate configuration
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function validateConfig(_config: Config): void {
  // Timeouts and feature flags have sensible defaults, no validation needed
}

/**
 * Get singleton configuration instance
 */
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
    validateConfig(configInstance);
  }
  return configInstance;
}

/**
 * Reset configuration (mainly for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Update configuration at runtime
 */
export function updateConfig(updates: Partial<Config>): void {
  if (!configInstance) {
    configInstance = loadConfig();
  }

  // Deep merge updates
  configInstance = deepMerge(configInstance, updates) as Config;
  validateConfig(configInstance!);
}

/**
 * Deep merge objects
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// Export default configuration
export default getConfig();
