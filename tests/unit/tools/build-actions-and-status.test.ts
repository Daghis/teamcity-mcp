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
                getBuild: async (_id: string) => ({
                  id: 'b1',
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
              headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
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

describe('tools: build pins', () => {
  const runWithBuilds = async (
    builds: Record<string, jest.Mock>,
    body: (
      getRequiredTool: (name: string) => {
        handler: (args: unknown) => Promise<{ content?: Array<{ text?: string }> }>;
      }
    ) => Promise<void>
  ) => {
    jest.resetModules();
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ modules: { builds } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          await body(getRequiredTool);
          resolve();
        })().catch(reject);
      });
    });
  };

  const payloadOf = (res: { content?: Array<{ text?: string }> }) =>
    JSON.parse(res.content?.[0]?.text ?? '{}');

  type FakePin = {
    status?: boolean;
    comment?: { text?: string; timestamp?: string; user?: { username?: string } };
  };

  const createPinStore = () => {
    let pin: FakePin = { status: false };
    return {
      getBuildPinInfo: jest.fn(async () => ({ data: pin })),
      setBuildPinInfo: jest.fn(async (_locator: string, _fields: unknown, body: FakePin) => {
        pin = body.status
          ? {
              status: true,
              comment: {
                text: body.comment?.text,
                timestamp: '20261027T210000+0100',
                user: { username: 'fred' },
              },
            }
          : { status: false };
        return { data: pin };
      }),
    };
  };

  const BUILD_FIELDS = 'build(id,number,buildTypeId,branchName)';

  const buildsFound = (...builds: Array<Record<string, unknown>>) =>
    jest.fn(async () => ({ data: { build: builds } }));

  it('get_build_pin resolves a build number on any branch to one build id', async () => {
    const store = createPinStore();
    const getAllBuilds = buildsFound({
      id: 7,
      number: '40',
      buildTypeId: 'Mac_Build',
      branchName: 'release',
    });
    await runWithBuilds({ ...store, getAllBuilds }, async (getRequiredTool) => {
      const res = await getRequiredTool('get_build_pin').handler({
        buildTypeId: 'Mac_Build',
        buildNumber: 40,
      });
      expect(payloadOf(res)).toEqual({
        buildId: '7',
        buildTypeId: 'Mac_Build',
        buildNumber: '40',
        branchName: 'release',
        pinned: false,
      });
      expect(getAllBuilds).toHaveBeenCalledWith(
        'buildType:(id:Mac_Build),number:40,branch:(default:any),lookupLimit:50000,count:2',
        BUILD_FIELDS
      );
      expect(store.getBuildPinInfo).toHaveBeenCalledWith('id:7');
    });
  });

  it('set_build_pin refuses a build number that matches several builds', async () => {
    const store = createPinStore();
    const getAllBuilds = buildsFound(
      { id: 7, number: '40', branchName: 'main' },
      { id: 9, number: '40', branchName: 'feature' }
    );
    await runWithBuilds({ ...store, getAllBuilds }, async (getRequiredTool) => {
      const res = (await getRequiredTool('set_build_pin').handler({
        buildTypeId: 'Mac_Build',
        buildNumber: '40',
        pinned: true,
      })) as { success?: boolean; error?: string };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Pass buildId');
      expect(store.setBuildPinInfo).not.toHaveBeenCalled();
    });
  });

  it('get_build_pin reports an unknown build number as not found', async () => {
    const store = createPinStore();
    await runWithBuilds({ ...store, getAllBuilds: buildsFound() }, async (getRequiredTool) => {
      const res = (await getRequiredTool('get_build_pin').handler({
        buildTypeId: 'Mac_Build',
        buildNumber: '41',
      })) as { success?: boolean; error?: string };
      expect(res.success).toBe(false);
      expect(res.error).toContain('Build Mac_Build #41 not found');
      expect(store.getBuildPinInfo).not.toHaveBeenCalled();
    });
  });

  it('set_build_pin pins a build that get_build_pin then reports as pinned', async () => {
    const store = createPinStore();
    const getAllBuilds = jest.fn();
    await runWithBuilds({ ...store, getAllBuilds }, async (getRequiredTool) => {
      const res = await getRequiredTool('set_build_pin').handler({
        buildId: '123',
        pinned: true,
        comment: 'released to beta',
      });
      expect(payloadOf(res)).toEqual({
        success: true,
        action: 'set_build_pin',
        buildId: '123',
        pinned: true,
        comment: 'released to beta',
        pinnedBy: 'fred',
        pinnedAt: '20261027T210000+0100',
      });
      expect(store.setBuildPinInfo).toHaveBeenCalledWith('id:123', undefined, {
        status: true,
        comment: { text: 'released to beta' },
      });
      expect(getAllBuilds).not.toHaveBeenCalled();

      const status = await getRequiredTool('get_build_pin').handler({ buildId: '123' });
      expect(payloadOf(status)).toMatchObject({ pinned: true, comment: 'released to beta' });
    });
  });

  it('set_build_pin is idempotent and replaces the comment when pinning again', async () => {
    await runWithBuilds(createPinStore(), async (getRequiredTool) => {
      const tool = getRequiredTool('set_build_pin');
      const first = await tool.handler({ buildId: '123', pinned: true, comment: 'release' });
      const second = await tool.handler({ buildId: '123', pinned: true, comment: 'release' });
      expect(payloadOf(second)).toEqual(payloadOf(first));

      const renamed = await tool.handler({ buildId: '123', pinned: true, comment: 'hotfix' });
      expect(payloadOf(renamed)).toMatchObject({ pinned: true, comment: 'hotfix' });
    });
  });

  it.each([undefined, '', '   '])(
    'set_build_pin uses the default comment when pinning with comment %p',
    async (comment) => {
      const store = createPinStore();
      await runWithBuilds(store, async (getRequiredTool) => {
        const res = await getRequiredTool('set_build_pin').handler({
          buildId: '123',
          pinned: true,
          comment,
        });
        expect(payloadOf(res)).toMatchObject({ pinned: true, comment: 'Pinned via MCP' });
        expect(store.setBuildPinInfo).toHaveBeenCalledWith('id:123', undefined, {
          status: true,
          comment: { text: 'Pinned via MCP' },
        });
      });
    }
  );

  it('set_build_pin unpins a pinned build and ignores a blank comment', async () => {
    const store = createPinStore();
    await runWithBuilds(store, async (getRequiredTool) => {
      const tool = getRequiredTool('set_build_pin');
      await tool.handler({ buildId: '123', pinned: true, comment: 'release' });
      const res = await tool.handler({ buildId: '123', pinned: false, comment: '' });
      expect(payloadOf(res)).toEqual({
        success: true,
        action: 'set_build_pin',
        buildId: '123',
        pinned: false,
      });
      expect(store.setBuildPinInfo).toHaveBeenLastCalledWith('id:123', undefined, {
        status: false,
      });

      const status = await getRequiredTool('get_build_pin').handler({ buildId: '123' });
      expect(payloadOf(status)).toMatchObject({ pinned: false });
    });
  });

  it('set_build_pin returns a failure result when the build is unknown', async () => {
    const notFound = Object.assign(new Error('Request failed with status code 404'), {
      isAxiosError: true,
      response: { status: 404, statusText: 'Not Found', data: 'No build found', headers: {} },
    });
    const setBuildPinInfo = jest.fn(async () => {
      throw notFound;
    });
    await runWithBuilds({ setBuildPinInfo }, async (getRequiredTool) => {
      const res = (await getRequiredTool('set_build_pin').handler({
        buildId: '999',
        pinned: true,
      })) as { success?: boolean };
      expect(res.success).toBe(false);
    });
  });

  const LIST_FIELDS =
    'count,build(id,number,buildTypeId,branchName,status,state,finishDate,webUrl,pinInfo(text,timestamp,user(username,name)))';

  const pinnedBuild = (id: number) => ({
    id,
    number: String(id),
    buildTypeId: 'Mac_Build',
    branchName: 'master',
    status: 'SUCCESS',
    state: 'finished',
    finishDate: '20261027T205400+0100',
    webUrl: `https://tc/build/${id}`,
    pinInfo: { text: 'released', timestamp: '20261027T210000+0100', user: { name: 'Fred' } },
  });

  it('list_pinned_builds filters on pinned builds of all branches and states', async () => {
    const getAllBuilds = jest.fn(async () => ({ data: { count: 1, build: [pinnedBuild(7)] } }));
    await runWithBuilds({ getAllBuilds }, async (getRequiredTool) => {
      const res = await getRequiredTool('list_pinned_builds').handler({
        buildTypeId: 'Mac_Build',
        projectId: 'Mac',
        pageSize: '50',
      });
      expect(payloadOf(res)).toEqual({
        items: [
          {
            id: 7,
            number: '7',
            buildTypeId: 'Mac_Build',
            branchName: 'master',
            status: 'SUCCESS',
            state: 'finished',
            finishDate: '20261027T205400+0100',
            webUrl: 'https://tc/build/7',
            comment: 'released',
            pinnedBy: 'Fred',
            pinnedAt: '20261027T210000+0100',
          },
        ],
        pagination: { page: 1, pageSize: 50 },
      });
      expect(getAllBuilds).toHaveBeenCalledWith(
        'pinned:true,branch:(default:any),defaultFilter:false,lookupLimit:50000,buildType:(id:Mac_Build),affectedProject:(id:Mac),count:50,start:0',
        LIST_FIELDS
      );
    });
  });

  it('list_pinned_builds pages through all pinned builds with all=true', async () => {
    const pages = [[pinnedBuild(1), pinnedBuild(2)], [pinnedBuild(3)]];
    const getAllBuilds = jest.fn(async (locator: string) => {
      const start = Number(/start:(\d+)/.exec(locator)?.[1] ?? 0);
      const build = pages[start / 2] ?? [];
      return { data: { count: build.length, build } };
    });
    await runWithBuilds({ getAllBuilds }, async (getRequiredTool) => {
      const res = await getRequiredTool('list_pinned_builds').handler({ pageSize: 2, all: true });
      const payload = payloadOf(res);
      expect(payload.items.map((b: { id: number }) => b.id)).toEqual([1, 2, 3]);
      expect(payload.pagination).toEqual({ mode: 'all', pageSize: 2, fetched: 3 });
      expect(getAllBuilds).toHaveBeenCalledWith(
        'pinned:true,branch:(default:any),defaultFilter:false,lookupLimit:50000,count:2,start:2',
        LIST_FIELDS
      );
    });
  });
});
