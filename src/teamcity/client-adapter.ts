/**
 * Lightweight adapter so managers can work with the unified TeamCityAPI
 * without depending on the legacy TeamCityClient implementation.
 */
import type { AxiosInstance, AxiosResponse } from 'axios';

import type { TeamCityAPI } from '@/api-client';

export interface TeamCityClientAdapter {
  builds: TeamCityAPI['builds'];
  projects: TeamCityAPI['projects'];
  buildTypes: TeamCityAPI['buildTypes'];
  buildQueue: TeamCityAPI['buildQueue'];
  tests: TeamCityAPI['tests'];
  testOccurrences: TeamCityAPI['tests'];
  vcsRoots: TeamCityAPI['vcsRoots'];
  agents: TeamCityAPI['agents'];
  agentPools: TeamCityAPI['agentPools'];
  server: TeamCityAPI['server'];
  health: TeamCityAPI['health'];
  changes: TeamCityAPI['changes'];
  problems: TeamCityAPI['problems'];
  problemOccurrences: TeamCityAPI['problemOccurrences'];
  investigations: TeamCityAPI['investigations'];
  mutes: TeamCityAPI['mutes'];
  versionedSettings: TeamCityAPI['versionedSettings'];
  roles: TeamCityAPI['roles'];
  users: TeamCityAPI['users'];
  testConnection: TeamCityAPI['testConnection'];
  listProjects: TeamCityAPI['listProjects'];
  getProject: TeamCityAPI['getProject'];
  listBuilds: TeamCityAPI['listBuilds'];
  getBuild: TeamCityAPI['getBuild'];
  triggerBuild: TeamCityAPI['triggerBuild'];
  getBuildLog: TeamCityAPI['getBuildLog'];
  getBuildLogChunk: TeamCityAPI['getBuildLogChunk'];
  listBuildTypes: TeamCityAPI['listBuildTypes'];
  getBuildType: TeamCityAPI['getBuildType'];
  listTestFailures: TeamCityAPI['listTestFailures'];
  listBuildArtifacts: (
    buildId: string,
    options?: {
      basePath?: string;
      locator?: string;
      fields?: string;
      resolveParameters?: boolean;
      logBuildUsage?: boolean;
    }
  ) => Promise<AxiosResponse<unknown>>;
  downloadArtifactContent: (
    buildId: string,
    artifactPath: string
  ) => Promise<AxiosResponse<ArrayBuffer>>;
  getBuildStatistics: (buildId: string, fields?: string) => Promise<AxiosResponse<unknown>>;
  listChangesForBuild: (buildId: string, fields?: string) => Promise<AxiosResponse<unknown>>;
  listSnapshotDependencies: (buildId: string) => Promise<AxiosResponse<unknown>>;
  listVcsRoots: TeamCityAPI['listVcsRoots'];
  listAgents: TeamCityAPI['listAgents'];
  listAgentPools: TeamCityAPI['listAgentPools'];
  getBaseUrl: TeamCityAPI['getBaseUrl'];
  baseUrl: string;
  http: AxiosInstance;
}

export function createAdapterFromTeamCityAPI(api: TeamCityAPI): TeamCityClientAdapter {
  return {
    builds: api.builds,
    projects: api.projects,
    buildTypes: api.buildTypes,
    buildQueue: api.buildQueue,
    tests: api.tests,
    testOccurrences: api.tests,
    vcsRoots: api.vcsRoots,
    agents: api.agents,
    agentPools: api.agentPools,
    server: api.server,
    health: api.health,
    changes: api.changes,
    problems: api.problems,
    problemOccurrences: api.problemOccurrences,
    investigations: api.investigations,
    mutes: api.mutes,
    versionedSettings: api.versionedSettings,
    roles: api.roles,
    users: api.users,
    testConnection: () => api.testConnection(),
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
    listBuildArtifacts: (buildId, options) => api.listBuildArtifacts(buildId, options),
    downloadArtifactContent: (buildId, artifactPath) =>
      api.downloadBuildArtifact(buildId, artifactPath),
    getBuildStatistics: (buildId, fields) => api.getBuildStatistics(buildId, fields),
    listChangesForBuild: (buildId, fields) => api.listChangesForBuild(buildId, fields),
    listSnapshotDependencies: (buildId) => api.listSnapshotDependencies(buildId),
    listVcsRoots: (projectId) => api.listVcsRoots(projectId),
    listAgents: () => api.listAgents(),
    listAgentPools: () => api.listAgentPools(),
    getBaseUrl: () => api.getBaseUrl(),
    baseUrl: api.getBaseUrl(),
    http: api.http,
  };
}
