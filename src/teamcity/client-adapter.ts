/**
 * Lightweight adapter so managers can work with the unified TeamCityAPI
 * without depending on the legacy TeamCityClient implementation.
 */
import type { TeamCityAPI } from '@/api-client';

import type { BuildApiLike, TeamCityUnifiedClient } from './types/client';

export type TeamCityClientAdapter = TeamCityUnifiedClient;

export function createAdapterFromTeamCityAPI(api: TeamCityAPI): TeamCityClientAdapter {
  return {
    modules: {
      builds: api.builds,
    },
    request: (fn) => api.request(fn),
    baseUrl: api.getBaseUrl(),
    builds: api.builds as unknown as BuildApiLike,
    listBuildArtifacts: (buildId, options) => api.listBuildArtifacts(buildId, options),
    downloadArtifactContent: (buildId, artifactPath) =>
      api.downloadBuildArtifact(buildId, artifactPath),
    getBuildStatistics: (buildId, fields) => api.getBuildStatistics(buildId, fields),
    listChangesForBuild: (buildId, fields) => api.listChangesForBuild(buildId, fields),
    listSnapshotDependencies: (buildId) => api.listSnapshotDependencies(buildId),
  };
}
