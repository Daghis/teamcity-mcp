// Full mode for write tools
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: queue maintenance operations', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('move_queued_build_to_top calls setQueuedBuildsOrder and returns JSON', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setQueuedBuildsOrder = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ buildQueue: { setQueuedBuildsOrder } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('move_queued_build_to_top').handler({ buildId: '123' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'move_queued_build_to_top',
            buildId: '123',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('reorder_queued_builds sets desired order and returns JSON with count', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const setQueuedBuildsOrder = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ buildQueue: { setQueuedBuildsOrder } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('reorder_queued_builds').handler({
            buildIds: ['1', '2'],
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'reorder_queued_builds',
            count: 2,
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('cancel_queued_builds_for_build_type cancels only matching builds', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllQueuedBuilds = jest.fn(async () => ({
            data: {
              build: [
                { id: 1, buildTypeId: 'bt1' },
                { id: 2, buildTypeId: 'bt2' },
                { id: 3, buildTypeId: 'bt1' },
              ],
              count: 3,
            },
          }));
          const deleteQueuedBuild = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildQueue: { getAllQueuedBuilds, deleteQueuedBuild } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('cancel_queued_builds_for_build_type').handler({
            buildTypeId: 'bt1',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'cancel_queued_builds_for_build_type',
            buildTypeId: 'bt1',
            canceled: 2,
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('cancel_queued_builds_by_locator cancels all returned builds', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllQueuedBuilds = jest.fn(async () => ({
            data: { build: [{ id: 10 }, { id: 11 }], count: 2 },
          }));
          const deleteQueuedBuild = jest.fn(async () => ({ data: {} }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ buildQueue: { getAllQueuedBuilds, deleteQueuedBuild } }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('cancel_queued_builds_by_locator').handler({
            locator: 'project:(id:P1)',
          });
          const payload = JSON.parse(res.content?.[0]?.text as string) ?? '{}';
          expect(payload).toMatchObject({
            success: true,
            action: 'cancel_queued_builds_by_locator',
            locator: 'project:(id:P1)',
            canceled: 2,
          });
          resolve();
        })().catch(reject);
      });
    });
  });
});
