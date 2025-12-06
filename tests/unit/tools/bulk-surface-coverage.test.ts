jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: bulk surface coverage for list & queue ops', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('list tools accept fields/locator and queue ops execute', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const projects = {
            getAllProjects: jest.fn(async () => ({ data: { project: [], count: 0 } })),
          };
          const buildTypes = {
            getAllBuildTypes: jest.fn(async () => ({ data: { buildType: [], count: 0 } })),
          };
          const builds = { getAllBuilds: jest.fn(async () => ({ data: { build: [], count: 0 } })) };
          const agents = {
            getAllAgents: jest.fn(async () => ({ data: { agent: [], count: 0 } })),
            setEnabledInfo: jest.fn(async () => ({ data: {} })),
          } as unknown as {
            getAllAgents: jest.Mock;
            setEnabledInfo: jest.Mock;
          };
          const agentPools = {
            getAllAgentPools: jest.fn(async () => ({ data: { agentPool: [], count: 0 } })),
          };
          const vcsRoots = {
            getAllVcsRoots: jest.fn(async () => ({ data: { 'vcs-root': [], count: 0 } })),
          };
          const buildQueue = {
            getAllQueuedBuilds: jest.fn(async () => ({ data: { build: [], count: 0 } })),
            setQueuedBuildsOrder: jest.fn(async () => ({ data: {} })),
            deleteQueuedBuild: jest.fn(async () => ({ data: {} })),
          };
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                projects,
                buildTypes,
                builds,
                agents,
                agentPools,
                vcsRoots,
                buildQueue,
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTool } = require('@/tools');

          // Exercise list tools with fields/locator
          await getTool('list_projects').handler({
            locator: 'archived:false',
            pageSize: 1,
            fields: '$short',
          });
          await getTool('list_build_configs').handler({
            locator: 'paused:false',
            pageSize: 1,
            fields: 'id,name',
          });
          await getTool('list_builds').handler({
            locator: 'state:running',
            pageSize: 1,
            fields: 'id,state',
          });
          await getTool('list_agents').handler({
            locator: 'enabled:true',
            pageSize: 1,
            fields: 'id,name',
          });
          await getTool('list_agent_pools').handler({ pageSize: 1, fields: 'id,name' });
          await getTool('list_vcs_roots').handler({ pageSize: 1, fields: 'id,name' });
          await getTool('list_queued_builds').handler({
            locator: 'project:(id:Root)',
            pageSize: 1,
            fields: 'id,waitReason',
          });

          // Exercise set_build_configs_paused with cancelQueued
          await getTool('set_build_configs_paused').handler({
            buildTypeIds: ['bt1', 'bt2'],
            paused: true,
            cancelQueued: true,
          });

          // Exercise pause/resume queue by pool
          // Supply one agent to disable/enable to touch those branches
          agents.getAllAgents.mockResolvedValueOnce({
            data: { agent: [{ id: '123' }], count: 1 },
          } as unknown as { data: { agent: Array<{ id: string }>; count: number } });
          await getTool('pause_queue_for_pool').handler({
            poolId: '1',
            comment: 'maint',
            until: '2025-01-01T00:00:00Z',
          });
          agents.getAllAgents.mockResolvedValueOnce({
            data: { agent: [{ id: '123' }], count: 1 },
          } as unknown as { data: { agent: Array<{ id: string }>; count: number } });
          await getTool('resume_queue_for_pool').handler({ poolId: '1' });

          // Behavior: no exceptions and handlers returned successfully
          resolve();
        })().catch(reject);
      });
    });
  });

  it('set_build_configs_paused skips queued builds with null id', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const buildTypes = {
            setBuildTypeField: jest.fn(async () => ({})),
          };
          const buildQueue = {
            getAllQueuedBuilds: jest.fn(async () => ({
              data: {
                build: [
                  { id: 1001, buildTypeId: 'bt1' },
                  { buildTypeId: 'bt2' }, // No id - should be skipped
                  { id: null, buildTypeId: 'bt1' }, // Null id - should be skipped
                ],
              },
            })),
            deleteQueuedBuild: jest.fn(async () => ({})),
          };

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes,
                buildQueue,
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTool } = require('@/tools');
          const res = await getTool('set_build_configs_paused').handler({
            buildTypeIds: ['bt1', 'bt2'],
            paused: true,
            cancelQueued: true,
          });

          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.success).toBe(true);
          expect(payload.updated).toBe(2); // Both bt1 and bt2 paused
          expect(payload.canceled).toBe(1); // Only the build with id 1001 was canceled
          expect(buildQueue.deleteQueuedBuild).toHaveBeenCalledTimes(1);
          expect(buildQueue.deleteQueuedBuild).toHaveBeenCalledWith('1001');
          resolve();
        })().catch(reject);
      });
    });
  });
});
