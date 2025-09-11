import axios from 'axios';

import type { TeamCityClient } from '@/teamcity/client';
import { TestProblemReporter } from '@/teamcity/test-problem-reporter';

jest.mock('axios');
const mockedAxios = jest.mocked(axios, { shallow: false });

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'http://localhost:8111',
  getTeamCityToken: () => 'token',
}));

describe('TestProblemReporter: trends and patterns', () => {
  const mockClient = {} as TeamCityClient;
  const makeAxios = () => {
    const instance = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };
    (mockedAxios.create as jest.Mock).mockReturnValue(instance);
    return instance as unknown as { get: jest.Mock };
  };

  it('getTestTrend aggregates stats for recent builds', async () => {
    const ax = makeAxios();
    // First call returns builds list
    ax.get.mockImplementation((path: string) => {
      if (path.startsWith('/buildTypes/id:bt1/builds')) {
        return Promise.resolve({ data: { build: [{ id: 'b1' }, { id: 'b2' }] } });
      }
      if (path === '/builds/id:b1') {
        return Promise.resolve({
          data: { id: 'b1', testOccurrences: { count: 10, passed: 8, failed: 2 } },
        });
      }
      if (path === '/builds/id:b2') {
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
    const ax = makeAxios();
    // Return two failed builds
    ax.get.mockImplementation((path: string) => {
      if (path.startsWith('/buildTypes/id:bt2/builds?locator=status:FAILURE')) {
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
      if (path.startsWith('/builds/id:')) {
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
