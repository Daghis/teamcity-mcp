/**
 * Build Configuration Manager for TeamCity
 *
 * Manages listing, filtering, and paginating build configurations
 * from TeamCity projects.
 */
import type { Logger } from 'winston';

import type { BuildType, BuildTypes, Projects } from '@/teamcity-client';

import type { TeamCityClientAdapter } from './client-adapter';

/**
 * Build configuration with normalized fields
 */
export interface ManagedBuildConfiguration {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  description?: string;
  webUrl?: string;
  paused: boolean;
  templateFlag: boolean;
  templateId?: string;
  parameters?: Record<string, string>;
  vcsRootIds?: string[];
  buildSteps?: number;
  triggers?: number;
  dependencies?: {
    snapshot: string[];
    artifact: string[];
  };
}

/**
 * Filtering options for build configurations
 */
export interface BuildConfigurationFilters {
  projectId?: string;
  projectIds?: string[];
  namePattern?: string;
  templateFlag?: boolean;
  paused?: boolean;
  tags?: string[];
  hasVcsRoot?: boolean;
  hasTriggers?: boolean;
}

/**
 * Sorting options
 */
export interface BuildConfigurationSort {
  by?: 'name' | 'projectName' | 'id' | 'created' | 'modified';
  order?: 'asc' | 'desc';
}

/**
 * Pagination options
 */
export interface BuildConfigurationPagination {
  page?: number;
  pageSize?: number;
}

/**
 * Response with pagination metadata
 */
export interface PaginatedBuildConfigurations {
  configurations: ManagedBuildConfiguration[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

/**
 * Manager for build configurations
 */
export class BuildConfigManager {
  constructor(
    private readonly client: TeamCityClientAdapter,
    private readonly logger: Logger
  ) {}

  /**
   * List build configurations with filtering and pagination
   */
  async listConfigurations(
    options: {
      filters?: BuildConfigurationFilters;
      sort?: BuildConfigurationSort;
      pagination?: BuildConfigurationPagination;
      includeDetails?: boolean;
    } = {}
  ): Promise<PaginatedBuildConfigurations> {
    const {
      filters = {},
      sort = { by: 'name', order: 'asc' },
      pagination = { page: 1, pageSize: 50 },
    } = options;

    try {
      // Construct locator string for TeamCity API
      const locator = this.buildLocator(filters);

      // Fetch build types from TeamCity
      const response = await this.client.buildTypes.getAllBuildTypes(
        locator,
        this.buildFieldsSpec(options.includeDetails)
      );

      const buildTypeData = (response.data ?? {}) as BuildTypes;
      const allConfigs = this.normalizeBuildTypes(buildTypeData);

      // Apply additional filtering
      let filteredConfigs = this.applyFilters(allConfigs, filters);

      // Sort configurations
      filteredConfigs = this.sortConfigurations(filteredConfigs, sort);

      // Apply pagination
      const paginatedResult = this.paginate(filteredConfigs, pagination);

      return paginatedResult;
    } catch (error) {
      this.logger.error('Failed to list build configurations', { error, options });
      throw error;
    }
  }

  /**
   * Get configurations by project with hierarchy
   */
  async getProjectConfigurations(
    projectId: string,
    includeSubprojects: boolean = false
  ): Promise<ManagedBuildConfiguration[]> {
    try {
      const filters: BuildConfigurationFilters = { projectId };

      if (includeSubprojects) {
        // Get all subprojects
        const subprojectIds = await this.getSubprojectIds(projectId);
        filters.projectIds = [projectId, ...subprojectIds];
        delete filters.projectId;
      }

      const result = await this.listConfigurations({
        filters,
        pagination: { pageSize: 1000 }, // Get all
      });

      return result.configurations;
    } catch (error) {
      this.logger.error('Failed to get project configurations', {
        error,
        projectId,
        includeSubprojects,
      });
      throw error;
    }
  }

  /**
   * Get template hierarchy for configurations
   */
  async getTemplateHierarchy(templateId: string): Promise<{
    template: ManagedBuildConfiguration;
    inheritors: ManagedBuildConfiguration[];
  }> {
    try {
      // Get the template itself
      const templateResponse = await this.client.buildTypes.getBuildType(
        templateId,
        this.buildFieldsSpec(true)
      );

      const templateData = (templateResponse.data ?? null) as Partial<BuildType> | null;
      if (!templateData) {
        throw new Error(`Template ${templateId} not found`);
      }

      const template = this.normalizeBuildType(templateData);

      // Find all configurations using this template
      const allConfigs = await this.listConfigurations({
        pagination: { pageSize: 1000 },
      });

      const inheritors = allConfigs.configurations.filter(
        (config) => config.templateId === templateId
      );

      return { template, inheritors };
    } catch (error) {
      this.logger.error('Failed to get template hierarchy', { error, templateId });
      throw error;
    }
  }

  /**
   * Build locator string for TeamCity API
   */
  private buildLocator(filters: BuildConfigurationFilters): string | undefined {
    const parts: string[] = [];

    if (filters.projectId) {
      parts.push(`affectedProject:(id:${filters.projectId})`);
    } else if (filters.projectIds && filters.projectIds.length > 0) {
      const projectLocator = filters.projectIds.map((id) => `id:${id}`).join(',');
      parts.push(`affectedProject:(${projectLocator})`);
    }

    if (filters.templateFlag !== undefined) {
      parts.push(`templateFlag:${filters.templateFlag}`);
    }

    if (filters.paused !== undefined) {
      parts.push(`paused:${filters.paused}`);
    }

    if (filters.tags && filters.tags.length > 0) {
      const tagLocator = filters.tags.join(',');
      parts.push(`tag:(${tagLocator})`);
    }

    return parts.length > 0 ? parts.join(',') : undefined;
  }

  /**
   * Build fields specification for API request
   */
  private buildFieldsSpec(includeDetails?: boolean): string {
    const baseFields = [
      'id',
      'name',
      'projectId',
      'projectName',
      'description',
      'webUrl',
      'paused',
      'templateFlag',
      'template(id)',
    ];

    if (includeDetails) {
      baseFields.push(
        'parameters(property(name,value))',
        'vcs-root-entries(vcs-root-entry(id))',
        'steps(count)',
        'triggers(count)',
        'snapshot-dependencies(count)',
        'artifact-dependencies(count)'
      );
    }

    return `buildType(${baseFields.join(',')})`;
  }

  /**
   * Normalize build types from API response
   */
  private normalizeBuildTypes(response: BuildTypes): ManagedBuildConfiguration[] {
    const buildTypes = response.buildType ?? [];
    return buildTypes.map((bt) => this.normalizeBuildType(bt));
  }

  /**
   * Normalize a single build type
   */
  private normalizeBuildType(buildType: Partial<BuildType>): ManagedBuildConfiguration {
    const config: ManagedBuildConfiguration = {
      id: buildType.id ?? '',
      name: buildType.name ?? '',
      projectId: buildType.projectId ?? '',
      projectName: buildType.projectName ?? '',
      description: buildType.description,
      webUrl: buildType.webUrl,
      paused: buildType.paused ?? false,
      templateFlag: buildType.templateFlag ?? false,
    };

    // Add template ID if present
    if (buildType.template?.id) {
      config.templateId = buildType.template.id;
    }

    // Add parameters if present
    if (buildType.parameters?.property) {
      config.parameters = {};
      for (const param of buildType.parameters.property) {
        if (param.name && param.value) {
          config.parameters[param.name] = param.value;
        }
      }
    }

    // Add VCS root IDs if present
    if (buildType['vcs-root-entries']?.['vcs-root-entry']) {
      config.vcsRootIds = buildType['vcs-root-entries']['vcs-root-entry']
        .map((entry: { id?: string }) => entry.id)
        .filter((id): id is string => Boolean(id));
    }

    // Add counts if present
    if (buildType.steps?.count !== undefined) {
      config.buildSteps = buildType.steps.count;
    }

    if (buildType.triggers?.count !== undefined) {
      config.triggers = buildType.triggers.count;
    }

    // Add dependencies if present
    if (buildType['snapshot-dependencies'] ?? buildType['artifact-dependencies']) {
      config.dependencies = {
        snapshot: [],
        artifact: [],
      };

      if (buildType['snapshot-dependencies']?.['snapshot-dependency']) {
        config.dependencies.snapshot = buildType['snapshot-dependencies']['snapshot-dependency']
          .map((dep: { id?: string }) => dep.id)
          .filter((id): id is string => Boolean(id));
      }

      if (buildType['artifact-dependencies']?.['artifact-dependency']) {
        config.dependencies.artifact = buildType['artifact-dependencies']['artifact-dependency']
          .map((dep: { id?: string }) => dep.id)
          .filter((id): id is string => Boolean(id));
      }
    }

    return config;
  }

  /**
   * Apply additional filters not supported by locator
   */
  private applyFilters(
    configurations: ManagedBuildConfiguration[],
    filters: BuildConfigurationFilters
  ): ManagedBuildConfiguration[] {
    let filtered = [...configurations];

    // Filter by name pattern
    if (filters.namePattern) {
      const pattern = filters.namePattern.toLowerCase();
      if (pattern.includes('*')) {
        // Wildcard pattern
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
        filtered = filtered.filter((config) => regex.test(config.name));
      } else {
        // Simple contains
        filtered = filtered.filter((config) => config.name.toLowerCase().includes(pattern));
      }
    }

    // Filter by VCS root presence
    if (filters.hasVcsRoot !== undefined) {
      filtered = filtered.filter((config) => {
        const hasVcs = config.vcsRootIds && config.vcsRootIds.length > 0;
        return filters.hasVcsRoot ? hasVcs : !hasVcs;
      });
    }

    // Filter by trigger presence
    if (filters.hasTriggers !== undefined) {
      filtered = filtered.filter((config) => {
        const hasTriggers = config.triggers != null && config.triggers > 0;
        return filters.hasTriggers === true ? hasTriggers : !hasTriggers;
      });
    }

    return filtered;
  }

  /**
   * Sort configurations
   */
  private sortConfigurations(
    configurations: ManagedBuildConfiguration[],
    sort: BuildConfigurationSort
  ): ManagedBuildConfiguration[] {
    const sorted = [...configurations];
    const { by = 'name', order = 'asc' } = sort;

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (by) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'projectName':
          comparison = a.projectName.localeCompare(b.projectName);
          break;
        case 'id':
          comparison = a.id.localeCompare(b.id);
          break;
        default:
          comparison = 0;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Apply pagination
   */
  private paginate(
    configurations: ManagedBuildConfiguration[],
    pagination: BuildConfigurationPagination
  ): PaginatedBuildConfigurations {
    const { page = 1, pageSize = 50 } = pagination;
    const totalCount = configurations.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedConfigs = configurations.slice(startIndex, endIndex);

    return {
      configurations: paginatedConfigs,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  /**
   * Get subproject IDs recursively
   */
  private async getSubprojectIds(projectId: string): Promise<string[]> {
    try {
      const response = await this.client.projects.getAllSubprojectsOrdered(
        projectId,
        'id,parentProjectId'
      );

      const subprojectData = (response.data ?? {}) as Projects;
      const subprojects = subprojectData.project ?? [];
      return subprojects
        .map((p: { id?: string }) => p.id)
        .filter((id): id is string => Boolean(id));
    } catch (error) {
      this.logger.warn('Failed to get subprojects', { error, projectId });
      return [];
    }
  }
}
