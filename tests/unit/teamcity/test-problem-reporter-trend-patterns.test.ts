import { TestProblemReporter } from '@/teamcity/test-problem-reporter';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('TestProblemReporter: trends and patterns', () => {
  let mockClient: MockTeamCityClient;
  let http: jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
  const BASE_URL = 'http://localhost:8111';

  const configureClient = () => {
    mockClient = createMockTeamCityClient();
    http = mockClient.http as jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
    http.get.mockReset();
    mockClient.request.mockImplementation(async (fn) => fn({ axios: http, baseUrl: BASE_URL }));
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
    // First call returns builds list
    http.get.mockImplementation((path: string) => {
      if (path.includes('/buildTypes/id:bt1/builds')) {
        return Promise.resolve({ data: { build: [{ id: 'b1' }, { id: 'b2' }] } });
      }
      if (path.includes('/builds/id:b1')) {
        return Promise.resolve({
          data: { id: 'b1', testOccurrences: { count: 10, passed: 8, failed: 2 } },
        });
      }
      if (path.includes('/builds/id:b2')) {
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
    http.get.mockImplementation((path: string) => {
      if (path.includes('/buildTypes/id:bt2/builds?locator=status:FAILURE')) {
        return Promise.resolve({ data: { build: [{ id: 'b10' }, { id: 'b11' }] } });
      }
      if (path.includes('/testOccurrences?locator=status:FAILURE')) {
        return Promise.resolve({
          data: {
            testOccurrence: [
              { id: 't1', name: 'A', status: 'FAILURE', test: { className: 'C' } },
              { id: 't2', name: 'B', status: 'FAILURE', test: { className: 'C' } },
            ],
          },
        });
      }
      if (path.includes('/builds/id:')) {
        // getTestStatistics called inside getFailurePatterns via getFailedTests indirectly; ensure stats call is harmless
        return Promise.resolve({
          data: { id: 'b', testOccurrences: { count: 2, passed: 0, failed: 2 } },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const reporter = new TestProblemReporter(mockClient);
    const patterns = await reporter.getFailurePatterns('bt2', 2);
    // two tests from same class produce two entries
    expect(Object.values(patterns).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(2);
  });
});
