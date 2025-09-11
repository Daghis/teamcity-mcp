/**
 * ProjectListManager - Handles TeamCity project listing operations
 */
import type { Project } from '@/teamcity-client/models/project';
import type { Projects } from '@/teamcity-client/models/projects';
import type { TeamCityClient } from '@/teamcity/client';
import type { ProjectInfo, ProjectListParams, ProjectListResult } from '@/types/project';

export type { ProjectListParams, ProjectInfo };

export class ProjectListManager {
  private client: TeamCityClient;

  constructor(client: TeamCityClient) {
    this.client = client;
  }

  /**
   * List projects with optional filtering and pagination
   */
  async listProjects(params: ProjectListParams = {}): Promise<ProjectListResult> {
    const {
      name,
      archived,
      parentProjectId,
      includeHierarchy = false,
      limit = 100,
      offset = 0,
    } = params;

    // Build TeamCity locator string
    const locator = this.buildLocator({
      name,
      archived,
      parentProjectId,
      offset,
      limit,
    });

    try {
      // Call TeamCity API
      const response = await this.client.projects.getAllProjects(
        locator,
        this.buildFieldsString(includeHierarchy)
      );

      // Extract data from AxiosResponse
      const projectsData = response.data;

      // Transform response to our format
      const projects = this.transformProjects(projectsData, includeHierarchy);

      // Build metadata
      const metadata = {
        count: projects.length,
        offset,
        limit,
        hasMore: this.hasMoreResults(projectsData, limit),
        totalCount: projectsData.count,
      };

      return { projects, metadata };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  /**
   * Build TeamCity locator string from parameters
   */
  private buildLocator(params: {
    name?: string;
    archived?: boolean;
    parentProjectId?: string;
    offset: number;
    limit: number;
  }): string {
    const parts: string[] = [];

    if (params.name != null && params.name !== '') {
      // Support wildcards in name search
      parts.push(`name:${params.name}`);
    }

    if (params.archived !== undefined) {
      parts.push(`archived:${params.archived}`);
    }

    if (params.parentProjectId != null && params.parentProjectId !== '') {
      parts.push(`parent:(id:${params.parentProjectId})`);
    }

    // Add pagination
    parts.push(`start:${params.offset}`);
    parts.push(`count:${params.limit}`);

    return parts.join(',');
  }

  /**
   * Build fields string for API request
   */
  private buildFieldsString(includeHierarchy: boolean): string {
    const baseFields = [
      'count',
      'project(id,name,description,href,webUrl,parentProjectId,archived)',
      'project(buildTypes(count))',
      'project(projects(count))',
    ];

    if (includeHierarchy) {
      baseFields.push('project(parentProject(id,name,href))');
      baseFields.push('project(projects(project(id,name,href,buildTypes(count))))');
      // Request ancestor projects for full hierarchy chain
      baseFields.push('project(ancestorProjects(project(id,name,href)))');
    }

    return baseFields.join(',');
  }

  /**
   * Transform TeamCity API response to our format
   */
  private transformProjects(response: Projects, includeHierarchy: boolean): ProjectInfo[] {
    if (!response.project || response.project.length === 0) {
      return [];
    }

    return response.project.map((project) => this.transformProject(project, includeHierarchy));
  }

  /**
   * Transform a single project
   */
  private transformProject(project: Project, includeHierarchy: boolean): ProjectInfo {
    const info: ProjectInfo = {
      id: project.id ?? '',
      name: project.name ?? '',
      description: project.description,
      href: project.href ?? '',
      webUrl: project.webUrl ?? '',
      parentProjectId: project.parentProjectId ?? '_Root',
      archived: project.archived ?? false,
      buildTypesCount: this.getBuildTypesCount(project),
      subprojectsCount: this.getSubprojectsCount(project),
    };

    if (includeHierarchy && project.parentProject != null) {
      info.parentProject = {
        id: project.parentProject.id ?? '',
        name: project.parentProject.name ?? '',
        href: project.parentProject.href,
      };
    }

    if (includeHierarchy && project.ancestorProjects?.project != null) {
      info.ancestorProjects = project.ancestorProjects.project.map((ancestor) => ({
        id: ancestor.id ?? '',
        name: ancestor.name ?? '',
        href: ancestor.href,
      }));
    }

    if (includeHierarchy && project.projects?.project != null) {
      info.childProjects = project.projects.project.map((child) => ({
        id: child.id ?? '',
        name: child.name ?? '',
        href: child.href,
        buildTypesCount: this.getBuildTypesCount(child),
      }));
    }

    // Calculate depth based on parent chain
    info.depth = this.calculateDepth(project);

    return info;
  }

  /**
   * Get build types count from project
   */
  private getBuildTypesCount(project: Project): number {
    if (project.buildTypes?.count !== undefined) {
      return project.buildTypes.count;
    }
    if (project.buildTypes?.buildType != null) {
      return project.buildTypes.buildType.length;
    }
    return 0;
  }

  /**
   * Get subprojects count from project
   */
  private getSubprojectsCount(project: Project): number {
    if (project.projects?.count !== undefined) {
      return project.projects.count;
    }
    if (project.projects?.project != null) {
      return project.projects.project.length;
    }
    return 0;
  }

  /**
   * Calculate project depth in hierarchy
   */
  private calculateDepth(project: Project): number {
    if (project.parentProjectId == null || project.parentProjectId === '_Root') {
      return 1;
    }

    // If we have ancestor projects, use their count + 1
    if (project.ancestorProjects?.project != null) {
      return project.ancestorProjects.project.length + 1;
    }

    // Otherwise, we know it has a parent, so at least depth 2
    return 2;
  }

  /**
   * Check if more results are available
   */
  private hasMoreResults(response: Projects, limit: number): boolean {
    if (response.count == null) {
      return false;
    }

    const returnedCount = response.project?.length ?? 0;
    return returnedCount === limit && response.count > returnedCount;
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: unknown): Error {
    if (this.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message ?? error.message ?? 'Unknown error';

      if (status === 401) {
        throw new Error(`Authentication failed: ${message}. Please check your TeamCity token.`);
      }
      if (status === 403) {
        throw new Error(`Permission denied: ${message}. You don't have access to these projects.`);
      }
      if (status === 404) {
        throw new Error(`Not found: ${message}`);
      }

      throw new Error(`TeamCity API error (${status ?? 'unknown'}): ${message}`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(`Unknown error: ${String(error)}`);
  }

  private isAxiosError(
    error: unknown
  ): error is { response?: { status?: number; data?: { message?: string } }; message?: string } {
    return error !== null && typeof error === 'object' && 'response' in error;
  }
}
