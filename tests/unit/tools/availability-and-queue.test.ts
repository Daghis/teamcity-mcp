// Ensure full mode for write tools
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: availability & queue structured tools', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('set_agent_enabled returns structured JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setEnabledInfo = jest.fn(async () => ({ data: { status: true } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { setEnabledInfo } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTool } = require('@/tools');
          const tool = getTool('set_agent_enabled');
          const res = await tool.handler({ agentId: 'A1', enabled: true });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'set_agent_enabled',
            agentId: 'A1',
            enabled: true,
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('bulk_set_agents_enabled aggregates results', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllAgents = jest.fn(async () => ({
            data: { agent: [{ id: '1' }, { id: '2' }] },
          }));
          const setEnabledInfo = jest.fn(async () => ({ data: { status: false } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getAllAgents, setEnabledInfo } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getTool } = require('@/tools');
          const tool = getTool('bulk_set_agents_enabled');
          const res = await tool.handler({ enabled: false, locator: 'enabled:true' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'bulk_set_agents_enabled',
            total: 2,
            succeeded: 2,
            failed: 0,
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_build_status can include queue totals and reason', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          // Mock status manager to return a queued build with queuePosition
          jest.doMock('@/teamcity/build-status-manager', () => ({
            BuildStatusManager: class {
              async getBuildStatus() {
                return {
                  buildId: 'b123',
                  state: 'queued',
                  status: 'UNKNOWN',
                  percentageComplete: 0,
                  queuePosition: 2,
                };
              }
            },
          }));
          const getAllQueuedBuilds = jest.fn(async (_locator?: string, fields?: string) => {
            if (fields === 'count') return { data: { count: 5 } };
            return { data: { build: [] } };
          });
          const getQueuedBuild = jest.fn(async () => ({ data: { waitReason: 'No agent' } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildQueue: { getAllQueuedBuilds, getQueuedBuild },
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
          const { getTool } = require('@/tools');
          const tool = getTool('get_build_status');
          const res = await tool.handler({
            buildId: 'b123',
            includeQueueTotals: true,
            includeQueueReason: true,
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            buildId: 'b123',
            state: 'queued',
            totalQueued: 5,
            waitReason: 'No agent',
            canMoveToTop: true,
          });
          resolve();
        })().catch(reject);
      });
    });
  });
});
