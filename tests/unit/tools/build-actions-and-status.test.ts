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

  it('cancel_build calls cancelBuild with JSON content-type and returns structured JSON', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const cancelBuild = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  builds: { cancelBuild },
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('cancel_build').handler({
            buildId: 'b42',
            comment: 'No longer needed',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({
            success: true,
            action: 'cancel_build',
            buildId: 'b42',
            comment: 'No longer needed',
          });
          expect(cancelBuild).toHaveBeenCalledTimes(1);
          expect(cancelBuild).toHaveBeenCalledWith(
            'id:b42',
            undefined,
            { comment: 'No longer needed', readdIntoQueue: false },
            expect.objectContaining({
              headers: expect.objectContaining({
                'Content-Type': 'application/json',
                Accept: 'application/json',
              }),
            })
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('cancel_build uses default comment when none provided', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const cancelBuild = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  builds: { cancelBuild },
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('cancel_build').handler({ buildId: 'b99' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ success: true, action: 'cancel_build', buildId: 'b99' });
          expect(cancelBuild).toHaveBeenCalledWith(
            'id:b99',
            undefined,
            { comment: 'Cancelled via MCP', readdIntoQueue: false },
            expect.anything()
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('cancel_build passes readdIntoQueue flag', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const cancelBuild = jest.fn(async () => ({}));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  builds: { cancelBuild },
                },
              }),
            },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await getRequiredTool('cancel_build').handler({
            buildId: 'b50',
            readdIntoQueue: true,
          });
          expect(cancelBuild).toHaveBeenCalledWith(
            'id:b50',
            undefined,
            { comment: 'Cancelled via MCP', readdIntoQueue: true },
            expect.anything()
          );
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

describe('tools: trigger_build XML fallback coverage', () => {
  /**
   * Helper to create a mock axios-like http instance.
   * The adapter needs http.defaults for configuration resolution.
   */
  const createMockHttp = (postFn: jest.Mock) => ({
    post: postFn,
    defaults: {
      baseURL: 'https://example.test',
      timeout: 30000,
      headers: { common: { Authorization: 'Bearer test-token' } },
    },
  });

  it('falls back to XML when JSON API fails', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildToQueue = jest.fn().mockRejectedValue(new Error('JSON API unsupported'));
          const httpPost = jest.fn().mockResolvedValue({
            data: {
              id: 999,
              state: 'queued',
              status: 'UNKNOWN',
              branchName: 'main',
            },
          });

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  buildQueue: { addBuildToQueue },
                },
                http: createMockHttp(httpPost),
                getBaseUrl: () => 'https://example.test',
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('trigger_build').handler({
            buildTypeId: 'bt_fallback',
            branchName: 'main',
          });

          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload.success).toBe(true);
          expect(payload.buildId).toBe('999');
          expect(payload.fallback).toEqual({
            mode: 'xml',
            reason: 'JSON API unsupported',
          });

          // Verify XML endpoint was called
          expect(httpPost).toHaveBeenCalledTimes(1);
          expect(httpPost).toHaveBeenCalledWith(
            '/app/rest/buildQueue',
            expect.stringContaining('<?xml version="1.0"'),
            expect.objectContaining({
              headers: { 'Content-Type': 'application/xml', Accept: 'application/json' },
            })
          );
          resolve();
        })().catch(reject);
      });
    });
  });

  it('escapes XML special characters in branch, comment, and properties', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildToQueue = jest.fn().mockRejectedValue(new Error('Force XML'));
          const httpPost = jest.fn().mockResolvedValue({
            data: { id: 1000, state: 'queued' },
          });

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  buildQueue: { addBuildToQueue },
                },
                http: createMockHttp(httpPost),
                getBaseUrl: () => 'https://example.test',
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await getRequiredTool('trigger_build').handler({
            buildTypeId: 'bt<>&"\'test',
            branchName: 'feature/<script>',
            comment: 'Build & Deploy "now"',
            properties: {
              'key<>': 'value&"special\'chars',
            },
          });

          expect(httpPost).toHaveBeenCalledTimes(1);
          const xmlPayload = httpPost.mock.calls[0][1] as string;

          // Verify XML escaping
          expect(xmlPayload).toContain('bt&lt;&gt;&amp;&quot;&apos;test');
          expect(xmlPayload).toContain('<branchName>feature/&lt;script&gt;</branchName>');
          expect(xmlPayload).toContain('<text>Build &amp; Deploy &quot;now&quot;</text>');
          expect(xmlPayload).toContain('name="key&lt;&gt;"');
          expect(xmlPayload).toContain('value="value&amp;&quot;special&apos;chars"');
          resolve();
        })().catch(reject);
      });
    });
  });

  it('includes comment and properties in XML fallback payload', async () => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const addBuildToQueue = jest.fn().mockRejectedValue(new Error('Force XML'));
          const httpPost = jest.fn().mockResolvedValue({
            data: { id: 1001, state: 'queued' },
          });

          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                modules: {
                  buildQueue: { addBuildToQueue },
                },
                http: createMockHttp(httpPost),
                getBaseUrl: () => 'https://example.test',
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await getRequiredTool('trigger_build').handler({
            buildTypeId: 'btWithProps',
            comment: 'Test comment',
            properties: {
              'env.NODE_ENV': 'production',
              'system.debug': 'true',
            },
          });

          expect(httpPost).toHaveBeenCalledTimes(1);
          const xmlPayload = httpPost.mock.calls[0][1] as string;

          // Verify structure
          expect(xmlPayload).toContain('<comment><text>Test comment</text></comment>');
          expect(xmlPayload).toContain('<properties>');
          expect(xmlPayload).toContain('<property name="env.NODE_ENV" value="production"/>');
          expect(xmlPayload).toContain('<property name="system.debug" value="true"/>');
          expect(xmlPayload).toContain('</properties>');
          resolve();
        })().catch(reject);
      });
    });
  });
});
