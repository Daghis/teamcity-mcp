/**
 * BuildListManager - Manages build list queries with pagination and caching
 */
import { errorLogger } from '@/utils/error-logger';

import { BuildQueryBuilder, type BuildStatus } from './build-query-builder';
import { TeamCityAPIError } from './errors';
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

interface TeamCityBuildListResponse {
  build: unknown[];
  nextHref?: unknown;
  count?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

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

    const locator = this.buildLocator(params);

    try {
      // Fetch builds from API
      const response = await this.client.modules.builds.getMultipleBuilds(
        locator,
        BuildListManager.fields
      );

      const payload = this.ensureBuildListResponse(response.data, locator);

      // Parse response
      const builds = this.parseBuilds(payload.build, locator);

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
          hasMore: this.hasMoreResults(payload.nextHref),
          totalCount,
        },
      };

      // Cache result
      this.cacheResult(cacheKey, result);

      return result;
    } catch (error: unknown) {
      if (error instanceof TeamCityAPIError) {
        throw error;
      }
      // Enhance error messages
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('Invalid date format')) {
        throw error;
      }
      if (errorMessage.includes('Invalid status value')) {
        throw error;
      }
      const finalMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new TeamCityAPIError(
        `Failed to fetch builds: ${finalMessage}`,
        'BUILD_LIST_ERROR',
        undefined,
        {
          locator,
        }
      );
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
  private parseBuilds(builds: unknown[], locator: string): BuildInfo[] {
    return builds.map((build, index) => {
      if (!isRecord(build)) {
        throw new TeamCityAPIError(
          'TeamCity returned a non-object build entry',
          'INVALID_RESPONSE',
          undefined,
          { locator, index }
        );
      }

      const {
        id,
        buildTypeId,
        number,
        status,
        state,
        branchName,
        startDate,
        finishDate,
        queuedDate,
        statusText,
        webUrl,
      } = build as Record<string, unknown>;

      if (
        (typeof id !== 'number' && typeof id !== 'string') ||
        typeof buildTypeId !== 'string' ||
        typeof number !== 'string' ||
        typeof status !== 'string' ||
        typeof state !== 'string' ||
        typeof webUrl !== 'string'
      ) {
        throw new TeamCityAPIError(
          'TeamCity build entry is missing required fields',
          'INVALID_RESPONSE',
          undefined,
          { locator, index, receivedKeys: Object.keys(build) }
        );
      }

      return {
        id: typeof id === 'string' ? parseInt(id, 10) : id,
        buildTypeId,
        number,
        status,
        state,
        branchName: typeof branchName === 'string' ? branchName : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        finishDate: typeof finishDate === 'string' ? finishDate : undefined,
        queuedDate: typeof queuedDate === 'string' ? queuedDate : undefined,
        statusText: typeof statusText === 'string' ? statusText : '',
        webUrl,
      };
    });
  }

  private ensureBuildListResponse(data: unknown, locator: string): TeamCityBuildListResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object build list response',
        'INVALID_RESPONSE',
        undefined,
        { locator, receivedType: typeof data }
      );
    }

    const record = data as Record<string, unknown>;
    const build = record['build'];
    const nextHref = record['nextHref'];
    const count = record['count'];

    if (!Array.isArray(build)) {
      throw new TeamCityAPIError(
        'TeamCity build list response is missing a build array',
        'INVALID_RESPONSE',
        undefined,
        { locator, expected: 'build[]', receivedKeys: Object.keys(data) }
      );
    }

    return { build, nextHref, count } as TeamCityBuildListResponse;
  }

  /**
   * Check if there are more results available
   */
  private hasMoreResults(nextHref: unknown): boolean {
    return typeof nextHref === 'string' && nextHref.length > 0;
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

      const response = await this.client.modules.builds.getAllBuilds(
        countLocator || undefined,
        'count'
      );

      return this.extractCount(response.data, countLocator || '<none>');
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

  private extractCount(data: unknown, locator: string): number {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object count response',
        'INVALID_RESPONSE',
        undefined,
        { locator, expected: 'object with count:number', receivedType: typeof data }
      );
    }

    const { count } = data as { count?: unknown };

    if (count === undefined) {
      throw new TeamCityAPIError(
        'TeamCity count response is missing the count field',
        'INVALID_RESPONSE',
        undefined,
        { locator, expected: 'count:number' }
      );
    }

    if (typeof count === 'number') {
      return count;
    }

    if (typeof count === 'string' && count.trim() !== '' && Number.isFinite(Number(count))) {
      return Number.parseInt(count, 10);
    }

    throw new TeamCityAPIError(
      'TeamCity count response contains a non-numeric count value',
      'INVALID_RESPONSE',
      undefined,
      { locator, receivedType: typeof count }
    );
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
