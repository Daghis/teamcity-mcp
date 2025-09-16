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

export interface TeamCityClientAdapter {
  builds: BuildApiLike;
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
    listBuildArtifacts: (buildId, options) => api.listBuildArtifacts(buildId, options),
    downloadArtifactContent: (buildId, artifactPath) => api.downloadBuildArtifact(buildId, artifactPath),
    getBuildStatistics: (buildId, fields) => api.getBuildStatistics(buildId, fields),
    listChangesForBuild: (buildId, fields) => api.listChangesForBuild(buildId, fields),
    listSnapshotDependencies: (buildId) => api.listSnapshotDependencies(buildId),
    baseUrl: api.getBaseUrl(),
  };
}
