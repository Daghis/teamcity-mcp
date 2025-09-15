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

  it('authorize_agent sets authorized state via authorizedInfo and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setAuthorizedInfo = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { setAuthorizedInfo } }) },
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

  it('set_vcs_root_property sets property and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setVcsRootProperty = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ vcsRoots: { setVcsRootProperty } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('set_vcs_root_property').handler({
            id: 'VCS1',
            name: 'branch',
            value: 'refs/heads/main',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'set_vcs_root_property',
            id: 'VCS1',
            name: 'branch',
          });
          expect(setVcsRootProperty).toHaveBeenCalledWith(
            'VCS1',
            'branch',
            'refs/heads/main',
            expect.any(Object)
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('delete_vcs_root_property deletes property and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const deleteVcsRootProperty = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ vcsRoots: { deleteVcsRootProperty } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('delete_vcs_root_property').handler({
            id: 'VCS1',
            name: 'branchSpec',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'delete_vcs_root_property',
            id: 'VCS1',
            name: 'branchSpec',
          });
          expect(deleteVcsRootProperty).toHaveBeenCalledWith('VCS1', 'branchSpec');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('update_vcs_root_properties updates multiple properties and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setVcsRootProperties = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ vcsRoots: { setVcsRootProperties } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('update_vcs_root_properties').handler({
            id: 'VCS1',
            branch: 'refs/heads/main',
            branchSpec: ['+:refs/heads/*', '+:refs/pull/*/head'],
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'update_vcs_root_properties',
            id: 'VCS1',
            updated: 2,
          });
          expect(setVcsRootProperties).toHaveBeenCalled();
          const [idArg, _fieldsArg, bodyArg] = (setVcsRootProperties.mock.calls[0] ??
            []) as unknown[];
          expect(idArg).toBe('VCS1');
          expect(bodyArg).toMatchObject({
            property: [
              { name: 'branch', value: 'refs/heads/main' },
              { name: 'branchSpec', value: '+:refs/heads/*\n+:refs/pull/*/head' },
            ],
          });
          resolve();
        })().catch(reject);
      });
    });
  });
});
