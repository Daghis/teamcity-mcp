/**
 * TeamCity integration module
 * Main entry point for TeamCity API operations
 */
import { TeamCityAPI } from '@/api-client';
import { info, warn } from '@/utils/logger';

import { type TeamCityClientAdapter, createAdapterFromTeamCityAPI } from './client-adapter';
import {
  type TeamCityFullConfig,
  loadTeamCityConfig,
  mergeConfig,
  toApiClientConfig,
  validateConfig,
} from './config';

// Re-export all public types and utilities
export * from './client-adapter';
export * from './auth';
export * from './errors';
export * from './circuit-breaker';
export * from './pagination';
export * from './config';

// Re-export configuration
export * from '@/teamcity-client/configuration';

/**
 * Global TeamCity client instance
 */
let globalClient: TeamCityClientAdapter | null = null;

/**
 * Initialize global TeamCity client
 */
export async function initializeTeamCity(
  config?: Partial<TeamCityFullConfig>
): Promise<TeamCityClientAdapter> {
  const envConfig = loadTeamCityConfig();
  const fullConfig = config ? mergeConfig(envConfig, config) : envConfig;

  const validation = validateConfig(fullConfig);
  if (!validation.isValid) {
    throw new Error(`Invalid TeamCity configuration: ${validation.errors.join(', ')}`);
  }

  const apiConfig = toApiClientConfig(fullConfig);
  const api = TeamCityAPI.getInstance(apiConfig);

  globalClient = createAdapterFromTeamCityAPI(api, {
    fullConfig,
    apiConfig,
  });

  const isConnected = await api.testConnection();
  if (!isConnected) {
    warn('Failed to connect to TeamCity server', {
      baseUrl: apiConfig.baseUrl,
    });
  } else {
    info('Successfully connected to TeamCity server', {
      baseUrl: apiConfig.baseUrl,
    });
  }

  return globalClient;
}

/**
 * Get global TeamCity client instance
 */
export function getTeamCityClient(): TeamCityClientAdapter {
  if (!globalClient) {
    throw new Error('TeamCity client not initialized. Call initializeTeamCity() first.');
  }
  return globalClient;
}

/**
 * Create a new TeamCity client instance
 */
export function createTeamCityClient(config?: Partial<TeamCityFullConfig>): TeamCityClientAdapter {
  const envConfig = loadTeamCityConfig();
  const fullConfig = config ? mergeConfig(envConfig, config) : envConfig;

  const validation = validateConfig(fullConfig);
  if (!validation.isValid) {
    throw new Error(`Invalid TeamCity configuration: ${validation.errors.join(', ')}`);
  }

  const apiConfig = toApiClientConfig(fullConfig);
  const api = TeamCityAPI.getInstance(apiConfig);
  return createAdapterFromTeamCityAPI(api, {
    fullConfig,
    apiConfig,
  });
}

/**
 * Reset global TeamCity client (for testing)
 */
export function resetTeamCityClient(): void {
  globalClient = null;
  TeamCityAPI.reset();
}

/**
 * Example usage and helper functions
 */

interface BuildData {
  id?: string;
  number?: number;
  status?: string;
  state?: string;
  branchName?: string;
  buildType?: {
    id: string;
    name: string;
  };
}

interface TestOccurrence {
  id?: string;
  name?: string;
  status?: string;
  ignored?: boolean;
  details?: string;
}

/**
 * Get all builds for a project
 */
export async function getProjectBuilds(projectId: string): Promise<BuildData[]> {
  const client = getTeamCityClient();
  const { builds } = client.modules;
  const response = await builds.getAllBuilds(
    `project:${projectId}`, // locator as string
    undefined // fields
  );
  // Map Build[] to BuildData[]
  const buildList = response.data.build ?? [];
  return buildList.map(
    (build: {
      id?: string | number;
      number?: string | number;
      status?: string;
      state?: string;
      buildTypeId?: string;
      branchName?: string;
    }) => ({
      id: build.id != null ? String(build.id) : undefined,
      number: typeof build.number === 'string' ? parseInt(build.number, 10) : build.number,
      status: build.status,
      state: build.state,
      buildTypeId: build.buildTypeId,
      branchName: build.branchName,
    })
  );
}

/**
 * Trigger a new build
 */
export async function triggerBuild(
  buildTypeId: string,
  branchName?: string,
  comment?: string
): Promise<BuildData> {
  const client = getTeamCityClient();
  const { buildQueue } = client.modules;
  const buildRequest = {
    buildType: { id: buildTypeId },
    branchName,
    comment:
      comment !== undefined && comment !== null && comment !== '' ? { text: comment } : undefined,
  };

  const response = await buildQueue.addBuildToQueue(
    undefined, // moveToTop
    buildRequest // body
  );

  // Map Build to BuildData
  const build = response.data;
  return {
    id: build.id != null ? String(build.id) : undefined,
    number: build.number != null ? parseInt(build.number) : undefined,
    status: build.status,
    state: build.state,
    branchName: build.branchName,
    buildType: build.buildTypeId != null ? { id: build.buildTypeId, name: '' } : undefined,
  };
}

/**
 * Cancel a running build
 */
export async function cancelBuild(buildId: number, comment?: string): Promise<void> {
  const client = getTeamCityClient();
  const { builds } = client.modules;
  await builds.cancelBuild(
    `id:${buildId}`, // buildLocator
    undefined, // fields
    { comment: comment ?? 'Cancelled via MCP' } // body
  );
}

/**
 * Get build status
 */
export async function getBuildStatus(buildId: number): Promise<{
  state: string;
  status: string;
  statusText: string;
}> {
  const client = getTeamCityClient();
  const { builds } = client.modules;
  const response = await builds.getBuild(
    `id:${buildId}`, // buildLocator
    'state,status,statusText' // fields
  );

  return {
    state: response.data.state ?? 'unknown',
    status: response.data.status ?? 'unknown',
    statusText: response.data.statusText ?? '',
  };
}

/**
 * Get test results for a build
 */
export async function getBuildTestResults(buildId: number): Promise<{
  total: number;
  passed: number;
  failed: number;
  ignored: number;
  failures: TestOccurrence[];
}> {
  const client = getTeamCityClient();
  const { tests } = client.modules;
  const response = await tests.getAllTestOccurrences(`build:${buildId}`);

  const occurrences = response.data.testOccurrence ?? [];
  const failures = occurrences.filter((t: TestOccurrence) => t.status === 'FAILURE');

  return {
    total: occurrences.length,
    passed: occurrences.filter((t: TestOccurrence) => t.status === 'SUCCESS').length,
    failed: failures.length,
    ignored: occurrences.filter((t: TestOccurrence) => t.ignored === true).length,
    failures,
  };
}

/**
 * Get build log
 */
export async function getBuildLog(buildId: number): Promise<string> {
  const client = getTeamCityClient();
  return client.getBuildLog(String(buildId));
}
