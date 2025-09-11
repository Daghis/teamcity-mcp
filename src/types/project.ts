/**
 * Project-related type definitions for TeamCity
 */

/**
 * Metadata for a TeamCity project
 */
export interface ProjectMetadata {
  /** The public project ID */
  id: string;

  /** The public project name */
  name: string;

  /** Optional project description */
  description?: string;

  /** REST API link to this project */
  href: string;

  /** Web URL for viewing the project in TeamCity UI */
  webUrl: string;

  /** Parent project ID, or '_Root' for top-level projects */
  parentProjectId: string;

  /** Whether the project is archived */
  archived: boolean;

  /** Number of build configurations in this project */
  buildTypesCount?: number;

  /** Number of subprojects */
  subprojectsCount?: number;

  /** Depth in the project hierarchy (0 for root, 1 for top-level, etc.) */
  depth?: number;
}

/**
 * Hierarchy information for a project
 */
export interface ProjectHierarchy {
  /** Parent project information */
  parentProject?: {
    id: string;
    name: string;
    href?: string;
  };

  /** List of ancestor projects from immediate parent to root */
  ancestorProjects?: Array<{
    id: string;
    name: string;
    href?: string;
  }>;

  /** Child projects (direct descendants only) */
  childProjects?: Array<{
    id: string;
    name: string;
    href?: string;
    buildTypesCount?: number;
  }>;
}

/**
 * Complete project information including metadata and hierarchy
 */
export interface ProjectInfo extends ProjectMetadata, ProjectHierarchy {
  /** Additional project features if requested */
  features?: Array<{
    type: string;
    properties?: Record<string, string>;
  }>;

  /** Project parameters if requested */
  parameters?: Record<string, string>;
}

/**
 * Parameters for listing projects
 */
export interface ProjectListParams {
  /** Filter by project name (supports wildcards) */
  name?: string;

  /** Filter by archived status */
  archived?: boolean;

  /** Filter by parent project ID */
  parentProjectId?: string;

  /** Include hierarchy information */
  includeHierarchy?: boolean;

  /** Pagination: number of results to return */
  limit?: number;

  /** Pagination: offset for results */
  offset?: number;
}

/**
 * Result of a project list operation
 */
export interface ProjectListResult {
  /** List of projects matching the criteria */
  projects: ProjectInfo[];

  /** Metadata about the result set */
  metadata: {
    /** Number of projects in this response */
    count: number;

    /** Offset used for this query */
    offset: number;

    /** Limit used for this query */
    limit: number;

    /** Whether more results are available */
    hasMore: boolean;

    /** Total count of matching projects (if available) */
    totalCount?: number;
  };
}
