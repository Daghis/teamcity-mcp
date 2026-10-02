import type { TeamCityAPI } from '@/api-client';
import { TeamCityAPIError, TeamCityNetworkError } from '@/teamcity/errors';
import { getRequiredTool } from '@/tools';

type GetBuildLogChunk = TeamCityAPI['getBuildLogChunk'];

const mockGetBuildLogChunk = jest.fn<ReturnType<GetBuildLogChunk>, Parameters<GetBuildLogChunk>>();

jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: () => ({ getBuildLogChunk: mockGetBuildLogChunk }),
  },
}));

const fetchLog = async (): Promise<Record<string, unknown>> => {
  const res = await getRequiredTool('fetch_build_log').handler({ buildId: 'b1', lineCount: 2 });
  return JSON.parse((res.content?.[0]?.text as string) ?? '{}') as Record<string, unknown>;
};

describe('fetch_build_log retries', () => {
  beforeEach(() => {
    mockGetBuildLogChunk.mockReset();
  });

  it('fetches the log on the next attempt after a 404', async () => {
    mockGetBuildLogChunk
      .mockRejectedValueOnce(new TeamCityAPIError('Not Found', 'HTTP_404', 404))
      .mockResolvedValueOnce({ lines: ['line 1', 'line 2'], startLine: 0 });

    const payload = await fetchLog();

    expect(payload['lines']).toEqual(['line 1', 'line 2']);
    expect(mockGetBuildLogChunk).toHaveBeenCalledTimes(2);
  });

  // The API client's axios-retry has already retried these before they reach the tool
  it.each([
    ['a 503', new TeamCityAPIError('Service Unavailable', 'HTTP_503', 503)],
    ['a network failure', new TeamCityNetworkError('socket hang up')],
  ])('does not retry %s', async (_label, error) => {
    mockGetBuildLogChunk.mockRejectedValue(error);

    const payload = await fetchLog();

    expect(payload['success']).toBe(false);
    expect(mockGetBuildLogChunk).toHaveBeenCalledTimes(1);
  });
});
