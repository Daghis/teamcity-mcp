/**
 * BuildConfigurationManager - Manages build configuration creation and management
 */
import { getTeamCityUrl } from '@/config';
import { debug, info, error as logError } from '@/utils/logger';

import type { TeamCityClientAdapter } from './client-adapter';

export interface BuildConfigData {
  projectId: string;
  name: string;
  description?: string;
  templateId?: string;
  vcsRootId?: string;
  steps?: BuildStep[];
  triggers?: BuildTrigger[];
  parameters?: Record<string, string>;
}

export interface VcsRootData {
  projectId: string;
  name: string;
  url: string;
  branch?: string;
  type?: 'git' | 'svn' | 'perforce';
  authentication?: {
    type?: 'password' | 'token' | 'ssh';
    username?: string;
    password?: string;
    privateKey?: string;
  };
}

export interface BuildStep {
  type: string;
  name: string;
  script?: string;
  goals?: string;
  tasks?: string;
  dockerfile?: string;
  workingDir?: string;
  arguments?: string;
}

export interface BuildTrigger {
  type: string;
  rules?: string;
  schedule?: string;
  buildType?: string;
  branchFilter?: string;
}

export class BuildConfigurationManager {
  private client: TeamCityClientAdapter;

  constructor(client: TeamCityClientAdapter) {
    this.client = client;
  }

  /**
   * Validate that a project exists and user has permissions
   */
  async validateProject(projectId: string): Promise<{ id: string; name: string } | null> {
    try {
      const response = await this.client.modules.projects.getProject(projectId, '$short');

      const id = response.data?.id;
      const name = response.data?.name;
      if (id && name) {
        return { id, name };
      }
      return null;
    } catch (err) {
      if (
        err != null &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        debug('Project not found', { projectId });
        return null;
      }
      if (
        err != null &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 403
      ) {
        throw new Error('Permission denied: You do not have access to this project');
      }
      throw err;
    }
  }

  /**
   * Create a VCS root for the build configuration
   */
  async createVcsRoot(data: VcsRootData): Promise<{ id: string }> {
    const vcsRootPayload = {
      name: data.name,
      vcsName: data.type ?? 'git',
      project: {
        id: data.projectId,
      },
      properties: {
        property: [
          { name: 'url', value: data.url },
          { name: 'branch', value: data.branch ?? 'main' },
          { name: 'branchSpec', value: '+:refs/heads/*' },
        ],
      },
    };

    // Add authentication properties if provided
    if (data.authentication) {
      if (data.authentication.type === 'password' && data.authentication.username) {
        vcsRootPayload.properties.property.push(
          { name: 'username', value: data.authentication.username },
          { name: 'secure:password', value: data.authentication.password ?? '' }
        );
      } else if (data.authentication.type === 'token' && data.authentication.password) {
        vcsRootPayload.properties.property.push(
          { name: 'authMethod', value: 'ACCESS_TOKEN' },
          { name: 'secure:accessToken', value: data.authentication.password }
        );
      } else if (data.authentication.type === 'ssh' && data.authentication.privateKey) {
        vcsRootPayload.properties.property.push(
          { name: 'authMethod', value: 'PRIVATE_KEY' },
          { name: 'secure:privateKey', value: data.authentication.privateKey }
        );
      }
    }

    const response = await this.client.modules.vcsRoots.addVcsRoot(undefined, vcsRootPayload);
    const id = response.data.id;
    if (!id) {
      throw new Error('VCS root creation failed: missing id');
    }
    return { id };
  }

  /**
   * Transform build steps to TeamCity API format
   */
  transformBuildSteps(steps: BuildStep[]): Array<{
    id: string;
    name: string;
    type: string;
    properties: { property: Array<{ name: string; value: string }> };
  }> {
    return steps.map((step, index) => {
      const baseStep = {
        id: `RUNNER_${index + 1}`,
        name: step.name,
        properties: {
          property: [] as Array<{ name: string; value: string }>,
        },
      };

      switch (step.type) {
        case 'script':
          return {
            ...baseStep,
            type: 'simpleRunner',
            properties: {
              property: [
                { name: 'script.content', value: step.script ?? '' },
                { name: 'teamcity.step.mode', value: 'default' },
                { name: 'use.custom.script', value: 'true' },
              ],
            },
          };

        case 'powershell':
          return {
            ...baseStep,
            type: 'jetbrains.powershell',
            properties: {
              property: [
                { name: 'script.content', value: step.script ?? '' },
                { name: 'teamcity.powershell.bitness', value: 'x64' },
                { name: 'teamcity.powershell.edition', value: 'Desktop' },
              ],
            },
          };

        case 'maven':
          return {
            ...baseStep,
            type: 'Maven2',
            properties: {
              property: [
                { name: 'goals', value: step.goals ?? 'clean install' },
                { name: 'teamcity.step.mode', value: 'default' },
                { name: 'pomLocation', value: 'pom.xml' },
              ],
            },
          };

        case 'gradle':
          return {
            ...baseStep,
            type: 'gradle-runner',
            properties: {
              property: [
                { name: 'tasks', value: step.tasks ?? 'build' },
                { name: 'gradle.wrapper.useWrapper', value: 'true' },
                { name: 'teamcity.step.mode', value: 'default' },
              ],
            },
          };

        case 'npm':
          return {
            ...baseStep,
            type: 'nodejs-runner',
            properties: {
              property: [
                { name: 'npm_commands', value: step.script ?? 'install' },
                { name: 'teamcity.step.mode', value: 'default' },
              ],
            },
          };

        case 'docker':
          return {
            ...baseStep,
            type: 'DockerBuild',
            properties: {
              property: [
                { name: 'dockerfile', value: step.dockerfile ?? 'Dockerfile' },
                { name: 'teamcity.step.mode', value: 'default' },
              ],
            },
          };

        default:
          throw new Error(`Unknown build step type: ${step.type}`);
      }
    });
  }

  /**
   * Transform triggers to TeamCity API format
   */
  transformTriggers(triggers: BuildTrigger[]): Array<{
    id: string;
    type: string;
    properties: { property: Array<{ name: string; value: string }> };
  }> {
    return triggers.map((trigger, index) => {
      const baseTrigger = {
        id: `TRIGGER_${index + 1}`,
        properties: {
          property: [] as Array<{ name: string; value: string }>,
        },
      };

      switch (trigger.type) {
        case 'vcs':
          return {
            ...baseTrigger,
            type: 'vcsTrigger',
            properties: {
              property: [
                { name: 'branchFilter', value: trigger.rules ?? '+:*' },
                { name: 'quietPeriodMode', value: 'DO_NOT_USE' },
              ],
            },
          };

        case 'schedule':
          return {
            ...baseTrigger,
            type: 'schedulingTrigger',
            properties: {
              property: [
                { name: 'schedulingPolicy', value: 'cron' },
                { name: 'cronExpression', value: trigger.schedule ?? '0 0 * * *' },
                { name: 'triggerBuildWithPendingChangesOnly', value: 'false' },
              ],
            },
          };

        case 'finish-build':
          return {
            ...baseTrigger,
            type: 'buildDependencyTrigger',
            properties: {
              property: [
                { name: 'dependsOn', value: trigger.buildType ?? '' },
                { name: 'afterSuccessfulBuildOnly', value: 'true' },
                { name: 'branchFilter', value: trigger.branchFilter ?? '+:*' },
              ],
            },
          };

        case 'maven-snapshot':
          return {
            ...baseTrigger,
            type: 'mavenSnapshotDependencyTrigger',
            properties: {
              property: [{ name: 'skipPollingIfNoChangesInBuildChain', value: 'true' }],
            },
          };

        default:
          throw new Error(`Unknown trigger type: ${trigger.type}`);
      }
    });
  }

  /**
   * Create a new build configuration
   */
  async createConfiguration(data: BuildConfigData): Promise<{
    id: string;
    name: string;
    projectId: string;
    url: string;
    description?: string;
  }> {
    // Generate a unique ID for the build configuration
    const configId = this.generateBuildConfigId(data.projectId, data.name);

    const configPayload: {
      id: string;
      name: string;
      project: { id: string };
      description?: string;
      templates?: { buildType: Array<{ id: string }> };
      'vcs-root-entries'?: {
        'vcs-root-entry': Array<{
          'vcs-root': { id: string };
          'checkout-rules': string;
        }>;
      };
      steps?: { step: BuildStep[] };
      triggers?: { trigger: BuildTrigger[] };
      parameters?: { property: Array<{ name: string; value: string }> };
    } = {
      id: configId,
      name: data.name,
      project: {
        id: data.projectId,
      },
    };

    // Add description if provided
    if (data.description) {
      configPayload.description = data.description;
    }

    // Add template reference if provided
    if (data.templateId) {
      configPayload.templates = {
        buildType: [{ id: data.templateId }],
      };
    }

    // Add VCS root if provided
    if (data.vcsRootId) {
      configPayload['vcs-root-entries'] = {
        'vcs-root-entry': [
          {
            'vcs-root': { id: data.vcsRootId },
            'checkout-rules': '',
          },
        ],
      };
    }

    // Add build steps
    if (data.steps && data.steps.length > 0) {
      configPayload.steps = {
        step: data.steps,
      };
    }

    // Add triggers
    if (data.triggers && data.triggers.length > 0) {
      configPayload.triggers = {
        trigger: data.triggers,
      };
    }

    // Add parameters
    if (data.parameters && Object.keys(data.parameters).length > 0) {
      configPayload.parameters = {
        property: Object.entries(data.parameters).map(([name, value]) => ({
          name,
          value,
        })),
      };
    }

    try {
      const response = await this.client.modules.buildTypes.createBuildType(
        undefined,
        configPayload
      );

      const teamcityUrl = getTeamCityUrl();
      const result = {
        id: response.data.id ?? configId,
        name: response.data.name ?? data.name,
        projectId: response.data.projectId ?? data.projectId,
        url: `${teamcityUrl}/viewType.html?buildTypeId=${response.data.id ?? configId}`,
        description: response.data.description,
      };

      info('Build configuration created', {
        id: result.id,
        name: result.name,
        projectId: result.projectId,
      });

      return result;
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };

      if (error.response?.status === 409) {
        throw new Error(`Build configuration already exists with ID: ${configId}`);
      }
      if (error.response?.status === 403) {
        throw new Error('Permission denied: You need project edit permissions');
      }
      if (error.response?.status === 400) {
        const message = error.response?.data?.message ?? 'Invalid configuration';
        throw new Error(`Invalid configuration: ${message}`);
      }

      logError('Failed to create build configuration', error as Error);
      throw error;
    }
  }

  /**
   * Generate a unique build configuration ID
   */
  private generateBuildConfigId(projectId: string, name: string): string {
    // Remove special characters and convert to valid ID format
    const cleanName = name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return `${projectId}_${cleanName}`;
  }
}
