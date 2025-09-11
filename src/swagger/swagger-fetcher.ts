/**
 * TeamCity Swagger specification fetcher
 */
import axios, { type AxiosInstance } from 'axios';

import { info, error as logError } from '@/utils/logger';

export interface SwaggerFetcherConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
}

export interface SwaggerSpec {
  swagger?: string;
  openapi?: string;
  info: {
    version: string;
    title: string;
    description?: string;
  };
  paths: Record<string, unknown>;
  [key: string]: unknown;
}

export class SwaggerFetcher {
  private client: AxiosInstance;

  constructor(config: SwaggerFetcherConfig) {
    // Remove trailing slash from base URL
    const baseUrl = config.baseUrl.replace(/\/$/, '');

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: config.timeout ?? 30000,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
    });

    info('SwaggerFetcher initialized', {
      baseUrl,
      timeout: config.timeout ?? 30000,
    });
  }

  /**
   * Fetch the Swagger/OpenAPI specification from TeamCity
   */
  async fetchSpec(): Promise<SwaggerSpec> {
    try {
      info('Fetching TeamCity Swagger specification...');

      const response = await this.client.get<SwaggerSpec>('/app/rest/swagger.json');

      if (response.status !== 200) {
        throw new Error(`Failed to fetch Swagger spec: ${response.status}`);
      }

      const spec = response.data;

      info('Successfully fetched Swagger specification', {
        version: spec.swagger ?? spec.openapi ?? 'unknown',
        title: spec.info?.title,
        pathCount: Object.keys(spec.paths ?? {}).length,
      });

      return spec;
    } catch (err) {
      logError(
        'Failed to fetch TeamCity Swagger spec',
        err instanceof Error ? err : new Error(String(err))
      );

      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          throw new Error(`Failed to fetch TeamCity Swagger spec: Request timeout`);
        }
        if (err.response?.status === 401) {
          throw new Error(`Failed to fetch TeamCity Swagger spec: Authentication failed`);
        }
        if (err.response?.status === 404) {
          throw new Error(`Failed to fetch TeamCity Swagger spec: Endpoint not found`);
        }
      }

      throw new Error(
        `Failed to fetch TeamCity Swagger spec: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Test connection to TeamCity server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/app/rest/server');
      return response.status === 200;
    } catch (err) {
      logError(
        'TeamCity connection test failed',
        err instanceof Error ? err : new Error(String(err))
      );
      return false;
    }
  }

  /**
   * Get TeamCity server version
   */
  async getServerVersion(): Promise<string | null> {
    try {
      const response = await this.client.get('/app/rest/server');
      const data = response.data as { version?: string };
      return data.version ?? null;
    } catch (err) {
      logError(
        'Failed to get TeamCity server version',
        err instanceof Error ? err : new Error(String(err))
      );
      return null;
    }
  }
}
