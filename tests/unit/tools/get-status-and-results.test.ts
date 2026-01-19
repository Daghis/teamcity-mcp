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
    jest.doMock('@/api-client', () => ({
      TeamCityAPI: {
        getInstance: () => ({
          builds: {},
          listBuildArtifacts: jest.fn(),
          downloadBuildArtifact: jest.fn(),
          getBuildStatistics: jest.fn(),
          listChangesForBuild: jest.fn(),
          listSnapshotDependencies: jest.fn(),
          getBaseUrl: () => 'https://example.test',
        }),
      },
    }));

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

  it('get_build_status resolves builds using buildTypeId and buildNumber', async () => {
    const fakeStatus = {
      buildId: 'b166',
      buildNumber: '166',
      state: 'finished',
      status: 'SUCCESS',
      percentageComplete: 100,
    };

    const getBuildStatus = jest.fn().mockResolvedValue(fakeStatus);
    const BuildStatusManager = jest.fn().mockImplementation(() => ({ getBuildStatus }));
    jest.doMock('@/teamcity/build-status-manager', () => ({ BuildStatusManager }));

    jest.doMock('@/api-client', () => ({
      TeamCityAPI: {
        getInstance: () => ({
          builds: {},
          buildQueue: {},
          listBuildArtifacts: jest.fn(),
          downloadBuildArtifact: jest.fn(),
          getBuildStatistics: jest.fn(),
          listChangesForBuild: jest.fn(),
          listSnapshotDependencies: jest.fn(),
          getBaseUrl: () => 'https://example.test',
        }),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_status').handler({
      buildTypeId: 'Infrastructure_DeployCrossroads',
      buildNumber: '166',
      includeProblems: true,
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.buildId).toBe('b166');
    expect(payload.buildNumber).toBe('166');
    expect(getBuildStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        buildTypeId: 'Infrastructure_DeployCrossroads',
        buildNumber: '166',
        includeProblems: true,
      })
    );
  });

  it('get_build_status rejects when buildNumber provided without buildTypeId', async () => {
    jest.doMock('@/teamcity/build-status-manager', () => ({
      BuildStatusManager: jest.fn().mockImplementation(() => ({
        getBuildStatus: jest.fn(),
      })),
    }));

    jest.doMock('@/api-client', () => ({
      TeamCityAPI: {
        getInstance: () => ({
          builds: {},
          buildQueue: {},
          listBuildArtifacts: jest.fn(),
          downloadBuildArtifact: jest.fn(),
          getBuildStatistics: jest.fn(),
          listChangesForBuild: jest.fn(),
          listSnapshotDependencies: jest.fn(),
          getBaseUrl: () => 'https://example.test',
        }),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_status').handler({
      buildNumber: '123',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('buildTypeId is required'))).toBe(true);
  });

  it('get_build_status rejects when neither buildId nor buildNumber is provided', async () => {
    jest.doMock('@/teamcity/build-status-manager', () => ({
      BuildStatusManager: jest.fn().mockImplementation(() => ({
        getBuildStatus: jest.fn(),
      })),
    }));

    jest.doMock('@/api-client', () => ({
      TeamCityAPI: {
        getInstance: () => ({
          builds: {},
          buildQueue: {},
          listBuildArtifacts: jest.fn(),
          downloadBuildArtifact: jest.fn(),
          getBuildStatistics: jest.fn(),
          listChangesForBuild: jest.fn(),
          listSnapshotDependencies: jest.fn(),
          getBaseUrl: () => 'https://example.test',
        }),
      },
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_status').handler({ includeTests: true });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('buildId or buildNumber'))).toBe(true);
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
    expect(getBuildResults).toHaveBeenCalledWith(
      '99',
      expect.objectContaining({
        includeArtifacts: true,
        includeStatistics: true,
        artifactEncoding: 'base64',
      })
    );
  });

  it('get_build_results allows streaming artifact encoding', async () => {
    const fakeResults = {
      build: { id: 77, status: 'SUCCESS', number: '10' },
    };

    const getBuildResults = jest.fn().mockResolvedValue(fakeResults);
    const BuildResultsManager = jest.fn().mockImplementation(() => ({ getBuildResults }));
    jest.doMock('@/teamcity/build-results-manager', () => ({ BuildResultsManager }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    await getRequiredTool('get_build_results').handler({
      buildId: '77',
      includeArtifacts: true,
      artifactEncoding: 'stream',
    });

    expect(getBuildResults).toHaveBeenCalledWith(
      '77',
      expect.objectContaining({ artifactEncoding: 'stream' })
    );
  });

  it('get_build_results resolves builds using buildTypeId and buildNumber', async () => {
    const fakeResults = {
      build: { id: 6001, status: 'SUCCESS', number: '60' },
    };

    const getBuildResults = jest.fn().mockResolvedValue(fakeResults);
    const BuildResultsManager = jest.fn().mockImplementation(() => ({ getBuildResults }));
    jest.doMock('@/teamcity/build-results-manager', () => ({ BuildResultsManager }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    await getRequiredTool('get_build_results').handler({
      buildTypeId: 'Infrastructure_DeployCrossroads',
      buildNumber: '60',
      includeStatistics: true,
    });

    expect(getBuildResults).toHaveBeenCalledWith(
      'buildType:(id:Infrastructure_DeployCrossroads),number:60',
      expect.objectContaining({ includeStatistics: true })
    );
  });

  it('get_build_results surfaces friendly not-found message with build context', async () => {
    const { TeamCityNotFoundError } = await import('@/teamcity/errors');

    const notFound = new TeamCityNotFoundError('Build', 'id:12345');
    const getBuildResults = jest.fn().mockRejectedValue(notFound);
    const BuildResultsManager = jest.fn().mockImplementation(() => ({ getBuildResults }));
    jest.doMock('@/teamcity/build-results-manager', () => ({ BuildResultsManager }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_results').handler({
      buildTypeId: 'Infrastructure_DeployCrossroads',
      buildNumber: '60',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.message).toMatch(/Infrastructure_DeployCrossroads[^]*number\s*60/i);
    expect(payload.error?.code).toBe('TEAMCITY_ERROR');
  });

  it('get_build_results rejects when only buildTypeId provided without buildNumber', async () => {
    jest.doMock('@/teamcity/build-results-manager', () => ({
      BuildResultsManager: jest.fn().mockImplementation(() => ({
        getBuildResults: jest.fn(),
      })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_results').handler({
      buildTypeId: 'SomeBuildType',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('together'))).toBe(true);
  });

  it('get_build_results rejects when only buildNumber provided without buildTypeId', async () => {
    jest.doMock('@/teamcity/build-results-manager', () => ({
      BuildResultsManager: jest.fn().mockImplementation(() => ({
        getBuildResults: jest.fn(),
      })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_results').handler({
      buildNumber: '123',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('together'))).toBe(true);
  });

  it('get_build_results rejects when neither buildId nor buildTypeId+buildNumber provided', async () => {
    jest.doMock('@/teamcity/build-results-manager', () => ({
      BuildResultsManager: jest.fn().mockImplementation(() => ({
        getBuildResults: jest.fn(),
      })),
    }));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('get_build_results').handler({
      includeArtifacts: true,
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('buildId or buildTypeId'))).toBe(true);
  });
});
