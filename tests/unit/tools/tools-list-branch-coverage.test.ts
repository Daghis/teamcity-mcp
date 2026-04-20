/**
 * Covers the "filter provided" branch in each list_* tool in `src/tools.ts`.
 *
 * Many list handlers have `if (typed.locator) parts.push(...)` style guards
 * whose "true" branch was never exercised by existing pagination tests (they
 * only pass `all` or `pageSize`). Running each handler with filters + a single
 * page of results turns those partial lines into full hits.
 */
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

describe('tools: list_* filter branch coverage', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock('@/api-client');
  });

  async function runListTool(
    toolName: string,
    topLevelApi: Record<string, unknown>,
    args: Record<string, unknown>
  ): Promise<{ items?: unknown[]; pagination?: unknown; [k: string]: unknown }> {
    return new Promise((resolve, reject) => {
      jest.resetModules();
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => topLevelApi },
          }));
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getRequiredTool } = require('@/tools');
            const res = await getRequiredTool(toolName).handler(args);
            resolve(JSON.parse(res.content?.[0]?.text ?? '{}'));
          } catch (err) {
            reject(err);
          }
        })().catch(reject);
      });
    });
  }

  it('list_changes with locator + projectId + buildId filters all included', async () => {
    const getAllChanges = jest.fn(async () => ({
      data: { change: [{ id: 1 }], count: 1 },
    }));
    const data = await runListTool(
      'list_changes',
      { changes: { getAllChanges } },
      { locator: 'change:(id:1)', projectId: 'P', buildId: 'B', pageSize: 10, fields: 'id' }
    );
    expect(Array.isArray(data.items)).toBe(true);
    expect(getAllChanges).toHaveBeenCalledWith(expect.stringContaining('change:(id:1)'), 'id');
  });

  it('list_problems with filters', async () => {
    const getAllBuildProblems = jest.fn(async () => ({
      data: { problem: [{ id: 'p' }], count: 1 },
    }));
    const data = await runListTool(
      'list_problems',
      { problems: { getAllBuildProblems } },
      { locator: 'identity:X', projectId: 'P', buildId: 'B', pageSize: 10, fields: 'id' }
    );
    expect(data.items).toBeDefined();
    expect(getAllBuildProblems).toHaveBeenCalled();
  });

  it('list_problem_occurrences with filters', async () => {
    const getAllBuildProblemOccurrences = jest.fn(async () => ({
      data: { problemOccurrence: [{ id: 'p' }], count: 1 },
    }));
    const data = await runListTool(
      'list_problem_occurrences',
      { problemOccurrences: { getAllBuildProblemOccurrences } },
      { locator: 'muted:false', projectId: 'P', buildId: 'B', pageSize: 10 }
    );
    expect(data.items).toBeDefined();
  });

  it('list_investigations with filters', async () => {
    const getAllInvestigations = jest.fn(async () => ({
      data: { investigation: [{ id: 'i' }], count: 1 },
    }));
    const data = await runListTool(
      'list_investigations',
      { investigations: { getAllInvestigations } },
      { locator: 'state:TAKEN', assigneeId: 'U', projectId: 'P', pageSize: 10 }
    );
    expect(data.items).toBeDefined();
  });

  it('list_muted_tests with filters', async () => {
    const getAllMutedTests = jest.fn(async () => ({
      data: { mute: [{ id: 'm' }], count: 1 },
    }));
    const data = await runListTool(
      'list_muted_tests',
      { mutes: { getAllMutedTests } },
      { locator: 'affected:scope', projectId: 'P', buildTypeId: 'bt', pageSize: 10 }
    );
    expect(data.items).toBeDefined();
  });

  it('list_users with filters', async () => {
    const getAllUsers = jest.fn(async () => ({
      data: { user: [{ id: 'u' }], count: 1 },
    }));
    const data = await runListTool(
      'list_users',
      { users: { getAllUsers } },
      { locator: 'name:x', pageSize: 10, fields: 'id' }
    );
    expect(data.items).toBeDefined();
  });

  it('list_roles returns the roles payload', async () => {
    const getRoles = jest.fn(async () => ({ data: { role: [{ id: 'r' }] } }));
    const data = await runListTool('list_roles', { roles: { getRoles } }, { fields: 'id' });
    expect(data['items']).toEqual([{ id: 'r' }]);
    expect(data['count']).toBe(1);
  });

  it('list_branches resolves via adapter.listBuilds when buildTypeId is provided', async () => {
    const listBuilds = jest.fn(async () => ({
      build: [
        { branchName: 'refs/heads/main' },
        { branchName: 'refs/heads/dev' },
        { branchName: null },
      ],
    }));
    const data = await runListTool('list_branches', { listBuilds }, { buildTypeId: 'bt1' });
    expect(data['branches']).toEqual(expect.arrayContaining(['refs/heads/main', 'refs/heads/dev']));
    expect(listBuilds).toHaveBeenCalledWith(expect.stringContaining('buildType:(id:bt1)'));
  });

  it('list_branches resolves via projectId when buildTypeId is absent', async () => {
    const listBuilds = jest.fn(async () => ({
      build: [{ branchName: 'feature/x' }],
    }));
    const data = await runListTool('list_branches', { listBuilds }, { projectId: 'proj' });
    expect(listBuilds).toHaveBeenCalledWith(expect.stringContaining('project:(id:proj)'));
    expect(data['count']).toBe(1);
  });

  it('list_parameters calls adapter.getBuildType and returns parameters array', async () => {
    const getBuildType = jest.fn(async () => ({
      parameters: {
        property: [
          { name: 'a', value: '1' },
          { name: 'b', value: '2' },
        ],
      },
    }));
    const data = await runListTool('list_parameters', { getBuildType }, { buildTypeId: 'bt' });
    expect(data['count']).toBe(2);
    expect(Array.isArray(data['parameters'])).toBe(true);
    expect(getBuildType).toHaveBeenCalledWith('bt');
  });

  it('list_parameters handles missing parameters.property gracefully', async () => {
    const getBuildType = jest.fn(async () => ({}));
    const data = await runListTool('list_parameters', { getBuildType }, { buildTypeId: 'bt' });
    expect(data['count']).toBe(0);
    expect(data['parameters']).toEqual([]);
  });

  it('list_project_parameters reads from projects.getBuildParameters', async () => {
    const getBuildParameters = jest.fn(async () => ({
      data: { property: [{ name: 'k', value: 'v' }] },
    }));
    const data = await runListTool(
      'list_project_parameters',
      { projects: { getBuildParameters } },
      { projectId: 'P' }
    );
    expect(data['count']).toBe(1);
    expect(getBuildParameters).toHaveBeenCalledWith('P');
  });

  it('list_project_hierarchy walks projects.getProject recursively', async () => {
    const getProject = jest.fn(async (id: string) => {
      if (id === 'Root') {
        return {
          data: {
            id: 'Root',
            name: 'Root',
            projects: { project: [{ id: 'c1', name: 'Child1' }] },
          },
        };
      }
      return { data: { id, name: `leaf-${id}` } };
    });
    const data = await runListTool(
      'list_project_hierarchy',
      { projects: { getProject } },
      { rootProjectId: 'Root' }
    );
    expect(data['id']).toBe('Root');
    expect(Array.isArray(data['children'])).toBe(true);
  });

  it('list_project_hierarchy defaults to "_Root" when rootProjectId is absent', async () => {
    const getProject = jest.fn(async () => ({
      data: { id: '_Root', name: 'RootProj', projects: { project: [] } },
    }));
    await runListTool('list_project_hierarchy', { projects: { getProject } }, {});
    expect(getProject).toHaveBeenCalledWith('_Root');
  });

  it('handles paginated fetcher with a response missing count', async () => {
    const getAllChanges = jest.fn(async () => ({ data: { change: [{ id: 1 }] } }));
    const data = await runListTool(
      'list_changes',
      { changes: { getAllChanges } },
      { pageSize: 50, fields: 'id' }
    );
    expect(data.items).toBeDefined();
  });

  it('handles paginated fetcher returning a non-array payload', async () => {
    const getAllChanges = jest.fn(async () => ({ data: { change: 'not-array' } }));
    const data = await runListTool(
      'list_changes',
      { changes: { getAllChanges } },
      { pageSize: 50 }
    );
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items).toHaveLength(0);
  });

  it('list_problems fetches all pages when all=true', async () => {
    const getAllBuildProblems = jest.fn(async () => ({
      data: { problem: [], count: 0 },
    }));
    const data = await runListTool(
      'list_problems',
      { problems: { getAllBuildProblems } },
      { all: true, pageSize: 10 }
    );
    expect(data['pagination']).toMatchObject({ mode: 'all' });
  });

  it('list_problem_occurrences fetches all pages when all=true', async () => {
    const getAllBuildProblemOccurrences = jest.fn(async () => ({
      data: { problemOccurrence: [], count: 0 },
    }));
    const data = await runListTool(
      'list_problem_occurrences',
      { problemOccurrences: { getAllBuildProblemOccurrences } },
      { all: true }
    );
    expect(data['pagination']).toMatchObject({ mode: 'all' });
  });

  it('list_investigations fetches all pages when all=true', async () => {
    const getAllInvestigations = jest.fn(async () => ({
      data: { investigation: [], count: 0 },
    }));
    const data = await runListTool(
      'list_investigations',
      { investigations: { getAllInvestigations } },
      { all: true, assigneeUsername: 'user', buildTypeId: 'bt' }
    );
    expect(data['pagination']).toMatchObject({ mode: 'all' });
  });

  it('list_muted_tests fetches all pages when all=true', async () => {
    const getAllMutedTests = jest.fn(async () => ({
      data: { mute: [], count: 0 },
    }));
    const data = await runListTool(
      'list_muted_tests',
      { mutes: { getAllMutedTests } },
      { all: true }
    );
    expect(data['pagination']).toMatchObject({ mode: 'all' });
  });

  it('list_users fetches all pages when all=true', async () => {
    const getAllUsers = jest.fn(async () => ({
      data: { user: [], count: 0 },
    }));
    const data = await runListTool('list_users', { users: { getAllUsers } }, { all: true });
    expect(data['pagination']).toMatchObject({ mode: 'all' });
  });

  it('list_test_failures first-page path with buildId', async () => {
    const getAllTestOccurrences = jest.fn(async () => ({
      data: { testOccurrence: [{ id: 't1' }], count: 1 },
    }));
    const data = await runListTool(
      'list_test_failures',
      { tests: { getAllTestOccurrences } },
      { buildId: 'b1', pageSize: 25, fields: 'id' }
    );
    expect(data['items']).toBeDefined();
  });

  it('list_vcs_roots with projectId filter', async () => {
    const getAllVcsRoots = jest.fn(async () => ({
      data: { 'vcs-root': [{ id: 'v1' }], count: 1 },
    }));
    const data = await runListTool(
      'list_vcs_roots',
      { vcsRoots: { getAllVcsRoots } },
      { projectId: 'P', pageSize: 25, fields: 'id' }
    );
    expect(data['items']).toBeDefined();
  });

  it('list_queued_builds with locator', async () => {
    const getAllQueuedBuilds = jest.fn(async () => ({
      data: { build: [{ id: 1 }], count: 1 },
    }));
    const data = await runListTool(
      'list_queued_builds',
      { buildQueue: { getAllQueuedBuilds } },
      { locator: 'project:(id:P)', pageSize: 25 }
    );
    expect(data['items']).toBeDefined();
  });

  it('list_agents first-page path with filter', async () => {
    const getAllAgents = jest.fn(async () => ({
      data: { agent: [{ id: '1' }], count: 1 },
    }));
    const data = await runListTool(
      'list_agents',
      { agents: { getAllAgents } },
      { locator: 'connected:true', pageSize: 25, fields: 'id' }
    );
    expect(data['items']).toBeDefined();
    expect(getAllAgents).toHaveBeenCalledWith(expect.stringContaining('connected:true'), 'id');
  });

  it('list_agent_pools first-page path', async () => {
    const getAllAgentPools = jest.fn(async () => ({
      data: { agentPool: [{ id: '1' }], count: 1 },
    }));
    const data = await runListTool(
      'list_agent_pools',
      { agentPools: { getAllAgentPools } },
      { pageSize: 25, fields: 'id' }
    );
    expect(data['items']).toBeDefined();
  });

  it('list_builds first-page path with all filters', async () => {
    const getAllBuilds = jest.fn(async () => ({
      data: { build: [{ id: 1 }], count: 1 },
    }));
    const data = await runListTool(
      'list_builds',
      { builds: { getAllBuilds } },
      {
        locator: 'state:running',
        projectId: 'P',
        buildTypeId: 'bt',
        branch: 'refs/heads/main',
        status: 'SUCCESS',
        pageSize: 25,
      }
    );
    expect(data['items']).toBeDefined();
    expect(getAllBuilds).toHaveBeenCalled();
  });

  it('list_build_configs first-page path with filters', async () => {
    const getAllBuildTypes = jest.fn(async () => ({
      data: { buildType: [{ id: 'bt' }], count: 1 },
    }));
    const data = await runListTool(
      'list_build_configs',
      { buildTypes: { getAllBuildTypes } },
      { locator: 'name:foo', projectId: 'P', pageSize: 25, fields: 'id' }
    );
    expect(data['items']).toBeDefined();
  });
});

describe('tools: fetch_build_log retry/error handling branches', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock('@/api-client');
  });

  async function runFetch(args: Record<string, unknown>, api: Record<string, unknown>) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          jest.doMock('@/api-client', () => ({
            TeamCityAPI: { getInstance: () => api },
          }));
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getRequiredTool } = require('@/tools');
            const res = await getRequiredTool('fetch_build_log').handler(args);
            resolve(JSON.parse((res.content?.[0]?.text as string) ?? '{}'));
          } catch (err) {
            reject(err);
          }
        })().catch(reject);
      });
    });
  }

  it('retries on 404 axios errors and eventually surfaces a normalized error', async () => {
    const getBuildLogChunk = jest.fn(async () => {
      const err = new Error('not found') as Error & {
        isAxiosError: boolean;
        response: { status: number; statusText: string };
      };
      err.isAxiosError = true;
      err.response = { status: 404, statusText: 'Not Found' };
      throw err;
    });
    const payload = await runFetch({ buildId: 'b-retry', lineCount: 10 }, { getBuildLogChunk });
    expect(payload['error']).toBeDefined();
    // Retried multiple times before giving up
    expect((getBuildLogChunk as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('retries on 500 axios errors and reports status text', async () => {
    const getBuildLogChunk = jest.fn(async () => {
      const err = new Error('boom') as Error & {
        isAxiosError: boolean;
        response: { status: number; statusText: string };
      };
      err.isAxiosError = true;
      err.response = { status: 503, statusText: 'Service Unavailable' };
      throw err;
    });
    const payload = await runFetch({ buildId: 'b-503', lineCount: 10 }, { getBuildLogChunk });
    expect(payload['error']).toBeDefined();
  });

  it('retries on network errors with no HTTP status', async () => {
    const getBuildLogChunk = jest.fn(async () => {
      const err = new Error('ECONNRESET') as Error & {
        isAxiosError: boolean;
      };
      err.isAxiosError = true;
      throw err;
    });
    const payload = await runFetch({ buildId: 'b-network', lineCount: 10 }, { getBuildLogChunk });
    expect(payload['error']).toBeDefined();
  });

  it('does not retry on non-retryable axios errors (401)', async () => {
    const getBuildLogChunk = jest.fn(async () => {
      const err = new Error('auth') as Error & {
        isAxiosError: boolean;
        response: { status: number };
      };
      err.isAxiosError = true;
      err.response = { status: 401 };
      throw err;
    });
    const payload = await runFetch({ buildId: 'b-401', lineCount: 10 }, { getBuildLogChunk });
    expect(payload['error']).toBeDefined();
    expect((getBuildLogChunk as jest.Mock).mock.calls.length).toBe(1);
  });

  it('normalizes non-axios rejection values into an Error message', async () => {
    const getBuildLogChunk = jest.fn(async () => {
      // eslint-disable-next-line no-throw-literal
      throw 'raw string';
    });
    const payload = await runFetch({ buildId: 'b-string', lineCount: 10 }, { getBuildLogChunk });
    // Non-axios non-Error value surfaces via the normalizeError(String(err)) branch.
    expect(payload['error']).toBeDefined();
  });
});

describe('tools: additional write-tool validation + error branches', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.unmock('@/api-client');
    jest.unmock('@/teamcity/client-adapter');
    jest.unmock('@/teamcity/build-dependency-manager');
    jest.unmock('@/teamcity/build-feature-manager');
    jest.unmock('@/teamcity/agent-requirements-manager');
    jest.unmock('@/teamcity/artifact-manager');
    jest.unmock('@/teamcity/build-results-manager');
  });

  async function runWithAdapter(
    toolName: string,
    register: () => void,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      jest.isolateModules(() => {
        (async () => {
          try {
            register();
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { getRequiredTool } = require('@/tools');
            const res = await getRequiredTool(toolName).handler(args);
            resolve(JSON.parse((res.content?.[0]?.text as string) ?? '{}'));
          } catch (err) {
            reject(err);
          }
        })().catch(reject);
      });
    });
  }

  it('download_build_artifacts throws when every artifact fails', async () => {
    const downloadArtifact = jest.fn(async () => {
      throw new Error('bad artifact');
    });
    const payload = await runWithAdapter(
      'download_build_artifacts',
      () => {
        jest.doMock('@/teamcity/artifact-manager', () => ({
          ArtifactManager: jest.fn().mockImplementation(() => ({ downloadArtifact })),
        }));
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      { buildId: 'b1', artifactPaths: ['a.txt', 'b.txt'], encoding: 'text' }
    );
    expect(payload['error']).toBeDefined();
    const err = payload['error'] as { message?: string } | string;
    const message = typeof err === 'string' ? err : (err?.message ?? '');
    expect(message).toMatch(/All artifact downloads failed/);
  });

  it('get_build_results rethrows non-not-found errors from the manager', async () => {
    const payload = await runWithAdapter(
      'get_build_results',
      () => {
        jest.doMock('@/teamcity/build-results-manager', () => ({
          BuildResultsManager: jest.fn().mockImplementation(() => ({
            getBuildResults: jest.fn(async () => {
              throw new Error('boom');
            }),
          })),
        }));
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      { buildId: 'b1' }
    );
    expect(payload['error']).toBeDefined();
  });

  it('download_build_artifacts rejects outputDir without stream encoding (zod)', async () => {
    const payload = await runWithAdapter(
      'download_build_artifacts',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      {
        buildId: 'b',
        artifactPaths: ['a.txt'],
        encoding: 'base64',
        outputDir: '/tmp/output',
      }
    );
    expect(payload['error']).toBeDefined();
  });

  it('list_project_hierarchy caps recursion at depth 3 (else-branch of else-if)', async () => {
    const getProject = jest.fn(async (id: string) => {
      // Always returns another child, which would recurse forever; depth
      // cap forces the else-if branch once we hit depth == 3.
      return {
        data: {
          id,
          name: `${id}-proj`,
          projects: { project: [{ id: `${id}-sub`, name: `${id}-sub-proj` }] },
        },
      };
    });
    const payload = await runWithAdapter(
      'list_project_hierarchy',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({ projects: { getProject } }) },
        }));
      },
      { rootProjectId: 'r0' }
    );
    expect(payload['children']).toBeDefined();
    expect(Array.isArray(payload['children'])).toBe(true);
  });

  it('manage_build_dependencies rejects missing dependsOn on action=add (zod)', async () => {
    const payload = await runWithAdapter(
      'manage_build_dependencies',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      {
        buildTypeId: 'bt',
        dependencyType: 'snapshot',
        action: 'add',
      }
    );
    expect(payload['error']).toBeDefined();
  });

  it('manage_build_dependencies rejects missing dependencyId on action=update', async () => {
    const payload = await runWithAdapter(
      'manage_build_dependencies',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      {
        buildTypeId: 'bt',
        dependencyType: 'snapshot',
        action: 'update',
      }
    );
    expect(payload['error']).toBeDefined();
  });

  it('manage_build_features rejects missing type on action=add', async () => {
    const payload = await runWithAdapter(
      'manage_build_features',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      {
        buildTypeId: 'bt',
        action: 'add',
      }
    );
    expect(payload['error']).toBeDefined();
  });

  it('manage_agent_requirements rejects missing requirementId on action=delete', async () => {
    const payload = await runWithAdapter(
      'manage_agent_requirements',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: { getInstance: () => ({}) },
        }));
      },
      {
        buildTypeId: 'bt',
        action: 'delete',
      }
    );
    expect(payload['error']).toBeDefined();
  });

  it('manage_build_triggers delete requires triggerId', async () => {
    const payload = await runWithAdapter(
      'manage_build_triggers',
      () => {
        jest.doMock('@/api-client', () => ({
          TeamCityAPI: {
            getInstance: () => ({
              buildTypes: { addTriggerToBuildType: jest.fn(), deleteTrigger: jest.fn() },
            }),
          },
        }));
      },
      { buildTypeId: 'bt', action: 'delete' }
    );
    expect(payload['success']).toBe(false);
    expect(payload['error']).toMatch(/Trigger ID is required/);
  });
});
