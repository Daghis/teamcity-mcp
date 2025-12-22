/**
 * Build Status Manager for TeamCity
 * Handles querying and monitoring build status information
 */
import type { TeamCityClientAdapter } from './client-adapter';
import { BuildAccessDeniedError, BuildNotFoundError } from './errors';

/**
 * Check if an error is an Axios 404 response
 */
function isAxios404(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
}

/**
 * Check if an error is an Axios 403 response
 */
function isAxios403(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 403
  );
}

/**
 * Options for querying build status
 */
export interface BuildStatusOptions {
  buildId?: string;
  buildNumber?: string;
  buildTypeId?: string;
  branch?: string;
  includeTests?: boolean;
  includeProblems?: boolean;
  forceRefresh?: boolean;
}

/**
 * Build status result
 */
export interface BuildStatusResult {
  buildId: string;
  buildNumber?: string;
  buildTypeId?: string;
  state: 'queued' | 'running' | 'finished' | 'failed' | 'canceled';
  status?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
  statusText?: string;
  percentageComplete: number;
  currentStageText?: string;
  branchName?: string;
  webUrl?: string;
  queuedDate?: Date;
  startDate?: Date;
  finishDate?: Date;
  elapsedSeconds?: number;
  estimatedTotalSeconds?: number;
  estimatedStartTime?: Date;
  queuePosition?: number;
  waitReason?: string;
  failureReason?: string;
  canceledBy?: string;
  canceledDate?: Date;
  testSummary?: TestSummary;
  problems?: BuildProblem[];
}

/**
 * Test execution summary
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  ignored: number;
  muted?: number;
  newFailed?: number;
}

/**
 * Build problem information
 */
export interface BuildProblem {
  type: string;
  identity: string;
  description: string;
}

type BuildApiBuild = {
  id?: string | number;
  number?: string;
  state?: string;
  status?: string;
  statusText?: string;
  buildTypeId?: string;
  branchName?: string;
  webUrl?: string;
  percentageComplete?: number;
  queuedDate?: string;
  startDate?: string;
  finishDate?: string;
  canceled?: boolean;
  failureReason?: string;
  testOccurrences?: {
    count?: number;
    passed?: number;
    failed?: number;
    ignored?: number;
    muted?: number;
    newFailed?: number;
  };
  problemOccurrences?: {
    problemOccurrence?: Array<{
      type?: string;
      identity?: string;
      details?: string;
      description?: string;
    }>;
  };
  'running-info'?: {
    currentStageText?: string;
    elapsedSeconds?: number;
    estimatedTotalSeconds?: number;
    percentageComplete?: number;
  };
  'queued-info'?: {
    position?: number;
    estimatedStartTime?: string;
  };
  canceledInfo?: {
    user?: { username?: string };
    timestamp?: string;
  };
};

/**
 * Cache entry for build status
 */
interface CacheEntry {
  result: BuildStatusResult;
  timestamp: number;
}

/**
 * Build Status Manager implementation
 */
export class BuildStatusManager {
  private client: TeamCityClientAdapter;
  private cache: Map<string, CacheEntry>;
  private readonly cacheTtl = 5 * 60 * 1000; // 5 minutes

  constructor(client: TeamCityClientAdapter) {
    this.client = client;
    this.cache = new Map();
  }

  /**
   * Get build status by ID or number.
   * Uses 3-step fallback to handle builds in queue and race conditions:
   * 1. Try builds endpoint
   * 2. On 404, try build queue (build may be queued)
   * 3. On 404 again, retry builds endpoint (build may have left queue between checks)
   */
  async getBuildStatus(options: BuildStatusOptions): Promise<BuildStatusResult> {
    // Validate input
    if (!options.buildId && !options.buildNumber) {
      throw new Error('Either buildId or buildNumber must be provided');
    }

    if (options.buildNumber && !options.buildTypeId) {
      throw new Error('Build type ID is required when querying by build number');
    }

    // Check cache for completed builds
    const cacheKey = this.getCacheKey(options);
    if (!options.forceRefresh) {
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Step 1: Try builds endpoint
    try {
      return await this.getBuildStatusFromBuildsEndpoint(options, cacheKey);
    } catch (error: unknown) {
      // Only continue to queue fallback for 404 errors on buildId queries
      if (!isAxios404(error) || !options.buildId) {
        this.handleBuildStatusError(error, options);
      }
      // Build not in builds endpoint - might be queued
    }

    // Step 2: Try build queue (only for buildId queries)
    // Note: We only reach here if options.buildId is defined (due to guard above)
    const buildId = options.buildId as string;
    try {
      return await this.getQueuedBuildStatus(buildId);
    } catch (queueError: unknown) {
      if (!isAxios404(queueError)) {
        // Non-404 error from queue - throw it
        this.handleBuildStatusError(queueError, options);
      }
      // Build not in queue either - race condition: it may have moved between our checks
    }

    // Step 3: Retry builds endpoint (build may have left queue between step 1 and 2)
    try {
      return await this.getBuildStatusFromBuildsEndpoint(options, cacheKey);
    } catch (error: unknown) {
      // This is the final attempt - throw appropriate error
      this.handleBuildStatusError(error, options);
    }
  }

  /**
   * Get build status from the builds endpoint
   */
  private async getBuildStatusFromBuildsEndpoint(
    options: BuildStatusOptions,
    cacheKey: string
  ): Promise<BuildStatusResult> {
    let buildData: BuildApiBuild | undefined;

    if (options.buildId) {
      // Query by build ID
      const response = await this.client.builds.getBuild(
        `id:${options.buildId}`,
        this.getFieldSelection(options)
      );
      buildData = response.data as BuildApiBuild;
    } else {
      // Query by build number and type using direct build locator
      const locator = this.buildLocator(options);
      const response = await this.client.builds.getBuild(locator, this.getFieldSelection(options));
      buildData = response.data as BuildApiBuild;
    }

    if (buildData == null) {
      throw new BuildNotFoundError('Build data is undefined');
    }

    // Transform response to standardized format
    const result = this.transformBuildResponse(buildData as BuildApiBuild, options);

    // Cache if build is completed
    if (result.state === 'finished' || result.state === 'canceled') {
      this.setCachedResult(cacheKey, result);
    }

    return result;
  }

  /**
   * Get build status from the build queue
   */
  private async getQueuedBuildStatus(buildId: string): Promise<BuildStatusResult> {
    const response = await this.client.modules.buildQueue.getQueuedBuild(
      buildId,
      'id,number,state,status,buildTypeId,branchName,webUrl,queuedDate,waitReason'
    );

    const queuedBuild = response.data as {
      id?: string | number;
      number?: string;
      state?: string;
      status?: string;
      buildTypeId?: string;
      branchName?: string;
      webUrl?: string;
      queuedDate?: string;
      waitReason?: string;
    };

    if (queuedBuild == null) {
      throw new BuildNotFoundError('Queued build data is undefined');
    }

    const result: BuildStatusResult = {
      buildId: String(queuedBuild.id),
      buildNumber: queuedBuild.number,
      buildTypeId: queuedBuild.buildTypeId,
      state: 'queued',
      status: undefined,
      percentageComplete: 0,
      branchName: queuedBuild.branchName,
      webUrl: queuedBuild.webUrl,
      waitReason: queuedBuild.waitReason,
    };

    if (queuedBuild.queuedDate) {
      result.queuedDate = this.parseDate(queuedBuild.queuedDate);
    }

    return result;
  }

  /**
   * Handle and re-throw build status errors with appropriate error types
   */
  private handleBuildStatusError(error: unknown, options: BuildStatusOptions): never {
    if (isAxios404(error)) {
      throw new BuildNotFoundError(`Build not found: ${options.buildId ?? options.buildNumber}`);
    }

    if (isAxios403(error)) {
      throw new BuildAccessDeniedError(
        `Access denied to build: ${options.buildId ?? options.buildNumber}`
      );
    }

    // Re-throw other errors
    throw error;
  }

  /**
   * Get build status using custom locator
   */
  async getBuildStatusByLocator(locator: string): Promise<BuildStatusResult> {
    try {
      const response = await this.client.builds.getMultipleBuilds(
        locator,
        this.getFieldSelection({})
      );

      const data = response.data as { build?: BuildApiBuild[] };
      if (!Array.isArray(data.build) || data.build.length === 0) {
        throw new BuildNotFoundError(`No builds found for locator: ${locator}`);
      }

      const firstBuild = data.build[0];
      if (!firstBuild) {
        throw new BuildNotFoundError(`No builds found for locator: ${locator}`);
      }

      return this.transformBuildResponse(firstBuild as BuildApiBuild, {});
    } catch (error: unknown) {
      if (
        error != null &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 404
      ) {
        throw new BuildNotFoundError(`No builds found for locator: ${locator}`);
      }
      throw error;
    }
  }

  /**
   * Clear the status cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Build locator string for querying
   */
  private buildLocator(options: BuildStatusOptions): string {
    const parts: string[] = [];

    if (options.buildTypeId) {
      parts.push(`buildType:(id:${options.buildTypeId})`);
    }

    if (options.buildNumber) {
      parts.push(`number:${options.buildNumber}`);
    }

    if (options.branch) {
      parts.push(`branch:${options.branch}`);
    }

    return parts.join(',');
  }

  /**
   * Get field selection string
   */
  private getFieldSelection(options: BuildStatusOptions): string {
    // Start with minimal fields required for basic status
    const baseFields = ['id', 'number', 'state', 'status', 'statusText'];

    // Always include essential fields for proper transformation
    baseFields.push(
      'buildTypeId',
      'branchName',
      'webUrl',
      'percentageComplete',
      'queuedDate',
      'startDate',
      'finishDate',
      'canceled',
      'failureReason',
      'running-info',
      'queued-info',
      'canceledInfo'
    );

    if (options.includeTests) {
      baseFields.push('testOccurrences');
    }

    if (options.includeProblems) {
      baseFields.push('problemOccurrences');
    }

    return baseFields.join(',');
  }

  /**
   * Transform TeamCity response to standardized format
   */
  private transformBuildResponse(
    build: {
      id?: string | number;
      number?: string;
      state?: string;
      status?: string;
      statusText?: string;
      buildTypeId?: string;
      branchName?: string;
      webUrl?: string;
      percentageComplete?: number;
      queuedDate?: string;
      startDate?: string;
      finishDate?: string;
      canceled?: boolean;
      failureReason?: string;
      testOccurrences?: {
        count?: number;
        passed?: number;
        failed?: number;
        ignored?: number;
        muted?: number;
        newFailed?: number;
      };
      problemOccurrences?: {
        problemOccurrence?: Array<{
          type?: string;
          identity?: string;
          details?: string;
          description?: string;
        }>;
      };
      'running-info'?: {
        currentStageText?: string;
        elapsedSeconds?: number;
        estimatedTotalSeconds?: number;
        percentageComplete?: number;
      };
      'queued-info'?: {
        position?: number;
        estimatedStartTime?: string;
      };
      canceledInfo?: {
        user?: { username?: string };
        timestamp?: string;
      };
    },
    options: BuildStatusOptions
  ): BuildStatusResult {
    // Determine build state with fallback
    let state: BuildStatusResult['state'];

    if (!build.state) {
      state = 'queued'; // Default state if undefined
    } else if (build.state === 'finished' && build.canceled) {
      state = 'canceled';
    } else if (
      build.state === 'queued' ||
      build.state === 'running' ||
      build.state === 'finished' ||
      build.state === 'failed' ||
      build.state === 'canceled'
    ) {
      state = build.state;
    } else {
      // Handle any unexpected state values
      state = 'queued';
    }

    // Calculate elapsed time
    let elapsedSeconds: number | undefined;
    if (build.startDate) {
      const startTime = this.parseDate(build.startDate).getTime();
      if (build.finishDate) {
        const finishTime = this.parseDate(build.finishDate).getTime();
        elapsedSeconds = Math.floor((finishTime - startTime) / 1000);
      } else if (state === 'running') {
        elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      }
    }

    // Extract running info
    const runningInfo = build['running-info'];
    const queuedInfo = build['queued-info'];

    // Build result object
    const result: BuildStatusResult = {
      buildId: String(build.id),
      buildNumber: build.number,
      buildTypeId: build.buildTypeId,
      state,
      status: build.status as 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN' | undefined,
      statusText: build.statusText,
      percentageComplete: this.getPercentageComplete(state, build),
      branchName: build.branchName,
      webUrl: build.webUrl,
      failureReason: build.failureReason,
    };

    // Add dates
    if (build.queuedDate) {
      result.queuedDate = this.parseDate(build.queuedDate);
    }
    if (build.startDate) {
      result.startDate = this.parseDate(build.startDate);
    }
    if (build.finishDate) {
      result.finishDate = this.parseDate(build.finishDate);
    }

    // Add running info
    if (runningInfo) {
      result.currentStageText = runningInfo.currentStageText;
      result.elapsedSeconds = runningInfo.elapsedSeconds ?? elapsedSeconds;
      result.estimatedTotalSeconds = runningInfo.estimatedTotalSeconds;
      if (runningInfo.percentageComplete !== undefined) {
        result.percentageComplete = runningInfo.percentageComplete;
      }
    } else if (elapsedSeconds !== undefined) {
      result.elapsedSeconds = elapsedSeconds;
    }

    // Add queued info
    if (queuedInfo) {
      result.queuePosition = queuedInfo.position;
      if (queuedInfo.estimatedStartTime) {
        result.estimatedStartTime = this.parseDate(queuedInfo.estimatedStartTime);
      }
    }

    // Add canceled info
    if (build.canceledInfo) {
      result.canceledBy = build.canceledInfo.user?.username;
      if (build.canceledInfo.timestamp) {
        result.canceledDate = this.parseDate(build.canceledInfo.timestamp);
      }
    }

    // Add test summary if requested
    if (options.includeTests && build.testOccurrences) {
      result.testSummary = {
        total: build.testOccurrences.count ?? 0,
        passed: build.testOccurrences.passed ?? 0,
        failed: build.testOccurrences.failed ?? 0,
        ignored: build.testOccurrences.ignored ?? 0,
        muted: build.testOccurrences.muted,
        newFailed: build.testOccurrences.newFailed,
      };
    }

    // Add problems if requested
    if (options.includeProblems && build.problemOccurrences?.problemOccurrence) {
      result.problems = build.problemOccurrences.problemOccurrence.map(
        (problem: {
          type?: string;
          identity?: string;
          details?: string;
          description?: string;
        }) => ({
          type: problem.type ?? 'unknown',
          identity: problem.identity ?? 'unknown',
          description: problem.details ?? problem.description ?? '',
        })
      );
    }

    return result;
  }

  /**
   * Get percentage complete for build
   */
  private getPercentageComplete(
    state: string,
    build: {
      percentageComplete?: number;
      'running-info'?: { percentageComplete?: number };
    }
  ): number {
    if (state === 'finished' || state === 'canceled') {
      return 100;
    }
    if (state === 'queued') {
      return 0;
    }
    return build.percentageComplete ?? build['running-info']?.percentageComplete ?? 0;
  }

  /**
   * Parse TeamCity date string
   */
  private parseDate(dateString: string): Date {
    // TeamCity format: 20250829T100000+0000
    return new Date(
      dateString
        .replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})([+-]\d{4})/, '$1-$2-$3T$4:$5:$6$7')
        .replace(/([+-]\d{2})(\d{2})$/, '$1:$2')
    );
  }

  /**
   * Get cache key for build query
   */
  private getCacheKey(options: BuildStatusOptions): string {
    if (options.buildId) {
      return `id:${options.buildId}`;
    }
    return `num:${options.buildTypeId}:${options.buildNumber}:${options.branch ?? 'default'}`;
  }

  /**
   * Get cached result if valid
   */
  private getCachedResult(key: string): BuildStatusResult | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if cache entry is still valid
    if (Date.now() - entry.timestamp > this.cacheTtl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Set cached result
   */
  private setCachedResult(key: string, result: BuildStatusResult): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }
}
