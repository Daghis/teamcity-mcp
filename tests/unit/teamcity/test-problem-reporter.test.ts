/**
 * Tests for TeamCity Test and Problem Reporter
 */
import { error as logError } from '@/utils';

import {
  type BuildProblem,
  type CategorizedProblems,
  TestProblemReporter,
} from '../../../src/teamcity/test-problem-reporter';
import {
  type MockBuildApi,
  type MockProblemOccurrenceApi,
  type MockTeamCityClient,
  type MockTestOccurrenceApi,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

jest.mock('@/utils', () => ({
  error: jest.fn(),
}));

describe('TestProblemReporter', () => {
  let reporter: TestProblemReporter;
  let mockClient: MockTeamCityClient;
  let http: jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
  let buildsApi: MockBuildApi;
  let testsApi: MockTestOccurrenceApi;
  let problemOccurrencesApi: MockProblemOccurrenceApi;
  const BASE_URL = 'http://localhost:8111';

  beforeEach(() => {
    jest.mocked(logError).mockReset();
    mockClient = createMockTeamCityClient();
    http = mockClient.http as jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
    http.get.mockReset();
    buildsApi = mockClient.mockModules.builds;
    testsApi = mockClient.mockModules.tests;
    problemOccurrencesApi = mockClient.mockModules.problemOccurrences;
    buildsApi.getBuild.mockImplementation((locator: string) =>
      http.get(`/app/rest/builds/${locator}`)
    );
    buildsApi.getAllBuilds.mockImplementation((locator?: string) =>
      locator ? http.get(`/app/rest/builds?locator=${locator}`) : http.get('/app/rest/builds')
    );
    testsApi.getAllTestOccurrences.mockImplementation((locator?: string) =>
      locator
        ? http.get(`/app/rest/testOccurrences?locator=${locator}`)
        : http.get('/app/rest/testOccurrences')
    );
    problemOccurrencesApi.getAllBuildProblemOccurrences.mockImplementation((locator?: string) =>
      locator
        ? http.get(`/app/rest/problemOccurrences?locator=${locator}`)
        : http.get('/app/rest/problemOccurrences')
    );
    mockClient.request.mockImplementation(async (fn) => fn({ axios: http, baseUrl: BASE_URL }));
    mockClient.getApiConfig.mockReturnValue({
      baseUrl: BASE_URL,
      token: 'test-token',
      timeout: undefined,
    });
    mockClient.getConfig.mockReturnValue({
      connection: {
        baseUrl: BASE_URL,
        token: 'test-token',
        timeout: undefined,
      },
    });

    reporter = new TestProblemReporter(mockClient);
  });

  describe('getTestStatistics', () => {
    it('should extract test statistics from build response', async () => {
      const buildId = '12345';

      http.get.mockResolvedValue({
        data: {
          id: buildId,
          testOccurrences: {
            count: 150,
            passed: 145,
            failed: 3,
            ignored: 2,
            muted: 0,
            newFailed: 1,
          },
        },
      });

      const stats = await reporter.getTestStatistics(buildId);

      expect(stats).toEqual({
        totalTests: 150,
        passedTests: 145,
        failedTests: 3,
        ignoredTests: 2,
        mutedTests: 0,
        newFailedTests: 1,
        successRate: 96.67,
      });
    });

    it('should handle builds without test data', async () => {
      const buildId = '12346';

      http.get.mockResolvedValue({
        data: {
          id: buildId,
          // No testOccurrences property
        },
      });

      const stats = await reporter.getTestStatistics(buildId);

      expect(stats).toEqual({
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        ignoredTests: 0,
        mutedTests: 0,
        newFailedTests: 0,
        successRate: 100,
      });
    });

    it('should calculate correct success rate', async () => {
      const buildId = '12347';

      http.get.mockResolvedValue({
        data: {
          id: buildId,
          testOccurrences: {
            count: 100,
            passed: 75,
            failed: 20,
            ignored: 5,
          },
        },
      });

      const stats = await reporter.getTestStatistics(buildId);

      expect(stats.successRate).toBe(75); // 75 passed out of 100 total
    });

    it('throws when TeamCity returns malformed statistics payload', async () => {
      http.get.mockResolvedValue({ data: 'oops' });

      await expect(reporter.getTestStatistics('99999')).rejects.toThrow('test statistics');
    });
  });

  describe('getFailedTests', () => {
    it('should retrieve failed test details', async () => {
      const buildId = '12348';

      http.get.mockResolvedValue({
        data: {
          testOccurrence: [
            {
              id: 'test1',
              name: 'testLogin',
              status: 'FAILURE',
              duration: 1500,
              details: 'AssertionError: Expected true but got false',
              test: {
                id: 'LoginTest.testLogin',
                name: 'testLogin',
                className: 'LoginTest',
              },
            },
            {
              id: 'test2',
              name: 'testLogout',
              status: 'FAILURE',
              duration: 2000,
              details: 'NullPointerException at line 45',
              test: {
                id: 'LoginTest.testLogout',
                name: 'testLogout',
                className: 'LoginTest',
              },
            },
          ],
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toHaveLength(2);
      expect(failedTests[0]).toEqual({
        id: 'test1',
        name: 'testLogin',
        className: 'LoginTest',
        status: 'FAILURE',
        duration: 1500,
        details: 'AssertionError: Expected true but got false',
      });
    });

    it('should handle no failed tests', async () => {
      const buildId = '12349';

      http.get.mockResolvedValue({
        data: {
          testOccurrence: [],
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toEqual([]);
    });

    it('logs and returns empty array when failed test payload is malformed', async () => {
      const buildId = '12351';

      http.get.mockResolvedValue({
        data: {
          testOccurrence: 'oops',
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toEqual([]);
      expect(logError).toHaveBeenCalledWith('Failed to get failed tests', expect.any(Error), {
        buildId,
      });
    });

    it('should filter only failed tests', async () => {
      const buildId = '12350';

      http.get.mockResolvedValue({
        data: {
          testOccurrence: [
            {
              id: 'test1',
              name: 'test1',
              status: 'SUCCESS',
            },
            {
              id: 'test2',
              name: 'test2',
              status: 'FAILURE',
              details: 'Test failed',
            },
            {
              id: 'test3',
              name: 'test3',
              status: 'IGNORED',
            },
          ],
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toHaveLength(1);
      expect(failedTests[0]?.name).toBe('test2');
    });
  });

  describe('getBuildProblems', () => {
    it('should retrieve build problems', async () => {
      const buildId = '12351';

      http.get.mockResolvedValue({
        data: {
          problemOccurrence: [
            {
              id: 'problem1',
              type: 'TC_COMPILATION_ERROR',
              identity: 'compilation_error_Main.java',
              details: 'Cannot find symbol: variable x',
              additionalData: {
                sourceFile: 'Main.java',
                line: '42',
              },
            },
            {
              id: 'problem2',
              type: 'TC_EXIT_CODE',
              identity: 'exit_code_1',
              details: 'Process exited with code 1',
            },
          ],
        },
      });

      const problems = await reporter.getBuildProblems(buildId);

      expect(problems).toHaveLength(2);
      expect((problems as BuildProblem[])[0]).toEqual({
        id: 'problem1',
        type: 'TC_COMPILATION_ERROR',
        identity: 'compilation_error_Main.java',
        details: 'Cannot find symbol: variable x',
        additionalData: {
          sourceFile: 'Main.java',
          line: '42',
        },
      });
    });

    it('should handle no problems', async () => {
      const buildId = '12352';

      http.get.mockResolvedValue({
        data: {
          problemOccurrence: [],
        },
      });

      const problems = await reporter.getBuildProblems(buildId);

      expect(problems).toEqual([]);
    });

    it('logs and returns empty array when problem payload is malformed', async () => {
      const buildId = '12355';

      http.get.mockResolvedValue({
        data: {
          problemOccurrence: 'oops',
        },
      });

      const problems = await reporter.getBuildProblems(buildId);

      expect(problems).toEqual([]);
      expect(logError).toHaveBeenCalledWith('Failed to get build problems', expect.any(Error), {
        buildId,
      });
    });

    it('should categorize problems by type', async () => {
      const buildId = '12353';

      http.get.mockResolvedValue({
        data: {
          problemOccurrence: [
            {
              id: 'p1',
              type: 'TC_COMPILATION_ERROR',
              identity: 'compilation_error_1',
              details: 'Compilation failed',
            },
            {
              id: 'p2',
              type: 'TC_COMPILATION_ERROR',
              identity: 'compilation_error_2',
              details: 'Another compilation error',
            },
            {
              id: 'p3',
              type: 'TC_FAILED_TESTS',
              identity: 'failed_tests',
              details: 'Tests failed',
            },
            {
              id: 'p4',
              type: 'TC_EXIT_CODE',
              identity: 'exit_code',
              details: 'Bad exit code',
            },
          ],
        },
      });

      const problems = await reporter.getBuildProblems(buildId, true);

      const categorized = problems as CategorizedProblems;
      expect(categorized.categorized['TC_COMPILATION_ERROR']).toHaveLength(2);
      expect(categorized.categorized['TC_FAILED_TESTS']).toHaveLength(1);
      expect(categorized.categorized['TC_EXIT_CODE']).toHaveLength(1);
    });
  });

  describe('getTestAndProblemSummary', () => {
    it('should provide complete test and problem summary', async () => {
      const buildId = '12354';

      // Mock test statistics
      http.get.mockImplementation((path: string) => {
        if (path.includes(`/testOccurrences?locator=build:(id:${buildId}),status:FAILURE`)) {
          return Promise.resolve({
            data: {
              testOccurrence: [
                {
                  id: 'test1',
                  name: 'failedTest1',
                  status: 'FAILURE',
                  details: 'Test failure details',
                  test: { className: 'TestClass' },
                },
              ],
            },
          });
        }
        if (path.includes('/problemOccurrences')) {
          return Promise.resolve({
            data: {
              problemOccurrence: [
                {
                  id: 'problem1',
                  type: 'TC_COMPILATION_ERROR',
                  identity: 'comp_error',
                  details: 'Compilation error',
                },
              ],
            },
          });
        }
        if (path.includes(`/builds/id:${buildId}`)) {
          return Promise.resolve({
            data: {
              id: buildId,
              testOccurrences: {
                count: 100,
                passed: 95,
                failed: 5,
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const summary = await reporter.getTestAndProblemSummary(buildId);

      expect(summary).toMatchObject({
        statistics: {
          totalTests: 100,
          passedTests: 95,
          failedTests: 5,
          successRate: 95,
        },
        failedTests: expect.arrayContaining([
          expect.objectContaining({
            name: 'failedTest1',
          }),
        ]),
        problems: expect.arrayContaining([
          expect.objectContaining({
            type: 'TC_COMPILATION_ERROR',
          }),
        ]),
        hasIssues: true,
      });
    });

    it('should handle optional inclusion flags', async () => {
      const buildId = '12355';

      http.get.mockResolvedValue({
        data: {
          id: buildId,
          testOccurrences: {
            count: 50,
            passed: 50,
            failed: 0,
          },
        },
      });

      const summary = await reporter.getTestAndProblemSummary(buildId, {
        includeFailedTests: false,
        includeProblems: false,
      });

      expect(summary.statistics).toBeDefined();
      expect(summary.failedTests).toBeUndefined();
      expect(summary.problems).toBeUndefined();
      expect(summary.hasIssues).toBe(false);
    });

    it('should detect builds with issues', async () => {
      const buildId = '12356';

      // Build with no test failures but problems
      http.get.mockImplementation((path: string) => {
        if (path.includes('/problemOccurrences')) {
          return Promise.resolve({
            data: {
              problemOccurrence: [
                {
                  id: 'problem2',
                  type: 'TC_EXIT_CODE',
                  identity: 'exit_code',
                  details: 'Non-zero exit',
                },
              ],
            },
          });
        }
        return Promise.resolve({ data: { testOccurrence: [] } });
      });

      const summary = await reporter.getTestAndProblemSummary(buildId);

      expect(summary.hasIssues).toBe(true); // Has problems even with all tests passing
    });
  });

  describe('formatFailureReason', () => {
    it('should format comprehensive failure reason', async () => {
      const buildId = '12357';

      http.get.mockImplementation((path: string) => {
        if (path.includes(`/testOccurrences?locator=build:(id:${buildId}),status:FAILURE`)) {
          return Promise.resolve({
            data: {
              testOccurrence: [
                { id: 'test1', name: 'test1', status: 'FAILURE' },
                { id: 'test2', name: 'test2', status: 'FAILURE' },
                { id: 'test3', name: 'test3', status: 'FAILURE' },
                { id: 'test4', name: 'test4', status: 'FAILURE' },
                { id: 'test5', name: 'test5', status: 'FAILURE' },
              ],
            },
          });
        }
        if (path.includes('/problemOccurrences')) {
          return Promise.resolve({
            data: {
              problemOccurrence: [
                {
                  id: 'problem3',
                  type: 'TC_COMPILATION_ERROR',
                  identity: 'compilation',
                  details: 'Compilation failed',
                },
              ],
            },
          });
        }
        if (path.includes(`/builds/id:${buildId}`)) {
          return Promise.resolve({
            data: {
              id: buildId,
              testOccurrences: {
                count: 100,
                passed: 95,
                failed: 5,
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const stats = await reporter.getTestStatistics(buildId);
      const failed = await reporter.getFailedTests(buildId, 10);
      const problemsResult = (await reporter.getBuildProblems(buildId)) as BuildProblem[];
      expect(stats.failedTests).toBeGreaterThan(0);
      expect(failed.length).toBeGreaterThan(0);
      expect(problemsResult.length).toBeGreaterThan(0);

      const reason = await reporter.formatFailureReason(buildId);

      expect(reason).toContain('5 test(s) failed');
      expect(reason).toContain('1 build problem(s)');
      expect(reason).toContain('Failed tests: test1, test2, test3');
      expect(reason).toContain('Build problems: Compilation failed');
    });

    it('should truncate long lists', async () => {
      const buildId = '12358';

      const tests = Array.from({ length: 10 }, (_, i) => ({
        id: `test${i + 1}`,
        name: `test${i + 1}`,
        status: 'FAILURE',
      }));

      http.get.mockImplementation((path: string) => {
        if (path.includes(`/testOccurrences?locator=build:(id:${buildId}),status:FAILURE`)) {
          return Promise.resolve({
            data: { testOccurrence: tests },
          });
        }
        if (path.includes('/problemOccurrences')) {
          return Promise.resolve({
            data: { problemOccurrence: [] },
          });
        }
        if (path.includes(`/builds/id:${buildId}`)) {
          return Promise.resolve({
            data: {
              id: buildId,
              testOccurrences: {
                count: 100,
                failed: 10,
                passed: 90,
              },
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      const reason = await reporter.formatFailureReason(buildId);

      expect(reason).toContain('test1, test2, test3, test4, test5... and 5 more');
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const buildId = '12359';

      http.get.mockRejectedValue(new Error('API Error'));

      await expect(reporter.getTestStatistics(buildId)).rejects.toThrow('API Error');
    });

    it('should handle malformed responses', async () => {
      const buildId = '12360';

      http.get.mockResolvedValue({
        data: {
          // Missing expected structure
          unexpected: 'data',
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toEqual([]);
    });
  });

  describe('payload validation branches', () => {
    it('throws when test occurrences is not a record', async () => {
      http.get.mockResolvedValue({ data: { testOccurrences: 'not-an-object' } });
      await expect(reporter.getTestStatistics('b1')).rejects.toThrow(
        /malformed test occurrences payload/
      );
    });

    it('coerces numeric-string count fields but throws on non-numeric strings', async () => {
      http.get.mockResolvedValueOnce({
        data: {
          testOccurrences: {
            count: '12',
            passed: '10',
            failed: 2,
            ignored: 0,
            muted: 0,
            newFailed: 1,
          },
        },
      });
      const stats = await reporter.getTestStatistics('build-numeric-string');
      expect(stats.totalTests).toBe(12);
      expect(stats.passedTests).toBe(10);

      http.get.mockResolvedValueOnce({
        data: {
          testOccurrences: {
            count: 'not-a-number',
            passed: 0,
            failed: 0,
            ignored: 0,
            muted: 0,
            newFailed: 0,
          },
        },
      });
      await expect(reporter.getTestStatistics('build-bad-string')).rejects.toThrow(
        /statistics field is not numeric/
      );
    });

    it('throws when a count field is neither number nor string', async () => {
      http.get.mockResolvedValue({
        data: {
          testOccurrences: {
            count: { nested: true },
            passed: 0,
            failed: 0,
            ignored: 0,
            muted: 0,
            newFailed: 0,
          },
        },
      });
      await expect(reporter.getTestStatistics('bad-type')).rejects.toThrow(
        /statistics field is not numeric/
      );
    });

    it('defaults to zeroes when testOccurrences is null', async () => {
      http.get.mockResolvedValue({ data: { testOccurrences: null } });
      const stats = await reporter.getTestStatistics('no-stats');
      expect(stats).toEqual({
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        ignoredTests: 0,
        mutedTests: 0,
        newFailedTests: 0,
        successRate: 100,
      });
    });

    it('logs and returns empty when failed tests payload has a non-record entry', async () => {
      http.get.mockResolvedValue({
        data: { testOccurrence: ['not-a-record'] },
      });
      const res = await reporter.getFailedTests('b1');
      expect(res).toEqual([]);
      expect(logError).toHaveBeenCalled();
    });

    it('returns empty for problems when data is not a record', async () => {
      http.get.mockResolvedValue({ data: null });
      const res = (await reporter.getBuildProblems('b1')) as BuildProblem[];
      expect(res).toEqual([]);
      expect(logError).toHaveBeenCalled();
    });

    it('returns categorized empty when problems payload missing', async () => {
      http.get.mockResolvedValue({ data: null });
      const res = (await reporter.getBuildProblems('b1', true)) as CategorizedProblems;
      expect(res).toEqual({ all: [], categorized: {} });
    });

    it('validates required fields on problem occurrences entry', async () => {
      http.get.mockResolvedValue({
        data: {
          problemOccurrence: [{ id: 'p1', type: 'GENERIC' }],
        },
      });
      const res = await reporter.getBuildProblems('b1');
      expect(res).toEqual([]);
      expect(logError).toHaveBeenCalledWith(
        'Failed to get build problems',
        expect.any(Error),
        expect.any(Object)
      );
    });

    it('rejects invalid additionalData types on a problem entry', async () => {
      http.get.mockResolvedValue({
        data: {
          problemOccurrence: [
            {
              id: 'p1',
              type: 'GENERIC',
              identity: 'ident',
              details: 'boom',
              additionalData: 42,
            },
          ],
        },
      });
      const res = await reporter.getBuildProblems('b1');
      expect(res).toEqual([]);
    });

    it('rejects non-array problemOccurrence payloads', async () => {
      http.get.mockResolvedValue({ data: { problemOccurrence: 'oops' } });
      const res = await reporter.getBuildProblems('b1');
      expect(res).toEqual([]);
      expect(logError).toHaveBeenCalled();
    });
  });

  describe('getTestTrend / getFailurePatterns', () => {
    it('returns empty trend when builds response has no list', async () => {
      http.get.mockResolvedValue({ data: { something: 'else' } });
      const trend = await reporter.getTestTrend('bt-missing');
      expect(trend).toEqual([]);
    });

    it('returns empty patterns when builds list is missing', async () => {
      http.get.mockResolvedValue({ data: {} });
      const patterns = await reporter.getFailurePatterns('bt-empty');
      expect(patterns).toEqual({});
    });

    it('swallows errors from getTestTrend and returns empty', async () => {
      http.get.mockRejectedValue(new Error('api boom'));
      const trend = await reporter.getTestTrend('bt');
      expect(trend).toEqual([]);
      expect(logError).toHaveBeenCalled();
    });

    it('swallows errors from getFailurePatterns and returns empty', async () => {
      http.get.mockRejectedValue(new Error('api boom'));
      const patterns = await reporter.getFailurePatterns('bt');
      expect(patterns).toEqual({});
      expect(logError).toHaveBeenCalled();
    });
  });

  describe('hasIssues + summary branches', () => {
    it('returns false when no failures and no problems', async () => {
      http.get.mockImplementation(async (url: string) => {
        if (url.includes('/problemOccurrences')) {
          return { data: { problemOccurrence: [] } };
        }
        return { data: { testOccurrences: { count: 0, passed: 0, failed: 0 } } };
      });
      await expect(reporter.hasIssues('b1')).resolves.toBe(false);
    });

    it('short-circuits to true on a failed test', async () => {
      http.get.mockResolvedValueOnce({
        data: { testOccurrences: { count: 1, passed: 0, failed: 1 } },
      });
      await expect(reporter.hasIssues('b1')).resolves.toBe(true);
    });

    it('returns default reason when no failures surface', async () => {
      http.get.mockResolvedValueOnce({
        data: { testOccurrences: { count: 0, passed: 0, failed: 0 } },
      });
      http.get.mockResolvedValueOnce({ data: { problemOccurrence: [] } });
      const reason = await reporter.formatFailureReason('b1');
      expect(reason).toBe('Build failed for unknown reasons');
    });
  });
});
