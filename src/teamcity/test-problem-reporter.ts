/**
 * Test and Problem Reporter for TeamCity
 * Extracts and formats test results and build problems
 */
import { error } from '@/utils';

import type { TeamCityClientAdapter } from './client-adapter';
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

  /**
   * Get test statistics for a build
   */
  async getTestStatistics(buildId: string): Promise<BuildTestStatistics> {
    const response = await this.client.modules.builds.getBuild(
      toBuildLocator(buildId),
      'testOccurrences(count,passed,failed,ignored,muted,newFailed)'
    );
    const build = response.data;

    const testOccurrences = build?.testOccurrences ?? {
      count: 0,
      passed: 0,
      failed: 0,
      ignored: 0,
      muted: 0,
      newFailed: 0,
    };

    const totalTests = testOccurrences.count ?? 0;
    const passedTests = testOccurrences.passed ?? 0;
    const failedTests = testOccurrences.failed ?? 0;
    const ignoredTests = testOccurrences.ignored ?? 0;
    const mutedTests = testOccurrences.muted ?? 0;
    const newFailedTests = testOccurrences.newFailed ?? 0;

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
      const data = response.data as {
        testOccurrence?: Array<{
          status: string;
          id: string;
          name: string;
          test?: { className: string };
          duration: number;
          details: string;
        }>;
      };

      if (data.testOccurrence == null || !Array.isArray(data.testOccurrence)) {
        return [];
      }

      // Filter only FAILURE status tests (in case API returns other statuses)
      return data.testOccurrence
        .filter((test: unknown) => (test as { status: string }).status === 'FAILURE')
        .map((test: unknown) => {
          const testObj = test as {
            id: string;
            name: string;
            test?: { className: string };
            status: string;
            duration: number;
            details: string;
          };
          return {
            id: testObj.id,
            name: testObj.name,
            className: testObj.test?.className,
            status: 'FAILURE',
            duration: testObj.duration,
            details: testObj.details,
          };
        });
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
      const data = response.data as {
        problemOccurrence?: Array<{
          id: string;
          type: string;
          identity: string;
          details: string;
          additionalData: string;
        }>;
      };

      if (data.problemOccurrence == null || !Array.isArray(data.problemOccurrence)) {
        return categorize ? { all: [], categorized: {} } : [];
      }

      const problems: BuildProblem[] = data.problemOccurrence.map((problem: unknown) => {
        const problemObj = problem as {
          id: string;
          type: string;
          identity: string;
          details: string;
          additionalData?: Record<string, string> | string;
        };
        return {
          id: problemObj.id,
          type: problemObj.type,
          identity: problemObj.identity,
          details: problemObj.details,
          additionalData:
            typeof problemObj.additionalData === 'object' && problemObj.additionalData !== null
              ? problemObj.additionalData
              : {},
        };
      });

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
        .map((p) => p.details)
        .filter((d) => d && d.length > 0)
        .join('; ');

      if (problemDetails) {
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
