/**
 * Lightweight adapter so managers can work with the unified TeamCityAPI
 * without depending on the legacy TeamCityClient implementation.
 */
import type { AxiosInstance } from 'axios';

import type { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import type { TeamCityFullConfig } from '@/teamcity/config';

import type {
  BuildApiLike,
  TeamCityApiSurface,
  TeamCityClientAdapter,
  TeamCityRequestContext,
} from './types/client';

export type { TeamCityClientAdapter } from './types/client';

interface AdapterOptions {
  fullConfig?: TeamCityFullConfig;
  apiConfig?: TeamCityAPIClientConfig;
}

const resolveModules = (api: TeamCityAPI): Readonly<TeamCityApiSurface> => {
  const candidate = (api as { modules?: Readonly<TeamCityApiSurface> }).modules;
  if (candidate != null) {
    return candidate;
  }

  const legacy = api as unknown as Record<string, unknown>;
  const pick = <K extends keyof TeamCityApiSurface>(key: K): TeamCityApiSurface[K] =>
    (legacy[key as string] ?? {}) as TeamCityApiSurface[K];

  const fallback: TeamCityApiSurface = {
    agents: pick('agents'),
    agentPools: pick('agentPools'),
    agentTypes: pick('agentTypes'),
    audit: pick('audit'),
    avatars: pick('avatars'),
    builds: pick('builds'),
    buildQueue: pick('buildQueue'),
    buildTypes: pick('buildTypes'),
    changes: pick('changes'),
    cloudInstances: pick('cloudInstances'),
    deploymentDashboards: pick('deploymentDashboards'),
    globalServerSettings: pick('globalServerSettings'),
    groups: pick('groups'),
    health: pick('health'),
    investigations: pick('investigations'),
    mutes: pick('mutes'),
    nodes: pick('nodes'),
    problems: pick('problems'),
    problemOccurrences: pick('problemOccurrences'),
    projects: pick('projects'),
    roles: pick('roles'),
    root: pick('root'),
    server: pick('server'),
    serverAuthSettings: pick('serverAuthSettings'),
    tests: pick('tests'),
    testMetadata: pick('testMetadata'),
    users: pick('users'),
    vcsRoots: pick('vcsRoots'),
    vcsRootInstances: pick('vcsRootInstances'),
    versionedSettings: pick('versionedSettings'),
  };

  return Object.freeze(fallback);
};

export function createAdapterFromTeamCityAPI(
  api: TeamCityAPI,
  options: AdapterOptions = {}
): TeamCityClientAdapter {
  const modules = resolveModules(api);
  const httpInstance = api.http ?? ({} as AxiosInstance);
  const resolvedApiConfig: TeamCityAPIClientConfig = {
    baseUrl: options.apiConfig?.baseUrl ?? api.getBaseUrl(),
    token: options.apiConfig?.token ?? '',
    timeout: options.apiConfig?.timeout ?? undefined,
  };

  const resolvedFullConfig: TeamCityFullConfig =
    options.fullConfig ?? {
      connection: {
        baseUrl: resolvedApiConfig.baseUrl,
        token: resolvedApiConfig.token,
        timeout: resolvedApiConfig.timeout,
      },
    };

  const request = async <T>(fn: (ctx: TeamCityRequestContext) => Promise<T>): Promise<T> =>
    fn({ axios: httpInstance, baseUrl: api.getBaseUrl(), requestId: undefined });

  const buildApi = modules.builds as unknown as BuildApiLike;

  return {
    modules,
    http: httpInstance,
    request,
    getConfig: () => resolvedFullConfig,
    getApiConfig: () => resolvedApiConfig,
    getAxios: () => httpInstance,
    builds: buildApi,
    listBuildArtifacts: (buildId, options) => api.listBuildArtifacts(buildId, options),
    downloadArtifactContent: (buildId, artifactPath) =>
      api.downloadBuildArtifact(buildId, artifactPath),
    getBuildStatistics: (buildId, fields) => api.getBuildStatistics(buildId, fields),
    listChangesForBuild: (buildId, fields) => api.listChangesForBuild(buildId, fields),
    listSnapshotDependencies: (buildId) => api.listSnapshotDependencies(buildId),
    baseUrl: api.getBaseUrl(),
  };
}
