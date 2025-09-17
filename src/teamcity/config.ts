/**
 * Configuration module for TeamCity client
 */
import type { TeamCityAPIClientConfig } from '@/api-client';
import { getConfig, getTeamCityOptions } from '@/config';

import type { TeamCityClientConfig } from './client';

export interface TeamCityConnectionConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
  maxConcurrentRequests?: number;
  keepAlive?: boolean;
  compression?: boolean;
}

export interface TeamCityRetryConfig {
  enabled?: boolean;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableStatuses?: number[];
}

export interface TeamCityPaginationConfig {
  defaultPageSize?: number;
  maxPageSize?: number;
  autoFetchAll?: boolean;
}

export interface TeamCityFullConfig {
  connection: TeamCityConnectionConfig;
  retry?: TeamCityRetryConfig;
  pagination?: TeamCityPaginationConfig;
  circuitBreaker?: {
    enabled?: boolean;
    failureThreshold?: number;
    resetTimeout?: number;
    successThreshold?: number;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: TeamCityFullConfig = {
  connection: {
    baseUrl: '',
    token: '',
    timeout: 30000,
    maxConcurrentRequests: 10,
    keepAlive: true,
    compression: true,
  },
  retry: {
    enabled: true,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  },
  pagination: {
    defaultPageSize: 100,
    maxPageSize: 1000,
    autoFetchAll: false,
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 60000,
    successThreshold: 2,
  },
};

/**
 * Load configuration from environment variables
 */
export function loadTeamCityConfig(): TeamCityFullConfig {
  const appConfig = getConfig();

  const { connection: conn, retry, pagination, circuitBreaker: circuit } = getTeamCityOptions();

  return {
    connection: {
      baseUrl: appConfig.teamcity?.url ?? '',
      token: appConfig.teamcity?.token ?? '',
      timeout: conn.timeout,
      maxConcurrentRequests: conn.maxConcurrentRequests,
      keepAlive: conn.keepAlive,
      compression: conn.compression,
    },
    retry: {
      enabled: retry.enabled,
      maxRetries: retry.maxRetries,
      baseDelay: retry.baseDelay,
      maxDelay: retry.maxDelay,
      retryableStatuses: DEFAULT_CONFIG.retry?.retryableStatuses,
    },
    pagination: {
      defaultPageSize: pagination.defaultPageSize,
      maxPageSize: pagination.maxPageSize,
      autoFetchAll: pagination.autoFetchAll,
    },
    circuitBreaker: {
      enabled: circuit.enabled,
      failureThreshold: circuit.failureThreshold,
      resetTimeout: circuit.resetTimeout,
      successThreshold: circuit.successThreshold,
    },
  };
}

/**
 * Merge configurations with defaults
 */
export function mergeConfig(...configs: Array<Partial<TeamCityFullConfig>>): TeamCityFullConfig {
  const result = { ...DEFAULT_CONFIG };

  for (const config of configs) {
    if (config.connection) {
      result.connection = { ...result.connection, ...config.connection };
    }
    if (config.retry) {
      result.retry = { ...result.retry, ...config.retry };
    }
    if (config.pagination) {
      result.pagination = { ...result.pagination, ...config.pagination };
    }
    if (config.circuitBreaker) {
      result.circuitBreaker = { ...result.circuitBreaker, ...config.circuitBreaker };
    }
  }

  return result;
}

/**
 * Convert full config to client config
 */
export function toApiClientConfig(config: TeamCityFullConfig): TeamCityAPIClientConfig {
  return {
    baseUrl: config.connection.baseUrl,
    token: config.connection.token,
    timeout: config.connection.timeout,
  };
}

/**
 * @deprecated Use toApiClientConfig instead.
 */
export function toClientConfig(config: TeamCityFullConfig): TeamCityClientConfig {
  return {
    baseUrl: config.connection.baseUrl,
    token: config.connection.token,
    timeout: config.connection.timeout,
    retryConfig:
      config.retry?.enabled === true
        ? {
            retries: config.retry.maxRetries,
            retryDelay: config.retry.baseDelay,
          }
        : undefined,
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: TeamCityFullConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.connection.baseUrl) {
    errors.push('TeamCity base URL is required');
  }

  if (!config.connection.token) {
    errors.push('TeamCity authentication token is required');
  }

  if (config.connection.timeout !== undefined && config.connection.timeout < 1000) {
    errors.push('Timeout must be at least 1000ms');
  }

  if (config.retry?.maxRetries !== undefined && config.retry.maxRetries < 0) {
    errors.push('Max retries must be non-negative');
  }

  if (config.pagination?.defaultPageSize !== undefined && config.pagination.defaultPageSize < 1) {
    errors.push('Page size must be at least 1');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
