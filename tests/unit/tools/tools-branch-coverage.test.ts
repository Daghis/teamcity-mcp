/**
 * Tests targeting previously uncovered branches inside `src/tools.ts`.
 *
 * These focus on error-handling paths, fallback branches, and alternate
 * outcomes that Codecov counted as partial line coverage (e.g. the queue
 * fallback in `get_build`, the 400 fallback in `list_server_health_items`,
 * `pause_queue_for_pool`, the `update_build_config` catch fallback, etc.).
 *
 * Pattern mirrors `error-handling.test.ts`: `jest.isolateModules` + per-test
 * `jest.doMock` for `@/api-client` and (where needed) `@/teamcity/*` managers.
 */
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

jest.mock('@/utils/logger/index', () => {
  const noop = jest.fn();
  const mockLoggerInstance = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    logToolExecution: noop,
    logTeamCityRequest: noop,
    logLifecycle: noop,
    child: jest.fn(),
    generateRequestId: () => 'test-request',
  };
  mockLoggerInstance.child.mockReturnValue(mockLoggerInstance);
  return {
    getLogger: () => mockLoggerInstance,
    logger: mockLoggerInstance,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
  };
});

type ToolResult = {
  content?: Array<{ text?: string }>;
  success?: boolean;
  error?: string;
};
type ToolHandler = (args: unknown) => Promise<ToolResult>;

function createAxiosError(options: {
  status?: number;
  data?: unknown;
  message?: string;
  hasResponse?: boolean;
}): AxiosError {
  const err = new Error(options.message ?? 'Request failed') as AxiosError;
  err.isAxiosError = true;
  err.name = 'AxiosError';
  err.config = {} as InternalAxiosRequestConfig;
  err.toJSON = () => ({});
  if (options.hasResponse !== false && options.status !== undefined) {
    err.response = {
      status: options.status,
      statusText: 'Error',
      data: options.data,
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    } as AxiosResponse;
  }
  return err;
}

function loadHandler(toolName: string, register: () => void): Promise<ToolHandler> {
  return new Promise((resolve, reject) => {
    jest.resetModules();
    jest.isolateModules(() => {
      try {
        register();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getRequiredTool } = require('@/tools');
        resolve(getRequiredTool(toolName).handler as ToolHandler);
      } catch (err) {
        reject(err);
      }
    });
  });
}

interface Payload {
  success?: unknown;
  error?: unknown;
  action?: unknown;
  updated?: unknown;
  ok?: unknown;
  criticalCount?: unknown;
  warningCount?: unknown;
  id?: unknown;
  number?: unknown;
  count?: unknown;
  healthItem?: unknown;
  state?: unknown;
  status?: unknown;
  waitReason?: unknown;
  version?: unknown;
  cpu?: unknown;
  buildType?: unknown;
  canceledQueued?: unknown;
  disabledAgents?: unknown;
  enabledAgents?: unknown;
  enabled?: unknown;
  [key: string]: unknown;
}

function parsePayload(res: ToolResult): Payload {
  return JSON.parse((res.content?.[0]?.text as string) ?? '{}') as Payload;
}

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Clear any per-test jest.doMock(…) registrations that might leak across tests
  // (particularly client-adapter and the manager modules used by update_build_config).
  jest.unmock('@/api-client');
  jest.unmock('@/teamcity/client-adapter');
  jest.unmock('@/teamcity/build-configuration-update-manager');
  jest.unmock('@/teamcity/build-configuration-clone-manager');
});

describe('tools: get_build queue fallback branches', () => {
  it('returns queued data when /builds 404s but queue has the build', async () => {
    const handler = await loadHandler('get_build', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            getBuild: async () => {
              throw createAxiosError({ status: 404 });
            },
            modules: {
              buildQueue: {
                getQueuedBuild: jest.fn(async () => ({
                  data: { id: 777, buildTypeId: 'bt', waitReason: 'No agent' },
                })),
              },
            },
          }),
        },
      }));
    });
    const res = await handler({ buildId: '777' });
    const payload = parsePayload(res);
    expect(payload).toMatchObject({ id: 777, state: 'queued', waitReason: 'No agent' });
  });

  it('retries /builds after queue returns 404 (race) and succeeds', async () => {
    const getBuild = jest
      .fn()
      .mockRejectedValueOnce(createAxiosError({ status: 404 }))
      .mockResolvedValueOnce({ id: 'b1', status: 'SUCCESS' });
    const handler = await loadHandler('get_build', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            getBuild,
            modules: {
              buildQueue: {
                getQueuedBuild: async () => {
                  throw createAxiosError({ status: 404 });
                },
              },
            },
          }),
        },
      }));
    });
    const res = await handler({ buildId: 'b1' });
    const payload = parsePayload(res);
    expect(payload.id).toBe('b1');
    expect(getBuild).toHaveBeenCalledTimes(2);
  });

  it('re-throws non-404 errors from /builds', async () => {
    const getQueuedBuild = jest.fn();
    const handler = await loadHandler('get_build', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            getBuild: async () => {
              throw createAxiosError({ status: 500, data: 'boom' });
            },
            modules: { buildQueue: { getQueuedBuild } },
          }),
        },
      }));
    });
    const res = await handler({ buildId: 'b2' });
    const payload = parsePayload(res);
    expect(payload.error ?? payload['message']).toBeDefined();
    expect(getQueuedBuild).not.toHaveBeenCalled();
  });

  it('re-throws non-404 errors from queue endpoint', async () => {
    const handler = await loadHandler('get_build', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            getBuild: async () => {
              throw createAxiosError({ status: 404 });
            },
            modules: {
              buildQueue: {
                getQueuedBuild: async () => {
                  throw createAxiosError({ status: 500 });
                },
              },
            },
          }),
        },
      }));
    });
    const res = await handler({ buildId: 'b3' });
    const payload = parsePayload(res);
    expect(payload.error ?? payload['message']).toBeDefined();
  });
});

describe('tools: list_server_health_items 400 fallback', () => {
  it('applies client-side filter when TeamCity rejects locator', async () => {
    const handler = await loadHandler('list_server_health_items', () => {
      const getHealthItems = jest.fn();
      getHealthItems.mockImplementationOnce(async () => {
        const err = new Error('bad locator') as Error & { statusCode: number };
        err.statusCode = 400;
        throw err;
      });
      getHealthItems.mockImplementationOnce(async () => ({
        data: {
          healthItem: [
            { id: 'a', severity: 'ERROR', category: 'DB' },
            { id: 'b', severity: 'WARNING', category: 'DB' },
            { id: 'c', severity: 'INFO', category: 'SYS' },
          ],
        },
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: { health: { getHealthItems } },
          }),
        },
      }));
    });
    const res = await handler({ locator: 'severity:error,category:DB,id:a,unknown:x' });
    const payload = parsePayload(res);
    expect(payload.count).toBe(1);
    expect(Array.isArray(payload.healthItem)).toBe(true);
    expect((payload.healthItem as Array<{ id: string }>)[0]?.id).toBe('a');
  });

  it('rethrows non-400 errors unchanged', async () => {
    const handler = await loadHandler('list_server_health_items', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              health: {
                getHealthItems: async () => {
                  throw new Error('server down');
                },
              },
            },
          }),
        },
      }));
    });
    const res = await handler({});
    const payload = parsePayload(res);
    expect(payload.error ?? payload['message']).toBeDefined();
  });

  it('recognizes VALIDATION_ERROR code as 400-equivalent', async () => {
    const handler = await loadHandler('list_server_health_items', () => {
      const getHealthItems = jest.fn();
      getHealthItems.mockImplementationOnce(async () => {
        const err = new Error('validation') as Error & { code: string };
        err.code = 'VALIDATION_ERROR';
        throw err;
      });
      getHealthItems.mockImplementationOnce(async () => ({
        data: { healthItem: [{ id: 'x', severity: 'ERROR' }] },
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({ modules: { health: { getHealthItems } } }),
        },
      }));
    });
    const res = await handler({ locator: 'severity:ERROR' });
    const payload = parsePayload(res);
    expect(payload.count).toBe(1);
  });

  it('normalizes category:(ERROR) parenthesized locator', async () => {
    const getHealthItems = jest.fn(async (loc?: string) => ({
      data: { healthItem: [{ id: 'z', severity: 'ERROR' }] },
      _loc: loc,
    }));
    const handler = await loadHandler('list_server_health_items', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({ modules: { health: { getHealthItems } } }),
        },
      }));
    });
    await handler({ locator: '  category:(ERROR)  ' });
    expect(getHealthItems).toHaveBeenCalledWith('category:ERROR');
  });
});

describe('tools: check_availability_guard', () => {
  it('returns ok=false when critical items exist', async () => {
    const handler = await loadHandler('check_availability_guard', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              health: {
                getHealthItems: async () => ({
                  data: {
                    healthItem: [
                      { severity: 'ERROR', id: 'a' },
                      { severity: 'WARNING', id: 'b' },
                    ],
                  },
                }),
              },
            },
          }),
        },
      }));
    });
    const res = await handler({});
    const payload = parsePayload(res);
    expect(payload.ok).toBe(false);
    expect(payload.criticalCount).toBe(1);
    expect(payload.warningCount).toBe(1);
  });

  it('treats warnings as failure when failOnWarning=true', async () => {
    const handler = await loadHandler('check_availability_guard', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              health: {
                getHealthItems: async () => ({
                  data: { healthItem: [{ severity: 'WARNING' }] },
                }),
              },
            },
          }),
        },
      }));
    });
    const res = await handler({ failOnWarning: true });
    expect(parsePayload(res).ok).toBe(false);
  });

  it('returns ok=true when only warnings and failOnWarning=false', async () => {
    const handler = await loadHandler('check_availability_guard', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              health: {
                getHealthItems: async () => ({
                  data: { healthItem: [{ severity: 'WARNING' }] },
                }),
              },
            },
          }),
        },
      }));
    });
    const res = await handler({});
    expect(parsePayload(res).ok).toBe(true);
  });
});

describe('tools: pause_queue_for_pool and resume_queue_for_pool', () => {
  it('disables agents, cancels matching queued builds', async () => {
    const setEnabledInfo = jest.fn(async () => ({}));
    const deleteQueuedBuild = jest.fn(async () => ({}));
    const handler = await loadHandler('pause_queue_for_pool', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              agents: {
                getAllAgents: async () => ({
                  data: { agent: [{ id: '1' }, { id: '2' }, {}] },
                }),
                setEnabledInfo,
              },
              buildQueue: {
                getAllQueuedBuilds: async () => ({
                  data: {
                    build: [
                      { id: 10, buildTypeId: 'btA' },
                      { id: 11, buildTypeId: 'btB' },
                      { buildTypeId: 'btA' }, // no id → skipped
                    ],
                  },
                }),
                deleteQueuedBuild,
              },
            },
          }),
        },
      }));
    });
    const res = await handler({
      poolId: 'pool-1',
      cancelQueuedForBuildTypeId: 'btA',
      comment: 'maintenance',
      until: '2030-01-01T00:00:00Z',
    });
    const payload = parsePayload(res);
    expect(payload).toMatchObject({
      success: true,
      action: 'pause_queue_for_pool',
      disabledAgents: 2,
      canceledQueued: 1,
    });
    expect(setEnabledInfo).toHaveBeenCalledTimes(2);
    expect(deleteQueuedBuild).toHaveBeenCalledWith('10');
  });

  it('skips cancellation when cancelQueuedForBuildTypeId is absent', async () => {
    const deleteQueuedBuild = jest.fn();
    const handler = await loadHandler('pause_queue_for_pool', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              agents: {
                getAllAgents: async () => ({ data: { agent: [{ id: 'a' }] } }),
                setEnabledInfo: async () => ({}),
              },
              buildQueue: { getAllQueuedBuilds: jest.fn(), deleteQueuedBuild },
            },
          }),
        },
      }));
    });
    const res = await handler({ poolId: 'pool' });
    const payload = parsePayload(res);
    expect(payload.canceledQueued).toBe(0);
    expect(deleteQueuedBuild).not.toHaveBeenCalled();
  });

  it('resume_queue_for_pool re-enables all agents in pool', async () => {
    const setEnabledInfo = jest.fn(async () => ({}));
    const handler = await loadHandler('resume_queue_for_pool', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({
            modules: {
              agents: {
                getAllAgents: async () => ({
                  data: { agent: [{ id: '1' }, { id: '2' }, {}] },
                }),
                setEnabledInfo,
              },
            },
          }),
        },
      }));
    });
    const res = await handler({ poolId: 'pool-2' });
    const payload = parsePayload(res);
    expect(payload).toMatchObject({
      success: true,
      action: 'resume_queue_for_pool',
      enabledAgents: 2,
    });
    expect(setEnabledInfo).toHaveBeenCalledTimes(2);
  });
});

describe('tools: update_build_config fallback branches', () => {
  const adapterStub = {
    http: { defaults: { timeout: 0, baseURL: 'http://x', headers: {} } },
    modules: { buildTypes: { setBuildTypeField: jest.fn(async () => ({})) } },
  };

  it('uses direct field updates when manager.retrieveConfiguration returns null', async () => {
    const setBuildTypeField = jest.fn(async () => ({}));
    const retrieveConfiguration = jest.fn(async () => null);
    const setArtifactRulesWithFallback = jest.fn(async () => ({}));
    const adapter = {
      http: adapterStub.http,
      modules: { buildTypes: { setBuildTypeField } },
    };
    const handler = await loadHandler('update_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-update-manager', () => ({
        BuildConfigurationUpdateManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration,
          validateUpdates: jest.fn(),
          applyUpdates: jest.fn(),
        })),
        setArtifactRulesWithFallback,
      }));
      jest.doMock('@/teamcity/client-adapter', () => ({
        createAdapterFromTeamCityAPI: () => adapter,
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({
      buildTypeId: 'bt',
      name: 'new name',
      description: 'new desc',
      artifactRules: 'out/** => dist',
    });
    expect(res.success).toBe(true);
    expect(retrieveConfiguration).toHaveBeenCalledWith('bt');
    expect(setBuildTypeField).toHaveBeenCalledWith('bt', 'name', 'new name', expect.any(Object));
    expect(setArtifactRulesWithFallback).toHaveBeenCalledWith(adapter.http, 'bt', 'out/** => dist');
  });

  it('falls through the catch branch when retrieveConfiguration throws', async () => {
    const setBuildTypeField = jest.fn(async () => ({}));
    const setArtifactRulesWithFallback = jest.fn(async () => ({}));
    const adapter = {
      http: adapterStub.http,
      modules: { buildTypes: { setBuildTypeField } },
    };
    const handler = await loadHandler('update_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-update-manager', () => ({
        BuildConfigurationUpdateManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration: jest.fn(async () => {
            throw new Error('boom');
          }),
          validateUpdates: jest.fn(),
          applyUpdates: jest.fn(),
        })),
        setArtifactRulesWithFallback,
      }));
      jest.doMock('@/teamcity/client-adapter', () => ({
        createAdapterFromTeamCityAPI: () => adapter,
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({
      buildTypeId: 'bt',
      description: 'only-desc',
      artifactRules: 'out/** => dist',
    });
    expect(res.success).toBe(true);
    expect(setArtifactRulesWithFallback).toHaveBeenCalledWith(adapter.http, 'bt', 'out/** => dist');
    expect(setBuildTypeField).toHaveBeenCalledWith(
      'bt',
      'description',
      'only-desc',
      expect.any(Object)
    );
  });

  it('applies updates through the manager happy path', async () => {
    const validateUpdates = jest.fn(async () => ({}));
    const applyUpdates = jest.fn(async () => ({}));
    const adapter = { http: adapterStub.http, modules: { buildTypes: {} } };
    const handler = await loadHandler('update_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-update-manager', () => ({
        BuildConfigurationUpdateManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration: jest.fn(async () => ({ id: 'bt', name: 'old' })),
          validateUpdates,
          applyUpdates,
        })),
        setArtifactRulesWithFallback: jest.fn(),
      }));
      jest.doMock('@/teamcity/client-adapter', () => ({
        createAdapterFromTeamCityAPI: () => adapter,
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({ buildTypeId: 'bt', name: 'new', description: 'desc' });
    expect(res.success).toBe(true);
    expect(validateUpdates).toHaveBeenCalled();
    expect(applyUpdates).toHaveBeenCalled();
  });
});

describe('tools: clone_build_config error/edge branches', () => {
  it('returns failure when source configuration not found', async () => {
    const handler = await loadHandler('clone_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
        BuildConfigurationCloneManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration: jest.fn(async () => null),
          cloneConfiguration: jest.fn(),
        })),
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({ sourceBuildTypeId: 'missing', name: 'n', id: 'new' });
    const payload = parsePayload(res);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('missing');
  });

  it('requires projectId when source has none', async () => {
    const handler = await loadHandler('clone_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
        BuildConfigurationCloneManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration: jest.fn(async () => ({ id: 'src' })),
          cloneConfiguration: jest.fn(),
        })),
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({ sourceBuildTypeId: 'src', name: 'n', id: 'new' });
    const payload = parsePayload(res);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/projectId is required/);
  });

  it('returns failure payload when cloneConfiguration throws', async () => {
    const handler = await loadHandler('clone_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
        BuildConfigurationCloneManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration: jest.fn(async () => ({ id: 'src', projectId: 'P' })),
          cloneConfiguration: jest.fn(async () => {
            throw new Error('clone failed');
          }),
        })),
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({ sourceBuildTypeId: 'src', name: 'n', id: 'new' });
    const payload = parsePayload(res);
    expect(payload.success).toBe(false);
    expect(payload.error).toContain('clone failed');
  });

  it('returns a generic failure message when clone rejects with a non-Error', async () => {
    const handler = await loadHandler('clone_build_config', () => {
      jest.doMock('@/teamcity/build-configuration-clone-manager', () => ({
        BuildConfigurationCloneManager: jest.fn().mockImplementation(() => ({
          retrieveConfiguration: jest.fn(async () => ({ id: 'src', projectId: 'P' })),

          cloneConfiguration: jest.fn(async () => {
            // eslint-disable-next-line no-throw-literal
            throw 'not an error instance';
          }),
        })),
      }));
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: { getInstance: () => ({}) },
      }));
    });
    const res = await handler({ sourceBuildTypeId: 'src', name: 'n', id: 'new' });
    const payload = parsePayload(res);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/Failed to clone build configuration/);
  });
});

describe('tools: simple-getter coverage for assorted read-only tools', () => {
  it('get_agent_enabled_info returns module data', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getEnabledInfo = jest.fn(async () => ({ data: { enabled: true } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ agents: { getEnabledInfo } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_agent_enabled_info').handler({ agentId: 'a1' });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ enabled: true });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_server_health_item returns data from modules.health.getSingleHealthItem', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getSingleHealthItem = jest.fn(async () => ({ data: { id: 'h-1' } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ health: { getSingleHealthItem } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_server_health_item').handler({
            locator: 'id:h-1',
          });
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ id: 'h-1' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_server_info returns info payload', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getServerInfo = jest.fn(async () => ({ data: { version: '2026.04' } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ server: { getServerInfo } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_server_info').handler({});
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ version: '2026.04' });
          resolve();
        })().catch(reject);
      });
    });
  });

  it('get_server_metrics returns metrics payload', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          const getAllMetrics = jest.fn(async () => ({ data: { cpu: 1 } }));
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => ({ server: { getAllMetrics } }) },
          }));
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { getRequiredTool } = require('@/tools');
          const res = await getRequiredTool('get_server_metrics').handler({});
          const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
          expect(payload).toMatchObject({ cpu: 1 });
          resolve();
        })().catch(reject);
      });
    });
  });
});

describe('tools: update_vcs_root_properties', () => {
  it('returns updated=0 when no properties supplied', async () => {
    const setVcsRootProperty = jest.fn();
    const handler = await loadHandler('update_vcs_root_properties', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({ vcsRoots: { setVcsRootProperty } }),
        },
      }));
    });
    const res = await handler({ id: 'v1' });
    const payload = parsePayload(res);
    expect(payload.updated).toBe(0);
    expect(setVcsRootProperty).not.toHaveBeenCalled();
  });

  it('joins a branchSpec array into newline-delimited value', async () => {
    const setVcsRootProperty = jest.fn(async () => ({}));
    const handler = await loadHandler('update_vcs_root_properties', () => {
      jest.doMock('@/api-client', () => ({
        TeamCityAPI: {
          getInstance: () => ({ vcsRoots: { setVcsRootProperty } }),
        },
      }));
    });
    const res = await handler({
      id: 'v1',
      url: 'git@host:repo.git',
      branch: 'refs/heads/main',
      branchSpec: ['+:refs/heads/*', '-:refs/heads/wip/*'],
      checkoutRules: '+:.',
    });
    const payload = parsePayload(res);
    expect(payload.updated).toBe(4);
    expect(setVcsRootProperty).toHaveBeenCalledWith(
      'v1',
      'branchSpec',
      '+:refs/heads/*\n-:refs/heads/wip/*',
      expect.any(Object)
    );
  });
});
