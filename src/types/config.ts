/**
 * Configuration type definitions
 */
import { z } from 'zod';

// Environment variable schema
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  MCP_MODE: z.enum(['dev', 'full']).default('dev'),
  TEAMCITY_URL: z.string().url().optional(),
  TEAMCITY_TOKEN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

// Server configuration
export interface ServerConfiguration {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  mode: 'dev' | 'full';
  cors: {
    enabled: boolean;
    origins: string[];
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
  timeout: {
    server: number;
    request: number;
  };
}

// TeamCity configuration
export interface TeamCityConfiguration {
  url: string;
  token: string;
  apiVersion: string;
  timeout: number;
  retryConfig: {
    maxRetries: number;
    retryDelay: number;
    retryOnStatusCodes: number[];
  };
}

// MCP configuration
export interface MCPConfiguration {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: {
    tools: boolean;
    prompts: boolean;
    resources: boolean;
  };
  tools: {
    enabled: string[];
    disabled: string[];
  };
}

// Complete application configuration
export interface ApplicationConfig {
  server: ServerConfiguration;
  teamcity?: TeamCityConfiguration;
  mcp: MCPConfiguration;
  features: {
    realtime: boolean;
    caching: boolean;
    metrics: boolean;
  };
}

// Configuration loader options
export interface ConfigLoaderOptions {
  envPath?: string;
  configPath?: string;
  overrides?: Partial<ApplicationConfig>;
}

// Tool configuration
export interface ToolConfig {
  name: string;
  enabled: boolean;
  mode: 'dev' | 'full' | 'both';
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  timeout?: number;
  retryable?: boolean;
}

// Cache configuration
export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'fifo';
}

// Metrics configuration
export interface MetricsConfig {
  enabled: boolean;
  port: number;
  path: string;
  collectInterval: number;
}

// Security configuration
export interface SecurityConfig {
  authentication: {
    enabled: boolean;
    type: 'bearer' | 'api-key' | 'none';
    header?: string;
  };
  encryption: {
    enabled: boolean;
    algorithm: string;
  };
  audit: {
    enabled: boolean;
    logLevel: 'all' | 'errors' | 'none';
  };
}

// Runtime configuration that can be modified
export interface RuntimeConfig {
  maintenance: boolean;
  readonly: boolean;
  maxConcurrentRequests: number;
  toolOverrides: Record<string, Partial<ToolConfig>>;
}
