// Force dev mode (read-only) for lookup tools
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

describe('tools: compatibility lookups', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('get_compatible_build_types_for_agent returns compatibilities', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getCompatibleBuildTypes = jest.fn(async () => ({
            data: { buildType: [{ id: 'bt1' }] },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getCompatibleBuildTypes } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_compatible_build_types_for_agent').handler({
            agentId: 'A1',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ buildType: [{ id: 'bt1' }] });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_incompatible_build_types_for_agent returns incompatibilities', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getIncompatibleBuildTypes = jest.fn(async () => ({
            data: { buildType: [{ id: 'btX' }] },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getIncompatibleBuildTypes } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_incompatible_build_types_for_agent').handler({
            agentId: 'A1',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ buildType: [{ id: 'btX' }] });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_compatible_agents_for_build_type filters enabled-by-default', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllAgents = jest.fn(async () => ({ data: { agent: [{ id: '1' }], count: 1 } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getAllAgents } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_compatible_agents_for_build_type').handler({
            buildTypeId: 'bt1',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(Array.isArray(payload.agent)).toBe(true);
          expect(payload.agent).toHaveLength(1);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_compatible_agents_for_build_type can include disabled when flag set', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllAgents = jest.fn(async () => ({ data: { agent: [], count: 0 } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getAllAgents } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_compatible_agents_for_build_type').handler({
            buildTypeId: 'bt1',
            includeDisabled: true,
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(Array.isArray(payload.agent)).toBe(true);
          expect(payload.agent).toHaveLength(0);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('count_compatible_agents_for_build_type returns only count', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllAgents = jest.fn(async (_loc?: string, fields?: string) => ({
            data: { count: fields === 'count' ? 7 : 0 },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getAllAgents } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('count_compatible_agents_for_build_type').handler({
            buildTypeId: 'bt1',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ count: 7 });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_compatible_agents_for_queued_build derives buildType and looks up agents', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getBuild = jest.fn(async () => ({ buildTypeId: 'btX' }));
          const getAllAgents = jest.fn(async () => ({ data: { agent: [{ id: '2' }], count: 1 } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ getBuild, agents: { getAllAgents } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_compatible_agents_for_queued_build').handler({
            buildId: 'b123',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(Array.isArray(payload.agent)).toBe(true);
          expect(payload.agent).toHaveLength(1);
          resolve();
        })().catch(reject);
      });
    });
  });
});
