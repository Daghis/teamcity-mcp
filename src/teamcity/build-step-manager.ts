/**
 * BuildStepManager - Manages build steps in TeamCity configurations
 *
 * Provides functionality to:
 * - List all build steps in a configuration
 * - Create new build steps with various runner types
 * - Update existing build steps
 * - Delete build steps
 * - Reorder build steps
 */
import axios, { type AxiosInstance } from 'axios';

import {
  BuildConfigurationNotFoundError,
  BuildStepNotFoundError,
  PermissionDeniedError,
  TeamCityAPIError,
  ValidationError,
} from '@/teamcity/errors';

import type { TeamCityClientConfig } from './client';

/**
 * Options for listing build steps
 */
export interface BuildStepManagerOptions {
  configId: string;
}

/**
 * Options for creating a build step
 */
export interface BuildStepCreateOptions {
  configId: string;
  name: string;
  type: RunnerType;
  enabled?: boolean;
  properties?: Record<string, string>;
  parameters?: Record<string, string>;
}

/**
 * Options for updating a build step
 */
export interface BuildStepUpdateOptions {
  configId: string;
  stepId: string;
  name?: string;
  enabled?: boolean;
  properties?: Record<string, string>;
  parameters?: Record<string, string>;
}

/**
 * Options for deleting a build step
 */
export interface BuildStepDeleteOptions {
  configId: string;
  stepId: string;
}

/**
 * Options for reordering build steps
 */
export interface BuildStepReorderOptions {
  configId: string;
  stepOrder: string[];
}

/**
 * Supported TeamCity runner types
 */
export type RunnerType =
  | 'simpleRunner' // Command line/shell scripts
  | 'Maven2' // Maven build runner
  | 'gradle-runner' // Gradle build runner
  | 'MSBuild' // MSBuild runner for .NET
  | 'dotnet' // .NET CLI runner
  | 'nodejs-runner' // Node.js runner
  | 'Docker' // Docker command runner
  | 'python' // Python runner
  | 'cargo' // Rust cargo runner
  | 'kotlinScript'; // Kotlin script runner

/**
 * Build step representation
 */
export interface BuildStep {
  id: string;
  name: string;
  type: RunnerType;
  enabled: boolean;
  parameters: Record<string, string>;
  executionMode?: 'default' | 'always' | 'onlyIfAllPreviousPassed';
}

/**
 * Result for listing build steps
 */
export interface BuildStepListResult {
  success: boolean;
  steps: BuildStep[];
  configId: string;
}

/**
 * Result for build step operations
 */
export interface BuildStepOperationResult {
  success: boolean;
  step?: BuildStep;
  steps?: BuildStep[];
  message?: string;
}

/**
 * Required parameters for each runner type
 */
const RUNNER_REQUIRED_PARAMS: Record<string, string[]> = {
  simpleRunner: ['script.content'],
  Maven2: ['goals'],
  'gradle-runner': ['gradle.tasks'],
  MSBuild: ['msbuild.project'],
  dotnet: ['dotnet.command'],
  'nodejs-runner': ['nodejs.script'],
  Docker: ['docker.command'],
  python: ['python.script'],
  cargo: ['cargo.command'],
  kotlinScript: ['kotlinScript.content'],
};

/**
 * Manages build steps in TeamCity configurations
 */
export class BuildStepManager {
  private readonly api: AxiosInstance;

  constructor(config: TeamCityClientConfig) {
    // Create axios instance for direct API calls
    this.api = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      timeout: config.timeout ?? 30000,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * List all build steps in a configuration
   */
  async listBuildSteps(options: BuildStepManagerOptions): Promise<BuildStepListResult> {
    try {
      const response = await this.api.get(`/app/rest/buildTypes/${options.configId}/steps`, {
        params: {
          fields:
            'count,step(id,name,type,disabled,properties(property(name,value)),parameters(property(name,value)))',
        },
      });

      if (response.data == null) {
        throw new TeamCityAPIError('Invalid response from TeamCity API', 'INVALID_RESPONSE', 500);
      }

      const steps = this.parseStepList(response.data);

      return {
        success: true,
        steps,
        configId: options.configId,
      };
    } catch (error) {
      throw this.handleError(error, 'list build steps');
    }
  }

  /**
   * Create a new build step
   */
  async createBuildStep(options: BuildStepCreateOptions): Promise<BuildStepOperationResult> {
    // Validate runner type
    if (!this.isValidRunnerType(options.type)) {
      throw new ValidationError(`Invalid runner type: ${options.type as string}`, {
        field: 'type',
        value: options.type,
        validValues: Object.keys(RUNNER_REQUIRED_PARAMS),
      });
    }

    // Validate required parameters
    this.validateRunnerParameters(options.type, options.properties ?? {});

    try {
      const stepData = this.buildStepData(options);

      const response = await this.api.post(
        `/app/rest/buildTypes/${options.configId}/steps`,
        stepData
      );

      const step = this.parseStep(response.data);

      return {
        success: true,
        step,
        message: `Build step '${step.name}' created successfully`,
      };
    } catch (error) {
      throw this.handleError(error, 'create build step');
    }
  }

  /**
   * Update an existing build step
   */
  async updateBuildStep(options: BuildStepUpdateOptions): Promise<BuildStepOperationResult> {
    try {
      const updateData: Record<string, unknown> = {};

      if (options.name !== undefined) {
        updateData['name'] = options.name;
      }

      if (options.enabled !== undefined) {
        updateData['disabled'] = !options.enabled;
      }

      if (options.properties) {
        updateData['properties'] = {
          property: Object.entries(options.properties).map(([name, value]) => ({
            name,
            value,
          })),
        };
      }

      if (options.parameters) {
        updateData['parameters'] = {
          property: Object.entries(options.parameters).map(([name, value]) => ({
            name,
            value,
          })),
        };
      }

      const response = await this.api.put(
        `/app/rest/buildTypes/${options.configId}/steps/${options.stepId}`,
        updateData
      );

      const step = this.parseStep(response.data);

      return {
        success: true,
        step,
        message: `Build step '${step.name}' updated successfully`,
      };
    } catch (error) {
      throw this.handleError(error, 'update build step', options.stepId);
    }
  }

  /**
   * Delete a build step
   */
  async deleteBuildStep(options: BuildStepDeleteOptions): Promise<BuildStepOperationResult> {
    try {
      await this.api.delete(`/app/rest/buildTypes/${options.configId}/steps/${options.stepId}`);

      return {
        success: true,
        message: `Build step '${options.stepId}' deleted successfully`,
      };
    } catch (error) {
      throw this.handleError(error, 'delete build step', options.stepId);
    }
  }

  /**
   * Reorder build steps
   */
  async reorderBuildSteps(options: BuildStepReorderOptions): Promise<BuildStepOperationResult> {
    try {
      // First, get existing steps to validate the new order
      const existingSteps = await this.listBuildSteps({ configId: options.configId });
      const existingIds = new Set(existingSteps.steps.map((s) => s.id));

      // Validate all step IDs exist
      for (const stepId of options.stepOrder) {
        if (!existingIds.has(stepId)) {
          throw new ValidationError(`Build step '${stepId}' not found in configuration`, {
            field: 'stepOrder',
            value: options.stepOrder,
            validValues: Array.from(existingIds),
          });
        }
      }

      // Build reorder request
      const reorderData = {
        step: options.stepOrder.map((id) => ({ id })),
      };

      const response = await this.api.put(
        `/app/rest/buildTypes/${options.configId}/steps`,
        reorderData
      );

      const steps = this.parseStepList(response.data);

      return {
        success: true,
        steps,
        message: 'Build steps reordered successfully',
      };
    } catch (error) {
      throw this.handleError(error, 'reorder build steps');
    }
  }

  /**
   * Parse step list from API response
   */
  private parseStepList(data: unknown): BuildStep[] {
    const stepData = data as { step?: unknown };
    if (stepData.step == null) {
      return [];
    }

    const steps = Array.isArray(stepData.step) ? stepData.step : [stepData.step];
    return steps.map((step) => this.parseStep(step));
  }

  /**
   * Parse individual step from API response
   */
  private parseStep(step: unknown): BuildStep {
    const stepData = step as {
      id: string;
      name?: string;
      type: string;
      disabled?: boolean;
      properties?: unknown;
      executionMode?: string;
    };
    return {
      id: stepData.id,
      name: stepData.name ?? 'Unnamed Step',
      type: stepData.type as RunnerType,
      enabled: stepData.disabled !== true,
      parameters: this.parseRunnerProperties(stepData.type, stepData.properties),
      executionMode: (stepData.executionMode ?? 'default') as BuildStep['executionMode'],
    };
  }

  /**
   * Parse runner properties based on runner type
   */
  private parseRunnerProperties(type: string, properties: unknown): Record<string, string> {
    const propsData = properties as { property?: unknown };
    if (propsData.property == null) {
      return {};
    }

    const props = Array.isArray(propsData.property) ? propsData.property : [propsData.property];

    const result: Record<string, string> = {};

    for (const prop of props) {
      const propData = prop as { name?: string; value?: string };
      if (
        propData.name !== null &&
        propData.name !== undefined &&
        propData.name !== '' &&
        propData.value !== undefined
      ) {
        result[propData.name] = propData.value;
      }
    }

    return result;
  }

  /**
   * Validate runner type
   */
  private isValidRunnerType(type: string): type is RunnerType {
    return type in RUNNER_REQUIRED_PARAMS;
  }

  /**
   * Validate runner parameters
   */
  private validateRunnerParameters(type: RunnerType, properties: Record<string, string>): void {
    const requiredParams = RUNNER_REQUIRED_PARAMS[type] ?? [];

    for (const param of requiredParams) {
      const value = properties[param];
      if (value == null || value === '') {
        throw new ValidationError(`Missing required parameter '${param}' for ${type} runner`, {
          field: param,
          runnerType: type,
          requiredParameters: requiredParams,
        });
      }
    }
  }

  /**
   * Build step data for API request
   */
  private buildStepData(options: BuildStepCreateOptions): Record<string, unknown> {
    const data: Record<string, unknown> = {
      name: options.name,
      type: options.type,
    };

    if (options.enabled !== undefined) {
      data['disabled'] = !options.enabled;
    }

    if (options.properties) {
      data['properties'] = {
        property: Object.entries(options.properties).map(([name, value]) => ({
          name,
          value,
        })),
      };
    }

    if (options.parameters) {
      data['parameters'] = {
        property: Object.entries(options.parameters).map(([name, value]) => ({
          name,
          value,
        })),
      };
    }

    return data;
  }

  /**
   * Handle API errors
   */
  private handleError(error: unknown, operation: string, stepId?: string): never {
    if (error instanceof ValidationError) {
      throw error;
    }

    const axiosError = error as {
      response?: { status: number; data?: { message?: string } };
      message?: string;
    };
    if (axiosError.response) {
      const status = axiosError.response.status;
      const message = axiosError.response.data?.message ?? axiosError.message ?? 'Unknown error';

      switch (status) {
        case 404:
          if (
            stepId !== null &&
            stepId !== undefined &&
            stepId !== '' &&
            typeof message === 'string' &&
            message.toLowerCase().includes('step')
          ) {
            throw new BuildStepNotFoundError(`Build step '${stepId}' not found`, stepId);
          } else {
            throw new BuildConfigurationNotFoundError('Build configuration not found', '');
          }
        case 403:
          throw new PermissionDeniedError(`Permission denied to ${operation}`, operation);
        case 401:
          throw new TeamCityAPIError('Authentication required', 'AUTHENTICATION_ERROR', 401, {
            operation,
          });
        case 409:
          throw new TeamCityAPIError(
            `Conflict while trying to ${operation}: ${message}`,
            'CONFLICT_ERROR',
            409,
            { operation }
          );
        default:
          throw new TeamCityAPIError(
            `Failed to ${operation}: ${message}`,
            `ERROR_${status}`,
            status,
            undefined,
            undefined,
            error instanceof Error ? error : undefined
          );
      }
    }

    throw new TeamCityAPIError(
      `Failed to ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'INTERNAL_ERROR',
      500,
      { operation },
      undefined,
      error instanceof Error ? error : undefined
    );
  }
}
