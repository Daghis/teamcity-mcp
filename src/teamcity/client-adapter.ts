/**
 * Lightweight adapter so managers can work with the unified TeamCityAPI
 * without depending on the legacy TeamCity client implementation.
 */
import axios, { type AxiosInstance } from 'axios';

import type { TeamCityAPI, TeamCityAPIClientConfig } from '@/api-client';
import type { TeamCityFullConfig } from '@/teamcity/config';
import { warn } from '@/utils/logger';

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

const FALLBACK_BASE_URL = 'http://not-configured';

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
  const getBaseUrl = (api as { getBaseUrl?: () => string }).getBaseUrl;
  const inferredBaseUrl = typeof getBaseUrl === 'function' ? getBaseUrl.call(api) : undefined;
  const fallbackBaseUrl =
    inferredBaseUrl ??
    options.apiConfig?.baseUrl ??
    ((api as { http?: AxiosInstance }).http?.defaults?.baseURL as string | undefined) ??
    FALLBACK_BASE_URL;

  const httpInstance: AxiosInstance =
    (api as { http?: AxiosInstance }).http ?? axios.create({ baseURL: fallbackBaseUrl });

  const fallbackApiConfig = resolveApiClientConfigFromApi(api, httpInstance, fallbackBaseUrl);
  const resolvedApiConfig: TeamCityAPIClientConfig = {
    baseUrl: options.apiConfig?.baseUrl ?? fallbackApiConfig.baseUrl,
    token: options.apiConfig?.token ?? fallbackApiConfig.token,
    timeout: options.apiConfig?.timeout ?? fallbackApiConfig.timeout,
  };

  const resolvedFullConfig: TeamCityFullConfig = options.fullConfig ?? {
    connection: {
      baseUrl: resolvedApiConfig.baseUrl,
      token: resolvedApiConfig.token,
      timeout: resolvedApiConfig.timeout,
    },
  };

  if (fallbackBaseUrl === FALLBACK_BASE_URL && resolvedApiConfig.baseUrl === FALLBACK_BASE_URL) {
    warn('TeamCity adapter using fallback baseUrl placeholder', {
      reason: 'missing_base_url',
      hasApiConfig: Boolean(options.apiConfig),
    });
  }

  const request = async <T>(fn: (ctx: TeamCityRequestContext) => Promise<T>): Promise<T> =>
    fn({ axios: httpInstance, baseUrl: resolvedApiConfig.baseUrl, requestId: undefined });

  const buildApi = modules.builds as unknown as BuildApiLike;

  return {
    modules,
    http: httpInstance,
    request,
    getConfig: () => resolvedFullConfig,
    getApiConfig: () => resolvedApiConfig,
    getAxios: () => httpInstance,
    testConnection: () =>
      typeof (api as { testConnection?: () => Promise<boolean> }).testConnection === 'function'
        ? (api as { testConnection: () => Promise<boolean> }).testConnection()
        : Promise.resolve(true),
    listProjects: (locator) => api.listProjects(locator),
    getProject: (projectId) => api.getProject(projectId),
    listBuilds: (locator) => api.listBuilds(locator),
    getBuild: (buildId) => api.getBuild(buildId),
    triggerBuild: (buildTypeId, branchName, comment) =>
      api.triggerBuild(buildTypeId, branchName, comment),
    getBuildLog: (buildId) => api.getBuildLog(buildId),
    getBuildLogChunk: (buildId, options) => api.getBuildLogChunk(buildId, options),
    listBuildTypes: (projectId) => api.listBuildTypes(projectId),
    getBuildType: (buildTypeId) => api.getBuildType(buildTypeId),
    listTestFailures: (buildId) => api.listTestFailures(buildId),
    builds: buildApi,
    listBuildArtifacts: (buildId, options) => api.listBuildArtifacts(buildId, options),
    downloadArtifactContent: (buildId, artifactPath) =>
      api.downloadBuildArtifact(buildId, artifactPath),
    getBuildStatistics: (buildId, fields) => api.getBuildStatistics(buildId, fields),
    listChangesForBuild: (buildId, fields) => api.listChangesForBuild(buildId, fields),
    listSnapshotDependencies: (buildId) => api.listSnapshotDependencies(buildId),
    listVcsRoots: (projectId) => api.listVcsRoots(projectId),
    listAgents: () => api.listAgents(),
    listAgentPools: () => api.listAgentPools(),
    baseUrl: resolvedApiConfig.baseUrl,
  };
}

interface AxiosHeadersRecord {
  common?: AxiosHeadersRecord;
  get?: (name: string) => unknown;
  [key: string]: unknown;
}

const isAxiosHeadersRecord = (value: unknown): value is AxiosHeadersRecord =>
  typeof value === 'object' && value !== null;

/**
 * Derive API client configuration directly from the TeamCityAPI singleton
 * so adapters created without an explicit configuration retain credentials.
 */
const resolveApiClientConfigFromApi = (
  api: TeamCityAPI,
  http: AxiosInstance,
  baseUrlFallback: string
): TeamCityAPIClientConfig => {
  const timeout = resolveTimeout(http);
  const authHeader = getAuthorizationHeader(http);
  const token = stripBearerPrefix(authHeader);

  const getBaseUrl = (api as { getBaseUrl?: () => string }).getBaseUrl;
  const resolvedBaseUrl =
    typeof getBaseUrl === 'function'
      ? getBaseUrl.call(api)
      : (http.defaults.baseURL ?? baseUrlFallback);

  return {
    baseUrl:
      typeof resolvedBaseUrl === 'string' && resolvedBaseUrl.length > 0
        ? resolvedBaseUrl
        : baseUrlFallback,
    token: token ?? '',
    timeout,
  };
};

const getAuthorizationHeader = (http: AxiosInstance): string | undefined => {
  const headers = http.defaults.headers;

  if (!isAxiosHeadersRecord(headers)) {
    return undefined;
  }

  const direct = pickAuthorization(headers);
  if (direct !== undefined) {
    return direct;
  }

  const commonRecord = isAxiosHeadersRecord(headers.common) ? headers.common : undefined;
  if (commonRecord) {
    const common = pickAuthorization(commonRecord);
    if (common !== undefined) {
      return common;
    }
  }

  const getter =
    resolveHeaderGetter(headers) ?? (commonRecord ? resolveHeaderGetter(commonRecord) : undefined);
  if (getter) {
    return readAuthorizationViaGetter(getter, headers);
  }

  return undefined;
};

const resolveTimeout = (http: AxiosInstance): number | undefined => {
  const raw = http.defaults.timeout;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return undefined;
};

const pickAuthorization = (record: AxiosHeadersRecord): string | undefined => {
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() !== 'authorization') {
      continue;
    }

    const value = record[key];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      const [first] = value;
      if (typeof first === 'string') {
        return first;
      }
    }
  }

  return undefined;
};

const resolveHeaderGetter = (
  record: AxiosHeadersRecord
): ((name: string) => unknown) | undefined => {
  const candidate = record.get;
  return typeof candidate === 'function' ? candidate : undefined;
};

const readAuthorizationViaGetter = (
  getter: (name: string) => unknown,
  context: unknown
): string | undefined => {
  try {
    const value = getter.call(context, 'Authorization');
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      const [first] = value;
      return typeof first === 'string' ? first : undefined;
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const stripBearerPrefix = (header: string | undefined): string | undefined => {
  if (typeof header !== 'string') {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? header;
};
