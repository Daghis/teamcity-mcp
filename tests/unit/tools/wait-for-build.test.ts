// Mock config to avoid reading env
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

describe('tools: wait_for_build', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function setupMocks(
    getBuildStatus: jest.Mock,
    sleepMock?: jest.Mock
  ): { BuildStatusManager: jest.Mock; sleepFn: jest.Mock } {
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

    const sleepFn = sleepMock ?? jest.fn().mockResolvedValue(undefined);
    jest.doMock('@/utils/async', () => ({ sleep: sleepFn }));

    return { BuildStatusManager, sleepFn };
  }

  it('returns immediately for already-finished build', async () => {
    const fakeStatus = {
      buildId: '100',
      state: 'finished',
      status: 'SUCCESS',
      percentageComplete: 100,
    };
    const getBuildStatus = jest.fn().mockResolvedValue(fakeStatus);
    const { sleepFn } = setupMocks(getBuildStatus);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildId: '100',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.state).toBe('finished');
    expect(payload.pollCount).toBe(1);
    expect(payload.timedOut).toBeUndefined();
    expect(getBuildStatus).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('polls until build finishes', async () => {
    const running = { buildId: '200', state: 'running', status: 'SUCCESS', percentageComplete: 50 };
    const finished = {
      buildId: '200',
      state: 'finished',
      status: 'SUCCESS',
      percentageComplete: 100,
    };
    const getBuildStatus = jest
      .fn()
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(finished);
    const { sleepFn } = setupMocks(getBuildStatus);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildId: '200',
      pollInterval: 5,
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.state).toBe('finished');
    expect(payload.pollCount).toBe(3);
    expect(payload.timedOut).toBeUndefined();
    expect(getBuildStatus).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(5000);
  });

  it('returns on timeout with timedOut flag', async () => {
    const running = { buildId: '300', state: 'running', status: 'SUCCESS', percentageComplete: 30 };
    const getBuildStatus = jest.fn().mockResolvedValue(running);

    // Make sleep advance Date.now past the deadline
    let callCount = 0;
    const sleepMock = jest.fn().mockImplementation(() => {
      callCount++;
      // After first sleep, push past the 1s timeout
      if (callCount >= 1) {
        jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10_000);
      }
      return Promise.resolve();
    });
    setupMocks(getBuildStatus, sleepMock);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildId: '300',
      timeout: 1,
      pollInterval: 5,
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.timedOut).toBe(true);
    expect(payload.state).toBe('running');

    jest.restoreAllMocks();
  });

  it('handles canceled builds immediately', async () => {
    const canceled = {
      buildId: '400',
      state: 'canceled',
      percentageComplete: 0,
      canceledBy: 'admin',
    };
    const getBuildStatus = jest.fn().mockResolvedValue(canceled);
    const { sleepFn } = setupMocks(getBuildStatus);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildId: '400',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.state).toBe('canceled');
    expect(payload.pollCount).toBe(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('handles failed builds immediately', async () => {
    const failed = {
      buildId: '401',
      state: 'failed',
      status: 'FAILURE',
      percentageComplete: 100,
    };
    const getBuildStatus = jest.fn().mockResolvedValue(failed);
    const { sleepFn } = setupMocks(getBuildStatus);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildId: '401',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.state).toBe('failed');
    expect(payload.pollCount).toBe(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('passes includeTests and includeProblems to status manager', async () => {
    const fakeStatus = {
      buildId: '500',
      state: 'finished',
      status: 'SUCCESS',
      percentageComplete: 100,
      testSummary: { passed: 10, failed: 0 },
      problems: [],
    };
    const getBuildStatus = jest.fn().mockResolvedValue(fakeStatus);
    setupMocks(getBuildStatus);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    await getRequiredTool('wait_for_build').handler({
      buildId: '500',
      includeTests: true,
      includeProblems: true,
    });

    expect(getBuildStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        buildId: '500',
        includeTests: true,
        includeProblems: true,
        forceRefresh: true,
      })
    );
  });

  it('rejects when neither buildId nor buildNumber is provided', async () => {
    setupMocks(jest.fn());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      timeout: 30,
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('buildId or buildNumber'))).toBe(true);
  });

  it('rejects when buildNumber provided without buildTypeId', async () => {
    setupMocks(jest.fn());

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildNumber: '42',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.success).toBe(false);
    expect(payload.error?.code).toBe('VALIDATION_ERROR');
    const issues = (payload.error?.data ?? []) as Array<{ message?: string }>;
    expect(issues.some((issue) => issue?.message?.includes('buildTypeId is required'))).toBe(true);
  });

  it('coerces string timeout and pollInterval parameters', async () => {
    const fakeStatus = {
      buildId: '600',
      state: 'finished',
      status: 'SUCCESS',
      percentageComplete: 100,
    };
    const getBuildStatus = jest.fn().mockResolvedValue(fakeStatus);
    const { sleepFn } = setupMocks(getBuildStatus);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('wait_for_build').handler({
      buildId: '600',
      timeout: '30',
      pollInterval: '10',
    });

    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.state).toBe('finished');
    expect(payload.pollCount).toBe(1);
    // Sleep wasn't called since build was already finished, but the params were accepted
    expect(sleepFn).not.toHaveBeenCalled();
  });
});
