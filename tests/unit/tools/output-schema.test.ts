/**
 * Output schema coverage for the first batch of tools that declare an
 * `outputSchema`. Each case mocks the underlying TeamCity client, invokes the
 * tool through its registered handler, and validates the JSON payload against
 * the declared schema with Ajv — so the acceptance criterion "runtime response
 * conforms to declared schema" is enforced in CI.
 */
import Ajv, { type ValidateFunction } from 'ajv';

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

type PayloadShape = Record<string, unknown>;

const compile = (schema: unknown): ValidateFunction => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(schema as object);
};

const parsePayload = (res: { content?: Array<{ text: string }> }): PayloadShape => {
  const text = res.content?.[0]?.text ?? '{}';
  return JSON.parse(text) as PayloadShape;
};

const assertConforms = (toolName: string, payload: PayloadShape, schema: unknown): void => {
  const validate = compile(schema);
  const ok = validate(payload);
  if (!ok) {
    throw new Error(
      `${toolName} response did not conform to declared outputSchema: ${JSON.stringify(
        validate.errors,
        null,
        2
      )}\nPayload: ${JSON.stringify(payload, null, 2)}`
    );
  }
};

describe('Tool outputSchema: first batch', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('every first-batch tool declares an outputSchema and it is exposed', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool, FIRST_BATCH_OUTPUT_SCHEMAS } = require('@/tools');
          const firstBatch = [
            'list_builds',
            'get_build',
            'get_build_status',
            'get_build_results',
            'list_projects',
            'get_project',
            'list_build_configs',
            'get_build_config',
          ] as const;
          for (const name of firstBatch) {
            const tool = getRequiredTool(name);
            expect(tool.outputSchema).toBeDefined();
            expect(tool.outputSchema).toBe(
              (FIRST_BATCH_OUTPUT_SCHEMAS as Record<string, unknown>)[name]
            );
            // Must be a valid JSON Schema — compile must succeed
            expect(() => compile(tool.outputSchema)).not.toThrow();
          }
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_projects response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllProjects = jest.fn(async () =>
            Promise.resolve({
              data: {
                project: [
                  { id: 'P1', name: 'Project 1', href: '/app/rest/projects/id:P1' },
                  { id: 'P2', name: 'Project 2' },
                ],
                count: 2,
              },
            })
          );
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                projects: { getAllProjects },
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('list_projects');
          const res = await tool.handler({ pageSize: 50 });
          const payload = parsePayload(res);
          assertConforms('list_projects', payload, tool.outputSchema);
          expect(payload['items']).toHaveLength(2);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_project response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getProject = jest.fn(async () => ({
            id: 'P1',
            name: 'Project One',
            parentProjectId: '_Root',
            archived: false,
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ getProject }) },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('get_project');
          const res = await tool.handler({ projectId: 'P1' });
          const payload = parsePayload(res);
          assertConforms('get_project', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_builds response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllBuilds = jest.fn(async () =>
            Promise.resolve({
              data: {
                build: [
                  {
                    id: 1,
                    number: '1',
                    state: 'finished',
                    status: 'SUCCESS',
                    buildTypeId: 'BT1',
                  },
                ],
                count: 1,
              },
            })
          );
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({ builds: { getAllBuilds } }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('list_builds');
          const res = await tool.handler({ pageSize: 10 });
          const payload = parsePayload(res);
          assertConforms('list_builds', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_build response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getBuild = jest.fn(async () => ({
            id: 42,
            number: '42',
            state: 'finished',
            status: 'SUCCESS',
            buildTypeId: 'BT1',
            statusText: 'Tests passed',
            webUrl: 'https://example.test/viewLog.html?buildId=42',
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ getBuild }) },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('get_build');
          const res = await tool.handler({ buildId: '42' });
          const payload = parsePayload(res);
          assertConforms('get_build', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_build_status response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getBuildStatus = jest.fn().mockResolvedValue({
            buildId: '42',
            buildNumber: '42',
            buildTypeId: 'BT1',
            state: 'running',
            status: 'SUCCESS',
            percentageComplete: 55,
            statusText: 'building',
          });
          jest.doMock('@/teamcity/build-status-manager', () => ({
            BuildStatusManager: jest.fn().mockImplementation(() => ({ getBuildStatus })),
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                builds: {},
                buildQueue: {},
                getBaseUrl: () => 'https://example.test',
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('get_build_status');
          const res = await tool.handler({ buildId: '42' });
          const payload = parsePayload(res);
          assertConforms('get_build_status', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_build_results response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getBuildResults = jest.fn().mockResolvedValue({
            build: {
              id: 99,
              number: '99',
              status: 'SUCCESS',
              state: 'finished',
              buildTypeId: 'BT1',
              statusText: 'ok',
              webUrl: 'https://example.test/viewLog.html?buildId=99',
            },
            artifacts: [{ name: 'a.txt', path: 'a.txt', size: 10 }],
            statistics: { testCount: 5, passedTests: 5 },
          });
          jest.doMock('@/teamcity/build-results-manager', () => ({
            BuildResultsManager: jest.fn().mockImplementation(() => ({ getBuildResults })),
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('get_build_results');
          const res = await tool.handler({
            buildId: '99',
            includeArtifacts: true,
            includeStatistics: true,
          });
          const payload = parsePayload(res);
          assertConforms('get_build_results', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('list_build_configs response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllBuildTypes = jest.fn(async () =>
            Promise.resolve({
              data: {
                buildType: [{ id: 'BT1', name: 'Build One', projectId: 'P1' }],
                count: 1,
              },
            })
          );
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: {
              getInstance: () => ({
                buildTypes: { getAllBuildTypes },
              }),
            },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('list_build_configs');
          const res = await tool.handler({ pageSize: 20 });
          const payload = parsePayload(res);
          assertConforms('list_build_configs', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_build_config response conforms to declared schema', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getBuildType = jest.fn(async () => ({
            id: 'BT1',
            name: 'Build One',
            projectId: 'P1',
            projectName: 'Project One',
            paused: false,
          }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ getBuildType }) },
          }));

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const tool = getRequiredTool('get_build_config');
          const res = await tool.handler({ buildTypeId: 'BT1' });
          const payload = parsePayload(res);
          assertConforms('get_build_config', payload, tool.outputSchema);
          resolve();
        })().catch(reject);
      });
    });
  });
});
