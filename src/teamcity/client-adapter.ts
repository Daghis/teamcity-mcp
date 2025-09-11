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
}

export function createAdapterFromTeamCityAPI(api: TeamCityAPI): TeamCityClientAdapter {
  return {
    builds: api.builds as unknown as BuildApiLike,
  };
}
