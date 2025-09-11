/**
 * Tests for TeamCity Test and Problem Reporter
 */
import axios from 'axios';

import type { TeamCityClient } from '../../../src/teamcity/client';
import {
  type BuildProblem,
  type CategorizedProblems,
  TestProblemReporter,
} from '../../../src/teamcity/test-problem-reporter';

// Mock axios
jest.mock('axios');
const mockedAxios = jest.mocked(axios, { shallow: false });

// Mock config
jest.mock('../../../src/config', () => ({
  getTeamCityUrl: jest.fn(() => 'http://localhost:8111'),
  getTeamCityToken: jest.fn(() => 'test-token'),
}));

describe('TestProblemReporter', () => {
  let reporter: TestProblemReporter;
  let mockClient: TeamCityClient | Partial<TeamCityClient>;
  type MockAxios = { get: jest.Mock; post: jest.Mock; put: jest.Mock; delete: jest.Mock };
  let mockAxiosInstance: MockAxios;

  beforeEach(() => {
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    (mockedAxios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    mockClient = {} as Partial<TeamCityClient>;

    reporter = new TestProblemReporter(mockClient as TeamCityClient);
  });

  describe('getTestStatistics', () => {
    it('should extract test statistics from build response', async () => {
      const buildId = '12345';

      mockAxiosInstance.get.mockResolvedValue({
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

      mockAxiosInstance.get.mockResolvedValue({
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

      mockAxiosInstance.get.mockResolvedValue({
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
  });

  describe('getFailedTests', () => {
    it('should retrieve failed test details', async () => {
      const buildId = '12348';

      mockAxiosInstance.get.mockResolvedValue({
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

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          testOccurrence: [],
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toEqual([]);
    });

    it('should filter only failed tests', async () => {
      const buildId = '12350';

      mockAxiosInstance.get.mockResolvedValue({
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

      mockAxiosInstance.get.mockResolvedValue({
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

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          problemOccurrence: [],
        },
      });

      const problems = await reporter.getBuildProblems(buildId);

      expect(problems).toEqual([]);
    });

    it('should categorize problems by type', async () => {
      const buildId = '12353';

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          problemOccurrence: [
            { type: 'TC_COMPILATION_ERROR', details: 'Compilation failed' },
            { type: 'TC_COMPILATION_ERROR', details: 'Another compilation error' },
            { type: 'TC_FAILED_TESTS', details: 'Tests failed' },
            { type: 'TC_EXIT_CODE', details: 'Bad exit code' },
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
      mockAxiosInstance.get.mockImplementation((path: string) => {
        if (path === `/builds/id:${buildId}`) {
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
        if (path.includes('/testOccurrences?locator=status:FAILURE')) {
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

      mockAxiosInstance.get.mockResolvedValue({
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
      mockAxiosInstance.get.mockImplementation((path: string) => {
        if (path === `/builds/id:${buildId}`) {
          return Promise.resolve({
            data: {
              id: buildId,
              testOccurrences: {
                count: 100,
                passed: 100,
                failed: 0,
              },
            },
          });
        }
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

      mockAxiosInstance.get.mockImplementation((path: string) => {
        if (path === `/builds/id:${buildId}`) {
          return Promise.resolve({
            data: {
              id: buildId,
              testOccurrences: {
                count: 100,
                failed: 5,
                passed: 95,
              },
            },
          });
        }
        if (path.includes('/testOccurrences?locator=status:FAILURE')) {
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
        return Promise.resolve({ data: {} });
      });

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

      mockAxiosInstance.get.mockImplementation((path: string) => {
        if (path === `/builds/id:${buildId}`) {
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
        if (path.includes('/testOccurrences?locator=status:FAILURE')) {
          return Promise.resolve({
            data: { testOccurrence: tests },
          });
        }
        if (path.includes('/problemOccurrences')) {
          return Promise.resolve({
            data: { problemOccurrence: [] },
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

      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      await expect(reporter.getTestStatistics(buildId)).rejects.toThrow('API Error');
    });

    it('should handle malformed responses', async () => {
      const buildId = '12360';

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          // Missing expected structure
          unexpected: 'data',
        },
      });

      const failedTests = await reporter.getFailedTests(buildId);

      expect(failedTests).toEqual([]);
    });
  });
});
