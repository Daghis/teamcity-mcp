/**
 * Lightweight adapter so managers can work with the unified TeamCityAPI
 * without depending on the legacy TeamCityClient implementation.
 */
import type { AxiosResponse, RawAxiosRequestConfig } from 'axios';

import type { TeamCityAPI } from '@/api-client';

export interface BuildApiLike {
  getBuild: (
    buildLocator: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  getMultipleBuilds: (
    locator: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  getBuildProblems: (
    buildLocator: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
}

export interface BuildTypeApiLike {
  getAllBuildTypes: (
    locator?: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  getBuildType: (
    btLocator: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  setBuildTypeField: (
    btLocator: string,
    field: string,
    body?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  ['deleteBuildParameterOfBuildType_2']: (
    name: string,
    btLocator: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  createBuildType: (
    projectLocator?: string,
    body?: unknown,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
}

export interface ProjectApiLike {
  getAllProjects: (
    locator?: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  getProject: (
    projectLocator: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  getAllSubprojectsOrdered: (
    projectLocator: string,
    field?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
}

export interface VcsRootApiLike {
  getAllVcsRoots: (
    locator?: string,
    fields?: string,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
  addVcsRoot: (
    fields?: string,
    body?: unknown,
    options?: RawAxiosRequestConfig
  ) => Promise<AxiosResponse<unknown>>;
}

export interface TeamCityClientAdapter {
  builds: BuildApiLike;
  buildTypes: BuildTypeApiLike;
  projects: ProjectApiLike;
  vcsRoots: VcsRootApiLike;
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
  baseUrl: string;
}

export function createAdapterFromTeamCityAPI(api: TeamCityAPI): TeamCityClientAdapter {
  return {
    builds: api.builds as unknown as BuildApiLike,
    buildTypes: api.buildTypes as unknown as BuildTypeApiLike,
    projects: api.projects as unknown as ProjectApiLike,
    vcsRoots: api.vcsRoots as unknown as VcsRootApiLike,
    listBuildArtifacts: (buildId, options) => api.listBuildArtifacts(buildId, options),
    downloadArtifactContent: (buildId, artifactPath) =>
      api.downloadBuildArtifact(buildId, artifactPath),
    getBuildStatistics: (buildId, fields) => api.getBuildStatistics(buildId, fields),
    listChangesForBuild: (buildId, fields) => api.listChangesForBuild(buildId, fields),
    listSnapshotDependencies: (buildId) => api.listSnapshotDependencies(buildId),
    baseUrl: api.getBaseUrl(),
  };
}
