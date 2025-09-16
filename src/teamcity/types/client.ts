import type { AxiosInstance } from 'axios';

import type { TeamCityFullConfig } from '@/teamcity/config';
import type { AgentApi } from '@/teamcity-client/api/agent-api';
import type { AgentPoolApi } from '@/teamcity-client/api/agent-pool-api';
import type { AgentTypeApi } from '@/teamcity-client/api/agent-type-api';
import type { AuditApi } from '@/teamcity-client/api/audit-api';
import type { AvatarApi } from '@/teamcity-client/api/avatar-api';
import type { BuildApi } from '@/teamcity-client/api/build-api';
import type { BuildQueueApi } from '@/teamcity-client/api/build-queue-api';
import type { BuildTypeApi } from '@/teamcity-client/api/build-type-api';
import type { ChangeApi } from '@/teamcity-client/api/change-api';
import type { CloudInstanceApi } from '@/teamcity-client/api/cloud-instance-api';
import type { DeploymentDashboardApi } from '@/teamcity-client/api/deployment-dashboard-api';
import type { GlobalServerSettingsApi } from '@/teamcity-client/api/global-server-settings-api';
import type { GroupApi } from '@/teamcity-client/api/group-api';
import type { HealthApi } from '@/teamcity-client/api/health-api';
import type { InvestigationApi } from '@/teamcity-client/api/investigation-api';
import type { MuteApi } from '@/teamcity-client/api/mute-api';
import type { NodeApi } from '@/teamcity-client/api/node-api';
import type { ProblemApi } from '@/teamcity-client/api/problem-api';
import type { ProblemOccurrenceApi } from '@/teamcity-client/api/problem-occurrence-api';
import type { ProjectApi } from '@/teamcity-client/api/project-api';
import type { RoleApi } from '@/teamcity-client/api/role-api';
import type { RootApi } from '@/teamcity-client/api/root-api';
import type { ServerApi } from '@/teamcity-client/api/server-api';
import type { ServerAuthenticationSettingsApi } from '@/teamcity-client/api/server-authentication-settings-api';
import type { TestApi } from '@/teamcity-client/api/test-api';
import type { TestOccurrenceApi } from '@/teamcity-client/api/test-occurrence-api';
import type { UserApi } from '@/teamcity-client/api/user-api';
import type { VcsRootApi } from '@/teamcity-client/api/vcs-root-api';
import type { VcsRootInstanceApi } from '@/teamcity-client/api/vcs-root-instance-api';
import type { VersionedSettingsApi } from '@/teamcity-client/api/versioned-settings-api';

export interface TeamCityApiSurface {
  agents: AgentApi;
  agentPools: AgentPoolApi;
  agentTypes: AgentTypeApi;
  audits: AuditApi;
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
  testMetadata: TestApi;
  tests: TestOccurrenceApi;
  users: UserApi;
  vcsRootInstances: VcsRootInstanceApi;
  vcsRoots: VcsRootApi;
  versionedSettings: VersionedSettingsApi;
}

export interface TeamCityRequestContext {
  axios: AxiosInstance;
  baseUrl: string;
  requestId?: string;
}

export interface TeamCityUnifiedClient {
  modules: TeamCityApiSurface;
  request<T>(fn: (context: TeamCityRequestContext) => Promise<T>): Promise<T>;
  getConfig(): TeamCityFullConfig;
  getAxios(): AxiosInstance;
}
