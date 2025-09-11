// getTool is required within isolateModules per test

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: branches, vcs, agents happy paths', () => {
  it('list_branches by projectId aggregates unique branch names', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                listBuilds: async (_: string) => ({
                  build: [
                    { branchName: 'main' },
                    { branchName: 'dev' },
                    { branchName: 'main' },
                    { branchName: null },
                  ],
                }),
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_branches').handler({ projectId: 'P1' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.branches.sort()).toEqual(['dev', 'main']);
          expect(payload.count).toBe(2);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_vcs_roots paginated first page', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllVcsRoots = jest.fn(async (_?: string) => ({
            data: { 'vcs-root': [{ id: 'v1' }, { id: 'v2' }], count: 3 },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ vcsRoots: { getAllVcsRoots } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_vcs_roots').handler({ pageSize: 2 });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items).toHaveLength(2);
          expect(payload.pagination.page).toBe(1);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_vcs_root returns details and properties', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllVcsRoots = jest.fn(async () => ({
            data: { vcsRoot: [{ id: 'v1', name: 'Root', href: '/v1' }] },
          }));
          const getAllVcsRootProperties = jest.fn(async () => ({
            data: { property: [{ name: 'url', value: 'git@example' }] },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ vcsRoots: { getAllVcsRoots, getAllVcsRootProperties } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_vcs_root').handler({ id: 'v1' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.id).toBe('v1');
          expect(payload.properties.property[0].name).toBe('url');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_agents and list_agent_pools basic page', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllAgents = jest.fn(async (_?: string) => ({
            data: { agent: [{ id: 1 }, { id: 2 }], count: 2 },
          }));
          const getAllAgentPools = jest.fn(async (_?: string) => ({
            data: { agentPool: [{ id: 1 }], count: 1 },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ agents: { getAllAgents }, agentPools: { getAllAgentPools } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const agentsRes = await getRequiredTool('list_agents').handler({ pageSize: 2 });
          const poolsRes = await getRequiredTool('list_agent_pools').handler({ pageSize: 1 });
          expect(JSON.parse((agentsRes.content?.[0]?.text as string) ?? '{}').items.length).toBe(2);
          expect(JSON.parse((poolsRes.content?.[0]?.text as string) ?? '{}').items.length).toBe(1);
          resolve();
        })().catch(reject);
      });
    });
  });
});
