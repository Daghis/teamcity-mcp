/**
 * Configuration management for TeamCity MCP Server
 */
import dotenv from 'dotenv';
import { z } from 'zod';

import type { ApplicationConfig } from '@/types/config';

// Load environment variables
dotenv.config();

// Environment variable schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MCP_MODE: z.enum(['dev', 'full']).default('dev'),
  // Accept primary and alias names for TeamCity credentials
  TEAMCITY_URL: z.string().url().optional(),
  TEAMCITY_SERVER_URL: z.string().url().optional(),
  TEAMCITY_TOKEN: z.string().optional(),
  TEAMCITY_API_TOKEN: z.string().optional(),
  // TeamCity connection and behavior knobs
  TEAMCITY_TIMEOUT: z.string().optional(),
  TEAMCITY_MAX_CONCURRENT: z.string().optional(),
  TEAMCITY_KEEP_ALIVE: z.string().optional(),
  TEAMCITY_COMPRESSION: z.string().optional(),
  // Retry
  TEAMCITY_RETRY_ENABLED: z.string().optional(),
  TEAMCITY_MAX_RETRIES: z.string().optional(),
  TEAMCITY_RETRY_DELAY: z.string().optional(),
  TEAMCITY_MAX_RETRY_DELAY: z.string().optional(),
  // Pagination
  TEAMCITY_PAGE_SIZE: z.string().optional(),
  TEAMCITY_MAX_PAGE_SIZE: z.string().optional(),
  TEAMCITY_AUTO_FETCH_ALL: z.string().optional(),
  // Circuit breaker
  TEAMCITY_CIRCUIT_BREAKER: z.string().optional(),
  TEAMCITY_CB_FAILURE_THRESHOLD: z.string().optional(),
  TEAMCITY_CB_RESET_TIMEOUT: z.string().optional(),
  TEAMCITY_CB_SUCCESS_THRESHOLD: z.string().optional(),
});

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): ApplicationConfig {
  // Parse and validate environment variables
  const env = envSchema.parse(process.env);

  // Build configuration object
  const config: ApplicationConfig = {
    server: {
      port: env.PORT,
      host: '0.0.0.0',
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      mode: env.MCP_MODE,
      cors: {
        enabled: true,
        origins: ['*'], // In production, specify allowed origins
      },
      rateLimit: {
        enabled: env.NODE_ENV === 'production',
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100,
      },
      timeout: {
        server: 30000,
        request: 10000,
      },
    },
    mcp: {
      name: 'teamcity-mcp',
      version: '1.0.0',
      protocolVersion: '1.0.0',
      capabilities: {
        tools: true,
        prompts: false,
        resources: false,
      },
      tools: {
        enabled: [],
        disabled: [],
      },
    },
    features: {
      realtime: false, // WebSocket/SSE support
      caching: env.NODE_ENV === 'production',
      metrics: false,
    },
  };

  // Resolve TeamCity credentials from primary or alias vars
  const tcUrl = env.TEAMCITY_URL ?? env.TEAMCITY_SERVER_URL;
  const tcToken = env.TEAMCITY_TOKEN ?? env.TEAMCITY_API_TOKEN;
  // Add TeamCity configuration if credentials are provided
  if (tcUrl !== undefined && tcToken !== undefined) {
    config.teamcity = {
      url: tcUrl,
      token: tcToken,
      apiVersion: 'latest',
      timeout: 30000,
      retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
        retryOnStatusCodes: [429, 500, 502, 503, 504],
      },
    };
  }

  return config;
}

/**
 * Get the current configuration
 * Caches the configuration after first load
 */
let cachedConfig: ApplicationConfig | null = null;

export function getConfig(): ApplicationConfig {
  cachedConfig ??= loadConfig();
  return cachedConfig;
}

/**
 * Reset configuration cache (useful for testing)
 */
export function resetConfigCache(): void {
  cachedConfig = null;
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

/**
 * Get MCP mode (dev or full)
 */
export function getMCPMode(): 'dev' | 'full' {
  // Always respect explicit MCP_MODE; default to 'dev'.
  // Unit tests that need full mode should mock getMCPMode or set MCP_MODE explicitly.
  return (process.env['MCP_MODE'] as 'dev' | 'full') ?? 'dev';
}

/**
 * Helper to parse boolean-like env flags: treat 'false' exactly as false, 'true' as true; undefined → defaultValue
 */
function parseBoolFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') return true;
  return defaultValue;
}

/**
 * Expose normalized TeamCity-related runtime options (centralized validation)
 */
export function getTeamCityConnectionOptions(): {
  timeout: number;
  maxConcurrentRequests: number;
  keepAlive: boolean;
  compression: boolean;
} {
  const env = envSchema.parse(process.env);
  return {
    timeout: Number.parseInt(env.TEAMCITY_TIMEOUT ?? '30000', 10),
    maxConcurrentRequests: Number.parseInt(env.TEAMCITY_MAX_CONCURRENT ?? '10', 10),
    keepAlive: parseBoolFlag(env.TEAMCITY_KEEP_ALIVE, true),
    compression: parseBoolFlag(env.TEAMCITY_COMPRESSION, true),
  };
}

export function getTeamCityRetryOptions(): {
  enabled: boolean;
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
} {
  const env = envSchema.parse(process.env);
  return {
    enabled: parseBoolFlag(env.TEAMCITY_RETRY_ENABLED, true),
    maxRetries: Number.parseInt(env.TEAMCITY_MAX_RETRIES ?? '3', 10),
    baseDelay: Number.parseInt(env.TEAMCITY_RETRY_DELAY ?? '1000', 10),
    maxDelay: Number.parseInt(env.TEAMCITY_MAX_RETRY_DELAY ?? '30000', 10),
  };
}

export function getTeamCityPaginationOptions(): {
  defaultPageSize: number;
  maxPageSize: number;
  autoFetchAll: boolean;
} {
  const env = envSchema.parse(process.env);
  return {
    defaultPageSize: Number.parseInt(env.TEAMCITY_PAGE_SIZE ?? '100', 10),
    maxPageSize: Number.parseInt(env.TEAMCITY_MAX_PAGE_SIZE ?? '1000', 10),
    autoFetchAll: parseBoolFlag(env.TEAMCITY_AUTO_FETCH_ALL, false),
  };
}

export function getTeamCityCircuitBreakerOptions(): {
  enabled: boolean;
  failureThreshold: number;
  resetTimeout: number;
  successThreshold: number;
} {
  const env = envSchema.parse(process.env);
  return {
    enabled: parseBoolFlag(env.TEAMCITY_CIRCUIT_BREAKER, true),
    failureThreshold: Number.parseInt(env.TEAMCITY_CB_FAILURE_THRESHOLD ?? '5', 10),
    resetTimeout: Number.parseInt(env.TEAMCITY_CB_RESET_TIMEOUT ?? '60000', 10),
    successThreshold: Number.parseInt(env.TEAMCITY_CB_SUCCESS_THRESHOLD ?? '2', 10),
  };
}

/**
 * Convenience: fetch all TeamCity option groups at once
 */
export function getTeamCityOptions(): {
  connection: ReturnType<typeof getTeamCityConnectionOptions>;
  retry: ReturnType<typeof getTeamCityRetryOptions>;
  pagination: ReturnType<typeof getTeamCityPaginationOptions>;
  circuitBreaker: ReturnType<typeof getTeamCityCircuitBreakerOptions>;
} {
  return {
    connection: getTeamCityConnectionOptions(),
    retry: getTeamCityRetryOptions(),
    pagination: getTeamCityPaginationOptions(),
    circuitBreaker: getTeamCityCircuitBreakerOptions(),
  };
}

/**
 * Get TeamCity URL from configuration
 */
export function getTeamCityUrl(): string {
  const config = getConfig();
  if (!config.teamcity?.url || config.teamcity.url.length === 0) {
    // In test mode, provide a stable dummy URL so unit tests can mock HTTP calls
    if (isTest()) {
      return 'https://teamcity.example.com';
    }
    throw new Error('TeamCity URL not configured. Please set TEAMCITY_URL environment variable.');
  }
  return config.teamcity.url;
}

/**
 * Get TeamCity token from configuration
 */
export function getTeamCityToken(): string {
  const config = getConfig();
  if (!config.teamcity?.token || config.teamcity.token.length === 0) {
    // In test mode, provide a stable dummy token so unit tests can mock HTTP calls
    if (isTest()) {
      return 'test-token';
    }
    throw new Error(
      'TeamCity token not configured. Please set TEAMCITY_TOKEN environment variable.'
    );
  }
  return config.teamcity.token;
}

// Export type alias for backward compatibility
export type Config = ApplicationConfig;
