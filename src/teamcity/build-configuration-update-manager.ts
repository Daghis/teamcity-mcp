/**
 * BuildConfigurationUpdateManager - Manages updating of build configurations
 */
import { debug, info, error as logError } from '@/utils/logger';

import type { TeamCityClient } from './client';

export interface UpdateOptions {
  name?: string;
  description?: string;
  buildNumberFormat?: string;
  artifactRules?: string;
  parameters?: Record<string, string>;
  removeParameters?: string[];
  agentRequirements?: {
    poolId?: string;
    requirements?: Record<string, string>;
  };
  buildOptions?: {
    cleanBuild?: boolean;
    executionTimeout?: number;
    checkoutDirectory?: string;
  };
}

export interface BuildConfiguration {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  buildNumberFormat?: string;
  artifactRules?: string;
  parameters?: Record<string, string>;
  agentRequirements?: {
    requirement?: Array<{
      id?: string;
      type: string;
      properties?: { property?: Array<{ name: string; value: string }> };
    }>;
  };
  buildOptions?: {
    cleanBuild?: boolean;
    executionTimeout?: number;
    checkoutDirectory?: string;
  };
  settings?: {
    property?: Array<{ name: string; value: string }>;
  };
}

export interface ChangeLog {
  [key: string]:
    | {
        before?: unknown;
        after?: unknown;
      }
    | {
        added?: Record<string, unknown>;
        updated?: Record<string, { before: unknown; after: unknown }>;
        removed?: string[];
      };
}

export class BuildConfigurationUpdateManager {
  private client: TeamCityClient;

  constructor(client: TeamCityClient) {
    this.client = client;
  }

  /**
   * Retrieve current build configuration
   */
  async retrieveConfiguration(configId: string): Promise<BuildConfiguration | null> {
    try {
      const response = await this.client.buildTypes.getBuildType(
        configId,
        '$long,parameters($long),settings($long),agent-requirements($long)'
      );

      if (response.data == null) {
        return null;
      }

      const config = response.data;

      // Extract parameters
      const parameters: Record<string, string> = {};
      if (config.parameters?.property != null) {
        for (const param of config.parameters.property) {
          if (param.name != null && param.value != null) {
            parameters[param.name] = param.value;
          }
        }
      }

      // Extract build settings
      const buildNumberFormat = config.settings?.property?.find(
        (p) => p.name === 'buildNumberPattern'
      )?.value;

      const artifactRules = config.settings?.property?.find(
        (p) => p.name === 'artifactRules'
      )?.value;

      const cleanBuild =
        config.settings?.property?.find((p) => p.name === 'cleanBuild')?.value === 'true';

      const executionTimeout = config.settings?.property?.find(
        (p) => p.name === 'executionTimeoutMin'
      )?.value;

      const checkoutDirectory = config.settings?.property?.find(
        (p) => p.name === 'checkoutDirectory'
      )?.value;

      if (!config.id || !config.name) {
        throw new Error('Invalid configuration data: missing id or name');
      }
      return {
        id: config.id,
        name: config.name,
        description: config.description,
        projectId: config.projectId ?? config.project?.id ?? '',
        buildNumberFormat,
        artifactRules,
        parameters,
        agentRequirements: config['agent-requirements'] as {
          requirement?: Array<{
            id?: string;
            type: string;
            properties?: { property?: Array<{ name: string; value: string }> };
          }>;
        },
        buildOptions: {
          cleanBuild,
          executionTimeout: executionTimeout != null ? parseInt(executionTimeout, 10) : undefined,
          checkoutDirectory,
        },
        settings: config.settings as {
          property?: Array<{ name: string; value: string }>;
        },
      };
    } catch (err) {
      if (
        err != null &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 404
      ) {
        debug('Build configuration not found', { configId });
        return null;
      }
      if (
        err != null &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { status?: number } }).response?.status === 403
      ) {
        throw new Error('Permission denied: No access to build configuration');
      }
      throw err;
    }
  }

  /**
   * Validate updates before applying
   */
  async validateUpdates(
    currentConfig: BuildConfiguration,
    updates: UpdateOptions
  ): Promise<boolean> {
    debug('Validating updates', {
      configId: currentConfig.id,
      updateFields: Object.keys(updates),
    });

    // Validate parameter names
    if (updates.parameters) {
      for (const paramName of Object.keys(updates.parameters)) {
        if (!this.isValidParameterName(paramName)) {
          throw new Error(`Invalid parameter name: ${paramName}`);
        }
      }
    }

    // Validate parameters to remove exist
    if (updates.removeParameters) {
      for (const paramName of updates.removeParameters) {
        if (!currentConfig.parameters?.[paramName]) {
          throw new Error(`Parameter does not exist: ${paramName}`);
        }
      }
    }

    // Check for parameter conflicts
    if (updates.parameters && updates.removeParameters) {
      const addOrUpdate = Object.keys(updates.parameters);
      const toRemove = updates.removeParameters;
      const conflicts = addOrUpdate.filter((param) => toRemove.includes(param));

      if (conflicts.length > 0) {
        throw new Error(
          `Conflict: Cannot update and remove the same parameter: ${conflicts.join(', ')}`
        );
      }
    }

    // Validate build number format
    if (updates.buildNumberFormat) {
      if (!this.isValidBuildNumberFormat(updates.buildNumberFormat)) {
        throw new Error(`Invalid build number format: ${updates.buildNumberFormat}`);
      }
    }

    // Validate artifact rules
    if (updates.artifactRules) {
      if (!this.isValidArtifactRules(updates.artifactRules)) {
        throw new Error(`Invalid artifact rules: ${updates.artifactRules}`);
      }
    }

    // Validate execution timeout
    if (updates.buildOptions?.executionTimeout !== undefined) {
      if (
        updates.buildOptions.executionTimeout < 0 ||
        updates.buildOptions.executionTimeout > 1440
      ) {
        throw new Error('Execution timeout must be between 0 and 1440 minutes');
      }
    }

    return true;
  }

  /**
   * Apply updates to configuration
   */
  async applyUpdates(
    currentConfig: BuildConfiguration,
    updates: UpdateOptions
  ): Promise<BuildConfiguration> {
    info('Applying updates to build configuration', {
      id: currentConfig.id,
      updateCount: Object.keys(updates).length,
    });

    const configPayload: {
      id: string;
      name: string;
      description?: string;
      project: { id: string };
      settings?: { property: Array<{ name: string; value: string }> };
      parameters?: { property: Array<{ name: string; value: string }> };
    } = {
      id: currentConfig.id,
      name: updates.name ?? currentConfig.name,
      description: updates.description ?? currentConfig.description,
      project: {
        id: currentConfig.projectId,
      },
    };

    // Update build settings
    const settings: Array<{ name: string; value: string }> = [];

    if (updates.buildNumberFormat !== undefined) {
      settings.push({
        name: 'buildNumberPattern',
        value: updates.buildNumberFormat,
      });
    }

    if (updates.artifactRules !== undefined) {
      settings.push({
        name: 'artifactRules',
        value: updates.artifactRules,
      });
    }

    if (updates.buildOptions) {
      if (updates.buildOptions.cleanBuild !== undefined) {
        settings.push({
          name: 'cleanBuild',
          value: updates.buildOptions.cleanBuild.toString(),
        });
      }
      if (updates.buildOptions.executionTimeout !== undefined) {
        settings.push({
          name: 'executionTimeoutMin',
          value: updates.buildOptions.executionTimeout.toString(),
        });
      }
      if (updates.buildOptions.checkoutDirectory !== undefined) {
        settings.push({
          name: 'checkoutDirectory',
          value: updates.buildOptions.checkoutDirectory,
        });
      }
    }

    if (settings.length > 0) {
      configPayload.settings = { property: settings };
    }

    // Handle parameters
    const finalParameters = { ...currentConfig.parameters };

    // Remove parameters first
    if (updates.removeParameters) {
      for (const paramName of updates.removeParameters) {
        delete finalParameters[paramName];
      }
    }

    // Add/update parameters
    if (updates.parameters) {
      Object.assign(finalParameters, updates.parameters);
    }

    if ((updates.parameters ?? updates.removeParameters) != null) {
      configPayload.parameters = {
        property: Object.entries(finalParameters).map(([name, value]) => ({
          name,
          value,
        })),
      };
    }

    // Handle agent requirements
    if (updates.agentRequirements) {
      // This would need more complex handling based on TeamCity's agent requirement format
      // For now, we'll keep it as a placeholder
      debug('Agent requirements update requested', updates.agentRequirements);
    }

    try {
      // Apply the updates via API using direct PUT request
      // Note: TeamCity API doesn't have a direct method for full config update,
      // so we need to update individual fields

      // Update basic fields
      if (updates.name !== undefined || updates.description !== undefined) {
        if (updates.name) {
          await this.client.buildTypes.setBuildTypeField(currentConfig.id, 'name', updates.name);
        }
        if (updates.description !== undefined) {
          await this.client.buildTypes.setBuildTypeField(
            currentConfig.id,
            'description',
            updates.description ?? ''
          );
        }
      }

      // Update settings
      if (settings.length > 0) {
        // Intentional sequential updates: TeamCity API expects ordered single-field updates
        /* eslint-disable no-await-in-loop */
        for (const setting of settings) {
          await this.client.buildTypes.setBuildTypeField(
            currentConfig.id,
            `settings/${setting.name}`,
            setting.value
          );
        }
        /* eslint-enable no-await-in-loop */
      }

      // Update parameters
      if (updates.removeParameters) {
        // Intentional sequential deletions: simplify error handling per parameter
        /* eslint-disable no-await-in-loop */
        for (const paramName of updates.removeParameters) {
          try {
            await this.client.buildTypes.deleteBuildParameterOfBuildType_2(
              paramName,
              currentConfig.id
            );
          } catch (err) {
            debug(`Failed to remove parameter ${paramName}`, err as Record<string, unknown>);
          }
        }
        /* eslint-enable no-await-in-loop */
      }

      if (updates.parameters) {
        // Intentional sequential updates to maintain deterministic order
        /* eslint-disable no-await-in-loop */
        for (const [name, value] of Object.entries(updates.parameters)) {
          await this.client.buildTypes.setBuildTypeField(
            currentConfig.id,
            `parameters/${name}`,
            value
          );
        }
        /* eslint-enable no-await-in-loop */
      }

      // Retrieve the updated configuration to return
      const updatedConfig = await this.retrieveConfiguration(currentConfig.id);
      if (!updatedConfig) {
        throw new Error('Failed to retrieve updated configuration');
      }

      info('Configuration updated successfully', {
        id: updatedConfig.id,
        name: updatedConfig.name,
      });

      return updatedConfig;
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { message?: string } } };

      if (error.response?.status === 409) {
        throw new Error('Configuration was modified by another user');
      }
      if (error.response?.status === 403) {
        throw new Error('Permission denied: You need project edit permissions');
      }
      if (error.response?.status === 400) {
        const message = error.response?.data?.message ?? 'Invalid configuration';
        throw new Error(`Invalid update: ${message}`);
      }

      logError('Failed to apply updates', error as Error);
      throw new Error('Partial update failure');
    }
  }

  /**
   * Generate change log comparing before and after states
   */
  generateChangeLog(currentConfig: BuildConfiguration, updates: UpdateOptions): ChangeLog {
    const changeLog: ChangeLog = {};

    // Track basic field changes
    if (updates.name && updates.name !== currentConfig.name) {
      changeLog['name'] = {
        before: currentConfig.name,
        after: updates.name,
      };
    }

    if (updates.description !== undefined && updates.description !== currentConfig.description) {
      changeLog['description'] = {
        before: currentConfig.description ?? '',
        after: updates.description,
      };
    }

    if (
      updates.buildNumberFormat !== undefined &&
      updates.buildNumberFormat !== currentConfig.buildNumberFormat
    ) {
      changeLog['buildNumberFormat'] = {
        before: currentConfig.buildNumberFormat ?? '',
        after: updates.buildNumberFormat,
      };
    }

    if (
      updates.artifactRules !== undefined &&
      updates.artifactRules !== currentConfig.artifactRules
    ) {
      changeLog['artifactRules'] = {
        before: currentConfig.artifactRules ?? '',
        after: updates.artifactRules,
      };
    }

    // Track parameter changes
    if ((updates.parameters ?? updates.removeParameters) != null) {
      const paramChanges: {
        added?: Record<string, string>;
        updated?: Record<string, { before: string; after: string }>;
        removed?: string[];
      } = {};

      // Track added/updated parameters
      if (updates.parameters) {
        const added: Record<string, string> = {};
        const updated: Record<string, { before: string; after: string }> = {};

        for (const [key, value] of Object.entries(updates.parameters)) {
          if (!currentConfig.parameters?.[key]) {
            added[key] = value;
          } else if (currentConfig.parameters[key] !== value) {
            updated[key] = {
              before: currentConfig.parameters[key],
              after: value,
            };
          }
        }

        if (Object.keys(added).length > 0) {
          paramChanges.added = added;
        }
        if (Object.keys(updated).length > 0) {
          paramChanges.updated = updated;
        }
      }

      // Track removed parameters
      if (updates.removeParameters && updates.removeParameters.length > 0) {
        paramChanges.removed = updates.removeParameters;
      }

      if (Object.keys(paramChanges).length > 0) {
        changeLog['parameters'] = paramChanges;
      }
    }

    // Track build options changes
    if (updates.buildOptions) {
      const optionChanges: Record<
        string,
        { before: boolean | number | string; after: boolean | number | string }
      > = {};

      if (
        updates.buildOptions.cleanBuild !== undefined &&
        updates.buildOptions.cleanBuild !== currentConfig.buildOptions?.cleanBuild
      ) {
        optionChanges['cleanBuild'] = {
          before: currentConfig.buildOptions?.cleanBuild ?? false,
          after: updates.buildOptions.cleanBuild,
        };
      }

      if (
        updates.buildOptions.executionTimeout !== undefined &&
        updates.buildOptions.executionTimeout !== currentConfig.buildOptions?.executionTimeout
      ) {
        optionChanges['executionTimeout'] = {
          before: currentConfig.buildOptions?.executionTimeout ?? 0,
          after: updates.buildOptions.executionTimeout,
        };
      }

      if (
        updates.buildOptions.checkoutDirectory !== undefined &&
        updates.buildOptions.checkoutDirectory !== currentConfig.buildOptions?.checkoutDirectory
      ) {
        optionChanges['checkoutDirectory'] = {
          before: currentConfig.buildOptions?.checkoutDirectory ?? '',
          after: updates.buildOptions.checkoutDirectory,
        };
      }

      if (Object.keys(optionChanges).length > 0) {
        changeLog['buildOptions'] = optionChanges;
      }
    }

    return changeLog;
  }

  /**
   * Rollback changes in case of failure
   */
  async rollbackChanges(configId: string, originalConfig: BuildConfiguration): Promise<void> {
    try {
      info('Rolling back configuration changes', { configId });

      // Restore original configuration
      await this.applyUpdates(originalConfig, {
        name: originalConfig.name,
        description: originalConfig.description,
        buildNumberFormat: originalConfig.buildNumberFormat,
        artifactRules: originalConfig.artifactRules,
        parameters: originalConfig.parameters,
      });

      info('Rollback completed successfully', { configId });
    } catch (err) {
      logError('Failed to rollback changes', err as Error);
      throw new Error('Rollback failed: Manual intervention may be required');
    }
  }

  /**
   * Validate parameter name according to TeamCity rules
   */
  private isValidParameterName(name: string): boolean {
    // TeamCity parameter names can contain letters, numbers, dots, underscores, and hyphens
    return /^[a-zA-Z0-9._-]+$/.test(name);
  }

  /**
   * Validate build number format
   */
  private isValidBuildNumberFormat(format: string): boolean {
    // Basic validation - should contain at least one counter reference
    return (
      format.includes('%') &&
      (format.includes('build.counter') ||
        format.includes('build.vcs.number') ||
        format.includes('build.number'))
    );
  }

  /**
   * Validate artifact rules
   */
  private isValidArtifactRules(rules: string): boolean {
    // Basic validation - non-empty and doesn't contain invalid characters
    return rules.length > 0 && !rules.includes('\\\\');
  }
}
