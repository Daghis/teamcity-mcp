// Mock config to avoid reading env
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

describe('tools: enhanced status and results', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('get_build_status with useEnhanced returns JSON payload', async () => {
    const fakeStatus = {
      buildId: '123',
      state: 'running',
      status: 'SUCCESS',
      percentageComplete: 42,
    };

    // Mock BuildStatusManager to return fakeStatus
    const getBuildStatus = jest.fn().mockResolvedValue(fakeStatus);
    const BuildStatusManager = jest.fn().mockImplementation(() => ({ getBuildStatus }));
    jest.doMock('@/teamcity/build-status-manager', () => ({ BuildStatusManager }));

    // Mock TeamCityAPI.getInstance to avoid env dependency
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ builds: {} }) } }));
    // Re-require tools after mocking the module
    // Mock TeamCityAPI.getInstance to avoid env dependency
    jest.doMock('@/api-client', () => ({ TeamCityAPI: { getInstance: () => ({ builds: {} }) } }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_status').handler({
      buildId: '123',
      useEnhanced: true,
      includeTests: true,
    });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(typeof payload).toBe('object');
    expect(payload.buildId).toBe('123');
  });

  it('get_build_results returns enriched payload via manager', async () => {
    const fakeResults = {
      build: { id: 99, status: 'SUCCESS', number: '1' },
      artifacts: [{ name: 'a.txt', size: 10 }],
      statistics: { testCount: 5 },
    };

    const getBuildResults = jest.fn().mockResolvedValue(fakeResults);
    const BuildResultsManager = jest.fn().mockImplementation(() => ({ getBuildResults }));
    jest.doMock('@/teamcity/build-results-manager', () => ({ BuildResultsManager }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_results').handler({
      buildId: '99',
      includeArtifacts: true,
      includeStatistics: true,
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(typeof payload).toBe('object');
    expect(payload.build?.id).toBe(99);
  });
});
