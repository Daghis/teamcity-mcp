// Dev mode is fine for list tools
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'dev',
}));

function parseCount(locator?: string): { count: number; start: number } {
  const loc = locator ?? '';
  const mCount = loc.match(/count:(\d+)/) as RegExpMatchArray | null;
  const mStart = loc.match(/start:(\d+)/) as RegExpMatchArray | null;
  return {
    count: mCount ? parseInt(mCount[1] as string, 10) : 100,
    start: mStart ? parseInt(mStart[1] as string, 10) : 0,
  };
}

describe('tools: list pagination with all=true', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('list_projects fetches all pages', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const total = 5;
          const data = Array.from({ length: total }, (_, i) => ({ id: `P${i + 1}` }));
          const getAllProjects = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = data.slice(start, start + count);
            return { data: { project: slice, count: total } };
          });
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ projects: { getAllProjects } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_projects').handler({
            all: true,
            pageSize: 2,
            fields: '$short',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(total);
          const gotIds = (payload.items as Array<{ id: string }>).map((p) => p.id).sort();
          const expectedIds = data.map((p) => p.id).sort();
          expect(gotIds).toEqual(expectedIds);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_build_configs fetches all pages', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const total = 5;
          const data = Array.from({ length: total }, (_, i) => ({ id: `BT${i + 1}` }));
          const getAllBuildTypes = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = data.slice(start, start + count);
            return { data: { buildType: slice, count: total } };
          });
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ buildTypes: { getAllBuildTypes } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_build_configs').handler({
            all: true,
            pageSize: 2,
            fields: '$short',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(total);
          const gotIds = (payload.items as Array<{ id: string }>).map((b) => b.id).sort();
          const expectedIds = data.map((b) => b.id).sort();
          expect(gotIds).toEqual(expectedIds);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_builds fetches all pages', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const total = 5;
          const data = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
          const getAllBuilds = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = data.slice(start, start + count);
            return { data: { build: slice, count: total } };
          });
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ builds: { getAllBuilds } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_builds').handler({
            all: true,
            pageSize: 2,
            fields: 'id',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(total);
          const gotIds = (payload.items as Array<{ id: number }>).map((b) => b.id).sort();
          const expectedIds = data.map((b) => b.id).sort();
          expect(gotIds).toEqual(expectedIds);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_agents and list_agent_pools fetch all pages', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const totalAgents = 4;
          const agentsData = Array.from({ length: totalAgents }, (_, i) => ({ id: `${i + 1}` }));
          const getAllAgents = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = agentsData.slice(start, start + count);
            return { data: { agent: slice, count: totalAgents } };
          });
          const totalPools = 3;
          const poolsData = Array.from({ length: totalPools }, (_, i) => ({ id: `${i + 1}` }));
          const getAllAgentPools = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = poolsData.slice(start, start + count);
            return { data: { agentPool: slice, count: totalPools } };
          });
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ agents: { getAllAgents }, agentPools: { getAllAgentPools } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('list_agents').handler({
            all: true,
            pageSize: 2,
            fields: 'id',
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(totalAgents);
          let gotIds = (payload.items as Array<{ id: string }>).map((a) => a.id).sort();
          let expectedIds = agentsData.map((a) => a.id).sort();
          expect(gotIds).toEqual(expectedIds);

          res = await getRequiredTool('list_agent_pools').handler({
            all: true,
            pageSize: 2,
            fields: 'id',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(totalPools);
          gotIds = (payload.items as Array<{ id: string }>).map((p) => p.id).sort();
          expectedIds = poolsData.map((p) => p.id).sort();
          expect(gotIds).toEqual(expectedIds);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_vcs_roots and list_queued_builds fetch all pages', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const totalRoots = 4;
          const rootsData = Array.from({ length: totalRoots }, (_, i) => ({ id: `V${i + 1}` }));
          const getAllVcsRoots = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = rootsData.slice(start, start + count);
            return { data: { 'vcs-root': slice, count: totalRoots } };
          });
          const totalQueue = 5;
          const queueData = Array.from({ length: totalQueue }, (_, i) => ({ id: i + 1 }));
          const getAllQueuedBuilds = jest.fn(async (locator?: string) => {
            const { count, start } = parseCount(locator);
            const slice = queueData.slice(start, start + count);
            return { data: { build: slice, count: totalQueue } };
          });
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                vcsRoots: { getAllVcsRoots },
                buildQueue: { getAllQueuedBuilds },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          let res = await getRequiredTool('list_vcs_roots').handler({
            all: true,
            pageSize: 2,
            fields: 'id',
          });
          let payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(totalRoots);
          const gotIds = (payload.items as Array<{ id: string }>).map((v) => v.id).sort();
          const expectedIds = rootsData.map((v) => v.id).sort();
          expect(gotIds).toEqual(expectedIds);

          res = await getRequiredTool('list_queued_builds').handler({
            all: true,
            pageSize: 2,
            fields: 'id',
          });
          payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(totalQueue);
          const gotBuildIds = (payload.items as Array<{ id: number }>).map((b) => b.id).sort();
          const expectedBuildIds = queueData.map((b) => b.id).sort();
          expect(gotBuildIds).toEqual(expectedBuildIds);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_test_failures fetches all pages', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const total = 5;
          const data = Array.from({ length: total }, (_, i) => ({ id: `T${i + 1}` }));
          const getAllTestOccurrences = jest.fn(async (locator: string) => {
            const { count, start } = parseCount(locator);
            const slice = data.slice(start, start + count);
            return { data: { testOccurrence: slice, count: total } };
          });
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ tests: { getAllTestOccurrences } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('list_test_failures').handler({
            buildId: 'b1',
            all: true,
            pageSize: 2,
            fields: 'id',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.items.length).toBe(total);
          const gotIds = (payload.items as Array<{ id: string }>).map((t) => t.id).sort();
          const expectedIds = data.map((t) => t.id).sort();
          expect(gotIds).toEqual(expectedIds);
          resolve();
        })().catch(reject);
      });
    });
  });
});
