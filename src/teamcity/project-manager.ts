/**
 * Project Manager for TeamCity
 *
 * Manages listing, filtering, and navigating TeamCity projects
 * with support for hierarchy traversal.
 */
import type { Logger } from 'winston';

import type { Project, Projects } from '@/teamcity-client';

import type { TeamCityClientAdapter } from './client-adapter';

/**
 * Managed project with normalized fields
 */
export interface ManagedProject {
  id: string;
  name: string;
  parentProjectId?: string;
  description?: string;
  webUrl?: string;
  archived: boolean;
  href?: string;
  buildTypesCount?: number;
  subprojectsCount?: number;
  parameters?: Record<string, string>;
  level?: number; // Hierarchy level (0 = root)
  path?: string[]; // Path from root to this project
}

/**
 * Project filters
 */
export interface ProjectFilters {
  namePattern?: string;
  archived?: boolean;
  parentProjectId?: string;
  hasBuilds?: boolean;
  maxDepth?: number;
}

/**
 * Sorting options
 */
export interface ProjectSort {
  by?: 'name' | 'id' | 'level';
  order?: 'asc' | 'desc';
}

/**
 * Pagination options
 */
export interface ProjectPagination {
  page?: number;
  pageSize?: number;
}

/**
 * Paginated projects response
 */
export interface PaginatedProjects {
  projects: ManagedProject[];
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
 * Project hierarchy node
 */
export interface ProjectHierarchyNode {
  project: ManagedProject;
  children: ProjectHierarchyNode[];
}

/**
 * Manager for TeamCity projects
 */
export class ProjectManager {
  private projectCache: Map<string, ManagedProject> = new Map();

  constructor(
    private readonly client: TeamCityClientAdapter,
    private readonly logger: Logger
  ) {}

  /**
   * List projects with filtering and pagination
   */
  async listProjects(
    options: {
      filters?: ProjectFilters;
      sort?: ProjectSort;
      pagination?: ProjectPagination;
      includeStatistics?: boolean;
    } = {}
  ): Promise<PaginatedProjects> {
    const {
      filters = {},
      sort = { by: 'name', order: 'asc' },
      pagination = { page: 1, pageSize: 50 },
      includeStatistics = false,
    } = options;

    try {
      // Build locator for API
      const locator = this.buildLocator(filters);

      // Fetch projects
      const response = await this.client.projects.getAllProjects(
        locator,
        this.buildFieldsSpec(includeStatistics)
      );

      // Normalize projects
      const projectData = (response.data ?? {}) as Projects;
      let projects = await this.normalizeProjects(projectData);

      // Apply additional filters
      projects = this.applyFilters(projects, filters);

      // Sort projects
      projects = this.sortProjects(projects, sort);

      // Apply pagination
      const paginatedResult = this.paginate(projects, pagination);

      return paginatedResult;
    } catch (error) {
      this.logger.error('Failed to list projects', { error, options });
      throw error;
    }
  }

  /**
   * Get project hierarchy starting from a root
   */
  async getProjectHierarchy(
    rootProjectId: string = '_Root',
    maxDepth: number = 10
  ): Promise<ProjectHierarchyNode> {
    try {
      const visited = new Set<string>();
      return await this.buildHierarchyNode(rootProjectId, 0, maxDepth, visited, []);
    } catch (error) {
      this.logger.error('Failed to get project hierarchy', { error, rootProjectId });
      throw error;
    }
  }

  /**
   * Get all ancestor projects (path from root)
   */
  async getProjectAncestors(projectId: string): Promise<ManagedProject[]> {
    try {
      const ancestors: ManagedProject[] = [];
      let currentId: string | undefined = projectId;

      while (currentId != null && currentId !== '_Root') {
        // Sequential ancestor traversal to preserve order
        // eslint-disable-next-line no-await-in-loop
        const project = await this.getProject(currentId);
        if (!project) {
          break;
        }

        ancestors.unshift(project); // Add to beginning
        currentId = project.parentProjectId;
      }

      return ancestors;
    } catch (error) {
      this.logger.error('Failed to get project ancestors', { error, projectId });
      throw error;
    }
  }

  /**
   * Get all descendant projects
   */
  async getProjectDescendants(projectId: string, maxDepth: number = 10): Promise<ManagedProject[]> {
    try {
      const descendants: ManagedProject[] = [];
      const visited = new Set<string>();

      await this.collectDescendants(projectId, descendants, 0, maxDepth, visited);

      return descendants;
    } catch (error) {
      this.logger.error('Failed to get project descendants', { error, projectId });
      throw error;
    }
  }

  /**
   * Get single project by ID
   */
  private async getProject(projectId: string): Promise<ManagedProject | null> {
    // Check cache first
    if (this.projectCache.has(projectId)) {
      const cached = this.projectCache.get(projectId) ?? null;
      if (cached) return cached;
    }

    try {
      const response = await this.client.projects.getProject(projectId, this.buildFieldsSpec(true));

      const projectData = (response.data ?? null) as Project | null;
      if (!projectData) {
        return null;
      }

      const project = this.normalizeProject(projectData);
      this.projectCache.set(projectId, project);

      return project;
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number } };
      if (axiosError.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Build hierarchy node recursively
   */
  private async buildHierarchyNode(
    projectId: string,
    level: number,
    maxDepth: number,
    visited: Set<string>,
    path: string[]
  ): Promise<ProjectHierarchyNode> {
    if (visited.has(projectId) || level > maxDepth) {
      throw new Error(`Circular reference or max depth exceeded for project ${projectId}`);
    }

    visited.add(projectId);

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    project.level = level;
    project.path = [...path, projectId];

    const children: ProjectHierarchyNode[] = [];

    if (level < maxDepth) {
      // Get subprojects
      const subprojectsResponse = await this.client.projects.getAllSubprojectsOrdered(
        projectId,
        'id,name'
      );
      const subprojectsData = (subprojectsResponse.data ?? {}) as Projects;
      const subprojects = subprojectsData.project ?? [];

      for (const subproject of subprojects) {
        if (subproject.id != null) {
          // Sequential recursion to avoid wide concurrent calls
          // eslint-disable-next-line no-await-in-loop
          const childNode = await this.buildHierarchyNode(
            subproject.id,
            level + 1,
            maxDepth,
            visited,
            project.path
          );
          children.push(childNode);
        }
      }
    }

    return { project, children };
  }

  /**
   * Collect descendants recursively
   */
  private async collectDescendants(
    projectId: string,
    descendants: ManagedProject[],
    level: number,
    maxDepth: number,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(projectId) || level > maxDepth) {
      return;
    }

    visited.add(projectId);

    const subprojectsResponse = await this.client.projects.getAllSubprojectsOrdered(
      projectId,
      this.buildFieldsSpec(false)
    );
    const subprojectsData = (subprojectsResponse.data ?? {}) as Projects;
    const subprojects = subprojectsData.project ?? [];

    for (const subproject of subprojects) {
      if (subproject.id) {
        const normalized = this.normalizeProject(subproject);
        normalized.level = level + 1;
        descendants.push(normalized);

        // Depth-first collection to maintain ordering; sequential recursion expected
        // eslint-disable-next-line no-await-in-loop
        await this.collectDescendants(subproject.id, descendants, level + 1, maxDepth, visited);
      }
    }
  }

  /**
   * Build locator string for API
   */
  private buildLocator(filters: ProjectFilters): string | undefined {
    const parts: string[] = [];

    if (filters.archived !== undefined) {
      parts.push(`archived:${filters.archived}`);
    }

    if (filters.parentProjectId) {
      parts.push(`affectedProject:(id:${filters.parentProjectId})`);
    }

    return parts.length > 0 ? parts.join(',') : undefined;
  }

  /**
   * Build fields specification
   */
  private buildFieldsSpec(includeStatistics: boolean): string {
    const baseFields = [
      'id',
      'name',
      'parentProjectId',
      'description',
      'webUrl',
      'archived',
      'href',
    ];

    if (includeStatistics) {
      baseFields.push('buildTypes(count)', 'projects(count)', 'parameters(property(name,value))');
    }

    return `project(${baseFields.join(',')})`;
  }

  /**
   * Normalize projects from API response
   */
  private async normalizeProjects(response: Projects): Promise<ManagedProject[]> {
    const projects = response.project ?? [];
    return projects.map((p) => this.normalizeProject(p));
  }

  /**
   * Normalize single project
   */
  private normalizeProject(project: Partial<Project>): ManagedProject {
    const normalized: ManagedProject = {
      id: project.id ?? '',
      name: project.name ?? '',
      parentProjectId: project.parentProjectId,
      description: project.description,
      webUrl: project.webUrl,
      archived: project.archived ?? false,
      href: project.href,
    };

    // Add statistics if present
    if (project.buildTypes?.count !== undefined) {
      normalized.buildTypesCount = project.buildTypes.count;
    }

    if (project.projects?.count !== undefined) {
      normalized.subprojectsCount = project.projects.count;
    }

    // Add parameters if present
    if (project.parameters?.property) {
      normalized.parameters = {};
      for (const param of project.parameters.property) {
        if (param.name != null && param.value != null) {
          normalized.parameters[param.name] = param.value;
        }
      }
    }

    return normalized;
  }

  /**
   * Apply additional filters
   */
  private applyFilters(projects: ManagedProject[], filters: ProjectFilters): ManagedProject[] {
    let filtered = [...projects];

    // Filter by name pattern
    if (filters.namePattern) {
      const pattern = filters.namePattern.toLowerCase();
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
        filtered = filtered.filter((p) => regex.test(p.name));
      } else {
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(pattern));
      }
    }

    // Filter by build presence
    if (filters.hasBuilds !== undefined) {
      filtered = filtered.filter((p) => {
        const hasBuilds = p.buildTypesCount != null && p.buildTypesCount > 0;
        return filters.hasBuilds === true ? hasBuilds : !hasBuilds;
      });
    }

    // Filter by depth level
    if (filters.maxDepth !== undefined && filtered.some((p) => p.level !== undefined)) {
      const maxDepth = filters.maxDepth as number;
      filtered = filtered.filter((p) => p.level === undefined || p.level <= maxDepth);
    }

    return filtered;
  }

  /**
   * Sort projects
   */
  private sortProjects(projects: ManagedProject[], sort: ProjectSort): ManagedProject[] {
    const sorted = [...projects];
    const { by = 'name', order = 'asc' } = sort;

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (by) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'id':
          comparison = a.id.localeCompare(b.id);
          break;
        case 'level':
          comparison = (a.level ?? 0) - (b.level ?? 0);
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
  private paginate(projects: ManagedProject[], pagination: ProjectPagination): PaginatedProjects {
    const { page = 1, pageSize = 50 } = pagination;
    const totalCount = projects.length;
    const totalPages = Math.ceil(totalCount / pageSize);

    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedProjects = projects.slice(startIndex, endIndex);

    return {
      projects: paginatedProjects,
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
   * Clear project cache
   */
  clearCache(): void {
    this.projectCache.clear();
  }
}
