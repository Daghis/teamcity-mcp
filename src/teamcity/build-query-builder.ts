/**
 * BuildQueryBuilder - Constructs TeamCity build locators
 */

export type BuildStatus = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';

interface BuildFilters {
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
  count?: number;
  start?: number;
}

export class BuildQueryBuilder {
  private filters: BuildFilters = {};
  private static readonly validStatuses: Set<string> = new Set([
    'SUCCESS',
    'FAILURE',
    'ERROR',
    'UNKNOWN',
  ]);
  private static readonly specialCharsRegex = /[:(),]/;

  /**
   * Reset builder state
   */
  reset(): BuildQueryBuilder {
    this.filters = {};
    return this;
  }

  /**
   * Filter by project ID
   */
  withProject(projectId: string | undefined): BuildQueryBuilder {
    if (projectId !== undefined) {
      this.filters.project = projectId;
    }
    return this;
  }

  /**
   * Filter by build type (configuration) ID
   */
  withBuildType(buildTypeId: string | undefined): BuildQueryBuilder {
    if (buildTypeId !== undefined) {
      this.filters.buildType = buildTypeId;
    }
    return this;
  }

  /**
   * Filter by build status
   */
  withStatus(status: BuildStatus | undefined): BuildQueryBuilder {
    if (status !== undefined) {
      if (!BuildQueryBuilder.validStatuses.has(status)) {
        throw new Error(`Invalid status value: ${status}`);
      }
      this.filters.status = status;
    }
    return this;
  }

  /**
   * Filter by VCS branch (supports wildcards)
   */
  withBranch(branch: string | undefined): BuildQueryBuilder {
    if (branch !== undefined) {
      this.filters.branch = branch;
    }
    return this;
  }

  /**
   * Filter by build tag (supports wildcards)
   */
  withTag(tag: string | undefined): BuildQueryBuilder {
    if (tag !== undefined) {
      this.filters.tag = tag;
    }
    return this;
  }

  /**
   * Filter builds since a specific date
   */
  withSinceDate(date: string | undefined): BuildQueryBuilder {
    if (date !== undefined) {
      this.filters.sinceDate = date;
    }
    return this;
  }

  /**
   * Filter builds until a specific date
   */
  withUntilDate(date: string | undefined): BuildQueryBuilder {
    if (date !== undefined) {
      this.filters.untilDate = date;
    }
    return this;
  }

  /**
   * Filter builds since a specific build ID
   */
  withSinceBuild(buildId: number | undefined): BuildQueryBuilder {
    if (buildId !== undefined) {
      this.filters.sinceBuild = buildId;
    }
    return this;
  }

  /**
   * Include/exclude running builds
   */
  withRunning(running: boolean | undefined): BuildQueryBuilder {
    if (running !== undefined) {
      this.filters.running = running;
    }
    return this;
  }

  /**
   * Include/exclude canceled builds
   */
  withCanceled(canceled: boolean | undefined): BuildQueryBuilder {
    if (canceled !== undefined) {
      this.filters.canceled = canceled;
    }
    return this;
  }

  /**
   * Include/exclude personal builds
   */
  withPersonal(personal: boolean | undefined): BuildQueryBuilder {
    if (personal !== undefined) {
      this.filters.personal = personal;
    }
    return this;
  }

  /**
   * Include/exclude failed-to-start builds
   */
  withFailedToStart(failedToStart: boolean | undefined): BuildQueryBuilder {
    if (failedToStart !== undefined) {
      this.filters.failedToStart = failedToStart;
    }
    return this;
  }

  /**
   * Set maximum number of results
   */
  withCount(count: number | undefined): BuildQueryBuilder {
    if (count !== undefined) {
      if (count < 1 || count > 10000) {
        throw new Error('Count must be between 1 and 10000');
      }
      this.filters.count = count;
    }
    return this;
  }

  /**
   * Set result offset for pagination
   */
  withStart(start: number | undefined): BuildQueryBuilder {
    if (start !== undefined) {
      if (start < 0) {
        throw new Error('Start offset must be non-negative');
      }
      this.filters.start = start;
    }
    return this;
  }

  /**
   * Build the locator string
   */
  build(): string {
    this.validate();

    const parts: string[] = [];

    // Add string filters with escaping
    if (this.filters.project) {
      parts.push(this.formatFilter('project', this.filters.project));
    }
    if (this.filters.buildType) {
      parts.push(this.formatFilter('buildType', this.filters.buildType));
    }
    if (this.filters.status) {
      parts.push(`status:${this.filters.status}`);
    }
    if (this.filters.branch) {
      parts.push(this.formatFilter('branch', this.filters.branch));
    }
    if (this.filters.tag) {
      parts.push(this.formatFilter('tag', this.filters.tag));
    }

    // Add date filters with conversion
    if (this.filters.sinceDate) {
      const tcDate = this.convertToTeamCityDate(this.filters.sinceDate);
      parts.push(`sinceDate:${tcDate}`);
    }
    if (this.filters.untilDate) {
      const tcDate = this.convertToTeamCityDate(this.filters.untilDate);
      parts.push(`untilDate:${tcDate}`);
    }

    // Add numeric filters
    if (this.filters.sinceBuild !== undefined) {
      parts.push(`sinceBuild:${this.filters.sinceBuild}`);
    }

    // Add boolean filters
    if (this.filters.running !== undefined) {
      parts.push(`running:${this.filters.running}`);
    }
    if (this.filters.canceled !== undefined) {
      parts.push(`canceled:${this.filters.canceled}`);
    }
    if (this.filters.personal !== undefined) {
      parts.push(`personal:${this.filters.personal}`);
    }
    if (this.filters.failedToStart !== undefined) {
      parts.push(`failedToStart:${this.filters.failedToStart}`);
    }

    // Add pagination
    if (this.filters.count !== undefined) {
      parts.push(`count:${this.filters.count}`);
    }
    if (this.filters.start !== undefined) {
      parts.push(`start:${this.filters.start}`);
    }

    return parts.join(',');
  }

  /**
   * Format a filter with proper escaping
   */
  private formatFilter(key: string, value: string): string {
    // Check if value needs escaping (contains special chars but not wildcards at expected positions)
    if (this.needsEscaping(value)) {
      return `${key}:(${value})`;
    }
    return `${key}:${value}`;
  }

  /**
   * Check if a value needs escaping
   */
  private needsEscaping(value: string): boolean {
    const containsWildcard = value.includes('*');

    if (/\s/.test(value)) {
      return true;
    }

    if (BuildQueryBuilder.specialCharsRegex.test(value)) {
      return true;
    }

    if (value.includes('/')) {
      return !containsWildcard;
    }

    return false;
  }

  /**
   * Convert ISO date to TeamCity format
   */
  private convertToTeamCityDate(dateStr: string): string {
    try {
      // Handle date-only format (YYYY-MM-DD)
      let dateString = dateStr;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateString = `${dateStr}T00:00:00Z`;
      }

      const date = new Date(dateString);

      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format');
      }

      // Format: yyyyMMdd'T'HHmmss+ZZZZ
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');

      return `${year}${month}${day}T${hours}${minutes}${seconds}+0000`;
    } catch (error) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }
  }

  /**
   * Validate filter combinations
   */
  private validate(): void {
    // Validate date range
    if (this.filters.sinceDate && this.filters.untilDate) {
      const since = new Date(this.filters.sinceDate);
      const until = new Date(this.filters.untilDate);

      if (since >= until) {
        throw new Error('sinceDate must be before untilDate');
      }
    }
  }
}
