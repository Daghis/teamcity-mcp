/**
 * Main module for TeamCity Swagger spec management
 */
import { getConfig } from '@/config';
import { info, error as logError, warn } from '@/utils/logger';

import { SwaggerCache } from './swagger-cache';
import { SwaggerFetcher, type SwaggerSpec } from './swagger-fetcher';
import { SwaggerValidator } from './swagger-validator';

export * from './swagger-fetcher';
export * from './swagger-validator';
export * from './swagger-cache';

export interface SwaggerManagerConfig {
  baseUrl?: string;
  token?: string;
  cacheDir?: string;
  cacheTTL?: number;
  forceRefresh?: boolean;
}

export class SwaggerManager {
  private fetcher!: SwaggerFetcher;
  private validator: SwaggerValidator;
  private cache!: SwaggerCache;
  private config: SwaggerManagerConfig;
  private initialized: Promise<void>;

  constructor(config: SwaggerManagerConfig = {}) {
    this.config = config;
    this.validator = new SwaggerValidator();

    // Initialize synchronously
    this.initialize();
    this.initialized = Promise.resolve();
  }

  private initialize(): void {
    // Get config from environment if not provided
    const envConfig = getConfig();

    this.config = {
      baseUrl: this.config.baseUrl ?? envConfig.teamcity?.url ?? '',
      token: this.config.token ?? envConfig.teamcity?.token ?? '',
      cacheDir: this.config.cacheDir ?? '.cache',
      cacheTTL: this.config.cacheTTL ?? 24 * 60 * 60 * 1000, // 24 hours
      forceRefresh: this.config.forceRefresh ?? false,
    };

    if (this.config.baseUrl === '' || this.config.token === '') {
      throw new Error('TeamCity base URL and token are required');
    }

    const baseUrl = this.config.baseUrl ?? '';
    const token = this.config.token ?? '';
    this.fetcher = new SwaggerFetcher({
      baseUrl,
      token,
    });

    this.cache = new SwaggerCache({
      cacheDir: this.config.cacheDir ?? '.cache',
      ttl: this.config.cacheTTL ?? 24 * 60 * 60 * 1000,
    });

    info('SwaggerManager initialized');
  }

  /**
   * Get TeamCity Swagger specification (with caching)
   */
  async getSpec(): Promise<SwaggerSpec> {
    await this.initialized;
    const cacheKey = this.getCacheKey();

    // Check cache first unless force refresh is requested
    if (this.config.forceRefresh !== true) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        info('Using cached Swagger specification');
        return cached;
      }
    }

    // Fetch fresh spec
    info('Fetching fresh Swagger specification from TeamCity');
    const spec = await this.fetcher.fetchSpec();

    // Validate the spec
    const validation = this.validator.validateSpec(spec);
    if (!validation.isValid) {
      throw new Error(`Invalid Swagger specification: ${validation.errors?.join(', ')}`);
    }

    if (validation.warnings && validation.warnings.length > 0) {
      warn('Swagger specification has warnings', { warnings: validation.warnings });
    }

    // Check TeamCity version compatibility
    if (validation.teamCityVersion !== undefined && validation.teamCityVersion !== '') {
      const isSupported = this.validator.isVersionSupported(validation.teamCityVersion);
      if (!isSupported) {
        warn('TeamCity version may not be fully supported', {
          version: validation.teamCityVersion,
          minSupported: '2020.1',
        });
      } else {
        info('TeamCity version is supported', {
          version: validation.teamCityVersion,
        });
      }
    }

    // Cache the validated spec
    try {
      await this.cache.set(cacheKey, spec);
    } catch (err) {
      // Caching failure is not critical
      warn('Failed to cache Swagger spec', { error: err });
    }

    return spec;
  }

  /**
   * Validate a Swagger specification
   */
  async validateSpec(spec?: SwaggerSpec): Promise<{
    isValid: boolean;
    version?: string;
    teamCityVersion?: string;
    errors?: string[];
    warnings?: string[];
  }> {
    const specToValidate = spec ?? (await this.getSpec());
    return this.validator.validateSpec(specToValidate);
  }

  /**
   * Get TeamCity server information
   */
  async getServerInfo(): Promise<{
    version: string | null;
    connected: boolean;
    specVersion?: string;
  }> {
    await this.initialized;
    const connected = await this.fetcher.testConnection();
    const version = await this.fetcher.getServerVersion();

    let specVersion: string | undefined;
    try {
      const spec = await this.getSpec();
      specVersion = spec.swagger ?? spec.openapi;
    } catch (err) {
      logError('Failed to get spec version', err instanceof Error ? err : new Error(String(err)));
    }

    const result: {
      version: string | null;
      connected: boolean;
      specVersion?: string;
    } = {
      version,
      connected,
    };

    if (specVersion !== undefined) {
      result.specVersion = specVersion;
    }

    return result;
  }

  /**
   * Clear cache
   */
  async clearCache(): Promise<void> {
    await this.cache.clear();
    info('Swagger cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    size: number;
    files: number;
    oldestFile?: Date;
    newestFile?: Date;
  }> {
    return await this.cache.getStats();
  }

  /**
   * Generate cache key based on TeamCity URL
   */
  private getCacheKey(): string {
    // Create a cache key based on the TeamCity URL
    const baseUrl = this.config.baseUrl ?? '';
    const url = new URL(baseUrl);
    return `teamcity-swagger-${url.hostname}`;
  }
}

/**
 * Singleton instance for convenience
 */
let managerInstance: SwaggerManager | null = null;

/**
 * Get or create SwaggerManager instance
 */
export function getSwaggerManager(config?: SwaggerManagerConfig): SwaggerManager {
  if (!managerInstance || config) {
    managerInstance = new SwaggerManager(config);
  }
  return managerInstance;
}
