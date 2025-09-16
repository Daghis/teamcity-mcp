import type { AxiosInstance, AxiosResponse, RawAxiosRequestConfig } from 'axios';

import type { BuildApi } from '@/teamcity-client/api/build-api';

export interface TeamCityRequestContext {
  axios: AxiosInstance;
  baseUrl: string;
  requestId?: string;
}

export type TeamCityRequestFn<T> = (ctx: TeamCityRequestContext) => Promise<T>;

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

export interface TeamCityApiModules {
  builds: BuildApi;
}

export interface TeamCityUnifiedClient {
  modules: TeamCityApiModules;
  request<T>(fn: TeamCityRequestFn<T>): Promise<T>;
  baseUrl: string;
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
}
