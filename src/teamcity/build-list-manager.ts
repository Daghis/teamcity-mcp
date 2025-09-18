/**
 * BuildListManager - Manages build list queries with pagination and caching
 */
import { errorLogger } from '@/utils/error-logger';

import { BuildQueryBuilder, type BuildStatus } from './build-query-builder';
import type { TeamCityUnifiedClient } from './types/client';

export interface BuildListParams {
  project?: string;
  buildType?: string;
  status?: BuildStatus;
  branch?: string;
  tag?: string;
  sinceDate?: string;
  untilDate?: string;
  sinceBuild?: number;
  running?: boolean;
  canceled?: boolean;
  personal?: boolean;
  failedToStart?: boolean;
  limit?: number;
  offset?: number;
  forceRefresh?: boolean;
  includeTotalCount?: boolean;
}

export interface BuildInfo {
  id: number;
  buildTypeId: string;
  number: string;
  status: string;
  state: string;
  branchName?: string;
  startDate?: string;
  finishDate?: string;
  queuedDate?: string;
  statusText: string;
  webUrl: string;
}

export interface BuildListResult {
  builds: BuildInfo[];
  metadata: {
    count: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    totalCount?: number;
  };
}

interface CacheEntry {
  result: BuildListResult;
  timestamp: number;
}

export class BuildListManager {
  private client: TeamCityUnifiedClient;
  private cache: Map<string, CacheEntry> = new Map();
  private static readonly cacheTtlMs = 30000; // 30 seconds
  private static readonly defaultLimit = 100;
  private static readonly maxLimit = 1000;
  private static readonly fields =
    'id,buildTypeId,number,status,state,branchName,startDate,finishDate,queuedDate,statusText,href,webUrl';

  constructor(client: TeamCityUnifiedClient) {
    this.client = client;
  }

  /**
   * List builds with filters and pagination
   */
  async listBuilds(params: BuildListParams): Promise<BuildListResult> {
    // Generate cache key
    const cacheKey = this.getCacheKey(params);

    // Check cache unless force refresh
    if (!params.forceRefresh) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Build locator string
      const locator = this.buildLocator(params);

      // Fetch builds from API
      const response = await this.client.modules.builds.getMultipleBuilds(
        locator,
        BuildListManager.fields
      );

      // Parse response
      const builds = this.parseBuilds(response.data);

      // Get total count if requested
      let totalCount: number | undefined;
      if (params.includeTotalCount) {
        totalCount = await this.getTotalCount(locator);
      }

      // Create result
      const result: BuildListResult = {
        builds,
        metadata: {
          count: builds.length,
          offset: params.offset ?? 0,
          limit: params.limit ?? BuildListManager.defaultLimit,
          hasMore: this.hasMoreResults(response.data),
          totalCount,
        },
      };

      // Cache result
      this.cacheResult(cacheKey, result);

      return result;
    } catch (error: unknown) {
      // Enhance error messages
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Invalid date format')) {
        throw error;
      }
      if (errorMessage.includes('Invalid status value')) {
        throw error;
      }
      const finalMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to fetch builds: ${finalMessage}`);
    }
  }

  /**
   * Build locator string from parameters
   */
  private buildLocator(params: BuildListParams): string {
    const builder = new BuildQueryBuilder();

    // Apply filters
    builder
      .withProject(params.project)
      .withBuildType(params.buildType)
      .withStatus(params.status)
      .withBranch(params.branch)
      .withTag(params.tag)
      .withSinceDate(params.sinceDate)
      .withUntilDate(params.untilDate)
      .withSinceBuild(params.sinceBuild)
      .withRunning(params.running)
      .withCanceled(params.canceled)
      .withPersonal(params.personal)
      .withFailedToStart(params.failedToStart);

    // Apply pagination
    const limit = Math.min(
      params.limit ?? BuildListManager.defaultLimit,
      BuildListManager.maxLimit
    );
    builder.withCount(limit);

    if (params.offset !== undefined && params.offset > 0) {
      builder.withStart(params.offset);
    }

    return builder.build();
  }

  /**
   * Parse builds from API response
   */
  private parseBuilds(data: unknown): BuildInfo[] {
    const dataObj = data as { build?: unknown[] } | null;
    if (dataObj?.build == null || !Array.isArray(dataObj.build)) {
      return [];
    }

    return dataObj.build.map((build: unknown) => {
      const buildObj = build as {
        id: string | number;
        buildTypeId: string;
        number: string;
        status: string;
        state: string;
        branchName?: string;
        startDate?: string;
        finishDate?: string;
        queuedDate?: string;
        statusText?: string;
        webUrl: string;
      };
      return {
        id: typeof buildObj.id === 'string' ? parseInt(buildObj.id, 10) : buildObj.id,
        buildTypeId: buildObj.buildTypeId,
        number: buildObj.number,
        status: buildObj.status,
        state: buildObj.state,
        branchName: buildObj.branchName,
        startDate: buildObj.startDate,
        finishDate: buildObj.finishDate,
        queuedDate: buildObj.queuedDate,
        statusText: buildObj.statusText ?? '',
        webUrl: buildObj.webUrl,
      };
    });
  }

  /**
   * Check if there are more results available
   */
  private hasMoreResults(data: unknown): boolean {
    const dataObj = data as { nextHref?: string } | null;
    return Boolean(dataObj?.nextHref);
  }

  /**
   * Get total count of builds matching the locator
   */
  private async getTotalCount(locator: string): Promise<number> {
    try {
      // Remove count and start from locator for total count query
      const countLocator = locator
        .split(',')
        .filter((part) => !part.startsWith('count:') && !part.startsWith('start:'))
        .join(',');

      const response = await this.client.request((ctx) =>
        ctx.axios.get<string>(`${ctx.baseUrl}/app/rest/builds/count`, {
          params: countLocator ? { locator: countLocator } : undefined,
          headers: {
            Accept: 'text/plain',
          },
          responseType: 'text',
          transformResponse: [(data) => data],
        })
      );

      return parseInt(String(response.data), 10);
    } catch (error: unknown) {
      // Total count is optional, don't fail the main request
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errorLogger.forComponent('BuildListManager').logWarning('Failed to fetch total count', {
        operation: 'fetchTotalCount',
        error: errorMessage,
      });
      return 0;
    }
  }

  /**
   * Generate cache key from parameters
   */
  private getCacheKey(params: BuildListParams): string {
    // Exclude forceRefresh and includeTotalCount from cache key
    const {
      forceRefresh: _forceRefresh,
      includeTotalCount: _includeTotalCount,
      ...cacheParams
    } = params;
    return JSON.stringify(cacheParams, Object.keys(cacheParams).sort());
  }

  /**
   * Get result from cache if valid
   */
  private getFromCache(key: string): BuildListResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > BuildListManager.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Cache a result
   */
  private cacheResult(key: string, result: BuildListResult): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    // Clean old entries
    this.cleanCache();
  }

  /**
   * Remove expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > BuildListManager.cacheTtlMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
    }
  }
}
