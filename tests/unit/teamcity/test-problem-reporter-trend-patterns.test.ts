import { TestProblemReporter } from '@/teamcity/test-problem-reporter';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('TestProblemReporter: trends and patterns', () => {
  let mockClient: MockTeamCityClient;
  const BASE_URL = 'http://localhost:8111';

  const configureClient = () => {
    mockClient = createMockTeamCityClient();
    mockClient.getApiConfig.mockReturnValue({
      baseUrl: BASE_URL,
      token: 'token',
      timeout: undefined,
    });
    mockClient.getConfig.mockReturnValue({
      connection: {
        baseUrl: BASE_URL,
        token: 'token',
        timeout: undefined,
      },
    });
  };

  beforeEach(() => configureClient());

  it('getTestTrend aggregates stats for recent builds', async () => {
    mockClient.mockModules.builds.getAllBuilds.mockResolvedValue({
      data: { build: [{ id: 'b1' }, { id: 'b2' }] },
    });
    mockClient.mockModules.builds.getBuild.mockImplementation((locator: string) => {
      if (locator === 'id:b1') {
        return Promise.resolve({
          data: { id: 'b1', testOccurrences: { count: 10, passed: 8, failed: 2 } },
        });
      }
      if (locator === 'id:b2') {
        return Promise.resolve({
          data: { id: 'b2', testOccurrences: { count: 5, passed: 5, failed: 0 } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const reporter = new TestProblemReporter(mockClient);
    const trend = await reporter.getTestTrend('bt1', 2);
    expect(trend).toHaveLength(2);
    expect(trend[0]?.statistics.totalTests).toBe(10);
    expect(trend[1]?.statistics.successRate).toBe(100);
  });

  it('getFailurePatterns counts repeated failures across builds', async () => {
    // Return two failed builds
    mockClient.mockModules.builds.getAllBuilds.mockResolvedValue({
      data: { build: [{ id: 'b10' }, { id: 'b11' }] },
    });
    mockClient.mockModules.tests.getAllTestOccurrences.mockImplementation((locator: string) => {
      if (locator.includes('build:(id:b10)')) {
        return Promise.resolve({
          data: {
            testOccurrence: [
              { id: 't1', name: 'A', status: 'FAILURE', test: { className: 'C' } },
              { id: 't2', name: 'B', status: 'FAILURE', test: { className: 'C' } },
            ],
          },
        });
      }
      if (locator.includes('build:(id:b11)')) {
        return Promise.resolve({
          data: {
            testOccurrence: [{ id: 't3', name: 'C', status: 'FAILURE', test: { className: 'D' } }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    mockClient.mockModules.builds.getBuild.mockResolvedValue({
      data: { id: 'b', testOccurrences: { count: 2, passed: 0, failed: 2 } },
    });

    const reporter = new TestProblemReporter(mockClient);
    const patterns = await reporter.getFailurePatterns('bt2', 2);
    // two tests from same class produce two entries
    expect(Object.values(patterns).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
  });
});
