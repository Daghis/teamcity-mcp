/**
 * BuildResultsManager - Manages comprehensive build results retrieval
 */
import { warn } from '@/utils/logger';

import type { TeamCityUnifiedClient } from './types/client';

export interface BuildResultsOptions {
  includeArtifacts?: boolean;
  includeStatistics?: boolean;
  includeChanges?: boolean;
  includeDependencies?: boolean;
  artifactFilter?: string;
  downloadArtifacts?: string[];
  maxArtifactSize?: number;
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('not found')) {
        throw new Error(`Build not found: ${buildId}`);
      }
      throw new Error(`Failed to fetch build results: ${errorMessage}`);
    }
  }

  /**
   * Fetch build summary data
   */
  private async fetchBuildSummary(buildId: string): Promise<unknown> {
    const response = await this.client.modules.builds.getBuild(
      this.toBuildLocator(buildId),
      BuildResultsManager.fields
    );
    return response.data;
  }

  /**
   * Transform build data to result format
   */
  private transformBuildData(data: unknown): BuildResult['build'] {
    const buildData = data as {
      id: number;
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
    };
    const build: BuildResult['build'] = {
      id: buildData.id,
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
      build.triggered = {
        type: buildData.triggered.type,
        date: buildData.triggered.date,
      };

      if (buildData.triggered.user) {
        build.triggered.user = buildData.triggered.user.username ?? buildData.triggered.user.name;
      }
    }

    return build;
  }

  /**
   * Fetch build artifacts
   */
  private async fetchArtifacts(
    buildId: string,
    options: BuildResultsOptions
  ): Promise<BuildResult['artifacts']> {
    try {
      const response = await this.client.modules.builds.getFilesListOfBuild(
        this.toBuildLocator(buildId)
      );
      const artifactListing = response.data as { file?: TeamCityArtifact[] };
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
          const artifactData: {
            name: string;
            path: string;
            size: number;
            modificationTime: string;
            downloadUrl: string;
            content?: string;
          } = {
            name: artifact.name,
            path: artifactPath,
            size: artifact.size ?? 0,
            modificationTime: artifact.modificationTime ?? '',
            downloadUrl: this.buildAbsoluteUrl(downloadHref),
          };

          // Download content if requested and small enough
          if (options.downloadArtifacts?.includes(artifact.name)) {
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
          }

          return artifactData;
        })
      );

      return result;
    } catch (error) {
      warn('Failed to fetch artifacts', { error, buildId });
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

  /**
   * Fetch build statistics
   */
  private async fetchStatistics(buildId: string): Promise<BuildResult['statistics']> {
    try {
      const response = await this.client.modules.builds.getBuildStatisticValues(
        this.toBuildLocator(buildId)
      );
      const payload = response.data as { property?: Array<{ name: string; value: string }> };
      const properties = payload.property ?? [];
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
      warn('Failed to fetch statistics', { error, buildId });
      return {};
    }
  }

  /**
   * Fetch VCS changes
   */
  private async fetchChanges(buildId: string): Promise<BuildResult['changes']> {
    try {
      const response = await this.client.modules.changes.getAllChanges(
        `build:(id:${buildId})`
      );
      const changePayload = response.data as { change?: TeamCityChange[] };
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
      warn('Failed to fetch changes', { error, buildId });
      return [];
    }
  }

  /**
   * Fetch build dependencies
   */
  private async fetchDependencies(buildId: string): Promise<BuildResult['dependencies']> {
    try {
      const response = await this.client.request((ctx) =>
        ctx.axios.get(`${ctx.baseUrl}/app/rest/builds/id:${buildId}/snapshot-dependencies`)
      );
      const depsData = response.data as {
        build?: Array<{
          id: number;
          number: string;
          buildTypeId: string;
          status: string;
        }>;
      };
      const builds = depsData.build ?? [];

      return builds.map((build) => ({
        buildId: build.id,
        buildNumber: build.number,
        buildTypeId: build.buildTypeId,
        status: build.status,
      }));
    } catch (error) {
      warn('Failed to fetch dependencies', { error, buildId });
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

  private toBuildLocator(buildId: string): string {
    return buildId.includes(':') ? buildId : `id:${buildId}`;
  }

  private async downloadArtifactContent(buildId: string, artifactPath: string): Promise<ArrayBuffer> {
    const normalizedPath = artifactPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const response = await this.client.request((ctx) =>
      ctx.axios.get<ArrayBuffer>(
        `${ctx.baseUrl}/app/rest/builds/id:${buildId}/artifacts/content/${normalizedPath}`,
        {
          responseType: 'arraybuffer',
        }
      )
    );

    return response.data;
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
