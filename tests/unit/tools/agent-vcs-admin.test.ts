// Full mode for write tools
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: agent admin & VCS', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('authorize_agent sets authorized field and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setAgentField = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { setAgentField } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('authorize_agent').handler({
            agentId: 'A1',
            authorize: true,
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'authorize_agent',
            agentId: 'A1',
            authorized: true,
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('assign_agent_to_pool sets pool and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setAgentPool = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { setAgentPool } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('assign_agent_to_pool').handler({
            agentId: 'A1',
            poolId: '2',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'assign_agent_to_pool',
            agentId: 'A1',
            poolId: '2',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('add_vcs_root_to_build attaches root and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addVcsRootToBuildType = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ buildTypes: { addVcsRootToBuildType } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('add_vcs_root_to_build').handler({
            buildTypeId: 'BT1',
            vcsRootId: 'VCS1',
            checkoutRules: '+:.',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'add_vcs_root_to_build',
            buildTypeId: 'BT1',
            vcsRootId: 'VCS1',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('create_vcs_root creates root and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addVcsRoot = jest.fn(async () => ({ data: { id: 'VCS1' } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ vcsRoots: { addVcsRoot } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('create_vcs_root').handler({
            projectId: 'P1',
            name: 'Root',
            id: 'VCS1',
            vcsName: 'jetbrains.git',
            url: 'https://git',
            branch: 'main',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ success: true, action: 'create_vcs_root', id: 'VCS1' });
          resolve();
        })().catch(reject);
      });
    });
  });
});
