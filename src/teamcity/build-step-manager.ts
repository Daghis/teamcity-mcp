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
import type { Step } from '@/teamcity-client/models/step';
import type { Steps } from '@/teamcity-client/models/steps';
import {
  BuildConfigurationNotFoundError,
  BuildStepNotFoundError,
  PermissionDeniedError,
  TeamCityAPIError,
  ValidationError,
} from '@/teamcity/errors';

import type { TeamCityClientAdapter } from './client-adapter';

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

interface StepListResponse {
  step?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

/**
 * Manages build steps in TeamCity configurations
 */
export class BuildStepManager {
  constructor(private readonly client: TeamCityClientAdapter) {}

  /**
   * List all build steps in a configuration
   */
  async listBuildSteps(options: BuildStepManagerOptions): Promise<BuildStepListResult> {
    try {
      const response = await this.client.modules.buildTypes.getAllBuildSteps(
        options.configId,
        'count,step(id,name,type,disabled,properties(property(name,value)),parameters(property(name,value)))'
      );
      const payload = this.ensureStepListResponse(
        response.data,
        options.configId,
        'list build steps'
      );
      const steps = this.parseStepList(payload.step, options.configId, 'list build steps');

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

      const response = await this.client.modules.buildTypes.addBuildStepToBuildType(
        options.configId,
        undefined,
        stepData as Step
      );

      const step = this.parseStep(response.data, {
        configId: options.configId,
        operation: 'create build step',
      });

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

      const response = await this.client.modules.buildTypes.replaceBuildStep(
        options.configId,
        options.stepId,
        undefined,
        updateData as Step
      );

      const step = this.parseStep(response.data, {
        configId: options.configId,
        operation: 'update build step',
        stepId: options.stepId,
      });

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
      await this.client.modules.buildTypes.deleteBuildStep(options.configId, options.stepId);

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
      const reorderData: Steps = {
        step: options.stepOrder.map((id) => ({ id })),
        count: options.stepOrder.length,
      };

      const response = await this.client.modules.buildTypes.replaceAllBuildSteps(
        options.configId,
        undefined,
        reorderData
      );
      const payload = this.ensureStepListResponse(
        response.data,
        options.configId,
        'reorder build steps'
      );
      const steps = this.parseStepList(payload.step, options.configId, 'reorder build steps');

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
  private ensureStepListResponse(
    data: unknown,
    configId: string,
    operation: string
  ): StepListResponse {
    if (!isRecord(data)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object step list response',
        'INVALID_RESPONSE',
        undefined,
        { configId, operation }
      );
    }

    const response = data as StepListResponse;
    const { step } = response;

    if (step !== undefined && !Array.isArray(step) && !isRecord(step)) {
      throw new TeamCityAPIError(
        'TeamCity step list response contains an invalid step payload',
        'INVALID_RESPONSE',
        undefined,
        { configId, operation }
      );
    }

    return response;
  }

  private parseStepList(stepNode: unknown, configId: string, operation: string): BuildStep[] {
    if (stepNode == null) {
      return [];
    }

    const steps = Array.isArray(stepNode) ? stepNode : [stepNode];
    return steps.map((step, index) =>
      this.parseStep(step, {
        configId,
        operation,
        index,
      })
    );
  }

  /**
   * Parse individual step from API response
   */
  private parseStep(
    step: unknown,
    context: { configId: string; operation: string; stepId?: string; index?: number }
  ): BuildStep {
    if (!isRecord(step)) {
      throw new TeamCityAPIError(
        'TeamCity returned a non-object build step entry',
        'INVALID_RESPONSE',
        undefined,
        { ...context }
      );
    }

    const stepData = step as Record<string, unknown>;
    const { id, name, type, disabled, properties, executionMode } = stepData;

    if (typeof id !== 'string' || typeof type !== 'string') {
      throw new TeamCityAPIError(
        'TeamCity build step entry is missing required identifiers',
        'INVALID_RESPONSE',
        undefined,
        { ...context, receivedKeys: Object.keys(stepData) }
      );
    }

    return {
      id,
      name: typeof name === 'string' && name.length > 0 ? name : 'Unnamed Step',
      type: type as RunnerType,
      enabled: disabled !== true,
      parameters: this.parseRunnerProperties(type, properties, {
        configId: context.configId,
        operation: context.operation,
      }),
      executionMode: (typeof executionMode === 'string'
        ? executionMode
        : 'default') as BuildStep['executionMode'],
    };
  }

  /**
   * Parse runner properties based on runner type
   */
  private parseRunnerProperties(
    type: string,
    properties: unknown,
    context: { configId: string; operation: string }
  ): Record<string, string> {
    if (properties == null) {
      return {};
    }

    if (!isRecord(properties)) {
      throw new TeamCityAPIError(
        'TeamCity build step entry contains invalid properties payload',
        'INVALID_RESPONSE',
        undefined,
        context
      );
    }

    const propsData = properties as { property?: unknown };
    if (propsData.property == null) {
      return {};
    }

    const props = Array.isArray(propsData.property) ? propsData.property : [propsData.property];

    const result: Record<string, string> = {};

    for (const prop of props) {
      if (!isRecord(prop)) {
        throw new TeamCityAPIError(
          'TeamCity build step property entry is not an object',
          'INVALID_RESPONSE',
          undefined,
          context
        );
      }
      const { name, value } = prop as { name?: string; value?: string };
      if (typeof name === 'string' && name !== '' && typeof value === 'string') {
        result[name] = value;
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
