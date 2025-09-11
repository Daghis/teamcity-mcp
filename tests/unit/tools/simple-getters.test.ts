// Dev mode ok for getters/ping
// Use required tool helper to avoid undefined checks

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

describe('tools: simple getters and utilities', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('get_project and get_build_config return JSON passthrough', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getProject = jest.fn(async () => ({ id: 'P1', name: 'Proj' }));
          const getBuildType = jest.fn(async () => ({ id: 'BT1', name: 'Build' }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ getProject, getBuildType }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('get_project').handler({ projectId: 'P1' });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ id: 'P1' });
          res = await getRequiredTool('get_build_config').handler({ buildTypeId: 'BT1' });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ id: 'BT1' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_test_details returns JSON occurrences', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllTestOccurrences = jest.fn(async () => ({
            data: { testOccurrence: [{ name: 't1' }] },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ tests: { getAllTestOccurrences } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_test_details').handler({ buildId: 'b1' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ testOccurrence: [{ name: 't1' }] });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('check_teamcity_connection returns { ok }', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const testConnection = jest.fn(async () => true);
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ testConnection }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('check_teamcity_connection').handler({});
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ ok: true });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('ping returns pong', async () => {
    // no mocks needed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getRequiredTool } = require('@/tools');
    const res = await getRequiredTool('ping').handler({ message: 'hi' });
    const text = (res.content?.[0]?.text as string) ?? '';
    expect(text).toContain('pong');
    expect(text).toContain('hi');
  });
});
