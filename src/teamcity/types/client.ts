import type { AxiosInstance, AxiosResponse, RawAxiosRequestConfig } from 'axios';

import type { TeamCityAPIClientConfig } from '@/api-client';
import type { TeamCityFullConfig } from '@/teamcity/config';
import { AgentApi } from '@/teamcity-client/api/agent-api';
import { AgentPoolApi } from '@/teamcity-client/api/agent-pool-api';
import { AgentTypeApi } from '@/teamcity-client/api/agent-type-api';
import { AuditApi } from '@/teamcity-client/api/audit-api';
import { AvatarApi } from '@/teamcity-client/api/avatar-api';
import { BuildApi } from '@/teamcity-client/api/build-api';
import { BuildQueueApi } from '@/teamcity-client/api/build-queue-api';
import { BuildTypeApi } from '@/teamcity-client/api/build-type-api';
import { ChangeApi } from '@/teamcity-client/api/change-api';
import { CloudInstanceApi } from '@/teamcity-client/api/cloud-instance-api';
import { DeploymentDashboardApi } from '@/teamcity-client/api/deployment-dashboard-api';
import { GlobalServerSettingsApi } from '@/teamcity-client/api/global-server-settings-api';
import { GroupApi } from '@/teamcity-client/api/group-api';
import { HealthApi } from '@/teamcity-client/api/health-api';
import { InvestigationApi } from '@/teamcity-client/api/investigation-api';
import { MuteApi } from '@/teamcity-client/api/mute-api';
import { NodeApi } from '@/teamcity-client/api/node-api';
import { ProblemApi } from '@/teamcity-client/api/problem-api';
import { ProblemOccurrenceApi } from '@/teamcity-client/api/problem-occurrence-api';
import { ProjectApi } from '@/teamcity-client/api/project-api';
import { RoleApi } from '@/teamcity-client/api/role-api';
import { RootApi } from '@/teamcity-client/api/root-api';
import { ServerApi } from '@/teamcity-client/api/server-api';
import { ServerAuthenticationSettingsApi } from '@/teamcity-client/api/server-authentication-settings-api';
import { TestApi } from '@/teamcity-client/api/test-api';
import { TestOccurrenceApi } from '@/teamcity-client/api/test-occurrence-api';
import { UserApi } from '@/teamcity-client/api/user-api';
import { VcsRootApi } from '@/teamcity-client/api/vcs-root-api';
import { VcsRootInstanceApi } from '@/teamcity-client/api/vcs-root-instance-api';
import { VersionedSettingsApi } from '@/teamcity-client/api/versioned-settings-api';

export interface TeamCityApiSurface {
  agents: AgentApi;
  agentPools: AgentPoolApi;
  agentTypes: AgentTypeApi;
  audit: AuditApi;
  avatars: AvatarApi;
  builds: BuildApi;
  buildQueue: BuildQueueApi;
  buildTypes: BuildTypeApi;
  changes: ChangeApi;
  cloudInstances: CloudInstanceApi;
  deploymentDashboards: DeploymentDashboardApi;
  globalServerSettings: GlobalServerSettingsApi;
  groups: GroupApi;
  health: HealthApi;
  investigations: InvestigationApi;
  mutes: MuteApi;
  nodes: NodeApi;
  problems: ProblemApi;
  problemOccurrences: ProblemOccurrenceApi;
  projects: ProjectApi;
  roles: RoleApi;
  root: RootApi;
  server: ServerApi;
  serverAuthSettings: ServerAuthenticationSettingsApi;
  tests: TestOccurrenceApi;
  testMetadata: TestApi;
  users: UserApi;
  vcsRoots: VcsRootApi;
  vcsRootInstances: VcsRootInstanceApi;
  versionedSettings: VersionedSettingsApi;
}

export type TeamCityApiModuleName = keyof TeamCityApiSurface;

export interface TeamCityRequestContext {
  axios: AxiosInstance;
  baseUrl: string;
  requestId?: string;
}

export interface TeamCityUnifiedClient {
  /** Direct access to generated REST API modules. */
  modules: Readonly<TeamCityApiSurface>;
  /** Shared axios instance configured with retries/interceptors. */
  http: AxiosInstance;
  /** Execute a callback with request context information. */
  request<T>(fn: (ctx: TeamCityRequestContext) => Promise<T>): Promise<T>;
  /** Latest full configuration used to initialize the client. */
  getConfig(): TeamCityFullConfig;
  /** Normalized API client configuration used by the singleton. */
  getApiConfig(): TeamCityAPIClientConfig;
  /** Convenience accessor returning the shared axios instance. */
  getAxios(): AxiosInstance;
}

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

export interface TeamCityClientAdapter extends TeamCityUnifiedClient {
  /** Backwards-compatible helpers expected by existing managers. */
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
  /** Canonical base URL of the connected TeamCity server. */
  baseUrl: string;
}
