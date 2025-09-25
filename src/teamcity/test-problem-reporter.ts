/**
 * Test and Problem Reporter for TeamCity
 * Extracts and formats test results and build problems
 */
import { error } from '@/utils';

import type { TeamCityClientAdapter } from './client-adapter';
import { TeamCityAPIError } from './errors';
import { toBuildLocator } from './utils/build-locator';

/**
 * Test statistics for a build
 */
export interface BuildTestStatistics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  ignoredTests: number;
  mutedTests: number;
  newFailedTests: number;
  successRate: number; // Percentage
}

/**
 * Failed test details
 */
export interface TestRun {
  id: string;
  name: string;
  className?: string;
  status: 'SUCCESS' | 'FAILURE' | 'IGNORED' | 'UNKNOWN';
  duration?: number; // milliseconds
  details?: string; // Error message or stack trace
}

/**
 * Build problem details
 */
export interface BuildProblem {
  id: string;
  type: string;
  identity: string;
  details: string;
  additionalData?: Record<string, string>;
}

/**
 * Categorized problems by type
 */
export interface CategorizedProblems {
  all: BuildProblem[];
  categorized: Record<string, BuildProblem[]>;
}

/**
 * Complete test and problem summary
 */
export interface TestAndProblemSummary {
  statistics: BuildTestStatistics;
  failedTests?: TestRun[];
  problems?: BuildProblem[] | CategorizedProblems;
  hasIssues: boolean;
  failureReason?: string;
}

/**
 * Options for summary generation
 */
export interface SummaryOptions {
  includeFailedTests?: boolean;
  includeProblems?: boolean;
  categorizeProblems?: boolean;
  maxFailedTestsToShow?: number;
  maxProblemsToShow?: number;
}

/**
 * Test and Problem Reporter implementation
 */
export class TestProblemReporter {
  constructor(private readonly client: TeamCityClientAdapter) {}

  private readonly isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
  };

  /**
   * Get test statistics for a build
   */
  async getTestStatistics(buildId: string): Promise<BuildTestStatistics> {
    const response = await this.client.modules.builds.getBuild(
      toBuildLocator(buildId),
      'testOccurrences(count,passed,failed,ignored,muted,newFailed)'
    );
    const build = this.ensureTestStatisticsPayload(response.data, buildId);
    const testOccurrences = this.ensureTestOccurrences(build.testOccurrences, buildId);

    const {
      count: totalTests,
      passed: passedTests,
      failed: failedTests,
      ignored: ignoredTests,
      muted: mutedTests,
      newFailed: newFailedTests,
    } = testOccurrences;

    // Calculate success rate
    let successRate = 100;
    if (totalTests > 0) {
      successRate = Math.round((passedTests / totalTests) * 10000) / 100; // Round to 2 decimal places
    }

    return {
      totalTests,
      passedTests,
      failedTests,
      ignoredTests,
      mutedTests,
      newFailedTests,
      successRate,
    };
  }

  /**
   * Get details of failed tests
   */
  async getFailedTests(buildId: string, maxResults?: number): Promise<TestRun[]> {
    try {
      const locatorParts = [`build:(id:${buildId})`, 'status:FAILURE'];
      if (maxResults) {
        locatorParts.push(`count:${maxResults}`);
      }
      const locator = locatorParts.join(',');
      const response = await this.client.modules.tests.getAllTestOccurrences(locator);
      const occurrences = this.ensureFailedTestsResponse(response.data, buildId, locator);

      return occurrences
        .filter((test) => test.status === 'FAILURE')
        .map((test) => ({
          id: test.id,
          name: test.name,
          className: test.test?.className,
          status: 'FAILURE' as const,
          duration: test.duration,
          details: test.details,
        }));
    } catch (err) {
      error('Failed to get failed tests', err as Error, { buildId });
      return [];
    }
  }

  /**
   * Get build problems
   */
  async getBuildProblems(
    buildId: string,
    categorize?: boolean
  ): Promise<BuildProblem[] | CategorizedProblems> {
    try {
      const response = await this.client.modules.problemOccurrences.getAllBuildProblemOccurrences(
        `build:(id:${buildId})`
      );
      const occurrences = this.ensureProblemOccurrencesResponse(response.data, buildId);

      const problems: BuildProblem[] = occurrences.map((problem) => ({
        id: problem.id,
        type: problem.type,
        identity: problem.identity,
        details: problem.details,
        additionalData:
          typeof problem.additionalData === 'object' && problem.additionalData !== null
            ? (problem.additionalData as Record<string, string>)
            : {},
      }));

      if (!categorize) {
        return problems;
      }

      // Categorize problems by type
      const categorized: Record<string, BuildProblem[]> = {};
      problems.forEach((problem) => {
        const key = problem.type;
        const bucket = categorized[key] ?? (categorized[key] = []);
        bucket.push(problem);
      });

      return {
        all: problems,
        categorized,
      };
    } catch (err) {
      error('Failed to get build problems', err as Error, { buildId });
      return categorize ? { all: [], categorized: {} } : [];
    }
  }

  private ensureTestStatisticsPayload(
    data: unknown,
    buildId: string
  ): Record<string, unknown> & { testOccurrences?: unknown } {
    if (!this.isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned invalid test statistics payload',
        'INVALID_RESPONSE',
        undefined,
        {
          buildId,
        }
      );
    }
    return data as Record<string, unknown> & { testOccurrences?: unknown };
  }

  private ensureTestOccurrences(
    occurrences: unknown,
    buildId: string
  ): {
    count: number;
    passed: number;
    failed: number;
    ignored: number;
    muted: number;
    newFailed: number;
  } {
    if (occurrences == null) {
      return {
        count: 0,
        passed: 0,
        failed: 0,
        ignored: 0,
        muted: 0,
        newFailed: 0,
      };
    }

    if (!this.isRecord(occurrences)) {
      throw new TeamCityAPIError(
        'TeamCity returned malformed test occurrences payload',
        'INVALID_RESPONSE',
        undefined,
        {
          buildId,
        }
      );
    }

    const { count, passed, failed, ignored, muted, newFailed } = occurrences as Record<
      string,
      unknown
    >;

    return {
      count: this.coerceCountField(count, 'count', buildId),
      passed: this.coerceCountField(passed, 'passed', buildId),
      failed: this.coerceCountField(failed, 'failed', buildId),
      ignored: this.coerceCountField(ignored, 'ignored', buildId),
      muted: this.coerceCountField(muted, 'muted', buildId),
      newFailed: this.coerceCountField(newFailed, 'newFailed', buildId),
    };
  }

  private coerceCountField(value: unknown, field: string, buildId: string): number {
    if (value === undefined) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    throw new TeamCityAPIError(
      'TeamCity test statistics field is not numeric',
      'INVALID_RESPONSE',
      undefined,
      {
        buildId,
        field,
        receivedType: typeof value,
      }
    );
  }

  private ensureFailedTestsResponse(
    data: unknown,
    buildId: string,
    locator: string
  ): Array<{
    status: string;
    id: string;
    name: string;
    test?: { className?: string };
    duration?: number;
    details?: string;
  }> {
    if (!this.isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned invalid failed tests payload',
        'INVALID_RESPONSE',
        undefined,
        {
          buildId,
          locator,
        }
      );
    }

    const { testOccurrence } = data as { testOccurrence?: unknown };

    if (testOccurrence === undefined) {
      return [];
    }

    if (!Array.isArray(testOccurrence)) {
      throw new TeamCityAPIError(
        'TeamCity failed tests payload is not an array',
        'INVALID_RESPONSE',
        undefined,
        {
          buildId,
          locator,
        }
      );
    }

    return testOccurrence.map((entry, index) => {
      if (!this.isRecord(entry)) {
        throw new TeamCityAPIError(
          'TeamCity failed test entry is not an object',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            locator,
            index,
          }
        );
      }

      const { status, id, name, test, duration, details } = entry as Record<string, unknown>;

      if (typeof status !== 'string' || typeof id !== 'string' || typeof name !== 'string') {
        throw new TeamCityAPIError(
          'TeamCity failed test entry is missing required fields',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            locator,
            index,
            receivedKeys: Object.keys(entry),
          }
        );
      }

      if (test !== undefined && test !== null && !this.isRecord(test)) {
        throw new TeamCityAPIError(
          'TeamCity failed test entry has invalid test metadata',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            locator,
            index,
          }
        );
      }

      if (duration !== undefined && typeof duration !== 'number') {
        throw new TeamCityAPIError(
          'TeamCity failed test entry has non-numeric duration',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            locator,
            index,
            receivedType: typeof duration,
          }
        );
      }

      if (details !== undefined && typeof details !== 'string') {
        throw new TeamCityAPIError(
          'TeamCity failed test entry has non-string details',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            locator,
            index,
            receivedType: typeof details,
          }
        );
      }

      return {
        status,
        id,
        name,
        test: test as { className?: string } | undefined,
        duration: duration as number | undefined,
        details: details as string | undefined,
      };
    });
  }

  private ensureProblemOccurrencesResponse(
    data: unknown,
    buildId: string
  ): Array<{
    id: string;
    type: string;
    identity: string;
    details: string;
    additionalData?: Record<string, string> | string;
  }> {
    if (!this.isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned invalid problem occurrences payload',
        'INVALID_RESPONSE',
        undefined,
        {
          buildId,
        }
      );
    }

    const { problemOccurrence } = data as { problemOccurrence?: unknown };

    if (problemOccurrence === undefined) {
      return [];
    }

    if (!Array.isArray(problemOccurrence)) {
      throw new TeamCityAPIError(
        'TeamCity problem occurrences payload is not an array',
        'INVALID_RESPONSE',
        undefined,
        {
          buildId,
        }
      );
    }

    return problemOccurrence.map((entry, index) => {
      if (!this.isRecord(entry)) {
        throw new TeamCityAPIError(
          'TeamCity problem occurrence entry is not an object',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            index,
          }
        );
      }

      const { id, type, identity, details, additionalData } = entry as Record<string, unknown>;

      if (
        typeof id !== 'string' ||
        typeof type !== 'string' ||
        typeof identity !== 'string' ||
        typeof details !== 'string'
      ) {
        throw new TeamCityAPIError(
          'TeamCity problem occurrence entry is missing required fields',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            index,
            receivedKeys: Object.keys(entry),
          }
        );
      }

      if (
        additionalData !== undefined &&
        additionalData !== null &&
        typeof additionalData !== 'string' &&
        !this.isRecord(additionalData)
      ) {
        throw new TeamCityAPIError(
          'TeamCity problem occurrence entry has invalid additionalData',
          'INVALID_RESPONSE',
          undefined,
          {
            buildId,
            index,
          }
        );
      }

      return {
        id,
        type,
        identity,
        details,
        additionalData: additionalData as Record<string, string> | string | undefined,
      };
    });
  }

  /**
   * Get comprehensive test and problem summary
   */
  async getTestAndProblemSummary(
    buildId: string,
    options: SummaryOptions = {}
  ): Promise<TestAndProblemSummary> {
    const {
      includeFailedTests = true,
      includeProblems = true,
      categorizeProblems = false,
      maxFailedTestsToShow = 100,
    } = options;

    // Get test statistics
    const statistics = await this.getTestStatistics(buildId);

    // Initialize result
    const summary: TestAndProblemSummary = {
      statistics,
      hasIssues: false,
    };

    // Get failed tests if requested
    if (includeFailedTests && statistics.failedTests > 0) {
      summary.failedTests = await this.getFailedTests(buildId, maxFailedTestsToShow);
      summary.hasIssues = true;
    }

    // Get problems if requested
    if (includeProblems) {
      const problems = await this.getBuildProblems(buildId, categorizeProblems);
      const problemCount = Array.isArray(problems) ? problems.length : problems.all.length;

      if (problemCount > 0) {
        summary.problems = problems;
        summary.hasIssues = true;
      }
    }

    // Format failure reason if there are issues
    if (summary.hasIssues) {
      summary.failureReason = await this.formatFailureReason(buildId);
    }

    return summary;
  }

  /**
   * Format a human-readable failure reason
   */
  async formatFailureReason(buildId: string): Promise<string> {
    const statistics = await this.getTestStatistics(buildId);
    const failedTests = statistics.failedTests > 0 ? await this.getFailedTests(buildId, 10) : [];
    const problems = (await this.getBuildProblems(buildId)) as BuildProblem[];

    const reasons: string[] = [];

    // Add test failure summary
    if (statistics.failedTests > 0) {
      reasons.push(`${statistics.failedTests} test(s) failed`);

      if (failedTests.length > 0) {
        const testNames = failedTests
          .slice(0, 5)
          .map((t) => t.name)
          .join(', ');

        const moreCount = failedTests.length - 5;
        const testList = moreCount > 0 ? `${testNames}... and ${moreCount} more` : testNames;

        if (failedTests.length > 0) {
          reasons.push(`Failed tests: ${testList}`);
        }
      }
    }

    // Add problem summary
    if (problems.length > 0) {
      reasons.push(`${problems.length} build problem(s)`);

      const problemDetails = problems
        .slice(0, 3)
        .map((problem) => problem.details)
        .filter((detail): detail is string => typeof detail === 'string' && detail.length > 0)
        .join('; ');

      if (problemDetails.length > 0) {
        reasons.push(`Build problems: ${problemDetails}`);
      }
    }

    return reasons.join('. ') || 'Build failed for unknown reasons';
  }

  /**
   * Check if a build has any test failures or problems
   */
  async hasIssues(buildId: string): Promise<boolean> {
    const statistics = await this.getTestStatistics(buildId);

    if (statistics.failedTests > 0) {
      return true;
    }

    const problems = (await this.getBuildProblems(buildId)) as BuildProblem[];
    return problems.length > 0;
  }

  /**
   * Get test trend for recent builds
   */
  async getTestTrend(
    buildTypeId: string,
    count: number = 10
  ): Promise<Array<{ buildId: string; statistics: BuildTestStatistics }>> {
    try {
      const locator = `buildType:(id:${buildTypeId}),count:${count}`;
      const response = await this.client.modules.builds.getAllBuilds(locator, 'build(id)');
      const builds = response.data as { build?: Array<{ id: string }> };

      if (builds.build == null || !Array.isArray(builds.build)) {
        return [];
      }

      const trend = await Promise.all(
        builds.build.map(async (build) => {
          const buildObj = build as { id: string };
          return {
            buildId: buildObj.id,
            statistics: await this.getTestStatistics(buildObj.id),
          };
        })
      );

      return trend;
    } catch (err) {
      error('Failed to get test trend', err as Error, { buildTypeId, count });
      return [];
    }
  }

  /**
   * Get common failure patterns
   */
  async getFailurePatterns(
    buildTypeId: string,
    count: number = 20
  ): Promise<Record<string, number>> {
    try {
      const locator = `buildType:(id:${buildTypeId}),status:FAILURE,count:${count}`;
      const response = await this.client.modules.builds.getAllBuilds(locator, 'build(id)');
      const builds = response.data as { build?: Array<{ id: string }> };

      if (builds.build == null || !Array.isArray(builds.build)) {
        return {};
      }

      const patterns: Record<string, number> = {};

      // Analyze failed tests across builds
      for (const build of builds.build) {
        // Analyze builds sequentially to keep requests bounded
        // eslint-disable-next-line no-await-in-loop
        const failedTests = await this.getFailedTests(build.id);

        failedTests.forEach((test) => {
          const key = `${test.className ?? 'Unknown'}.${test.name}`;
          patterns[key] = (patterns[key] ?? 0) + 1;
        });
      }

      // Sort by frequency
      const sorted = Object.entries(patterns)
        .sort(([, a], [, b]) => b - a)
        .reduce(
          (acc, [key, value]) => {
            acc[key] = value;
            return acc;
          },
          {} as Record<string, number>
        );

      return sorted;
    } catch (err) {
      error('Failed to get failure patterns', err as Error, { buildTypeId, count });
      return {};
    }
  }
}
