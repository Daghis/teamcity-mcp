/**
 * TeamCity API Client Wrapper
 * Provides authentication and configuration for the generated client
 *
 * @deprecated Prefer using the unified TeamCityAPI (src/api-client.ts) directly.
 *             Managers should depend on a small adapter interface instead of this class.
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';

import { AgentApi } from '@/teamcity-client/api/agent-api';
import { AgentPoolApi } from '@/teamcity-client/api/agent-pool-api';
import { BuildApi } from '@/teamcity-client/api/build-api';
import { BuildQueueApi } from '@/teamcity-client/api/build-queue-api';
import { BuildTypeApi } from '@/teamcity-client/api/build-type-api';
import { ChangeApi } from '@/teamcity-client/api/change-api';
import { ProjectApi } from '@/teamcity-client/api/project-api';
import { TestApi } from '@/teamcity-client/api/test-api';
import { TestOccurrenceApi } from '@/teamcity-client/api/test-occurrence-api';
import { UserApi } from '@/teamcity-client/api/user-api';
import { VcsRootApi } from '@/teamcity-client/api/vcs-root-api';
import { Configuration } from '@/teamcity-client/configuration';
import { debug, info } from '@/utils/logger';

import { addRequestId, logAndTransformError, logResponse, validateConfiguration } from './auth';
// import { CircuitBreakerManager } from './circuit-breaker';
import { TeamCityAPIError, getRetryDelay, isRetryableError } from './errors';

export interface TeamCityClientConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
  retryConfig?: {
    retries?: number;
    retryDelay?: number;
    retryCondition?: (error: unknown) => boolean;
  };
}

export class TeamCityClient {
  private config: InstanceType<typeof Configuration>;
  // private readonly circuitBreaker: CircuitBreakerManager;
  private _buildApi?: BuildApi;
  private _projectApi?: ProjectApi;
  private _buildTypeApi?: BuildTypeApi;
  private _buildQueueApi?: BuildQueueApi;
  private _vcsRootApi?: VcsRootApi;
  private _changeApi?: ChangeApi;
  private _testApi?: TestApi;
  private _testOccurrenceApi?: TestOccurrenceApi;
  private _userApi?: UserApi;
  private _agentApi?: AgentApi;
  private _agentPoolApi?: AgentPoolApi;

  constructor(config: TeamCityClientConfig) {
    // Remove trailing slash from base URL
    const basePath = config.baseUrl.replace(/\/$/, '');

    // Create axios instance with interceptors
    const axiosInstance = axios.create({
      timeout: config.timeout ?? 30000,
    });

    // Initialize circuit breaker (commented out for now)
    // this.circuitBreaker = new CircuitBreakerManager({
    //   failureThreshold: 5,
    //   resetTimeout: 60000, // 1 minute
    //   successThreshold: 2,
    // });

    // Add retry logic with custom error handling
    axiosRetry(axiosInstance, {
      retries: config.retryConfig?.retries ?? 3,
      retryDelay: (retryCount, error) => {
        const teamcityError = TeamCityAPIError.fromAxiosError(error);
        return getRetryDelay(teamcityError, retryCount, config.retryConfig?.retryDelay ?? 1000);
      },
      retryCondition: (error) => {
        const teamcityError = TeamCityAPIError.fromAxiosError(error);
        return isRetryableError(teamcityError);
      },
    });

    // Validate configuration before proceeding
    const validation = validateConfiguration(basePath, config.token);
    if (!validation.isValid) {
      throw new Error(`Invalid TeamCity configuration: ${validation.errors.join(', ')}`);
    }

    // Add request interceptor for authentication and request ID
    axiosInstance.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
      // Add Bearer token to all requests
      requestConfig.headers['Authorization'] = `Bearer ${config.token}`;
      requestConfig.headers['Accept'] = 'application/json';

      // Debug logging
      debug('TeamCity request', {
        method: requestConfig.method,
        url: requestConfig.url,
        hasAuth: Boolean(requestConfig.headers['Authorization']),
      });

      // Add request ID for tracing
      return addRequestId(requestConfig);
    });

    // Add response interceptor for logging and error transformation
    axiosInstance.interceptors.response.use(logResponse, logAndTransformError);

    // Create configuration for generated client
    this.config = new Configuration({
      basePath,
      accessToken: config.token,
      baseOptions: {
        timeout: config.timeout ?? 30000,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token}`,
        },
      },
    });

    info('TeamCity client initialized', {
      baseUrl: basePath,
      timeout: config.timeout ?? 30000,
    });
  }

  /**
   * Get Build API client
   */
  get builds(): BuildApi {
    if (!this._buildApi) {
      this._buildApi = new BuildApi(this.config);
    }
    return this._buildApi;
  }

  /**
   * Get Project API client
   */
  get projects(): ProjectApi {
    if (!this._projectApi) {
      this._projectApi = new ProjectApi(this.config);
    }
    return this._projectApi;
  }

  /**
   * Get BuildType API client
   */
  get buildTypes(): BuildTypeApi {
    if (!this._buildTypeApi) {
      this._buildTypeApi = new BuildTypeApi(this.config);
    }
    return this._buildTypeApi;
  }

  /**
   * Get BuildQueue API client
   */
  get buildQueue(): BuildQueueApi {
    if (!this._buildQueueApi) {
      this._buildQueueApi = new BuildQueueApi(this.config);
    }
    return this._buildQueueApi;
  }

  /**
   * Get VCS Root API client
   */
  get vcsRoots(): VcsRootApi {
    if (!this._vcsRootApi) {
      this._vcsRootApi = new VcsRootApi(this.config);
    }
    return this._vcsRootApi;
  }

  /**
   * Get Change API client
   */
  get changes(): ChangeApi {
    if (!this._changeApi) {
      this._changeApi = new ChangeApi(this.config);
    }
    return this._changeApi;
  }

  /**
   * Get Test API client
   */
  get tests(): TestApi {
    if (!this._testApi) {
      this._testApi = new TestApi(this.config);
    }
    return this._testApi;
  }

  /**
   * Get TestOccurrence API client
   */
  get testOccurrences(): TestOccurrenceApi {
    if (!this._testOccurrenceApi) {
      this._testOccurrenceApi = new TestOccurrenceApi(this.config);
    }
    return this._testOccurrenceApi;
  }

  /**
   * Get User API client
   */
  get users(): UserApi {
    if (!this._userApi) {
      this._userApi = new UserApi(this.config);
    }
    return this._userApi;
  }

  /**
   * Get Agent API client
   */
  get agents(): AgentApi {
    if (!this._agentApi) {
      this._agentApi = new AgentApi(this.config);
    }
    return this._agentApi;
  }

  /**
   * Get Agent Pool API client
   */
  get agentPools(): AgentPoolApi {
    if (!this._agentPoolApi) {
      this._agentPoolApi = new AgentPoolApi(this.config);
    }
    return this._agentPoolApi;
  }

  /**
   * Test connection to TeamCity server
   */
  async testConnection(): Promise<boolean> {
    try {
      // Try to get server info
      const token = typeof this.config.accessToken === 'string' ? this.config.accessToken : '';
      const response = await axios.get(`${this.config.basePath}/app/rest/server`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        timeout: 5000,
      });

      const data = response.data as { version?: string; buildNumber?: string };
      info('TeamCity connection test successful', {
        version: data.version,
        buildNumber: data.buildNumber,
      });

      return response.status === 200;
    } catch (error) {
      info('TeamCity connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}
