import axios, { type AxiosInstance } from 'axios';

import type { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import { createAdapterFromTeamCityAPI } from '@/teamcity/client-adapter';
import type { TeamCityFullConfig } from '@/teamcity/config';
import type {
  BuildApiLike,
  TeamCityApiSurface,
  TeamCityRequestContext,
} from '@/teamcity/types/client';
import { warn } from '@/utils/logger';

jest.mock('@/utils/logger', () => ({
  warn: jest.fn(),
}));

describe('createAdapterFromTeamCityAPI', () => {
  const baseUrl = 'https://teamcity.example.com';
  let http: AxiosInstance;
  let modules: Readonly<TeamCityApiSurface>;
  let apiConfig: TeamCityAPIClientConfig;
  let fullConfig: TeamCityFullConfig;
  let apiMock: TeamCityAPI;
  const testConnection = jest.fn();
  const listProjects = jest.fn();
  const getProject = jest.fn();
  const listBuilds = jest.fn();
  const getBuild = jest.fn();
  const triggerBuild = jest.fn();
  const getBuildLog = jest.fn();
  const getBuildLogChunk = jest.fn();
  const listBuildArtifacts = jest.fn();
  const downloadBuildArtifact = jest.fn();
  const getBuildStatistics = jest.fn();
  const listChangesForBuild = jest.fn();
  const listSnapshotDependencies = jest.fn();
  const listBuildTypes = jest.fn();
  const getBuildType = jest.fn();
  const listTestFailures = jest.fn();
  const listVcsRoots = jest.fn();
  const listAgents = jest.fn();
  const listAgentPools = jest.fn();
  const warnMock = warn as jest.MockedFunction<typeof warn>;

  beforeEach(() => {
    const token = 'token-123';
    const timeout = 4200;

    http = axios.create({
      baseURL: baseUrl,
      timeout,
      headers: { Authorization: `Bearer ${token}` },
    });
    const buildsMock: BuildApiLike = {
      getAllBuilds: jest.fn(),
      getBuild: jest.fn(),
      getMultipleBuilds: jest.fn(),
      getBuildProblems: jest.fn(),
    };

    modules = {
      agents: {},
      agentPools: {},
      agentTypes: {},
      audit: {},
      avatars: {},
      builds: buildsMock,
      buildQueue: {},
      buildTypes: {},
      changes: {},
      cloudInstances: {},
      deploymentDashboards: {},
      globalServerSettings: {},
      groups: {},
      health: {},
      investigations: {},
      mutes: {},
      nodes: {},
      problems: {},
      problemOccurrences: {},
      projects: {},
      roles: {},
      root: {},
      server: {},
      serverAuthSettings: {},
      tests: {},
      testMetadata: {},
      users: {},
      vcsRoots: {},
      vcsRootInstances: {},
      versionedSettings: {},
    } as unknown as TeamCityApiSurface;

    apiConfig = {
      baseUrl,
      token,
      timeout,
    };

    fullConfig = {
      connection: {
        baseUrl,
        token: apiConfig.token,
        timeout: apiConfig.timeout,
      },
    };

    apiMock = {
      modules,
      http,
      getBaseUrl: () => baseUrl,
      testConnection,
      listProjects,
      getProject,
      listBuilds,
      getBuild,
      triggerBuild,
      getBuildLog,
      getBuildLogChunk,
      listBuildTypes,
      getBuildType,
      listTestFailures,
      listBuildArtifacts,
      downloadBuildArtifact,
      getBuildStatistics,
      listChangesForBuild,
      listSnapshotDependencies,
      listVcsRoots,
      listAgents,
      listAgentPools,
    } as unknown as TeamCityAPI;

    testConnection.mockReset().mockResolvedValue(true);
    listProjects.mockReset().mockResolvedValue({ projects: [] });
    getProject.mockReset().mockResolvedValue({ project: {} });
    listBuilds.mockReset().mockResolvedValue({ build: [] });
    getBuild.mockReset().mockResolvedValue({ build: {} });
    triggerBuild.mockReset().mockResolvedValue({ build: 'queued' });
    getBuildLog.mockReset().mockResolvedValue('log');
    getBuildLogChunk.mockReset().mockResolvedValue({ lines: [], startLine: 0 });
    listBuildTypes.mockReset().mockResolvedValue({ buildType: [] });
    getBuildType.mockReset().mockResolvedValue({ buildType: {} });
    listTestFailures.mockReset().mockResolvedValue({ testOccurrence: [] });
    listBuildArtifacts.mockReset();
    downloadBuildArtifact.mockReset();
    getBuildStatistics.mockReset();
    listChangesForBuild.mockReset();
    listSnapshotDependencies.mockReset();
    listVcsRoots.mockReset().mockResolvedValue({ vcsRoot: [] });
    listAgents.mockReset().mockResolvedValue({ agent: [] });
    listAgentPools.mockReset().mockResolvedValue({ agentPool: [] });
    warnMock.mockReset();
  });

  it('exposes unified surface and configuration helpers', async () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock, { apiConfig, fullConfig });

    expect(adapter.modules).toBe(modules);
    expect(adapter.http).toBe(http);
    expect(adapter.getAxios()).toBe(http);
    expect(adapter.getConfig()).toBe(fullConfig);
    expect(adapter.getApiConfig()).toEqual(apiConfig);
    expect(adapter.baseUrl).toBe(baseUrl);

    const buildsMock = modules.builds.getAllBuilds as jest.Mock;
    buildsMock.mockClear();
    expect(typeof adapter.builds.getAllBuilds).toBe('function');
    await adapter.builds.getAllBuilds('locator');
    expect(buildsMock).toHaveBeenCalledWith('locator', undefined, undefined);
  });

  it('delegates helper methods to the underlying API', async () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock, { apiConfig, fullConfig });

    await adapter.listBuildArtifacts('42');
    expect(listBuildArtifacts).toHaveBeenCalledWith('42', undefined);

    await adapter.downloadArtifactContent('42', 'foo.zip');
    expect(downloadBuildArtifact).toHaveBeenCalledWith('42', 'foo.zip');

    await adapter.getBuildStatistics('42', 'data');
    expect(getBuildStatistics).toHaveBeenCalledWith('42', 'data');

    await adapter.listChangesForBuild('42', 'changes');
    expect(listChangesForBuild).toHaveBeenCalledWith('42', 'changes');

    await adapter.listSnapshotDependencies('42');
    expect(listSnapshotDependencies).toHaveBeenCalledWith('42');
  });

  it('delegates extended helper methods to the underlying API', async () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock, { apiConfig, fullConfig });

    await adapter.testConnection();
    expect(testConnection).toHaveBeenCalledTimes(1);

    await adapter.listProjects('locator');
    expect(listProjects).toHaveBeenCalledWith('locator');

    await adapter.getProject('PROJECT_ID');
    expect(getProject).toHaveBeenCalledWith('PROJECT_ID');

    await adapter.listBuilds('buildLocator');
    expect(listBuilds).toHaveBeenCalledWith('buildLocator');

    await adapter.getBuild('buildId');
    expect(getBuild).toHaveBeenCalledWith('buildId');

    await adapter.triggerBuild('bt2', 'refs/heads/main', 'comment');
    expect(triggerBuild).toHaveBeenCalledWith('bt2', 'refs/heads/main', 'comment');

    await adapter.getBuildLog('99');
    expect(getBuildLog).toHaveBeenCalledWith('99');

    const chunkOptions = { startLine: 10, lineCount: 5 } as const;
    await adapter.getBuildLogChunk('100', chunkOptions);
    expect(getBuildLogChunk).toHaveBeenCalledWith('100', chunkOptions);

    await adapter.listBuildTypes('proj');
    expect(listBuildTypes).toHaveBeenCalledWith('proj');

    await adapter.getBuildType('bt3');
    expect(getBuildType).toHaveBeenCalledWith('bt3');

    await adapter.listTestFailures('101');
    expect(listTestFailures).toHaveBeenCalledWith('101');

    await adapter.listVcsRoots('proj');
    expect(listVcsRoots).toHaveBeenCalledWith('proj');

    await adapter.listAgents();
    expect(listAgents).toHaveBeenCalledWith();

    await adapter.listAgentPools();
    expect(listAgentPools).toHaveBeenCalledWith();
  });

  it('provides request helper with axios context', async () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock, { apiConfig, fullConfig });
    const fn = jest.fn(async (ctx: TeamCityRequestContext) => ctx.baseUrl);

    const result = await adapter.request(fn);

    expect(result).toBe(baseUrl);
    expect(fn).toHaveBeenCalledWith({ axios: http, baseUrl, requestId: undefined });
  });

  it('falls back to minimal config when options omitted', () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock);

    expect(adapter.getApiConfig()).toEqual({
      baseUrl,
      token: apiConfig.token,
      timeout: apiConfig.timeout,
    });
    expect(adapter.getConfig()).toEqual({
      connection: {
        baseUrl,
        token: apiConfig.token,
        timeout: apiConfig.timeout,
      },
    });
  });

  it('uses apiConfig baseUrl when TeamCityAPI lacks getBaseUrl', () => {
    const minimalApi = {
      modules,
      listProjects,
      getProject,
      listBuilds,
      getBuild,
      triggerBuild,
      getBuildLog,
      getBuildLogChunk,
      listBuildTypes,
      getBuildType,
      listTestFailures,
      listBuildArtifacts,
      downloadBuildArtifact,
      getBuildStatistics,
      listChangesForBuild,
      listSnapshotDependencies,
      listVcsRoots,
      listAgents,
      listAgentPools,
    } as unknown as TeamCityAPI;

    const adapter = createAdapterFromTeamCityAPI(minimalApi, {
      apiConfig: { baseUrl: 'https://from-options', token: 'opt-token', timeout: 1111 },
    });

    expect(adapter.baseUrl).toBe('https://from-options');
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('uses axios defaults when baseUrl is provided on the HTTP client', () => {
    const httpOnly = axios.create({ baseURL: 'https://from-http' });
    const minimalApi = {
      modules,
      http: httpOnly,
      listProjects,
      getProject,
      listBuilds,
      getBuild,
      triggerBuild,
      getBuildLog,
      getBuildLogChunk,
      listBuildTypes,
      getBuildType,
      listTestFailures,
      listBuildArtifacts,
      downloadBuildArtifact,
      getBuildStatistics,
      listChangesForBuild,
      listSnapshotDependencies,
      listVcsRoots,
      listAgents,
      listAgentPools,
    } as unknown as TeamCityAPI;

    const adapter = createAdapterFromTeamCityAPI(minimalApi);

    expect(adapter.baseUrl).toBe('https://from-http');
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('warns and uses the placeholder baseUrl when no sources are available', async () => {
    const projects = { getAllProjects: jest.fn().mockResolvedValue({}) };
    const builds: BuildApiLike = {
      getAllBuilds: jest.fn(),
      getBuild: jest.fn(),
      getMultipleBuilds: jest.fn(),
      getBuildProblems: jest.fn(),
    };
    const minimalApi = {
      projects,
      builds,
      listProjects,
      getProject,
      listBuilds,
      getBuild,
      triggerBuild,
      getBuildLog,
      getBuildLogChunk,
      listBuildTypes,
      getBuildType,
      listTestFailures,
      listBuildArtifacts,
      downloadBuildArtifact,
      getBuildStatistics,
      listChangesForBuild,
      listSnapshotDependencies,
      listVcsRoots,
      listAgents,
      listAgentPools,
    } as unknown as TeamCityAPI;

    const adapter = createAdapterFromTeamCityAPI(minimalApi);

    expect(adapter.baseUrl).toBe('http://not-configured');
    expect(warnMock).toHaveBeenCalledWith(
      'TeamCity adapter using fallback baseUrl placeholder',
      expect.objectContaining({ reason: 'missing_base_url' })
    );

    await adapter.modules.projects.getAllProjects?.('foo');
    expect(projects.getAllProjects).toHaveBeenCalledWith('foo');
  });
});
