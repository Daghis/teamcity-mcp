// getTool is required within isolateModules per test

// Mock config to run tools in full mode for actions
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: build actions and status/basic info', () => {
  it('get_build returns JSON build payload', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                getBuild: async (id: string) => ({
                  id,
                  number: '42',
                  status: 'SUCCESS',
                  state: 'finished',
                  statusText: 'OK',
                }),
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_build').handler({ buildId: 'b1' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.id).toBe('b1');
          expect(payload.number).toBe('42');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('trigger_build enqueues build with branch and comment metadata', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildToQueue = jest.fn(async () => ({
            data: {
              id: 777,
              state: 'queued',
              status: 'UNKNOWN',
              branchName: 'feature/foo',
            },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  buildQueue: {
                    addBuildToQueue,
                  },
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('trigger_build').handler({
            buildTypeId: 'bt1',
            branchName: 'feature/foo',
            comment: 'go',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ success: true, action: 'trigger_build', buildId: '777' });
          expect(payload.branchName).toBe('feature/foo');
          expect(addBuildToQueue).toHaveBeenCalledTimes(1);
          expect(addBuildToQueue).toHaveBeenCalledWith(
            false,
            expect.objectContaining({
              buildType: { id: 'bt1' },
              branchName: 'feature/foo',
              comment: { text: 'go' },
            }),
            expect.objectContaining({
              headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
            })
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('trigger_build infers branch from teamcity.build.branch property', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildToQueue = jest.fn(async () => ({
            data: {
              id: 888,
              state: 'queued',
              status: 'UNKNOWN',
              branchName: 'feature/bar',
            },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  buildQueue: {
                    addBuildToQueue,
                  },
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('trigger_build').handler({
            buildTypeId: 'bt2',
            properties: {
              'teamcity.build.branch': 'feature/bar',
              'env.FOO': 'bar',
            },
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ success: true, action: 'trigger_build', buildId: '888' });
          expect(payload.branchName).toBe('feature/bar');
          expect(addBuildToQueue).toHaveBeenCalledWith(
            false,
            expect.objectContaining({
              buildType: { id: 'bt2' },
              branchName: 'feature/bar',
              properties: {
                property: expect.arrayContaining([
                  { name: 'teamcity.build.branch', value: 'feature/bar' },
                  { name: 'env.FOO', value: 'bar' },
                ]),
              },
            }),
            expect.anything()
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('trigger_build rejects conflicting branch overrides', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildToQueue = jest.fn();
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  buildQueue: {
                    addBuildToQueue,
                  },
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('trigger_build').handler({
            buildTypeId: 'bt3',
            branchName: 'main',
            properties: {
              'teamcity.build.branch': 'feature/baz',
            },
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.success).toBe(false);
          expect(String(payload.error)).toContain('Conflicting branch overrides');
          expect(addBuildToQueue).not.toHaveBeenCalled();
          resolve();
        })().catch(reject);
      });
    });
  });

  it('cancel_queued_build calls deleteQueuedBuild and returns structured JSON', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const deleteQueuedBuild = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ buildQueue: { deleteQueuedBuild } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('cancel_queued_build').handler({ buildId: 'qb1' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'cancel_queued_build',
            buildId: 'qb1',
          });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_build_status returns structured status JSON', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          // Mock BuildStatusManager to avoid hitting real adapter
          jest.doMock('@/teamcity/build-status-manager', () => ({
            BuildStatusManager: class {
              async getBuildStatus() {
                return {
                  buildId: 'b9',
                  buildNumber: '9',
                  state: 'finished',
                  status: 'SUCCESS',
                  statusText: 'All good',
                  percentageComplete: 100,
                };
              }
            },
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
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
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_build_status').handler({ buildId: 'b9' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ buildId: 'b9', state: 'finished', status: 'SUCCESS' });
          resolve();
        })().catch(reject);
      });
    });
  });
});
