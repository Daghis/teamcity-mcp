import axios, { type AxiosInstance } from 'axios';

import type { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import { createAdapterFromTeamCityAPI } from '@/teamcity/client-adapter';
import type { TeamCityFullConfig } from '@/teamcity/config';
import type {
  BuildApiLike,
  TeamCityApiSurface,
  TeamCityRequestContext,
} from '@/teamcity/types/client';

describe('createAdapterFromTeamCityAPI', () => {
  const baseUrl = 'https://teamcity.example.com';
  let http: AxiosInstance;
  let modules: Readonly<TeamCityApiSurface>;
  let apiConfig: TeamCityAPIClientConfig;
  let fullConfig: TeamCityFullConfig;
  let apiMock: TeamCityAPI;
  const listBuildArtifacts = jest.fn();
  const downloadBuildArtifact = jest.fn();
  const getBuildStatistics = jest.fn();
  const listChangesForBuild = jest.fn();
  const listSnapshotDependencies = jest.fn();

  beforeEach(() => {
    http = axios.create();
    const buildsMock: BuildApiLike = {
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
      token: 'token-123',
      timeout: 4200,
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
      listBuildArtifacts,
      downloadBuildArtifact,
      getBuildStatistics,
      listChangesForBuild,
      listSnapshotDependencies,
    } as unknown as TeamCityAPI;
  });

  it('exposes unified surface and configuration helpers', () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock, { apiConfig, fullConfig });

    expect(adapter.modules).toBe(modules);
    expect(adapter.http).toBe(http);
    expect(adapter.getAxios()).toBe(http);
    expect(adapter.getConfig()).toBe(fullConfig);
    expect(adapter.getApiConfig()).toEqual(apiConfig);
    expect(adapter.baseUrl).toBe(baseUrl);
    expect(adapter.builds).toBe(modules.builds);
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

  it('provides request helper with axios context', async () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock, { apiConfig, fullConfig });
    const fn = jest.fn(async (ctx: TeamCityRequestContext) => ctx.baseUrl);

    const result = await adapter.request(fn);

    expect(result).toBe(baseUrl);
    expect(fn).toHaveBeenCalledWith({ axios: http, baseUrl, requestId: undefined });
  });

  it('falls back to minimal config when options omitted', () => {
    const adapter = createAdapterFromTeamCityAPI(apiMock);

    expect(adapter.getConfig().connection.baseUrl).toBe(baseUrl);
    expect(adapter.getApiConfig().baseUrl).toBe(baseUrl);
  });
});
