/**
 * Simple TeamCity API Client
 * Direct API wrapper without dependency injection or complex abstractions
 */
import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';

import { getTeamCityToken, getTeamCityUrl } from '@/config';
import {
  addRequestId,
  logAndTransformError,
  logResponse,
  validateConfiguration,
} from '@/teamcity/auth';
import { TeamCityAPIError, isRetryableError } from '@/teamcity/errors';
import type { TeamCityApiSurface } from '@/teamcity/types/client';
import { info } from '@/utils/logger';

import { AgentApi } from './teamcity-client/api/agent-api';
import { AgentPoolApi } from './teamcity-client/api/agent-pool-api';
import { AgentTypeApi } from './teamcity-client/api/agent-type-api';
import { AuditApi } from './teamcity-client/api/audit-api';
import { AvatarApi } from './teamcity-client/api/avatar-api';
import { BuildApi } from './teamcity-client/api/build-api';
import { BuildQueueApi } from './teamcity-client/api/build-queue-api';
import { BuildTypeApi } from './teamcity-client/api/build-type-api';
import { ChangeApi } from './teamcity-client/api/change-api';
import { CloudInstanceApi } from './teamcity-client/api/cloud-instance-api';
import { DeploymentDashboardApi } from './teamcity-client/api/deployment-dashboard-api';
import { GlobalServerSettingsApi } from './teamcity-client/api/global-server-settings-api';
import { GroupApi } from './teamcity-client/api/group-api';
import { HealthApi } from './teamcity-client/api/health-api';
import { InvestigationApi } from './teamcity-client/api/investigation-api';
import { MuteApi } from './teamcity-client/api/mute-api';
import { NodeApi } from './teamcity-client/api/node-api';
import { ProblemApi } from './teamcity-client/api/problem-api';
import { ProblemOccurrenceApi } from './teamcity-client/api/problem-occurrence-api';
import { ProjectApi } from './teamcity-client/api/project-api';
import { RoleApi } from './teamcity-client/api/role-api';
import { RootApi } from './teamcity-client/api/root-api';
import { ServerApi } from './teamcity-client/api/server-api';
import { ServerAuthenticationSettingsApi } from './teamcity-client/api/server-authentication-settings-api';
import { TestApi } from './teamcity-client/api/test-api';
import { TestOccurrenceApi } from './teamcity-client/api/test-occurrence-api';
import { UserApi } from './teamcity-client/api/user-api';
import { VcsRootApi } from './teamcity-client/api/vcs-root-api';
import { VcsRootInstanceApi } from './teamcity-client/api/vcs-root-instance-api';
import { VersionedSettingsApi } from './teamcity-client/api/versioned-settings-api';
import { Configuration } from './teamcity-client/configuration';

export interface TeamCityAPIClientConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
}

interface NormalizedClientConfig {
  baseUrl: string;
  token: string;
  timeout?: number;
}

export class TeamCityAPI {
  private static instance: TeamCityAPI | undefined;
  private static instanceConfig: NormalizedClientConfig | undefined;
  private readonly axiosInstance: AxiosInstance;
  private readonly config: Configuration;
  private readonly baseUrl: string;

  /** Shared axios instance including interceptors and retry configuration. */
  public readonly http: AxiosInstance;
  public readonly agents: AgentApi;
  public readonly agentPools: AgentPoolApi;
  public readonly agentTypes: AgentTypeApi;
  public readonly audit: AuditApi;
  public readonly avatars: AvatarApi;
  public readonly builds: BuildApi;
  public readonly buildQueue: BuildQueueApi;
  public readonly buildTypes: BuildTypeApi;
  public readonly changes: ChangeApi;
  public readonly cloudInstances: CloudInstanceApi;
  public readonly deploymentDashboards: DeploymentDashboardApi;
  public readonly globalServerSettings: GlobalServerSettingsApi;
  public readonly groups: GroupApi;
  public readonly health: HealthApi;
  public readonly investigations: InvestigationApi;
  public readonly mutes: MuteApi;
  public readonly nodes: NodeApi;
  public readonly problems: ProblemApi;
  public readonly problemOccurrences: ProblemOccurrenceApi;
  public readonly projects: ProjectApi;
  public readonly roles: RoleApi;
  public readonly root: RootApi;
  public readonly server: ServerApi;
  public readonly serverAuthSettings: ServerAuthenticationSettingsApi;
  public readonly testMetadata: TestApi;
  public readonly tests: TestOccurrenceApi;
  public readonly users: UserApi;
  public readonly vcsRoots: VcsRootApi;
  public readonly vcsRootInstances: VcsRootInstanceApi;
  public readonly versionedSettings: VersionedSettingsApi;
  /**
   * Immutable map of generated REST modules keyed by their resource category.
   * Managers should depend on this surface to access TeamCity endpoints.
   */
  public readonly modules: Readonly<TeamCityApiSurface>;

  private constructor(config: TeamCityAPIClientConfig) {
    const basePath = config.baseUrl.replace(/\/$/, '');
    const timeout = config.timeout ?? 30000;

    const validation = validateConfiguration(basePath, config.token);
    if (!validation.isValid) {
      throw new Error(`Invalid TeamCity configuration: ${validation.errors.join(', ')}`);
    }

    this.baseUrl = basePath;

    this.axiosInstance = axios.create({
      baseURL: basePath,
      timeout,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
    this.http = this.axiosInstance;

    // Configure retry with exponential backoff and error classification
    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: (retryCount, error) => {
        const reqId = (error?.config as { requestId?: string } | undefined)?.requestId;
        const tcError = TeamCityAPIError.fromAxiosError(error, reqId);
        // Prefer Retry-After when present (seconds), else exponential backoff
        const retryAfter =
          typeof (tcError as unknown as { retryAfter?: number }).retryAfter === 'number'
            ? ((tcError as unknown as { retryAfter?: number }).retryAfter as number) * 1000
            : undefined;
        return retryAfter ?? Math.min(1000 * Math.pow(2, Math.max(0, retryCount - 1)), 8000);
      },
      retryCondition: (error) => {
        const reqId = (error?.config as { requestId?: string } | undefined)?.requestId;
        const tcError = TeamCityAPIError.fromAxiosError(error, reqId);
        return isRetryableError(tcError);
      },
    });

    // Attach interceptors: request ID, response logging, and error transform
    this.axiosInstance.interceptors.request.use((config) => addRequestId(config));
    this.axiosInstance.interceptors.response.use(logResponse, logAndTransformError);

    this.config = new Configuration({
      basePath,
      accessToken: config.token,
      baseOptions: {
        timeout,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: 'application/json',
        },
      },
    });

    this.builds = this.createApi(BuildApi);
    this.projects = this.createApi(ProjectApi);
    this.buildTypes = this.createApi(BuildTypeApi);
    this.buildQueue = this.createApi(BuildQueueApi);
    this.tests = this.createApi(TestOccurrenceApi);
    this.testMetadata = this.createApi(TestApi);
    this.vcsRoots = this.createApi(VcsRootApi);
    this.vcsRootInstances = this.createApi(VcsRootInstanceApi);
    this.agents = this.createApi(AgentApi);
    this.agentPools = this.createApi(AgentPoolApi);
    this.agentTypes = this.createApi(AgentTypeApi);
    this.audit = this.createApi(AuditApi);
    this.avatars = this.createApi(AvatarApi);
    this.server = this.createApi(ServerApi);
    this.serverAuthSettings = this.createApi(ServerAuthenticationSettingsApi);
    this.health = this.createApi(HealthApi);
    this.changes = this.createApi(ChangeApi);
    this.problems = this.createApi(ProblemApi);
    this.problemOccurrences = this.createApi(ProblemOccurrenceApi);
    this.investigations = this.createApi(InvestigationApi);
    this.mutes = this.createApi(MuteApi);
    this.versionedSettings = this.createApi(VersionedSettingsApi);
    this.roles = this.createApi(RoleApi);
    this.users = this.createApi(UserApi);
    this.cloudInstances = this.createApi(CloudInstanceApi);
    this.deploymentDashboards = this.createApi(DeploymentDashboardApi);
    this.globalServerSettings = this.createApi(GlobalServerSettingsApi);
    this.groups = this.createApi(GroupApi);
    this.nodes = this.createApi(NodeApi);
    this.root = this.createApi(RootApi);

    this.modules = Object.freeze({
      agents: this.agents,
      agentPools: this.agentPools,
      agentTypes: this.agentTypes,
      audit: this.audit,
      avatars: this.avatars,
      builds: this.builds,
      buildQueue: this.buildQueue,
      buildTypes: this.buildTypes,
      changes: this.changes,
      cloudInstances: this.cloudInstances,
      deploymentDashboards: this.deploymentDashboards,
      globalServerSettings: this.globalServerSettings,
      groups: this.groups,
      health: this.health,
      investigations: this.investigations,
      mutes: this.mutes,
      nodes: this.nodes,
      problems: this.problems,
      problemOccurrences: this.problemOccurrences,
      projects: this.projects,
      roles: this.roles,
      root: this.root,
      server: this.server,
      serverAuthSettings: this.serverAuthSettings,
      tests: this.tests,
      testMetadata: this.testMetadata,
      users: this.users,
      vcsRoots: this.vcsRoots,
      vcsRootInstances: this.vcsRootInstances,
      versionedSettings: this.versionedSettings,
    });

    info('TeamCityAPI initialized', { baseUrl: basePath, timeout });
  }

  /**
   * Get or create singleton instance
   */
  static getInstance(config: TeamCityAPIClientConfig): TeamCityAPI;
  static getInstance(baseUrl?: string, token?: string): TeamCityAPI;
  static getInstance(arg1?: string | TeamCityAPIClientConfig, arg2?: string): TeamCityAPI {
    const requestedConfig = this.normalizeArgs(arg1, arg2);

    if (requestedConfig) {
      if (this.instance != null && this.configsEqual(this.instanceConfig, requestedConfig)) {
        return this.instance;
      }

      this.instance = new TeamCityAPI(requestedConfig);
      this.instanceConfig = requestedConfig;
      return this.instance;
    }

    if (this.instance == null) {
      const envConfig = this.normalizeConfig({
        baseUrl: getTeamCityUrl(),
        token: getTeamCityToken(),
      });
      this.instance = new TeamCityAPI(envConfig);
      this.instanceConfig = envConfig;
    }

    return this.instance;
  }

  /**
   * Test connection to TeamCity server
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.projects.getAllProjects(undefined, '$long,project($short)');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Simple helper methods for common operations
   */

  async listProjects(locator?: string) {
    const response = await this.projects.getAllProjects(locator);
    return response.data;
  }

  async getProject(projectId: string) {
    const response = await this.projects.getProject(projectId);
    return response.data;
  }

  async listBuilds(locator?: string) {
    const response = await this.builds.getAllBuilds(locator);
    return response.data;
  }

  async getBuild(buildId: string) {
    const response = await this.builds.getBuild(this.toBuildLocator(buildId));
    return response.data;
  }

  async triggerBuild(buildTypeId: string, branchName?: string, comment?: string) {
    const response = await this.buildQueue.addBuildToQueue(
      false, // moveToTop
      {
        buildType: { id: buildTypeId },
        branchName,
        comment: { text: comment },
        personal: false,
      }
    );
    return response.data;
  }

  async getBuildLog(buildId: string) {
    // Fetch raw build log as plain text. Prefer the HTML download endpoint,
    // then fall back to the REST log endpoint with plain text.
    // Ensure headers/responseType request text rather than JSON.
    try {
      const response = await this.axiosInstance.get(`/downloadBuildLog.html`, {
        params: { buildId },
        headers: { Accept: 'text/plain' },
        responseType: 'text',
        transformResponse: [(data) => data],
      });
      return response.data as string;
    } catch (primaryError) {
      // Fallback to REST endpoint (plain text)
      const response = await this.axiosInstance.get(`/app/rest/builds/id:${buildId}/log`, {
        params: { plain: true },
        headers: { Accept: 'text/plain' },
        responseType: 'text',
        transformResponse: [(data) => data],
      });
      return response.data as string;
    }
  }

  /**
   * Fetch a chunk of the build log by line range.
   * Attempts server-side pagination first; falls back to client-side slicing.
   */
  async getBuildLogChunk(
    buildId: string,
    options?: { startLine?: number; lineCount?: number }
  ): Promise<{
    lines: string[];
    startLine: number;
    nextStartLine?: number;
    totalLines?: number;
  }> {
    const startLine = options?.startLine ?? 0;
    const lineCount = options?.lineCount ?? 500;

    // Try REST endpoint with start/count support (if available)
    try {
      const response = await this.axiosInstance.get(`/app/rest/builds/id:${buildId}/log`, {
        params: {
          plain: true,
          start: startLine,
          count: lineCount,
        },
        headers: { Accept: 'text/plain' },
        responseType: 'text',
        transformResponse: [(data) => data],
      });
      const text = (response.data as string) ?? '';
      // Normalize newlines and split into lines consistently
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      // Some servers may include an extra trailing empty line
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

      return {
        lines,
        startLine,
        nextStartLine: lines.length === lineCount ? startLine + lines.length : undefined,
      };
    } catch {
      // Fallback: fetch full log then slice locally
      const full = await this.getBuildLog(buildId);
      const allLines = full.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      if (allLines.length > 0 && allLines[allLines.length - 1] === '') allLines.pop();
      const start = Math.max(0, Math.min(startLine, allLines.length));
      const end = Math.min(allLines.length, start + lineCount);
      const slice = allLines.slice(start, end);
      return {
        lines: slice,
        startLine: start,
        nextStartLine: end < allLines.length ? end : undefined,
        totalLines: allLines.length,
      };
    }
  }

  async listBuildTypes(projectId?: string) {
    const locator = projectId ? `affectedProject:(id:${projectId})` : undefined;
    const response = await this.buildTypes.getAllBuildTypes(locator);
    return response.data;
  }

  async getBuildType(buildTypeId: string) {
    const response = await this.buildTypes.getBuildType(buildTypeId);
    return response.data;
  }

  async listTestFailures(buildId: string) {
    const response = await this.tests.getAllTestOccurrences(`build:(id:${buildId}),status:FAILURE`);
    return response.data;
  }

  async listBuildArtifacts(
    buildId: string,
    options?: {
      basePath?: string;
      locator?: string;
      fields?: string;
      resolveParameters?: boolean;
      logBuildUsage?: boolean;
    }
  ): Promise<AxiosResponse<unknown>> {
    return this.builds.getFilesListOfBuild(
      this.toBuildLocator(buildId),
      options?.basePath,
      options?.locator,
      options?.fields,
      options?.resolveParameters,
      options?.logBuildUsage
    );
  }

  async downloadBuildArtifact(
    buildId: string,
    artifactPath: string
  ): Promise<AxiosResponse<ArrayBuffer>> {
    const normalizedPath = artifactPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return this.axiosInstance.get(
      `/app/rest/builds/id:${buildId}/artifacts/content/${normalizedPath}`,
      {
        responseType: 'arraybuffer',
      }
    );
  }

  async getBuildStatistics(buildId: string, fields?: string): Promise<AxiosResponse<unknown>> {
    return this.builds.getBuildStatisticValues(this.toBuildLocator(buildId), fields);
  }

  async listChangesForBuild(buildId: string, fields?: string): Promise<AxiosResponse<unknown>> {
    return this.axiosInstance.get('/app/rest/changes', {
      params: {
        locator: `build:(id:${buildId})`,
        fields,
      },
    });
  }

  async listSnapshotDependencies(buildId: string): Promise<AxiosResponse<unknown>> {
    return this.axiosInstance.get(`/app/rest/builds/id:${buildId}/snapshot-dependencies`);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async listVcsRoots(projectId?: string) {
    const locator = projectId ? `affectedProject:(id:${projectId})` : undefined;
    const response = await this.vcsRoots.getAllVcsRoots(locator);
    return response.data;
  }

  async listAgents() {
    const response = await this.agents.getAllAgents();
    return response.data;
  }

  async listAgentPools() {
    const response = await this.agentPools.getAllAgentPools();
    return response.data;
  }

  /**
   * Reset instance (mainly for testing)
   */
  static reset() {
    this.instance = undefined;
    this.instanceConfig = undefined;
  }

  private toBuildLocator(buildId: string): string {
    return buildId.includes(':') ? buildId : `id:${buildId}`;
  }

  private createApi<T>(
    apiCtor: new (configuration: Configuration, basePath?: string, axios?: AxiosInstance) => T
  ): T {
    return new apiCtor(this.config, this.baseUrl, this.axiosInstance);
  }

  private static normalizeArgs(
    arg1?: string | TeamCityAPIClientConfig,
    arg2?: string
  ): NormalizedClientConfig | undefined {
    if (arg1 != null && typeof arg1 === 'object') {
      return this.normalizeConfig(arg1);
    }

    if (typeof arg1 === 'string' && typeof arg2 === 'string') {
      return this.normalizeConfig({ baseUrl: arg1, token: arg2 });
    }

    return undefined;
  }

  private static normalizeConfig(config: TeamCityAPIClientConfig): NormalizedClientConfig {
    return {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      token: config.token,
      timeout: config.timeout,
    };
  }

  private static configsEqual(a?: NormalizedClientConfig, b?: NormalizedClientConfig): boolean {
    if (a == null || b == null) {
      return false;
    }

    return a.baseUrl === b.baseUrl && a.token === b.token && a.timeout === b.timeout;
  }
}
