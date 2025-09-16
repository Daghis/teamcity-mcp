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
import { info } from '@/utils/logger';

import { AgentApi } from './teamcity-client/api/agent-api';
import { AgentPoolApi } from './teamcity-client/api/agent-pool-api';
import { BuildApi } from './teamcity-client/api/build-api';
import { BuildQueueApi } from './teamcity-client/api/build-queue-api';
import { BuildTypeApi } from './teamcity-client/api/build-type-api';
import { ChangeApi } from './teamcity-client/api/change-api';
import { HealthApi } from './teamcity-client/api/health-api';
import { InvestigationApi } from './teamcity-client/api/investigation-api';
import { MuteApi } from './teamcity-client/api/mute-api';
import { ProblemApi } from './teamcity-client/api/problem-api';
import { ProblemOccurrenceApi } from './teamcity-client/api/problem-occurrence-api';
import { ProjectApi } from './teamcity-client/api/project-api';
import { RoleApi } from './teamcity-client/api/role-api';
import { ServerApi } from './teamcity-client/api/server-api';
import { TestOccurrenceApi } from './teamcity-client/api/test-occurrence-api';
import { UserApi } from './teamcity-client/api/user-api';
import { VcsRootApi } from './teamcity-client/api/vcs-root-api';
import { VersionedSettingsApi } from './teamcity-client/api/versioned-settings-api';
import { Configuration } from './teamcity-client/configuration';

export class TeamCityAPI {
  private static instance: TeamCityAPI;
  private axiosInstance: AxiosInstance;
  private config: Configuration;
  private baseUrl: string;

  // API instances
  public builds: BuildApi;
  public projects: ProjectApi;
  public buildTypes: BuildTypeApi;
  public buildQueue: BuildQueueApi;
  public tests: TestOccurrenceApi;
  public vcsRoots: VcsRootApi;
  public agents: AgentApi;
  public agentPools: AgentPoolApi;
  public server: ServerApi;
  public health: HealthApi;
  public changes: ChangeApi;
  public problems: ProblemApi;
  public problemOccurrences: ProblemOccurrenceApi;
  public investigations: InvestigationApi;
  public mutes: MuteApi;
  public versionedSettings: VersionedSettingsApi;
  public roles: RoleApi;
  public users: UserApi;

  private constructor(baseUrl: string, token: string) {
    // Remove trailing slash from base URL
    const basePath = baseUrl.replace(/\/$/, '');

    // Validate configuration
    const validation = validateConfiguration(basePath, token);
    if (!validation.isValid) {
      throw new Error(`Invalid TeamCity configuration: ${validation.errors.join(', ')}`);
    }

    // Create axios instance with basic config and default headers
    this.baseUrl = basePath;

    this.axiosInstance = axios.create({
      baseURL: basePath,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

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

    // Create configuration for generated API clients
    this.config = new Configuration({
      basePath,
      accessToken: token,
      baseOptions: {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    });

    // Initialize API clients
    this.builds = new BuildApi(this.config, basePath, this.axiosInstance);
    this.projects = new ProjectApi(this.config, basePath, this.axiosInstance);
    this.buildTypes = new BuildTypeApi(this.config, basePath, this.axiosInstance);
    this.buildQueue = new BuildQueueApi(this.config, basePath, this.axiosInstance);
    this.tests = new TestOccurrenceApi(this.config, basePath, this.axiosInstance);
    this.vcsRoots = new VcsRootApi(this.config, basePath, this.axiosInstance);
    this.agents = new AgentApi(this.config, basePath, this.axiosInstance);
    this.agentPools = new AgentPoolApi(this.config, basePath, this.axiosInstance);
    this.server = new ServerApi(this.config, basePath, this.axiosInstance);
    this.health = new HealthApi(this.config, basePath, this.axiosInstance);
    this.changes = new ChangeApi(this.config, basePath, this.axiosInstance);
    this.problems = new ProblemApi(this.config, basePath, this.axiosInstance);
    this.problemOccurrences = new ProblemOccurrenceApi(this.config, basePath, this.axiosInstance);
    this.investigations = new InvestigationApi(this.config, basePath, this.axiosInstance);
    this.mutes = new MuteApi(this.config, basePath, this.axiosInstance);
    this.versionedSettings = new VersionedSettingsApi(this.config, basePath, this.axiosInstance);
    this.roles = new RoleApi(this.config, basePath, this.axiosInstance);
    this.users = new UserApi(this.config, basePath, this.axiosInstance);

    info('TeamCityAPI initialized', { baseUrl: basePath });
  }

  /**
   * Get or create singleton instance
   * @param baseUrl Optional base URL for testing
   * @param token Optional token for testing
   */
  static getInstance(baseUrl?: string, token?: string): TeamCityAPI {
    // If parameters are provided, create a new instance (for testing)
    if (baseUrl && token) {
      this.instance = new TeamCityAPI(baseUrl, token);
      return this.instance;
    }

    // Otherwise use singleton pattern with centralized config
    if (this.instance == null) {
      const baseUrl = getTeamCityUrl();
      const tokenStr = getTeamCityToken();
      this.instance = new TeamCityAPI(baseUrl, tokenStr);
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

  async getBuildCount(locator?: string): Promise<AxiosResponse<string>> {
    return this.axiosInstance.get('/app/rest/builds/count', {
      params: locator ? { locator } : undefined,
      headers: {
        Accept: 'text/plain',
      },
      responseType: 'text',
      transformResponse: [(data) => data],
    });
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
    this.instance = null as unknown as TeamCityAPI;
  }

  private toBuildLocator(buildId: string): string {
    return buildId.includes(':') ? buildId : `id:${buildId}`;
  }
}
