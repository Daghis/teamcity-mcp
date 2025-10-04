/**
 * BuildConfigurationCloneManager - Manages cloning of build configurations
 */
import { getTeamCityUrl } from '@/config';
import type { BuildType } from '@/teamcity-client/models/build-type';
import { debug, info, error as logError } from '@/utils/logger';

import {
  type BuildTypeData,
  type BuildTypeDependency,
  type BuildTypeFeature,
  type BuildTypeProperty,
  type BuildTypeStep,
  type BuildTypeTrigger,
  type VcsRootData,
  isBuildTypeData,
  isVcsRootsResponse,
} from './types/api-responses';
import type { TeamCityUnifiedClient } from './types/client';

type BuildTypeClonePayload = Partial<BuildTypeData> & {
  id: string;
  name: string;
  project: { id: string };
};

export interface CloneOptions {
  name: string;
  targetProjectId: string;
  description?: string;
  vcsRootId?: string;
  parameters?: Record<string, string>;
  copyBuildCounter?: boolean;
  id?: string;
}

export interface BuildConfiguration {
  id: string;
  name: string;
  projectId: string;
  description?: string;
  vcsRootId?: string;
  parameters?: Record<string, string>;
  templateId?: string;
  steps?: BuildTypeStep[];
  triggers?: BuildTypeTrigger[];
  features?: BuildTypeFeature[];
  artifactDependencies?: BuildTypeDependency[];
  snapshotDependencies?: BuildTypeDependency[];
  buildNumberCounter?: number;
  buildNumberFormat?: string;
  url?: string;
}

export class BuildConfigurationCloneManager {
  private client: TeamCityUnifiedClient;

  constructor(client: TeamCityUnifiedClient) {
    this.client = client;
  }

  /**
   * Retrieve complete build configuration from TeamCity
   */
  async retrieveConfiguration(configId: string): Promise<BuildConfiguration | null> {
    try {
      const response = await this.client.modules.buildTypes.getBuildType(
        configId,
        '$long,steps($long),triggers($long),features($long),artifact-dependencies($long),snapshot-dependencies($long),parameters($long),vcs-root-entries($long)'
      );

      if (response.data == null || !isBuildTypeData(response.data)) {
        return null;
      }

      const config = response.data as BuildTypeData;

      // Extract VCS root ID if present
      let vcsRootId: string | undefined;
      const vcsRootEntries = config['vcs-root-entries'];
      if (vcsRootEntries?.['vcs-root-entry'] && vcsRootEntries['vcs-root-entry'].length > 0) {
        const firstEntry = vcsRootEntries['vcs-root-entry'][0];
        if (firstEntry?.['vcs-root']?.id) {
          vcsRootId = firstEntry['vcs-root'].id;
        }
      }

      // Extract parameters
      const parameters: Record<string, string> = {};
      if (config.parameters?.property) {
        for (const param of config.parameters.property) {
          if (param.name && param.value) {
            parameters[param.name] = param.value;
          }
        }
      }

      const cfgId = config.id;
      const cfgName = config.name;
      if (!cfgId || !cfgName) {
        throw new Error('Source configuration missing id or name');
      }
      return {
        id: cfgId,
        name: cfgName,
        projectId: config.projectId ?? config.project?.id ?? '',
        description: config.description,
        vcsRootId,
        parameters,
        templateId: config.templates?.buildType?.[0]?.id,
        steps: config.steps?.step,
        triggers: config.triggers?.trigger,
        features: config.features?.feature,
        artifactDependencies: config['artifact-dependencies']?.['artifact-dependency'],
        snapshotDependencies: config['snapshot-dependencies']?.['snapshot-dependency'],
        buildNumberCounter: (() => {
          const counterProp = config.settings?.property?.find(
            (p: BuildTypeProperty) => p.name === 'buildNumberCounter'
          );
          return counterProp?.value ? parseInt(counterProp.value, 10) : undefined;
        })(),
        buildNumberFormat: config.settings?.property?.find(
          (p: BuildTypeProperty) => p.name === 'buildNumberPattern'
        )?.value,
      };
    } catch (err) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        debug('Build configuration not found', { configId });
        return null;
      }
      if (axiosError.response?.status === 403) {
        throw new Error('Permission denied: No access to source configuration');
      }
      throw err;
    }
  }

  /**
   * Validate target project exists and user has permissions
   */
  async validateTargetProject(projectId: string): Promise<{ id: string; name: string } | null> {
    try {
      const response = await this.client.modules.projects.getProject(projectId, '$short');

      const id = response.data?.id;
      const name = response.data?.name;
      if (id && name) {
        return { id, name };
      }
      return null;
    } catch (err) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        debug('Target project not found', { projectId });
        return null;
      }
      if (axiosError.response?.status === 403) {
        debug('No permission to access target project', { projectId });
        return null;
      }
      throw err;
    }
  }

  /**
   * Handle VCS root cloning or reuse
   */
  async handleVcsRoot(
    vcsRootId: string,
    handling: 'clone' | 'reuse',
    targetProjectId: string
  ): Promise<{ id: string; name: string }> {
    if (handling === 'reuse') {
      // Just return the existing VCS root ID
      return { id: vcsRootId, name: 'Reused VCS Root' };
    }

    // Clone the VCS root
    try {
      // Get VCS root details
      const vcsRootsResponse = await this.client.modules.vcsRoots.getAllVcsRoots(
        `id:${vcsRootId}`,
        '$long,vcsRoot($long,properties($long))'
      );

      if (vcsRootsResponse.data == null || !isVcsRootsResponse(vcsRootsResponse.data)) {
        throw new Error('Invalid VCS root response');
      }

      const vcsRoots = vcsRootsResponse.data['vcs-root'] ?? [];
      if (vcsRoots.length === 0) {
        throw new Error('VCS root not found');
      }

      const sourceVcsRoot = vcsRoots[0] as VcsRootData;
      if (sourceVcsRoot == null) {
        throw new Error('VCS root data is invalid');
      }

      const clonedVcsRootName = `${sourceVcsRoot.name}_Clone_${Date.now()}`;

      const clonedVcsRoot = {
        name: clonedVcsRootName,
        vcsName: sourceVcsRoot.vcsName,
        project: {
          id: targetProjectId,
        },
        properties: sourceVcsRoot.properties,
      };

      const createResponse = await this.client.modules.vcsRoots.addVcsRoot(
        undefined,
        clonedVcsRoot as VcsRootData
      );

      const newId = createResponse.data.id;
      const newName = createResponse.data.name;
      if (!newId || !newName) {
        throw new Error('Failed to obtain cloned VCS root id/name');
      }
      return { id: newId, name: newName };
    } catch (err) {
      logError('Failed to clone VCS root', err as Error);
      throw new Error(`Failed to clone VCS root: ${(err as Error).message}`);
    }
  }

  /**
   * Apply parameter overrides to configuration
   */
  async applyParameterOverrides(
    sourceParameters: Record<string, string>,
    overrides: Record<string, string>
  ): Promise<Record<string, string>> {
    const mergedParameters = { ...sourceParameters };

    for (const [key, value] of Object.entries(overrides)) {
      // Validate parameter name
      if (!this.isValidParameterName(key)) {
        throw new Error(`Invalid parameter name: ${key}`);
      }
      mergedParameters[key] = value;
    }

    return mergedParameters;
  }

  /**
   * Clone the build configuration
   */
  async cloneConfiguration(
    source: BuildConfiguration,
    options: CloneOptions
  ): Promise<BuildConfiguration> {
    // Generate new configuration ID
    const configId =
      options.id ?? this.generateBuildConfigId(options.targetProjectId, options.name);

    // Build the configuration payload
    const configPayload: BuildTypeClonePayload = {
      id: configId,
      name: options.name,
      project: {
        id: options.targetProjectId,
      },
    };

    // Add optional fields
    if (options.description) {
      configPayload.description = options.description;
    }

    // Copy template reference if exists
    if (source.templateId) {
      configPayload.templates = {
        buildType: [{ id: source.templateId }],
      };
    }

    // Add VCS root if provided
    if (options.vcsRootId) {
      configPayload['vcs-root-entries'] = {
        'vcs-root-entry': [
          {
            'vcs-root': { id: options.vcsRootId },
            'checkout-rules': '',
          },
        ],
      };
    }

    // Copy build steps
    if (source.steps && source.steps.length > 0) {
      configPayload.steps = {
        step: this.cloneBuildSteps(source.steps),
      };
    }

    // Copy triggers
    if (source.triggers && source.triggers.length > 0) {
      configPayload.triggers = {
        trigger: this.cloneTriggers(source.triggers),
      };
    }

    // Copy features with deep cloning
    if (source.features && source.features.length > 0) {
      configPayload.features = {
        feature: source.features.map((f) => this.deepCloneConfiguration(f)),
      };
    }

    // Copy dependencies with reference updates
    if (source.artifactDependencies && source.artifactDependencies.length > 0) {
      configPayload['artifact-dependencies'] = {
        'artifact-dependency': this.updateDependencyReferences(
          source.artifactDependencies,
          source.id,
          configId
        ),
      };
    }

    if (source.snapshotDependencies && source.snapshotDependencies.length > 0) {
      configPayload['snapshot-dependencies'] = {
        'snapshot-dependency': this.updateDependencyReferences(
          source.snapshotDependencies,
          source.id,
          configId
        ),
      };
    }

    // Add parameters
    if (options.parameters && Object.keys(options.parameters).length > 0) {
      configPayload.parameters = {
        property: Object.entries(options.parameters).map(([name, value]) => ({
          name,
          value,
        })),
      };
    }

    // Handle build counter
    if (options.copyBuildCounter && source.buildNumberCounter) {
      configPayload.settings ??= { property: [] };
      configPayload.settings.property?.push({
        name: 'buildNumberCounter',
        value: source.buildNumberCounter.toString(),
      });
    }

    // Copy build number format
    if (source.buildNumberFormat) {
      configPayload.settings ??= { property: [] };
      configPayload.settings.property?.push({
        name: 'buildNumberPattern',
        value: source.buildNumberFormat,
      });
    }

    try {
      const response = await this.client.modules.buildTypes.createBuildType(
        undefined,
        this.prepareBuildTypePayload(configPayload)
      );

      const teamcityUrl = getTeamCityUrl();
      const id = response.data.id;
      const name = response.data.name;
      if (!id || !name) {
        throw new Error('Clone response missing id or name');
      }
      const result: BuildConfiguration = {
        id,
        name,
        projectId: response.data.projectId ?? options.targetProjectId,
        description: response.data.description,
        vcsRootId: options.vcsRootId,
        parameters: options.parameters,
        url: `${teamcityUrl}/viewType.html?buildTypeId=${id}`,
      };

      info('Build configuration cloned', {
        id: result.id,
        name: result.name,
        sourceId: source.id,
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

      logError(
        'Failed to clone build configuration',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Normalize cloned payload into the generated BuildType shape expected by the API
   */
  private prepareBuildTypePayload(payload: BuildTypeClonePayload): BuildType {
    const clone =
      typeof structuredClone === 'function'
        ? structuredClone(payload)
        : (JSON.parse(JSON.stringify(payload)) as BuildTypeClonePayload);

    if (typeof clone.id !== 'string' || typeof clone.name !== 'string') {
      throw new Error('Invalid build configuration payload: missing id or name');
    }

    if (typeof clone.project?.id !== 'string') {
      throw new Error('Invalid build configuration payload: missing project id');
    }

    return clone as BuildType;
  }

  /**
   * Deep clone configuration object and remove server-generated fields
   */
  private deepCloneConfiguration<T>(config: T): T {
    // Create a deep copy to avoid mutating the source
    const cloned = JSON.parse(JSON.stringify(config)) as T & {
      href?: unknown;
      webUrl?: unknown;
      locator?: unknown;
      uuid?: unknown;
      links?: unknown;
      _links?: unknown;
    };

    // Remove server-generated fields that shouldn't be included in the clone
    delete cloned.href;
    delete cloned.webUrl;
    delete cloned.locator;
    delete cloned.uuid;
    delete cloned.links;
    delete cloned._links;

    return cloned as T;
  }

  /**
   * Clone build steps with new IDs
   */
  private cloneBuildSteps(steps: BuildTypeStep[]): BuildTypeStep[] {
    return steps.map((step, index) => {
      const clonedStep = this.deepCloneConfiguration(step);
      clonedStep.id = `RUNNER_${index + 1}`;
      return clonedStep;
    });
  }

  /**
   * Clone triggers with new IDs
   */
  private cloneTriggers(triggers: BuildTypeTrigger[]): BuildTypeTrigger[] {
    return triggers.map((trigger, index) => {
      const clonedTrigger = this.deepCloneConfiguration(trigger);
      clonedTrigger.id = `TRIGGER_${index + 1}`;
      return clonedTrigger;
    });
  }

  /**
   * Update internal references in dependencies
   */
  private updateDependencyReferences(
    dependencies: BuildTypeDependency[],
    oldId: string,
    newId: string
  ): BuildTypeDependency[] {
    return dependencies.map((dep) => {
      const clonedDep = this.deepCloneConfiguration(dep);
      // Update any references to the old configuration ID
      if (clonedDep.sourceBuildTypeId === oldId) {
        clonedDep.sourceBuildTypeId = newId;
      }
      if (clonedDep.dependsOnBuildTypeId === oldId) {
        clonedDep.dependsOnBuildTypeId = newId;
      }
      return clonedDep;
    });
  }

  /**
   * Generate a unique build configuration ID
   */
  private generateBuildConfigId(projectId: string, name: string): string {
    const cleanName = name
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return `${projectId}_${cleanName}`;
  }

  /**
   * Validate parameter name according to TeamCity rules
   */
  private isValidParameterName(name: string): boolean {
    // TeamCity parameter names can contain letters, numbers, dots, underscores, and hyphens
    return /^[a-zA-Z0-9._-]+$/.test(name);
  }
}
