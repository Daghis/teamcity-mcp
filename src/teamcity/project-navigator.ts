/**
 * ProjectNavigator - Advanced project discovery and navigation for TeamCity
 */
import type { Project } from '@/teamcity-client/models/project';
import type { TeamCityClientAdapter } from '@/teamcity/client-adapter';
import { warn } from '@/utils/logger';

export interface ProjectNavigatorParams {
  mode?: 'list' | 'hierarchy' | 'ancestors' | 'descendants';
  projectId?: string;
  rootProjectId?: string;
  filters?: {
    namePattern?: string;
    archived?: boolean;
    hasBuilds?: boolean;
    parentProjectId?: string;
    maxDepth?: number;
  };
  pagination?: {
    page?: number;
    pageSize?: number;
  };
  sort?: {
    by?: 'name' | 'id' | 'level';
    order?: 'asc' | 'desc';
  };
  includeStatistics?: boolean;
  maxDepth?: number;
}

export interface ProjectNavigatorResult {
  success: boolean;
  data?: {
    mode: string;
    projects?: Array<{
      id: string;
      name: string;
      description?: string;
      parentProjectId?: string;
      parentProjectName?: string;
      archived: boolean;
      level: number;
      href?: string;
      webUrl?: string;
      statistics?: {
        buildConfigurationCount?: number;
        vcsRootCount?: number;
        subprojectCount?: number;
        lastActivity?: string;
      };
    }>;
    hierarchy?: HierarchyNode;
    ancestors?: Array<ProjectInfo>;
    descendants?: Array<ProjectInfo>;
    totalCount?: number;
    page?: number;
    pageSize?: number;
    hasMore?: boolean;
    maxDepthReached?: boolean;
    executionTime?: number;
    cached?: boolean;
  };
  error?: string;
}

interface HierarchyNode {
  id: string;
  name: string;
  description?: string;
  archived: boolean;
  children?: HierarchyNode[];
  statistics?: ProjectStatistics;
}

interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  archived?: boolean;
  level?: number;
  parentProjectId?: string;
}

interface ProjectStatistics {
  buildConfigurationCount?: number;
  vcsRootCount?: number;
  subprojectCount?: number;
  lastActivity?: string;
}

interface CacheEntry {
  data: ProjectNavigatorResult['data'];
  timestamp: number;
}

type NavigatorResult = Partial<ProjectNavigatorResult['data']>;

interface HierarchyNodeInternal {
  project: {
    id: string;
    name: string;
    description?: string;
    archived: boolean;
    buildTypesCount?: number;
    subprojectsCount?: number;
  };
  children: HierarchyNodeInternal[];
}

export class ProjectNavigator {
  private readonly client: TeamCityClientAdapter;
  private cache: Map<string, CacheEntry>;
  private readonly cacheTtl = 120000; // 120 seconds

  constructor(client: TeamCityClientAdapter) {
    this.client = client;
    this.cache = new Map();
  }

  async listProjects(params: ProjectNavigatorParams = {}): Promise<ProjectNavigatorResult> {
    const startTime = Date.now();
    const mode = params.mode ?? 'list';

    try {
      // Validate parameters
      const validationError = this.validateParams(params);
      if (validationError) {
        return { success: false, error: validationError };
      }

      // Check cache
      const cacheKey = this.getCacheKey(params);
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult != null) {
        return {
          success: true,
          data: {
            mode: cachedResult.mode ?? 'list',
            ...cachedResult,
            cached: true,
            executionTime: Date.now() - startTime,
          } as ProjectNavigatorResult['data'],
        };
      }

      let result: NavigatorResult;

      switch (mode) {
        case 'hierarchy':
          result = await this.getHierarchy(params);
          break;
        case 'ancestors':
          result = await this.getAncestors(params);
          break;
        case 'descendants':
          result = await this.getDescendants(params);
          break;
        case 'list':
        default:
          result = await this.getList(params);
          break;
      }

      if (!result) {
        throw new Error('Failed to compute project navigation result');
      }
      result.mode = mode;
      result.cached = false;
      result.executionTime = Date.now() - startTime;

      // Cache the result
      this.setCachedResult(cacheKey, result);

      return {
        success: true,
        data: { mode: mode || 'list', ...result } as ProjectNavigatorResult['data'],
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  private async getList(params: ProjectNavigatorParams): Promise<NavigatorResult> {
    // Build locator string for API filtering
    const locatorParts: string[] = [];

    if (params.filters?.namePattern) {
      locatorParts.push(`name:${params.filters.namePattern}`);
    }

    if (params.filters?.archived !== undefined) {
      locatorParts.push(`archived:${params.filters.archived}`);
    }

    if (params.filters?.parentProjectId) {
      locatorParts.push(`parentProject:(id:${params.filters.parentProjectId})`);
    }

    // Add pagination to locator
    if (params.pagination) {
      const page = params.pagination.page ?? 1;
      const pageSize = params.pagination.pageSize ?? 100;
      const start = (page - 1) * pageSize;

      locatorParts.push(`count:${pageSize}`);
      if (start > 0) {
        locatorParts.push(`start:${start}`);
      }
    }

    const locator = locatorParts.length > 0 ? locatorParts.join(',') : undefined;
    const fields = params.includeStatistics
      ? '$long,buildTypes(count),subprojects(count)'
      : '$long';

    // Use the projects API to list all projects
    const response = await this.client.modules.projects.getAllProjects(locator, fields);

    // Get projects from response
    let projects = response.data.project ?? [];

    // Apply sorting if requested
    if (params.sort?.by) {
      projects = this.sortProjects(projects, params.sort.by, params.sort.order ?? 'asc');
    }

    // Don't apply client-side pagination if we already did server-side
    const page = params.pagination?.page ?? 1;
    const pageSize = params.pagination?.pageSize ?? 100;
    const paginatedProjects = projects; // Already paginated by API

    return {
      projects: paginatedProjects.map((p: Project) => ({
        id: p.id ?? '',
        name: p.name ?? '',
        description: p.description,
        parentProjectId: p.parentProjectId,
        archived: p.archived ?? false,
        level: 0, // Would need to calculate based on hierarchy
        href: p.href,
        webUrl: p.webUrl,
        statistics: params.includeStatistics
          ? {
              buildConfigurationCount: p.buildTypes?.count,
              subprojectCount: p.projects?.count,
              vcsRootCount: p.vcsRoots?.count,
            }
          : undefined,
      })),
      totalCount: response.data.count ?? projects.length,
      page,
      pageSize,
      hasMore: paginatedProjects.length === pageSize,
    };
  }

  private async getHierarchy(params: ProjectNavigatorParams): Promise<NavigatorResult> {
    const rootId = params.rootProjectId ?? '_Root';
    const maxDepth = params.maxDepth ?? 5;

    // Recursive function to build hierarchy
    const buildHierarchy = async (
      projectId: string,
      currentDepth = 0,
      visited = new Set<string>()
    ): Promise<HierarchyNodeInternal> => {
      // Prevent circular references
      if (visited.has(projectId)) {
        return {
          project: {
            id: projectId,
            name: `[Circular Reference: ${projectId}]`,
            description: 'Circular reference detected',
            archived: false,
            buildTypesCount: 0,
            subprojectsCount: 0,
          },
          children: [],
        };
      }

      visited.add(projectId);

      try {
        const response = await this.client.modules.projects.getProject(projectId);
        const project = response.data;

        const node = {
          project: {
            id: project.id ?? projectId,
            name: project.name ?? `Unknown Project ${projectId}`,
            description: project.description,
            archived: project.archived ?? false,
            buildTypesCount: project.buildTypes?.count ?? 0,
            subprojectsCount: project.projects?.count ?? 0,
          },
          children: [] as HierarchyNodeInternal[],
        };

        // Load children if not at max depth and has children
        if (currentDepth < maxDepth && project.projects?.project?.length) {
          const childVisited = new Set(visited);
          for (const child of project.projects.project) {
            if (child.id && !visited.has(child.id)) {
              // Sequential recursion to avoid uncontrolled concurrency and maintain order
              // eslint-disable-next-line no-await-in-loop
              const childNode = await buildHierarchy(child.id, currentDepth + 1, childVisited);
              node.children.push(childNode);
            }
          }
        }

        return node;
      } catch (error) {
        // Handle non-existent or inaccessible projects
        return {
          project: {
            id: projectId,
            name: `[Error: ${projectId}]`,
            description: 'Project not accessible or does not exist',
            archived: false,
            buildTypesCount: 0,
            subprojectsCount: 0,
          },
          children: [],
        };
      }
    };

    const hierarchyNode = await buildHierarchy(rootId, 0);
    const hierarchy = this.transformHierarchyNode(hierarchyNode);

    return {
      hierarchy,
      maxDepthReached: params.maxDepth
        ? this.checkMaxDepthReached(hierarchyNode, params.maxDepth)
        : false,
    };
  }

  private async getAncestors(params: ProjectNavigatorParams): Promise<NavigatorResult> {
    if (!params.projectId) {
      throw new Error('projectId is required for ancestors mode');
    }

    const ancestors: ProjectInfo[] = [];
    let currentProjectId = params.projectId;
    const visited = new Set<string>();

    // First verify the target project exists and save it
    let targetProject: Project;
    try {
      const targetResponse = await this.client.modules.projects.getProject(currentProjectId);
      if (targetResponse.data == null) {
        throw new Error(`Project not found: ${params.projectId}`);
      }
      targetProject = targetResponse.data;
      currentProjectId = targetResponse.data.parentProjectId ?? '_Root';
    } catch (error) {
      throw new Error(`Project not found: ${params.projectId}`);
    }

    // Always add root project first
    ancestors.push({
      id: '_Root',
      name: '<Root project>',
      description: 'Root project',
      archived: false,
      level: 0,
      parentProjectId: undefined,
    });

    // Walk up the parent chain (excluding root since we already added it)
    while (currentProjectId && currentProjectId !== '_Root' && !visited.has(currentProjectId)) {
      visited.add(currentProjectId);

      try {
        // Sequential parent traversal up the chain
        // eslint-disable-next-line no-await-in-loop
        const response = await this.client.modules.projects.getProject(currentProjectId);
        const project = response.data;

        if (project != null) {
          ancestors.push({
            id: project.id ?? currentProjectId,
            name: project.name ?? `Unknown Project ${currentProjectId}`,
            description: project.description,
            archived: project.archived ?? false,
            level: ancestors.length,
            parentProjectId: project.parentProjectId,
          });

          currentProjectId = project.parentProjectId ?? '_Root';
        } else {
          break;
        }
      } catch (error) {
        // Stop if we can't find a parent
        break;
      }
    }

    // Add the target project itself at the end
    ancestors.push({
      id: targetProject.id ?? params.projectId,
      name: targetProject.name ?? `Unknown Project ${params.projectId}`,
      description: targetProject.description,
      archived: targetProject.archived ?? false,
      level: ancestors.length,
      parentProjectId: targetProject.parentProjectId,
    });

    return { ancestors };
  }

  private async getDescendants(params: ProjectNavigatorParams): Promise<NavigatorResult> {
    if (!params.projectId) {
      throw new Error('projectId is required for descendants mode');
    }

    const maxDepth = params.maxDepth ?? 5;
    const descendants: ProjectInfo[] = [];
    const visited = new Set<string>();

    // First verify the target project exists
    try {
      const targetResponse = await this.client.modules.projects.getProject(params.projectId);
      if (targetResponse.data == null) {
        throw new Error(`Project not found: ${params.projectId}`);
      }
    } catch (error) {
      throw new Error(`Project not found: ${params.projectId}`);
    }

    // Recursive function to collect all descendants
    const collectDescendants = async (
      projectId: string,
      currentDepth = 0,
      parentLevel = 0
    ): Promise<void> => {
      if (currentDepth >= maxDepth || visited.has(projectId)) {
        return;
      }

      visited.add(projectId);

      try {
        const response = await this.client.modules.projects.getProject(projectId);
        const project = response.data;

        if (project?.projects?.project?.length) {
          for (const child of project.projects.project) {
            if (child.id && !visited.has(child.id)) {
              try {
                // Get full child project details
                // eslint-disable-next-line no-await-in-loop
                const childResponse = await this.client.modules.projects.getProject(child.id);
                const childProject = childResponse.data;

                if (childProject != null) {
                  descendants.push({
                    id: childProject.id ?? child.id,
                    name: childProject.name ?? child.name ?? `Unknown Project ${child.id}`,
                    description: childProject.description,
                    archived: childProject.archived ?? false,
                    level: parentLevel + 1,
                    parentProjectId: projectId,
                  });

                  // Recursively collect children of this child
                  // eslint-disable-next-line no-await-in-loop
                  await collectDescendants(child.id, currentDepth + 1, parentLevel + 1);
                }
              } catch (childError) {
                // Skip children we can't access, but don't stop the whole operation
                warn(`Could not access child project ${child.id}:`, { error: childError });
              }
            }
          }
        }
      } catch (error) {
        // Skip projects we can't access
        warn(`Could not access project ${projectId}:`, { error });
      }
    };

    await collectDescendants(params.projectId, 0, 0);

    return {
      descendants,
      maxDepthReached: maxDepth > 0 && descendants.some((p) => p.level === maxDepth),
    };
  }

  /**
   * Transform domain hierarchy node to navigator format
   */
  private transformHierarchyNode(node: HierarchyNodeInternal): HierarchyNode {
    const transformed: HierarchyNode = {
      id: node.project.id,
      name: node.project.name,
      description: node.project.description,
      archived: node.project.archived,
      children: [], // Always include children array
    };

    if (node.project.buildTypesCount ?? node.project.subprojectsCount) {
      transformed.statistics = {
        buildConfigurationCount: node.project.buildTypesCount,
        subprojectCount: node.project.subprojectsCount,
      };
    }

    // Add children if they exist
    if (node.children != null && node.children.length > 0) {
      transformed.children = node.children.map((child) => this.transformHierarchyNode(child));
    }

    return transformed;
  }

  /**
   * Transform domain project to project info format
   */
  private transformToProjectInfo(project: Project & { level?: number }): ProjectInfo {
    return {
      id: project.id ?? '',
      name: project.name ?? '',
      description: project.description,
      archived: project.archived,
      level: project.level,
      parentProjectId: project.parentProjectId,
    };
  }

  /**
   * Check if max depth was reached in hierarchy
   */
  private checkMaxDepthReached(
    node: HierarchyNodeInternal,
    maxDepth: number,
    currentDepth = 0
  ): boolean {
    if (currentDepth >= maxDepth) {
      return true;
    }
    if (node.children != null && node.children.length > 0) {
      return node.children.some((child) =>
        this.checkMaxDepthReached(child, maxDepth, currentDepth + 1)
      );
    }
    return false;
  }

  private validateParams(params: ProjectNavigatorParams): string | null {
    if (params.pagination) {
      if (params.pagination.page && params.pagination.page < 1) {
        return 'Invalid pagination: page must be >= 1';
      }
      if (params.pagination.pageSize) {
        if (params.pagination.pageSize < 1 || params.pagination.pageSize > 1000) {
          return 'Invalid pagination: pageSize must be between 1 and 1000';
        }
      }
    }

    if (params.mode === 'ancestors' && !params.projectId) {
      return 'projectId is required for ancestors mode';
    }

    if (params.mode === 'descendants' && !params.projectId) {
      return 'projectId is required for descendants mode';
    }

    return null;
  }

  private getCacheKey(params: ProjectNavigatorParams): string {
    return JSON.stringify(params);
  }

  private getCachedResult(key: string): NavigatorResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.cacheTtl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCachedResult(key: string, data: NavigatorResult): void {
    this.cache.set(key, {
      data: data as ProjectNavigatorResult['data'],
      timestamp: Date.now(),
    });

    // Clean old entries
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (let i = 0; i < 50 && i < entries.length; i++) {
        this.cache.delete(entries[i]?.[0] ?? '');
      }
    }
  }

  private sortProjects<T extends { name?: string; id?: string; level?: number }>(
    projects: T[],
    sortBy: string,
    order: 'asc' | 'desc'
  ): T[] {
    const sorted = [...projects];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = (a.name ?? '').localeCompare(b.name ?? '');
          break;
        case 'id':
          comparison = (a.id ?? '').localeCompare(b.id ?? '');
          break;
        case 'level':
          comparison = (a.level ?? 0) - (b.level ?? 0);
          break;
        default:
          comparison = 0;
      }

      return order === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }

  private formatError(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const err = error as { response?: { status?: number }; message?: string };
      if (err.response?.status === 401) {
        return 'Authentication failed: Please check your TeamCity token';
      }
      if (err.response?.status === 403) {
        return "Permission denied: You don't have access to these projects";
      }
      if (err.response?.status === 404) {
        return 'Not found: The requested project does not exist';
      }
      if (err.message) {
        return err.message;
      }
    }
    return 'An unexpected error occurred';
  }
}
