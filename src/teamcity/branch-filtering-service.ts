/**
 * Branch Filtering and Pagination Service for TeamCity
 *
 * Provides comprehensive filtering, sorting, and pagination capabilities
 * for branch discovery results, with intelligent prioritization of active branches.
 */
import type { Logger } from 'winston';

/**
 * Extended BranchInfo with proper Date types for filtering
 */
export interface BranchInfo {
  name: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  buildCount: number;
  lastBuild?: {
    id: string;
    number: string;
    status: string;
    date: Date | string;
    webUrl?: string;
  };
  firstSeenDate?: Date | string;
  lastActivityDate?: Date | string;
  vcsRoot?: {
    id: string;
    name: string;
    url: string;
  };
}

/**
 * Options for filtering branches
 */
export interface BranchFilterOptions {
  /** Pattern to match branch names (supports wildcards and regex) */
  namePattern?: string;
  /** Case-insensitive pattern matching */
  caseInsensitive?: boolean;
  /** Only return active branches */
  onlyActive?: boolean;
  /** Only return default branches */
  onlyDefault?: boolean;
  /** Branches active since this date */
  activeSince?: Date;
  /** Branches active before this date */
  activeBefore?: Date;
  /** Minimum number of builds */
  minBuildCount?: number;
  /** Filter by last build status */
  lastBuildStatus?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
}

/**
 * Options for sorting branches
 */
export interface BranchSortOptions {
  /** Field to sort by */
  sortBy?: 'name' | 'activity' | 'buildCount' | 'status';
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
  /** Put default branch first regardless of sorting */
  defaultFirst?: boolean;
}

/**
 * Options for paginating branches
 */
export interface BranchPaginationOptions {
  /** Page number (1-based) */
  page?: number;
  /** Number of items per page */
  pageSize?: number;
  /** Prioritize active branches in results */
  prioritizeActive?: boolean;
}

/**
 * Paginated result of branches
 */
export interface PaginatedBranches {
  /** Branches for current page */
  branches: BranchInfo[];
  /** Total number of branches (before pagination) */
  totalCount: number;
  /** Current page number */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there are more pages */
  hasMore: boolean;
}

export class BranchFilteringService {
  private readonly defaultPageSize = 20;

  constructor(private readonly logger: Logger) {}

  /**
   * Filter branches based on provided options
   */
  filterBranches(branches: BranchInfo[], options: BranchFilterOptions): BranchInfo[] {
    let filtered = [...branches];

    // Apply name pattern filter
    if (options.namePattern) {
      filtered = this.filterByNamePattern(filtered, options.namePattern, options.caseInsensitive);
    }

    // Apply activity filters
    if (options.onlyActive !== undefined) {
      filtered = filtered.filter((b) => b.isActive === options.onlyActive);
    }

    if (options.onlyDefault !== undefined) {
      filtered = filtered.filter((b) => b.isDefault === options.onlyDefault);
    }

    if (options.activeSince != null) {
      const activeSince = options.activeSince;
      filtered = filtered.filter((b) => {
        if (b.lastActivityDate == null) {
          return false;
        }
        const activityDate = this.toDate(b.lastActivityDate);
        return activityDate != null && activeSince != null && activityDate >= activeSince;
      });
    }

    if (options.activeBefore != null) {
      const activeBefore = options.activeBefore;
      filtered = filtered.filter((b) => {
        if (b.lastActivityDate == null) {
          return false;
        }
        const activityDate = this.toDate(b.lastActivityDate);
        return activityDate != null && activeBefore != null && activityDate < activeBefore;
      });
    }

    if (options.minBuildCount !== undefined) {
      const minBuildCount = options.minBuildCount as number;
      filtered = filtered.filter((b) => b.buildCount >= minBuildCount);
    }

    // Apply status filter
    if (options.lastBuildStatus) {
      filtered = filtered.filter((b) => b.lastBuild?.status === options.lastBuildStatus);
    }

    this.logger.debug('Filtered branches', {
      originalCount: branches.length,
      filteredCount: filtered.length,
      options,
    });

    return filtered;
  }

  /**
   * Sort branches based on provided options
   */
  sortBranches(
    branches: BranchInfo[],
    sortBy: BranchSortOptions['sortBy'] = 'name',
    sortOrder: BranchSortOptions['sortOrder'] = 'asc',
    defaultFirst: boolean = false
  ): BranchInfo[] {
    const sorted = [...branches];

    // Define sort comparators
    const comparators: Record<string, (a: BranchInfo, b: BranchInfo) => number> = {
      name: (a, b) => a.displayName.localeCompare(b.displayName),
      activity: (a, b) => {
        const aDate = this.toDate(a.lastActivityDate)?.getTime() ?? 0;
        const bDate = this.toDate(b.lastActivityDate)?.getTime() ?? 0;
        return bDate - aDate; // More recent first
      },
      buildCount: (a, b) => b.buildCount - a.buildCount, // Higher count first
      status: (a, b) => {
        const statusOrder: Record<string, number> = {
          SUCCESS: 0,
          UNKNOWN: 1,
          ERROR: 2,
          FAILURE: 3,
        };
        const aStatus = a.lastBuild?.status ?? 'UNKNOWN';
        const bStatus = b.lastBuild?.status ?? 'UNKNOWN';
        return (statusOrder[aStatus] ?? 99) - (statusOrder[bStatus] ?? 99);
      },
    };

    const comparator = comparators[sortBy] ?? comparators['name'];

    sorted.sort((a, b) => {
      // Default branch always first if requested
      if (defaultFirst) {
        if (a.isDefault && !b.isDefault) {
          return -1;
        }
        if (!a.isDefault && b.isDefault) {
          return 1;
        }
      }

      const result = comparator ? comparator(a, b) : 0;
      return sortOrder === 'desc' && sortBy === 'name'
        ? -result
        : sortOrder === 'asc' && sortBy !== 'name'
          ? -result
          : result;
    });

    return sorted;
  }

  /**
   * Paginate branches with optional intelligent prioritization
   */
  paginateBranches(branches: BranchInfo[], options: BranchPaginationOptions): PaginatedBranches {
    const page = Math.max(1, options.page ?? 1);
    const pageSize =
      options.pageSize && options.pageSize > 0 ? options.pageSize : this.defaultPageSize;

    let branchesToPaginate = [...branches];

    // Apply intelligent prioritization if requested
    if (options.prioritizeActive) {
      branchesToPaginate = this.prioritizeBranches(branchesToPaginate);
    }

    const totalCount = branchesToPaginate.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    const paginatedBranches = branchesToPaginate.slice(startIndex, endIndex);

    return {
      branches: paginatedBranches,
      totalCount,
      currentPage: page,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  /**
   * Apply filters, sorting, and pagination in one operation
   */
  applyFiltersAndPagination(
    branches: BranchInfo[],
    filterOptions: BranchFilterOptions,
    sortOptions: BranchSortOptions,
    paginationOptions: BranchPaginationOptions
  ): PaginatedBranches {
    // Step 1: Filter
    let result = this.filterBranches(branches, filterOptions);

    // Step 2: Sort
    const shouldSort = sortOptions.sortBy != null ? true : sortOptions.defaultFirst === true;
    if (shouldSort) {
      result = this.sortBranches(
        result,
        sortOptions.sortBy,
        sortOptions.sortOrder,
        sortOptions.defaultFirst
      );
    }

    // Step 3: Paginate
    return this.paginateBranches(result, paginationOptions);
  }

  /**
   * Filter branches by name pattern (supports wildcards and regex)
   */
  private filterByNamePattern(
    branches: BranchInfo[],
    pattern: string,
    caseInsensitive?: boolean
  ): BranchInfo[] {
    // Check if pattern is a regex (enclosed in /)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regexPattern = pattern.slice(1, -1);
        const flags = caseInsensitive ? 'i' : '';
        const regex = new RegExp(regexPattern, flags);
        return branches.filter((b) => regex.test(b.displayName));
      } catch (error) {
        this.logger.warn('Invalid regex pattern, falling back to no filtering', {
          pattern,
          error,
        });
        return branches;
      }
    }

    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // Replace * with .*

    // Handle case sensitivity
    const flags = caseInsensitive ? 'i' : '';

    try {
      const regex = new RegExp(`^${regexPattern}$`, flags);
      return branches.filter((b) => regex.test(b.displayName));
    } catch (error) {
      this.logger.warn('Pattern conversion failed, falling back to simple contains', {
        pattern,
        error,
      });

      // Fallback to simple contains check
      const searchStr = caseInsensitive ? pattern.toLowerCase() : pattern;
      return branches.filter((b) => {
        const name = caseInsensitive ? b.displayName.toLowerCase() : b.displayName;
        return name.includes(searchStr.replace(/\*/g, ''));
      });
    }
  }

  /**
   * Prioritize branches for intelligent pagination
   * Orders by: default first, then active by recency, then inactive
   */
  private prioritizeBranches(branches: BranchInfo[]): BranchInfo[] {
    return [...branches].sort((a, b) => {
      // Default branch always first
      if (a.isDefault && !b.isDefault) {
        return -1;
      }
      if (!a.isDefault && b.isDefault) {
        return 1;
      }

      // Active branches before inactive
      if (a.isActive && !b.isActive) {
        return -1;
      }
      if (!a.isActive && b.isActive) {
        return 1;
      }

      // Within active/inactive groups, sort by last activity
      const aDate = this.toDate(a.lastActivityDate)?.getTime() ?? 0;
      const bDate = this.toDate(b.lastActivityDate)?.getTime() ?? 0;
      return bDate - aDate;
    });
  }

  /**
   * Convert a date string or Date object to Date
   */
  private toDate(date: Date | string | undefined): Date | undefined {
    if (date == null) {
      return undefined;
    }
    if (date instanceof Date) {
      return date;
    }
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
