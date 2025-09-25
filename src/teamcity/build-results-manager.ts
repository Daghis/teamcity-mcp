/**
 * BuildResultsManager - Manages comprehensive build results retrieval
 */
import type { AxiosError, AxiosResponse } from 'axios';

import { warn } from '@/utils/logger';

import { TeamCityAPIError, TeamCityNotFoundError } from './errors';
import type { TeamCityUnifiedClient } from './types/client';
import { toBuildLocator } from './utils/build-locator';

type ArtifactEncoding = 'base64' | 'stream';

interface ArtifactDownloadHandle {
  tool: 'download_build_artifact';
  args: {
    buildId: string;
    artifactPath: string;
    encoding?: 'stream';
    maxSize?: number;
  };
}

export interface BuildResultsOptions {
  includeArtifacts?: boolean;
  includeStatistics?: boolean;
  includeChanges?: boolean;
  includeDependencies?: boolean;
  artifactFilter?: string;
  downloadArtifacts?: string[];
  maxArtifactSize?: number;
  artifactEncoding?: ArtifactEncoding;
}

export interface BuildResult {
  build: {
    id: number;
    number: string;
    status: string;
    state: string;
    buildTypeId: string;
    projectId?: string;
    branchName?: string;
    startDate?: string;
    finishDate?: string;
    duration?: number;
    queuedDate?: string;
    triggered?: {
      type: string;
      user?: string;
      date: string;
    };
    statusText: string;
    webUrl: string;
  };
  artifacts?: Array<{
    name: string;
    path: string;
    size: number;
    modificationTime: string;
    downloadUrl: string;
    content?: string;
    downloadHandle?: ArtifactDownloadHandle;
  }>;
  statistics?: {
    buildDuration?: number;
    testCount?: number;
    passedTests?: number;
    failedTests?: number;
    ignoredTests?: number;
    codeCoverage?: number;
    [key: string]: unknown;
  };
  changes?: Array<{
    revision: string;
    author: string;
    date: string;
    comment: string;
    files: Array<{
      path: string;
      changeType: string;
    }>;
  }>;
  dependencies?: Array<{
    buildId: number;
    buildNumber: string;
    buildTypeId: string;
    status: string;
  }>;
}

interface CacheEntry {
  result: BuildResult;
  timestamp: number;
}

interface TeamCityArtifact {
  name: string;
  fullName?: string;
  size?: number;
  modificationTime?: string;
  href?: string;
  content?: { href?: string };
  children?: { file?: TeamCityArtifact[] };
}

interface TeamCityChange {
  version: string;
  username: string;
  date: string;
  comment?: string;
  files?: {
    file?: Array<{
      name: string;
      changeType?: string;
    }>;
  };
}

interface BuildSummaryResponse {
  id: number | string;
  number: string;
  status: string;
  state: string;
  buildTypeId: string;
  statusText?: string;
  webUrl: string;
  projectId?: string;
  branchName?: string;
  startDate?: string;
  finishDate?: string;
  queuedDate?: string;
  triggered?: {
    type: string;
    date: string;
    user?: { username?: string; name?: string };
  };
}

interface ArtifactListResponse {
  file?: TeamCityArtifact[];
}

interface StatisticsResponse {
  property?: Array<{ name: string; value: string }>;
}

interface ChangesResponse {
  change?: TeamCityChange[];
}

interface DependenciesResponse {
  build?: Array<{
    id?: unknown;
    number?: unknown;
    buildTypeId?: unknown;
    status?: unknown;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export class BuildResultsManager {
  private client: TeamCityUnifiedClient;
  private cache: Map<string, CacheEntry> = new Map();
  private static readonly cacheTtlMs = 10 * 60 * 1000; // 10 minutes
  private static readonly defaultMaxArtifactSize = 1024 * 1024; // 1MB
  private static readonly fields =
    'id,number,status,state,buildTypeId,projectId,branchName,startDate,finishDate,queuedDate,statusText,href,webUrl,triggered';

  constructor(client: TeamCityUnifiedClient) {
    this.client = client;
  }

  /**
   * Get comprehensive build results
   */
  async getBuildResults(buildId: string, options: BuildResultsOptions = {}): Promise<BuildResult> {
    // Check cache for completed builds
    const cacheKey = this.getCacheKey(buildId, options);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Fetch build summary
      const buildData = await this.fetchBuildSummary(buildId);

      // Start parallel fetches for additional data
      const promises: Promise<unknown>[] = [];

      if (options.includeArtifacts) {
        promises.push(this.fetchArtifacts(buildId, options));
      }

      if (options.includeStatistics) {
        promises.push(this.fetchStatistics(buildId));
      }

      if (options.includeChanges) {
        promises.push(this.fetchChanges(buildId));
      }

      if (options.includeDependencies) {
        promises.push(this.fetchDependencies(buildId));
      }

      // Wait for all parallel fetches
      const results = await Promise.allSettled(promises);

      // Build the result object
      const result: BuildResult = {
        build: this.transformBuildData(buildData),
      };

      // Process parallel fetch results
      let resultIndex = 0;

      if (options.includeArtifacts) {
        const artifactResult = results[resultIndex++];
        if (artifactResult) {
          result.artifacts =
            artifactResult.status === 'fulfilled'
              ? (artifactResult.value as BuildResult['artifacts'])
              : [];
        }
      }

      if (options.includeStatistics) {
        const statsResult = results[resultIndex++];
        if (statsResult) {
          result.statistics =
            statsResult.status === 'fulfilled'
              ? (statsResult.value as BuildResult['statistics'])
              : {};
        }
      }

      if (options.includeChanges) {
        const changesResult = results[resultIndex++];
        if (changesResult) {
          result.changes =
            changesResult.status === 'fulfilled'
              ? (changesResult.value as BuildResult['changes'])
              : [];
        }
      }

      if (options.includeDependencies) {
        const depsResult = results[resultIndex++];
        if (depsResult) {
          result.dependencies =
            depsResult.status === 'fulfilled'
              ? (depsResult.value as BuildResult['dependencies'])
              : [];
        }
      }

      // Cache if build is completed
      if ((buildData as { state?: string }).state === 'finished') {
        this.cacheResult(cacheKey, result);
      }

      return result;
    } catch (error: unknown) {
      if (error instanceof TeamCityAPIError) {
        if (error.statusCode === 404) {
          throw new TeamCityNotFoundError('Build', buildId, error.requestId, error);
        }
        throw error;
      }

      if (this.isAxiosNotFound(error)) {
        const axiosError = error as AxiosError;
        const apiError = TeamCityAPIError.fromAxiosError(axiosError);
        if (apiError.statusCode === 404) {
          throw new TeamCityNotFoundError('Build', buildId, apiError.requestId, apiError);
        }
        throw apiError;
      }

      const message = error instanceof Error ? error.message : String(error);
      if (/not found/i.test(message)) {
        throw new TeamCityNotFoundError(
          'Build',
          buildId,
          undefined,
          error instanceof Error ? error : undefined
        );
      }

      throw new TeamCityAPIError(
        `Failed to fetch build results: ${message}`,
        'GET_BUILD_RESULTS_FAILED',
        undefined,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Fetch build summary data
   */
  private async fetchBuildSummary(buildId: string): Promise<BuildSummaryResponse> {
    const response = await this.client.modules.builds.getBuild(
      toBuildLocator(buildId),
      BuildResultsManager.fields
    );
    return this.ensureBuildSummary(response.data, buildId);
  }

  /**
   * Transform build data to result format
   */
  private transformBuildData(buildData: BuildSummaryResponse): BuildResult['build'] {
    const build: BuildResult['build'] = {
      id: typeof buildData.id === 'string' ? Number.parseInt(buildData.id, 10) : buildData.id,
      number: buildData.number,
      status: buildData.status,
      state: buildData.state,
      buildTypeId: buildData.buildTypeId,
      statusText: buildData.statusText ?? '',
      webUrl: buildData.webUrl,
    };

    // Add optional fields
    if (buildData.projectId) {
      build.projectId = buildData.projectId;
    }
    if (buildData.branchName) {
      build.branchName = buildData.branchName;
    }
    if (buildData.startDate) {
      build.startDate = buildData.startDate;
    }
    if (buildData.finishDate) {
      build.finishDate = buildData.finishDate;
    }
    if (buildData.queuedDate) {
      build.queuedDate = buildData.queuedDate;
    }

    // Calculate duration if dates available
    if (buildData.startDate && buildData.finishDate) {
      const start = this.parseTeamCityDate(buildData.startDate);
      const finish = this.parseTeamCityDate(buildData.finishDate);
      build.duration = finish - start;
    }

    // Add trigger information
    if (buildData.triggered) {
      const triggered: BuildResult['build']['triggered'] = {
        type: buildData.triggered.type,
        date: buildData.triggered.date,
      };

      const triggeredUser = buildData.triggered.user;
      if (triggeredUser) {
        const username = triggeredUser.username ?? triggeredUser.name;
        if (username) {
          triggered.user = username;
        }
      }

      build.triggered = triggered;
    }

    return build;
  }

  private ensureBuildSummary(data: unknown, buildId: string): BuildSummaryResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object build summary response',
        'INVALID_RESPONSE',
        undefined,
        { buildId, expected: 'object with build fields', receivedType: typeof data }
      );
    }

    const summary = data as Record<string, unknown>;
    const { id, number, status, state, buildTypeId, webUrl, triggered } = summary;

    if (
      (typeof id !== 'number' && typeof id !== 'string') ||
      typeof number !== 'string' ||
      typeof status !== 'string' ||
      typeof state !== 'string' ||
      typeof buildTypeId !== 'string' ||
      typeof webUrl !== 'string'
    ) {
      throw new TeamCityAPIError(
        'TeamCity build summary response is missing required fields',
        'INVALID_RESPONSE',
        undefined,
        { buildId, receivedKeys: Object.keys(summary) }
      );
    }

    let normalizedTriggered: BuildSummaryResponse['triggered'];

    if (triggered !== undefined && triggered !== null) {
      if (!isRecord(triggered)) {
        throw new TeamCityAPIError(
          'TeamCity build summary response contains an invalid triggered payload',
          'INVALID_RESPONSE',
          undefined,
          { buildId, receivedType: typeof triggered }
        );
      }

      const { type, date, user } = triggered as Record<string, unknown>;
      if (typeof type !== 'string' || typeof date !== 'string') {
        throw new TeamCityAPIError(
          'TeamCity build summary response contains an invalid triggered payload',
          'INVALID_RESPONSE',
          undefined,
          { buildId }
        );
      }

      if (user !== undefined && user !== null && !isRecord(user)) {
        throw new TeamCityAPIError(
          'TeamCity build summary response contains an invalid trigger user payload',
          'INVALID_RESPONSE',
          undefined,
          { buildId }
        );
      }

      let normalizedUser: { username?: string; name?: string } | undefined;
      if (user !== undefined && user !== null) {
        const userRecord = user as Record<string, unknown>;
        const username = userRecord['username'];
        const name = userRecord['name'];

        const normalizedUsername = typeof username === 'string' ? username : undefined;
        const normalizedName = typeof name === 'string' ? name : undefined;

        if (normalizedUsername !== undefined || normalizedName !== undefined) {
          normalizedUser = {};
          if (normalizedUsername) {
            normalizedUser.username = normalizedUsername;
          }
          if (normalizedName) {
            normalizedUser.name = normalizedName;
          }
        }
      }

      normalizedTriggered = {
        type,
        date,
        ...(normalizedUser ? { user: normalizedUser } : {}),
      };
    }

    const normalized: BuildSummaryResponse = {
      id: id as number | string,
      number: number as string,
      status: status as string,
      state: state as string,
      buildTypeId: buildTypeId as string,
      statusText:
        typeof summary['statusText'] === 'string' ? (summary['statusText'] as string) : undefined,
      webUrl: webUrl as string,
      projectId:
        typeof summary['projectId'] === 'string' ? (summary['projectId'] as string) : undefined,
      branchName:
        typeof summary['branchName'] === 'string' ? (summary['branchName'] as string) : undefined,
      startDate:
        typeof summary['startDate'] === 'string' ? (summary['startDate'] as string) : undefined,
      finishDate:
        typeof summary['finishDate'] === 'string' ? (summary['finishDate'] as string) : undefined,
      queuedDate:
        typeof summary['queuedDate'] === 'string' ? (summary['queuedDate'] as string) : undefined,
      triggered: normalizedTriggered,
    };

    return normalized;
  }

  /**
   * Fetch build artifacts
   */
  private async fetchArtifacts(
    buildId: string,
    options: BuildResultsOptions
  ): Promise<BuildResult['artifacts']> {
    try {
      const encoding: ArtifactEncoding = options.artifactEncoding ?? 'base64';
      const response = await this.client.modules.builds.getFilesListOfBuild(
        toBuildLocator(buildId)
      );
      const artifactListing = this.ensureArtifactListResponse(response.data, buildId);
      let artifacts = artifactListing.file ?? [];

      // Filter artifacts if pattern provided
      if (options.artifactFilter) {
        artifacts = this.filterArtifacts(artifacts, options.artifactFilter);
      }

      // Transform artifact data
      const result = await Promise.all(
        artifacts.map(async (artifact: TeamCityArtifact) => {
          const artifactPath = artifact.fullName ?? artifact.name;
          const downloadHref =
            artifact.content?.href ??
            `/app/rest/builds/id:${buildId}/artifacts/content/${artifactPath}`;
          const shouldInlineContent =
            encoding === 'base64' &&
            (options.downloadArtifacts?.length
              ? options.downloadArtifacts.includes(artifact.name) ||
                options.downloadArtifacts.includes(artifactPath)
              : true);
          const artifactData: {
            name: string;
            path: string;
            size: number;
            modificationTime: string;
            downloadUrl: string;
            content?: string;
            downloadHandle?: ArtifactDownloadHandle;
          } = {
            name: artifact.name,
            path: artifactPath,
            size: artifact.size ?? 0,
            modificationTime: artifact.modificationTime ?? '',
            downloadUrl: this.buildAbsoluteUrl(downloadHref),
          };

          // Download content if requested and small enough
          if (shouldInlineContent) {
            const maxSize = options.maxArtifactSize ?? BuildResultsManager.defaultMaxArtifactSize;
            if ((artifact.size ?? 0) <= maxSize) {
              try {
                const contentResponse = await this.downloadArtifactContent(buildId, artifactPath);

                // Convert to base64
                artifactData.content = Buffer.from(contentResponse).toString('base64');
              } catch (err) {
                // Ignore download errors
              }
            }
          } else if (encoding === 'stream') {
            artifactData.downloadHandle = {
              tool: 'download_build_artifact',
              args: {
                buildId,
                artifactPath,
                encoding: 'stream',
                ...(options.maxArtifactSize ? { maxSize: options.maxArtifactSize } : {}),
              },
            };
          }

          return artifactData;
        })
      );

      return result;
    } catch (error) {
      warn('Failed to fetch artifacts', {
        error: error instanceof Error ? error.message : error,
        buildId,
        expected: 'file[]',
      });
      return [];
    }
  }

  /**
   * Filter artifacts by pattern
   */
  private filterArtifacts(artifacts: TeamCityArtifact[], pattern: string): TeamCityArtifact[] {
    // Convert glob pattern to regex
    const regex = new RegExp(
      `^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`
    );

    return artifacts.filter((a) => regex.test(a.name));
  }

  private ensureArtifactListResponse(data: unknown, buildId: string): ArtifactListResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object artifact list response',
        'INVALID_RESPONSE',
        undefined,
        { buildId, expected: 'object with file[]' }
      );
    }

    const { file } = data as ArtifactListResponse;

    if (file !== undefined && !Array.isArray(file)) {
      throw new TeamCityAPIError(
        'TeamCity artifact list response contains a non-array file field',
        'INVALID_RESPONSE',
        undefined,
        { buildId, receivedType: typeof file }
      );
    }

    return data as ArtifactListResponse;
  }

  private ensureStatisticsResponse(data: unknown, buildId: string): StatisticsResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object statistics response',
        'INVALID_RESPONSE',
        undefined,
        { buildId, expected: 'object with property[]' }
      );
    }

    const { property } = data as { property?: unknown };

    if (property === undefined) {
      return {} as StatisticsResponse;
    }

    if (!Array.isArray(property)) {
      throw new TeamCityAPIError(
        'TeamCity statistics response contains a non-array property field',
        'INVALID_RESPONSE',
        undefined,
        { buildId, receivedType: typeof property }
      );
    }

    property.forEach((entry, index) => {
      if (!isRecord(entry)) {
        throw new TeamCityAPIError(
          'TeamCity statistics response contains a non-object property entry',
          'INVALID_RESPONSE',
          undefined,
          { buildId, index }
        );
      }

      const { name, value } = entry as Record<string, unknown>;
      if (typeof name !== 'string' || typeof value !== 'string') {
        throw new TeamCityAPIError(
          'TeamCity statistics response property entry is missing required fields',
          'INVALID_RESPONSE',
          undefined,
          { buildId, index, receivedKeys: Object.keys(entry) }
        );
      }
    });

    return { property: property as Array<{ name: string; value: string }> };
  }

  private ensureChangesResponse(data: unknown, buildId: string): ChangesResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object changes response',
        'INVALID_RESPONSE',
        undefined,
        { buildId, expected: 'object with change[]' }
      );
    }

    const { change } = data as ChangesResponse;

    if (change !== undefined && !Array.isArray(change)) {
      throw new TeamCityAPIError(
        'TeamCity changes response contains a non-array change field',
        'INVALID_RESPONSE',
        undefined,
        { buildId, receivedType: typeof change }
      );
    }

    return data as ChangesResponse;
  }

  private ensureDependenciesResponse(data: unknown, buildId: string): DependenciesResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object dependencies response',
        'INVALID_RESPONSE',
        undefined,
        { buildId, expected: 'object with build[]' }
      );
    }

    const { build } = data as DependenciesResponse;

    if (build !== undefined && !Array.isArray(build)) {
      throw new TeamCityAPIError(
        'TeamCity dependencies response contains a non-array build field',
        'INVALID_RESPONSE',
        undefined,
        { buildId, receivedType: typeof build }
      );
    }

    if (Array.isArray(build)) {
      build.forEach((entry, index) => {
        if (!isRecord(entry)) {
          throw new TeamCityAPIError(
            'TeamCity dependencies response contains a non-object build entry',
            'INVALID_RESPONSE',
            undefined,
            { buildId, index }
          );
        }

        const { id, number, buildTypeId, status } = entry as Record<string, unknown>;
        if (
          (typeof id !== 'number' && typeof id !== 'string') ||
          typeof number !== 'string' ||
          typeof buildTypeId !== 'string' ||
          typeof status !== 'string'
        ) {
          throw new TeamCityAPIError(
            'TeamCity dependencies response is missing required fields on build entry',
            'INVALID_RESPONSE',
            undefined,
            { buildId, index, receivedKeys: Object.keys(entry) }
          );
        }

        if (typeof id === 'string' && Number.isNaN(Number.parseInt(id, 10))) {
          throw new TeamCityAPIError(
            'TeamCity dependencies response contains a non-numeric id value',
            'INVALID_RESPONSE',
            undefined,
            { buildId, index, receivedValue: id }
          );
        }
      });
    }

    return data as DependenciesResponse;
  }

  /**
   * Fetch build statistics
   */
  private async fetchStatistics(buildId: string): Promise<BuildResult['statistics']> {
    try {
      const response = await this.client.modules.builds.getBuildStatisticValues(
        toBuildLocator(buildId)
      );
      const payload = this.ensureStatisticsResponse(response.data, buildId);
      const properties: Array<{ name: string; value: string }> = payload.property ?? [];
      const stats: BuildResult['statistics'] = {};

      for (const prop of properties) {
        switch (prop.name) {
          case 'BuildDuration':
            stats.buildDuration = parseInt(prop.value, 10);
            break;
          case 'TestCount':
            stats.testCount = parseInt(prop.value, 10);
            break;
          case 'PassedTestCount':
            stats.passedTests = parseInt(prop.value, 10);
            break;
          case 'FailedTestCount':
            stats.failedTests = parseInt(prop.value, 10);
            break;
          case 'IgnoredTestCount':
            stats.ignoredTests = parseInt(prop.value, 10);
            break;
          case 'CodeCoverageL':
          case 'CodeCoverageB':
            if (!stats.codeCoverage || parseFloat(prop.value) > stats.codeCoverage) {
              stats.codeCoverage = parseFloat(prop.value);
            }
            break;
          default:
            // Store other statistics as-is
            stats[prop.name] = prop.value;
        }
      }

      return stats;
    } catch (error) {
      warn('Failed to fetch statistics', {
        error: error instanceof Error ? error.message : error,
        buildId,
        expected: 'property[]',
      });
      return {};
    }
  }

  /**
   * Fetch VCS changes
   */
  private async fetchChanges(buildId: string): Promise<BuildResult['changes']> {
    try {
      const response = await this.client.modules.changes.getAllChanges(`build:(id:${buildId})`);
      const changePayload = this.ensureChangesResponse(response.data, buildId);
      const changes = changePayload.change ?? [];

      return changes.map((change: TeamCityChange) => ({
        revision: change.version,
        author: change.username,
        date: change.date,
        comment: change.comment ?? '',
        files: (change.files?.file ?? []).map((file) => ({
          path: file.name,
          changeType: file.changeType ?? 'edited',
        })),
      }));
    } catch (error) {
      warn('Failed to fetch changes', {
        error: error instanceof Error ? error.message : error,
        buildId,
        expected: 'change[]',
      });
      return [];
    }
  }

  /**
   * Fetch build dependencies
   */
  private async fetchDependencies(buildId: string): Promise<BuildResult['dependencies']> {
    try {
      const response = await this.client.modules.builds.getAllBuilds(
        `snapshotDependency:(to:(id:${buildId}))`,
        'build(id,number,buildTypeId,status)'
      );
      const depsData = this.ensureDependenciesResponse(response.data, buildId);
      const builds = depsData.build ?? [];

      return builds.map((build) => ({
        buildId:
          typeof build.id === 'string' ? Number.parseInt(build.id, 10) : (build.id as number),
        buildNumber: build.number as string,
        buildTypeId: build.buildTypeId as string,
        status: build.status as string,
      }));
    } catch (error) {
      warn('Failed to fetch dependencies', {
        error: error instanceof Error ? error.message : error,
        buildId,
        expected: 'build[]',
      });
      return [];
    }
  }

  /**
   * Resolve absolute URLs using the shared TeamCity client base URL
   */
  private buildAbsoluteUrl(path: string): string {
    if (/^https?:/i.test(path)) {
      return path;
    }
    const baseUrl = this.getBaseUrl();
    if (path.startsWith('/')) {
      return `${baseUrl}${path}`;
    }
    return `${baseUrl}/${path}`;
  }

  private getBaseUrl(): string {
    const baseUrl = this.client.getApiConfig().baseUrl;
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  private async downloadArtifactContent(
    buildId: string,
    artifactPath: string
  ): Promise<ArrayBufferLike> {
    const normalizedPath = artifactPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const buildLocator = toBuildLocator(buildId);
    const response = await this.client.modules.builds.downloadFileOfBuild(
      `content/${normalizedPath}`,
      buildLocator,
      undefined,
      undefined,
      { responseType: 'arraybuffer' }
    );

    const axiosResponse = response as AxiosResponse<unknown>;
    const { data } = axiosResponse;

    if (data instanceof ArrayBuffer) {
      return data.slice(0);
    }

    if (Buffer.isBuffer(data)) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    }

    throw new Error('Artifact download returned unexpected binary payload type');
  }

  /**
   * Parse TeamCity date format
   */
  private parseTeamCityDate(dateStr: string): number {
    // TeamCity format: yyyyMMdd'T'HHmmss+ZZZZ
    const match = dateStr.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (!match) {
      return Date.parse(dateStr);
    }

    const [, year, month, day, hour, minute, second] = match;
    if (!year || !month || !day || !hour || !minute || !second) {
      return Date.parse(dateStr);
    }
    return new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    ).getTime();
  }

  /**
   * Generate cache key
   */
  private getCacheKey(buildId: string, options: BuildResultsOptions): string {
    return `${buildId}:${JSON.stringify(options)}`;
  }

  private isAxiosNotFound(error: unknown): error is AxiosError {
    const axiosError = error as AxiosError | undefined;
    return Boolean(axiosError?.response && axiosError.response.status === 404);
  }

  /**
   * Get from cache if valid
   */
  private getFromCache(key: string): BuildResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > BuildResultsManager.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Cache a result
   */
  private cacheResult(key: string, result: BuildResult): void {
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
      if (now - entry.timestamp > BuildResultsManager.cacheTtlMs) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.cache.delete(key);
    }
  }
}
