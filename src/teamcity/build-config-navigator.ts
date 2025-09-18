/**
 * BuildConfigNavigator - Navigate and discover TeamCity build configurations
 * Provides comprehensive build configuration listing, filtering, and metadata extraction
 */
import { debug, error as logError } from '@/utils/logger';

import {
  type BuildTypeProperty,
  type BuildTypeVcsRootEntry,
  type BuildTypesResponse,
  type ProjectData,
  isBuildTypesResponse,
  isProjectData,
} from './types/api-responses';
import type { TeamCityUnifiedClient } from './types/client';

export interface BuildConfigNavigatorParams {
  projectId?: string;
  projectIds?: string[];
  namePattern?: string;
  includeVcsRoots?: boolean;
  includeParameters?: boolean;
  includeProjectHierarchy?: boolean;
  viewMode?: 'list' | 'project-grouped';
  vcsRootFilter?: {
    url?: string;
    branch?: string;
    vcsName?: string;
  };
  statusFilter?: {
    lastBuildStatus?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
    paused?: boolean;
    hasRecentActivity?: boolean;
    activeSince?: Date;
  };
  sortBy?: 'name' | 'project' | 'lastModified';
  sortOrder?: 'asc' | 'desc';
  pagination?: {
    limit?: number;
    offset?: number;
  };
}

export interface BuildConfig {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  description?: string;
  href?: string;
  webUrl?: string;
  vcsRoots?: VcsRoot[];
  parameters?: Record<string, string>;
  projectHierarchy?: ProjectInfo[];
  lastBuildDate?: string;
  lastBuildStatus?: string;
  paused?: boolean;
}

export interface VcsRoot {
  id: string;
  name: string;
  vcsName: string;
  url?: string;
  branch?: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export interface ProjectGroup {
  projectId: string;
  projectName: string;
  buildConfigs: BuildConfig[];
}

export interface BuildConfigNavigatorResult {
  buildConfigs: BuildConfig[];
  totalCount: number;
  hasMore: boolean;
  viewMode: 'list' | 'project-grouped';
  groupedByProject?: Record<string, ProjectGroup>;
}

interface CacheEntry {
  data: BuildConfigNavigatorResult;
  timestamp: number;
}

export class BuildConfigNavigator {
  private client: TeamCityUnifiedClient;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTtlMs = 120000; // 120 seconds
  private readonly maxCacheSize = 100;

  constructor(client: TeamCityUnifiedClient) {
    this.client = client;
  }

  /**
   * List build configurations with optional filtering and metadata extraction
   */
  async listBuildConfigs(
    params: BuildConfigNavigatorParams = {}
  ): Promise<BuildConfigNavigatorResult> {
    const cacheKey = this.generateCacheKey(params);

    // Check cache first
    const cachedEntry = this.cache.get(cacheKey);
    if (cachedEntry != null && Date.now() - cachedEntry.timestamp < this.cacheTtlMs) {
      debug('Cache hit for build configurations', { cacheKey });
      return cachedEntry.data;
    }

    try {
      const locator = this.buildLocator(params);
      const fields = this.buildFields(params);

      debug('Fetching build configurations', { locator });

      const response = await this.client.modules.buildTypes.getAllBuildTypes(locator, fields);

      if (response.data == null || !isBuildTypesResponse(response.data)) {
        throw new Error('Invalid API response from TeamCity');
      }

      const buildConfigs = await this.processBuildConfigs(response.data, params);
      const totalCount = response.data.count ?? buildConfigs.length;

      const result: BuildConfigNavigatorResult = {
        buildConfigs,
        totalCount,
        hasMore: this.calculateHasMore(buildConfigs.length, totalCount, params.pagination),
        viewMode: params.viewMode ?? 'list',
        groupedByProject:
          params.viewMode === 'project-grouped'
            ? this.groupBuildConfigsByProject(buildConfigs)
            : undefined,
      };

      // Cache successful results
      this.cacheResult(cacheKey, result);

      return result;
    } catch (error) {
      logError(
        'Failed to fetch build configurations',
        error instanceof Error ? error : new Error(String(error)),
        {
          locator: this.buildLocator(params),
        }
      );

      throw this.transformError(error, params);
    }
  }

  /**
   * Build TeamCity API locator string based on parameters
   */
  private buildLocator(params: BuildConfigNavigatorParams): string {
    const locatorParts: string[] = [];

    if (params.projectId) {
      locatorParts.push(`project:${params.projectId}`);
    } else if (params.projectIds && params.projectIds.length > 0) {
      locatorParts.push(`project:(${params.projectIds.join(',')})`);
    }

    if (params.pagination) {
      if (params.pagination.limit !== undefined) {
        locatorParts.push(`count:${params.pagination.limit}`);
      }
      if (params.pagination.offset !== undefined) {
        locatorParts.push(`start:${params.pagination.offset}`);
      }
    }

    return locatorParts.join(',');
  }

  /**
   * Build TeamCity API fields string based on what metadata is requested
   */
  private buildFields(params: BuildConfigNavigatorParams): string {
    const baseFields = '$long';

    const needsAdditionalFields =
      params.includeVcsRoots === true ||
      params.includeParameters === true ||
      params.vcsRootFilter !== undefined ||
      params.statusFilter !== undefined ||
      params.sortBy === 'lastModified';

    if (!needsAdditionalFields) {
      return baseFields;
    }

    const additionalFields: string[] = [];

    if (params.includeVcsRoots === true || params.vcsRootFilter !== undefined) {
      additionalFields.push(
        'vcs-root-entries(vcs-root(id,name,vcsName,properties(property(name,value))))'
      );
    }

    if (params.includeParameters === true) {
      additionalFields.push('parameters(property(name,value,type))');
    }

    if (params.statusFilter !== undefined || params.sortBy === 'lastModified') {
      additionalFields.push('lastBuildDate,lastBuildStatus,paused');
    }

    return additionalFields.length > 0 ? `${baseFields},${additionalFields.join(',')}` : baseFields;
  }

  /**
   * Process raw API response into structured BuildConfig objects
   */
  private async processBuildConfigs(
    data: BuildTypesResponse,
    params: BuildConfigNavigatorParams
  ): Promise<BuildConfig[]> {
    const buildTypes = data.buildType ?? [];
    let buildConfigs: BuildConfig[] = [];

    for (const buildType of buildTypes) {
      const buildConfig: BuildConfig = {
        id: buildType.id ?? '',
        name: buildType.name ?? '',
        projectId: buildType.projectId ?? buildType.project?.id ?? '',
        projectName: buildType.projectName ?? buildType.project?.name ?? '',
        description: buildType.description,
        href: buildType.href,
        webUrl: buildType.webUrl,
        lastBuildDate: buildType.lastBuildDate,
        lastBuildStatus: buildType.lastBuildStatus,
        paused: buildType.paused,
      };

      // Apply name pattern filtering if specified
      if (params.namePattern && !this.matchesPattern(buildConfig.name, params.namePattern)) {
        continue;
      }

      // Extract VCS roots if requested or needed for filtering
      const needVcsRoots = params.includeVcsRoots === true ? true : params.vcsRootFilter != null;
      if (needVcsRoots && buildType['vcs-root-entries']) {
        buildConfig.vcsRoots = this.extractVcsRoots(buildType['vcs-root-entries']);

        // Apply VCS root filtering if specified
        if (
          params.vcsRootFilter &&
          !this.matchesVcsRootFilter(buildConfig.vcsRoots, params.vcsRootFilter)
        ) {
          continue;
        }
      }

      // Extract parameters if requested
      if (params.includeParameters && buildType.parameters) {
        buildConfig.parameters = this.extractParameters(buildType.parameters);
      }

      // Extract project hierarchy if requested
      if (params.includeProjectHierarchy) {
        // Intentional sequential per-item hierarchy fetch; keeps API usage simple in list flows
        // eslint-disable-next-line no-await-in-loop
        buildConfig.projectHierarchy = await this.extractProjectHierarchy(buildConfig.projectId);
      }

      // Apply status filtering if specified
      if (params.statusFilter && !this.matchesStatusFilter(buildConfig, params.statusFilter)) {
        continue;
      }

      buildConfigs.push(buildConfig);
    }

    // Apply sorting if specified
    if (params.sortBy) {
      buildConfigs = this.sortBuildConfigs(buildConfigs, params.sortBy, params.sortOrder ?? 'asc');
    }

    // Note: Pagination is already applied at the API level via the locator
    // (see buildLocator method which adds count and start parameters)
    // So we don't need to apply client-side pagination here

    return buildConfigs;
  }

  /**
   * Check if a name matches a pattern (supports wildcards)
   */
  private matchesPattern(name: string, pattern: string): boolean {
    if (!pattern.includes('*')) {
      return name.toLowerCase().includes(pattern.toLowerCase());
    }

    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
      .replace(/\*/g, '.*'); // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(name);
  }

  /**
   * Check if VCS roots match the filter criteria
   */
  private matchesVcsRootFilter(
    vcsRoots: VcsRoot[] | undefined,
    filter: NonNullable<BuildConfigNavigatorParams['vcsRootFilter']>
  ): boolean {
    if (!vcsRoots || vcsRoots.length === 0) {
      return false;
    }

    return vcsRoots.some((vcsRoot) => {
      if (filter.url && !vcsRoot.url?.includes(filter.url)) {
        return false;
      }
      if (filter.branch && vcsRoot.branch !== filter.branch) {
        return false;
      }
      if (filter.vcsName && vcsRoot.vcsName !== filter.vcsName) {
        return false;
      }
      return true;
    });
  }

  /**
   * Check if build config matches status filter criteria
   */
  private matchesStatusFilter(
    buildConfig: BuildConfig,
    filter: NonNullable<BuildConfigNavigatorParams['statusFilter']>
  ): boolean {
    if (filter.lastBuildStatus && buildConfig.lastBuildStatus !== filter.lastBuildStatus) {
      return false;
    }
    if (filter.paused !== undefined && buildConfig.paused !== filter.paused) {
      return false;
    }
    if (filter.hasRecentActivity !== undefined) {
      const hasActivity = Boolean(buildConfig.lastBuildDate);
      if (filter.hasRecentActivity !== hasActivity) {
        return false;
      }
    }
    if (filter.activeSince && buildConfig.lastBuildDate) {
      const lastBuildDate = new Date(buildConfig.lastBuildDate);
      if (lastBuildDate < filter.activeSince) {
        return false;
      }
    }
    return true;
  }

  /**
   * Sort build configurations by specified field
   */
  private sortBuildConfigs(
    buildConfigs: BuildConfig[],
    sortBy: NonNullable<BuildConfigNavigatorParams['sortBy']>,
    sortOrder: 'asc' | 'desc'
  ): BuildConfig[] {
    const sorted = [...buildConfigs].sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case 'name':
          compareValue = a.name.localeCompare(b.name);
          break;
        case 'project':
          compareValue = a.projectName.localeCompare(b.projectName);
          if (compareValue === 0) {
            // Secondary sort by name within same project
            compareValue = a.name.localeCompare(b.name);
          }
          break;
        case 'lastModified':
          if (!a.lastBuildDate && !b.lastBuildDate) {
            compareValue = 0;
          } else if (!a.lastBuildDate) {
            compareValue = 1;
          } else if (!b.lastBuildDate) {
            compareValue = -1;
          } else {
            compareValue =
              new Date(b.lastBuildDate).getTime() - new Date(a.lastBuildDate).getTime();
          }
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return sorted;
  }

  /**
   * Extract VCS root information from build type data
   */
  private extractVcsRoots(vcsRootEntries: {
    'vcs-root-entry'?: BuildTypeVcsRootEntry[];
  }): VcsRoot[] {
    const vcsRoots: VcsRoot[] = [];
    const entries = vcsRootEntries['vcs-root-entry'] ?? [];

    for (const entry of entries) {
      const vcsRoot = entry['vcs-root'];
      if (vcsRoot) {
        const properties = vcsRoot.properties?.property ?? [];
        const propertiesMap = properties.reduce<Record<string, string | undefined>>((acc, prop) => {
          if (prop.name) {
            acc[prop.name] = prop.value;
          }
          return acc;
        }, {});

        vcsRoots.push({
          id: vcsRoot.id ?? '',
          name: vcsRoot.name ?? '',
          vcsName: vcsRoot.vcsName ?? '',
          url: propertiesMap['url'],
          branch: propertiesMap['branch'],
        });
      }
    }

    return vcsRoots;
  }

  /**
   * Extract build parameters from build type data
   */
  private extractParameters(parametersData: {
    property?: BuildTypeProperty[];
  }): Record<string, string> {
    const parameters: Record<string, string> = {};
    const properties = parametersData.property ?? [];

    for (const property of properties) {
      parameters[property.name] = property.value;
    }

    return parameters;
  }

  /**
   * Extract project hierarchy path for a given project
   */
  private async extractProjectHierarchy(projectId: string): Promise<ProjectInfo[]> {
    try {
      const response = await this.client.modules.projects.getProject(
        projectId,
        '$short,parentProject($short)'
      );

      // Build hierarchy from root to current project
      const ancestors: ProjectInfo[] = [];
      let current: ProjectData | undefined = isProjectData(response.data)
        ? response.data
        : undefined;

      while (current?.id && current.name) {
        ancestors.unshift({
          id: current.id,
          name: current.name,
        });

        current = current.parentProject;
      }

      return ancestors;
    } catch (error) {
      debug('Failed to extract project hierarchy', { projectId, error });
      return [{ id: projectId, name: projectId }];
    }
  }

  /**
   * Group build configurations by project
   */
  private groupBuildConfigsByProject(buildConfigs: BuildConfig[]): Record<string, ProjectGroup> {
    const grouped: Record<string, ProjectGroup> = {};

    for (const config of buildConfigs) {
      let group = grouped[config.projectId];
      if (!group) {
        group = {
          projectId: config.projectId,
          projectName: config.projectName,
          buildConfigs: [],
        };
        grouped[config.projectId] = group;
      }

      group.buildConfigs.push(config);
    }

    return grouped;
  }

  /**
   * Calculate if there are more results available
   */
  private calculateHasMore(
    currentCount: number,
    totalCount: number,
    pagination?: { limit?: number; offset?: number }
  ): boolean {
    if (!pagination?.limit) {
      return false;
    }

    const offset = pagination.offset ?? 0;
    return currentCount === pagination.limit && totalCount > offset + currentCount;
  }

  /**
   * Transform API errors into user-friendly messages
   */
  private transformError(error: unknown, params: BuildConfigNavigatorParams): Error {
    const axiosError = error as { response?: { status?: number }; name?: string; message?: string };
    if (axiosError?.response?.status === 401) {
      return new Error('Authentication failed - please check your TeamCity token');
    }

    if (axiosError?.response?.status === 403) {
      return new Error('Permission denied - you do not have access to build configurations');
    }

    if (axiosError?.response?.status === 404) {
      if (params.projectId) {
        return new Error(`Project ${params.projectId} not found`);
      }
      return new Error('Build configurations not found');
    }

    if (axiosError?.name === 'ECONNABORTED' || axiosError?.message?.includes('timeout')) {
      return new Error('Request timed out - TeamCity server may be overloaded');
    }

    if (axiosError?.response?.status && axiosError.response.status >= 500) {
      return new Error(`TeamCity API error: ${axiosError.message ?? 'Internal server error'}`);
    }

    return new Error(`TeamCity API error: ${axiosError?.message ?? 'Unknown error'}`);
  }

  /**
   * Generate cache key for request parameters
   */
  private generateCacheKey(params: BuildConfigNavigatorParams): string {
    return JSON.stringify(params);
  }

  /**
   * Cache successful results with TTL
   */
  private cacheResult(cacheKey: string, result: BuildConfigNavigatorResult): void {
    // Clean up cache if it gets too large
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entries to make room for one new entry
      const entriesToRemove = this.cache.size - this.maxCacheSize + 1;
      const oldestKeys = Array.from(this.cache.keys()).slice(0, entriesToRemove);
      for (const key of oldestKeys) {
        this.cache.delete(key);
      }
    }

    this.cache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    debug('Cached build configurations result', {
      cacheKey,
      resultCount: result.buildConfigs.length,
    });
  }
}
