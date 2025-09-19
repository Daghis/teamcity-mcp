/**
 * BuildTriggerManager - Manages build triggers in TeamCity
 */
import { debug, error as logError } from '@/utils/logger';

import {
  type TeamCityErrorResponse,
  type TeamCityTriggerResponse,
  type TeamCityTriggersResponse,
  type TeamCityVcsRootEntriesResponse,
  normalizeProperties,
  normalizeTriggers,
  normalizeVcsRootEntries,
  propertiesToRecord,
} from './api-types';
import type { TeamCityClientAdapter } from './client-adapter';
import {
  BuildConfigurationNotFoundError,
  CircularDependencyError,
  TeamCityAPIError,
  TriggerNotFoundError,
  ValidationError,
} from './errors';

/**
 * Supported trigger types in TeamCity
 */
export type TriggerType = 'vcsTrigger' | 'schedulingTrigger' | 'buildDependencyTrigger';

/**
 * Base trigger interface
 */
export interface BuildTrigger {
  id: string;
  type: TriggerType;
  enabled: boolean;
  properties: Record<string, string>;
  // Parsed properties for dependency triggers
  dependsOn?: string | string[];
  afterSuccessfulBuildOnly?: boolean;
  artifactRules?: string;
  dependOnStartedBuild?: boolean;
  promoteArtifacts?: boolean;
}

/**
 * VCS trigger specific properties
 */
export interface VcsTriggerProperties {
  branchFilter?: string;
  quietPeriodMode?: 'DO_NOT_USE' | 'USE_DEFAULT' | 'USE_CUSTOM';
  quietPeriod?: number;
  triggerRules?: string;
  enableQueueOptimization?: boolean;
  vcsRootId?: string; // Optional specific VCS root to monitor
}

/**
 * Schedule trigger specific properties
 */
export interface ScheduleTriggerProperties {
  schedulingPolicy: string; // Cron or TeamCity format
  timezone?: string;
  triggerBuildWithPendingChangesOnly?: boolean;
  promoteWatchedBuild?: boolean;
  buildParameters?: Record<string, string>;
}

/**
 * Dependency trigger specific properties
 */
export interface DependencyTriggerProperties {
  dependsOn: string | string[]; // Build configuration ID(s)
  afterSuccessfulBuildOnly?: boolean;
  branchFilter?: string;
  artifactRules?: string; // Artifact rules in TeamCity format
  artifactDependencies?: string[];
  dependOnStartedBuild?: boolean;
  promoteArtifacts?: boolean;
}

/**
 * Options for listing triggers
 */
export interface ListTriggersOptions {
  configId: string;
  fields?: string;
}

/**
 * Options for creating a trigger
 */
export interface CreateTriggerOptions {
  configId: string;
  type: TriggerType;
  enabled?: boolean;
  properties: VcsTriggerProperties | ScheduleTriggerProperties | DependencyTriggerProperties;
}

/**
 * Options for updating a trigger
 */
export interface UpdateTriggerOptions {
  configId: string;
  triggerId: string;
  enabled?: boolean;
  properties?: Partial<
    VcsTriggerProperties | ScheduleTriggerProperties | DependencyTriggerProperties
  >;
}

/**
 * Options for deleting a trigger
 */
export interface DeleteTriggerOptions {
  configId: string;
  triggerId: string;
}

/**
 * Options for validating a trigger
 */
export interface ValidateTriggerOptions {
  type: TriggerType;
  properties: VcsTriggerProperties | ScheduleTriggerProperties | DependencyTriggerProperties;
}

/**
 * Result for list triggers operation
 */
export interface ListTriggersResult {
  success: boolean;
  triggers: BuildTrigger[];
  configId: string;
}

/**
 * Result for trigger operations
 */
export interface TriggerOperationResult {
  success: boolean;
  trigger?: BuildTrigger;
  message?: string;
}

/**
 * Result for trigger validation
 */
export interface ValidateTriggerResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Manages build triggers in TeamCity
 */
export class BuildTriggerManager {
  constructor(private readonly client: TeamCityClientAdapter) {}

  /**
   * List all triggers for a build configuration
   */
  async listTriggers(options: ListTriggersOptions): Promise<ListTriggersResult> {
    const { configId, fields } = options;

    try {
      debug('Listing triggers for build configuration', { configId });

      const response = await this.client.modules.buildTypes.getAllTriggers(configId, fields);

      const triggers = this.parseTriggerList(response.data as unknown as TeamCityTriggersResponse);

      return {
        success: true,
        triggers,
        configId,
      };
    } catch (err) {
      if (this.isNotFoundError(err)) {
        throw new BuildConfigurationNotFoundError(
          `Build configuration '${configId}' not found`,
          configId
        );
      }
      throw this.handleApiError(err, 'Failed to list triggers');
    }
  }

  /**
   * Create a new trigger
   */
  async createTrigger(options: CreateTriggerOptions): Promise<TriggerOperationResult> {
    const { configId, type, enabled = true, properties } = options;

    try {
      debug('Creating trigger', { configId, type });

      // Validate trigger before creation
      const validation = this.validateTrigger({ type, properties });
      if (!validation.valid) {
        throw new ValidationError(
          `Invalid trigger configuration: ${validation.errors.join(', ')}`,
          { errors: validation.errors }
        );
      }

      // Additional VCS root validation for VCS triggers
      if (type === 'vcsTrigger') {
        const vcsProps = properties as VcsTriggerProperties;
        if (vcsProps.vcsRootId) {
          await this.validateVcsRoot(configId, vcsProps.vcsRootId);
        }
      }

      // Check for circular dependencies if it's a dependency trigger
      if (type === 'buildDependencyTrigger') {
        const depProps = properties as DependencyTriggerProperties;
        const dependsOn = Array.isArray(depProps.dependsOn)
          ? depProps.dependsOn[0]
          : depProps.dependsOn;
        if (dependsOn) {
          await this.checkCircularDependency(configId, dependsOn);
        }
      }

      const triggerData = this.buildTriggerPayload(type, properties, !enabled);

      const response = await this.client.modules.buildTypes.addTriggerToBuildType(
        configId,
        undefined,
        triggerData
      );

      const trigger = this.parseTrigger(response.data as unknown as TeamCityTriggerResponse);

      return {
        success: true,
        trigger,
        message: `Trigger created successfully`,
      };
    } catch (err) {
      if (err instanceof ValidationError || err instanceof CircularDependencyError) {
        throw err;
      }
      if (this.isNotFoundError(err)) {
        throw new BuildConfigurationNotFoundError(
          `Build configuration '${configId}' not found`,
          configId
        );
      }
      throw this.handleApiError(err, 'Failed to create trigger');
    }
  }

  /**
   * Update an existing trigger
   */
  async updateTrigger(options: UpdateTriggerOptions): Promise<TriggerOperationResult> {
    const { configId, triggerId, enabled, properties } = options;

    try {
      debug('Updating trigger', { configId, triggerId });

      // Get existing trigger first
      const existingResponse = await this.client.modules.buildTypes.getTrigger(configId, triggerId);

      const existingTrigger = this.parseTrigger(
        existingResponse.data as unknown as TeamCityTriggerResponse
      );

      // Merge properties
      const mergedProperties = properties
        ? {
            ...existingTrigger.properties,
            ...this.propertiesToRecord(
              properties as
                | VcsTriggerProperties
                | ScheduleTriggerProperties
                | DependencyTriggerProperties
            ),
          }
        : existingTrigger.properties;

      const triggerData = this.buildTriggerPayload(
        existingTrigger.type,
        mergedProperties as
          | VcsTriggerProperties
          | ScheduleTriggerProperties
          | DependencyTriggerProperties,
        enabled !== undefined ? !enabled : !existingTrigger.enabled
      );

      const response = await this.client.modules.buildTypes.replaceTrigger(
        configId,
        triggerId,
        undefined,
        triggerData
      );

      const trigger = this.parseTrigger(response.data as unknown as TeamCityTriggerResponse);

      return {
        success: true,
        trigger,
        message: `Trigger updated successfully`,
      };
    } catch (err) {
      if (this.isNotFoundError(err)) {
        throw new TriggerNotFoundError(`Trigger '${triggerId}' not found`, triggerId);
      }
      throw this.handleApiError(err, 'Failed to update trigger');
    }
  }

  /**
   * Delete a trigger
   */
  async deleteTrigger(options: DeleteTriggerOptions): Promise<TriggerOperationResult> {
    const { configId, triggerId } = options;

    try {
      debug('Deleting trigger', { configId, triggerId });

      await this.client.modules.buildTypes.deleteTrigger(configId, triggerId);

      return {
        success: true,
        message: `Trigger deleted successfully`,
      };
    } catch (err) {
      if (this.isNotFoundError(err)) {
        throw new TriggerNotFoundError(`Trigger '${triggerId}' not found`, triggerId);
      }
      throw this.handleApiError(err, 'Failed to delete trigger');
    }
  }

  /**
   * Validate trigger configuration
   */
  validateTrigger(options: ValidateTriggerOptions): ValidateTriggerResult {
    const { type, properties } = options;
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (type) {
      case 'vcsTrigger': {
        const vcsProps = properties as VcsTriggerProperties;
        if (vcsProps.branchFilter && !this.isValidBranchFilter(vcsProps.branchFilter)) {
          errors.push('Invalid branch filter pattern');
        }
        if (vcsProps.quietPeriod !== undefined && vcsProps.quietPeriod < 0) {
          errors.push('Quiet period must be non-negative');
        }
        if (vcsProps.quietPeriodMode === 'USE_CUSTOM' && vcsProps.quietPeriod === undefined) {
          errors.push('Quiet period is required when using USE_CUSTOM mode');
        }
        if (vcsProps.triggerRules && !this.isValidPathFilterRules(vcsProps.triggerRules)) {
          errors.push('Invalid path filter rules syntax');
        }
        break;
      }

      case 'schedulingTrigger': {
        const scheduleProps = properties as ScheduleTriggerProperties;
        if (!this.isValidSchedule(scheduleProps.schedulingPolicy)) {
          errors.push('Invalid schedule format');
        }
        if (scheduleProps.timezone && !this.isValidTimezone(scheduleProps.timezone)) {
          warnings.push('Unrecognized timezone');
        }
        break;
      }

      case 'buildDependencyTrigger': {
        const depProps = properties as DependencyTriggerProperties;
        if (depProps.dependsOn == null) {
          errors.push('Dependency trigger requires dependsOn property');
        }
        if (depProps.artifactRules && !this.isValidArtifactRules(depProps.artifactRules)) {
          errors.push('Invalid artifact rule format');
        }
        if (depProps.branchFilter && !this.isValidBranchFilter(depProps.branchFilter)) {
          errors.push('Invalid branch filter pattern');
        }
        break;
      }

      default:
        errors.push(`Unknown trigger type: ${type as string}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Parse trigger list from API response
   */
  private parseTriggerList(data: TeamCityTriggersResponse): BuildTrigger[] {
    const triggers = normalizeTriggers(data);
    return triggers.map((t) => this.parseTrigger(t));
  }

  /**
   * Parse single trigger from API response
   */
  private parseTrigger(data: TeamCityTriggerResponse): BuildTrigger {
    const propsArray = normalizeProperties(data.properties);
    const properties = propertiesToRecord(propsArray);

    const trigger: BuildTrigger = {
      id: data.id ?? '',
      type: data.type as TriggerType,
      enabled: data.disabled !== true,
      properties,
    };

    // Parse dependency trigger specific properties
    if (data.type === 'buildDependencyTrigger') {
      const dependsOn = properties['dependsOn'];
      if (dependsOn) {
        // Check if it's a comma-separated list
        trigger.dependsOn = dependsOn.includes(',')
          ? dependsOn.split(',').map((s) => s.trim())
          : dependsOn;
      }

      if (properties['afterSuccessfulBuildOnly']) {
        trigger.afterSuccessfulBuildOnly = properties['afterSuccessfulBuildOnly'] === 'true';
      }

      const artifactRules = properties['artifactRules'];
      if (artifactRules) {
        trigger.artifactRules = artifactRules;
      }

      if (properties['dependOnStartedBuild']) {
        trigger.dependOnStartedBuild = properties['dependOnStartedBuild'] === 'true';
      }

      if (properties['promoteArtifacts']) {
        trigger.promoteArtifacts = properties['promoteArtifacts'] === 'true';
      }
    }

    return trigger;
  }

  /**
   * Build trigger payload for API
   */
  private buildTriggerPayload(
    type: TriggerType,
    properties: VcsTriggerProperties | ScheduleTriggerProperties | DependencyTriggerProperties,
    disabled: boolean
  ): {
    type: TriggerType;
    disabled: boolean;
    properties: { property: Array<{ name: string; value: string }> };
  } {
    const propertyArray = Object.entries(this.propertiesToRecord(properties)).map(
      ([name, value]) => ({ name, value })
    );

    return {
      type,
      disabled,
      properties: {
        property: propertyArray,
      },
    };
  }

  /**
   * Convert typed properties to record
   */
  private propertiesToRecord(
    properties:
      | VcsTriggerProperties
      | ScheduleTriggerProperties
      | DependencyTriggerProperties
      | Record<string, string | number | boolean | undefined | null | string[]>
  ): Record<string, string> {
    const record: Record<string, string> = {};

    Object.entries(properties).forEach(([key, value]) => {
      // Handle build parameters specially
      if (key === 'buildParameters' && typeof value === 'object' && value !== null) {
        // Convert buildParameters object to individual properties
        Object.entries(value as Record<string, unknown>).forEach(([paramKey, paramValue]) => {
          if (paramValue != null) {
            record[`buildParams.${paramKey}`] = String(paramValue);
          }
        });
      }
      // Handle array values (e.g., multiple dependsOn configurations)
      else if (Array.isArray(value)) {
        record[key] = value.join(',');
      } else if (value != null) {
        record[key] = String(value);
      }
    });

    return record;
  }

  /**
   * Validate VCS root exists and is attached to the build configuration
   */
  private async validateVcsRoot(configId: string, vcsRootId: string): Promise<void> {
    try {
      // Check if VCS root is attached to this build configuration
      const response = await this.client.modules.buildTypes.getAllVcsRootsOfBuildType(
        configId,
        'vcs-root(id)'
      );

      const rootEntries = normalizeVcsRootEntries(response.data as TeamCityVcsRootEntriesResponse);
      const hasVcsRoot = rootEntries.some((entry) => entry['vcs-root']?.id === vcsRootId);

      if (!hasVcsRoot) {
        throw new ValidationError(
          `VCS root '${vcsRootId}' is not attached to build configuration '${configId}'`,
          { vcsRootId, configId }
        );
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        throw err;
      }
      // If we can't validate, log a warning but proceed
      debug('Could not validate VCS root', { error: err });
    }
  }

  /**
   * Check for circular dependencies
   */
  private async checkCircularDependency(sourceConfig: string, targetConfig: string): Promise<void> {
    // Get triggers from target config
    try {
      const response = await this.client.modules.buildTypes.getAllTriggers(targetConfig);

      const triggers = this.parseTriggerList(response.data as unknown as TeamCityTriggersResponse);

      // Check if target already depends on source
      const hasCycle = triggers.some(
        (t) => t.type === 'buildDependencyTrigger' && t.properties['dependsOn'] === sourceConfig
      );

      if (hasCycle) {
        throw new CircularDependencyError(
          `Circular dependency detected between ${sourceConfig} and ${targetConfig}`,
          { source: sourceConfig, target: targetConfig }
        );
      }
    } catch (err) {
      if (err instanceof CircularDependencyError) {
        throw err;
      }
      // Ignore other errors - we'll let the creation proceed
      debug('Could not check for circular dependencies', { error: err });
    }
  }

  /**
   * Validate branch filter pattern
   */
  private isValidBranchFilter(filter: string): boolean {
    // Enhanced validation for branch filter patterns
    // Format: [+|-]:pattern with support for wildcards and refs
    const patterns = filter.trim().split(/\s+/);

    for (const pattern of patterns) {
      // Must start with + or -
      if (!/^[+-]:/.test(pattern)) {
        return false;
      }

      // Extract the actual pattern after the prefix
      const branchPattern = pattern.substring(2);

      // Pattern must not be empty
      if (!branchPattern || branchPattern.length === 0) {
        return false;
      }

      // Check for common invalid characters
      if (/[\s]/.test(branchPattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate artifact rules format
   */
  private isValidArtifactRules(rules: string): boolean {
    // Artifact rules format: source => target
    // Multiple rules separated by newlines
    const lines = rules.trim().split(/\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        continue;
      }

      // Check for valid pattern - must have path-like structure
      // or => separator for target mapping
      if (trimmedLine.includes('=>')) {
        const parts = trimmedLine.split('=>');
        if (parts.length !== 2) {
          return false;
        }

        const source = parts[0]?.trim();
        const target = parts[1]?.trim();

        // Both source and target must be non-empty if => is used
        if (source === undefined || source === '' || target === undefined || target === '') {
          return false;
        }

        // Source should look like a path pattern
        if (!this.isValidPathPattern(source)) {
          return false;
        }
      } else {
        // Single path pattern without target
        if (!this.isValidPathPattern(trimmedLine)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if a string looks like a valid path pattern
   */
  private isValidPathPattern(pattern: string): boolean {
    // Must contain at least one of: /, *, ., or be a simple filename
    // Cannot be just random text
    return /[/*.]|^[\w-]+\.\w+$/.test(pattern);
  }

  /**
   * Validate path filter rules syntax
   */
  private isValidPathFilterRules(rules: string): boolean {
    // Path filter rules use similar syntax to branch filters
    // Format: [+|-]:path/pattern on each line
    const lines = rules.trim().split(/\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (!trimmedLine) {
        continue;
      }

      // Must start with + or -
      if (!/^[+-]:/.test(trimmedLine)) {
        return false;
      }

      // Extract the path pattern
      const pathPattern = trimmedLine.substring(2);

      // Pattern must not be empty
      if (!pathPattern || pathPattern.length === 0) {
        return false;
      }

      // Check for invalid double colons
      if (pathPattern.includes('::')) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate schedule format
   */
  private isValidSchedule(schedule: string): boolean {
    // Check for TeamCity simple formats
    const simpleFormats = ['daily', 'weekly', 'nightly', 'hourly'];
    if (simpleFormats.includes(schedule.toLowerCase())) {
      return true;
    }

    // Enhanced cron validation (6 or 7 fields)
    const cronParts = schedule.trim().split(/\s+/);
    if (cronParts.length !== 6 && cronParts.length !== 7) {
      return false;
    }

    // Validate each cron field
    const [seconds, minutes, hours, dayOfMonth, month, dayOfWeek] = cronParts;

    // Validate seconds (0-59)
    if (seconds === undefined || !this.isValidCronField(seconds, 0, 59)) {
      return false;
    }

    // Validate minutes (0-59)
    if (minutes === undefined || !this.isValidCronField(minutes, 0, 59)) {
      return false;
    }

    // Validate hours (0-23)
    if (hours === undefined || !this.isValidCronField(hours, 0, 23)) {
      return false;
    }

    // Validate day of month (1-31)
    if (dayOfMonth === undefined || !this.isValidCronField(dayOfMonth, 1, 31, true)) {
      return false;
    }

    // Validate month (1-12)
    if (month === undefined || !this.isValidCronField(month, 1, 12, true)) {
      return false;
    }

    // Validate day of week (0-7, where 0 and 7 are Sunday)
    if (dayOfWeek === undefined || !this.isValidCronField(dayOfWeek, 0, 7, true)) {
      return false;
    }

    return true;
  }

  /**
   * Validate individual cron field
   */
  private isValidCronField(
    field: string,
    min: number,
    max: number,
    allowWildcard = false
  ): boolean {
    // Handle wildcards
    if (field === '*') {
      return true; // Wildcard is always allowed
    }
    if (field === '?') {
      return allowWildcard; // Question mark only for day fields
    }

    // Handle ranges (e.g., 1-5)
    if (field.includes('-')) {
      const parts = field.split('-');
      if (parts.length !== 2) {
        return false;
      }
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      if (isNaN(start) || isNaN(end)) {
        return false;
      }
      return start >= min && start <= max && end >= min && end <= max && start <= end;
    }

    // Handle steps (e.g., */5)
    if (field.includes('/')) {
      const parts = field.split('/');
      if (parts.length !== 2) {
        return false;
      }
      const range = parts[0];
      const step = parts[1];
      if (range === undefined || step === undefined) {
        return false;
      }
      const stepNum = Number(step);
      if (isNaN(stepNum) || stepNum <= 0) {
        return false;
      }
      if (range === '*') {
        return true;
      }
      return this.isValidCronField(range, min, max, allowWildcard);
    }

    // Handle lists (e.g., 1,3,5)
    if (field.includes(',')) {
      const values = field.split(',');
      return values.every((v) => this.isValidCronField(v, min, max, allowWildcard));
    }

    // Handle single number
    const num = Number(field);
    if (isNaN(num)) {
      return false;
    }
    return num >= min && num <= max;
  }

  /**
   * Validate timezone
   */
  private isValidTimezone(timezone: string): boolean {
    // Common timezone patterns
    const commonTimezones = [
      'UTC',
      'GMT',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Australia/Sydney',
    ];

    // Check if it's a common timezone
    if (commonTimezones.includes(timezone)) {
      return true;
    }

    // Check for valid timezone format (Continent/City or abbreviation)
    return /^([A-Z]{2,4}|[A-Za-z]+\/[A-Za-z_]+)$/.test(timezone);
  }

  /**
   * Calculate next run time for a schedule
   */
  public calculateNextRunTime(schedule: string, timezone?: string): Date {
    const now = new Date();

    // Handle TeamCity simple formats
    const simpleFormats: Record<string, () => Date> = {
      daily: () => {
        const next = new Date(now);
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        return next;
      },
      weekly: () => {
        const next = new Date(now);
        next.setDate(next.getDate() + 7);
        next.setHours(0, 0, 0, 0);
        return next;
      },
      nightly: () => {
        const next = new Date(now);
        if (next.getHours() >= 2) {
          next.setDate(next.getDate() + 1);
        }
        next.setHours(2, 0, 0, 0);
        return next;
      },
      hourly: () => {
        const next = new Date(now);
        next.setHours(next.getHours() + 1, 0, 0, 0);
        return next;
      },
    };

    const lowerSchedule = schedule.toLowerCase();
    const formatFunc = simpleFormats[lowerSchedule];
    if (formatFunc !== undefined) {
      return formatFunc();
    }

    // Parse cron expression for next run time
    return this.calculateNextCronRun(schedule, now, timezone);
  }

  /**
   * Calculate next run time for cron expression
   */
  private calculateNextCronRun(cron: string, from: Date, _timezone?: string): Date {
    // Simple implementation - in production, use a library like node-cron
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 6) {
      return new Date(from.getTime() + 3600000); // Default to 1 hour
    }

    const [seconds, minutes, hours] = parts;
    const next = new Date(from);

    // Parse hours
    if (hours !== undefined && hours !== '*' && hours !== '?') {
      const hour = parseInt(hours, 10);
      if (!isNaN(hour)) {
        next.setHours(hour);
      }
    }

    // Parse minutes
    if (minutes !== undefined && minutes !== '*' && minutes !== '?') {
      const minute = parseInt(minutes, 10);
      if (!isNaN(minute)) {
        next.setMinutes(minute);
      }
    }

    // Parse seconds
    if (seconds !== undefined && seconds !== '*' && seconds !== '?') {
      const second = parseInt(seconds, 10);
      if (!isNaN(second)) {
        next.setSeconds(second);
      }
    }

    // If the calculated time is in the past, add one day
    if (next <= from) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Check if error is a 404
   */
  private isNotFoundError(err: unknown): boolean {
    return this.extractErrorResponse(err)?.status === 404;
  }

  /**
   * Validate dependency chain for circular dependencies
   * Check if adding sourceConfig -> targetConfig would create a cycle
   */
  async validateDependencyChain(
    sourceConfig: string,
    targetConfig: string,
    visited: Set<string> = new Set()
  ): Promise<{ hasCircularDependency: boolean; chain: string[] }> {
    // We're checking if targetConfig (or its dependencies) eventually depend on sourceConfig
    // which would create a cycle when sourceConfig depends on targetConfig

    // Start from the target and follow its dependencies
    const chain: string[] = [sourceConfig, targetConfig];

    // Helper function to check dependencies recursively
    const checkDependencies = async (
      configId: string,
      lookingFor: string,
      path: string[]
    ): Promise<{ found: boolean; fullPath: string[] }> => {
      // If we've already visited this node, skip it to avoid infinite loops
      if (visited.has(configId)) {
        return { found: false, fullPath: path };
      }

      visited.add(configId);

      try {
        const result = await this.listTriggers({ configId });
        const triggers = result.triggers;

        for (const trigger of triggers) {
          if (
            trigger.type === 'buildDependencyTrigger' &&
            trigger.dependsOn !== undefined &&
            trigger.dependsOn !== null
          ) {
            const dependencies = Array.isArray(trigger.dependsOn)
              ? trigger.dependsOn
              : [trigger.dependsOn];

            for (const dep of dependencies) {
              const newPath = [...path, dep];

              // Found a cycle!
              if (dep === lookingFor) {
                return { found: true, fullPath: newPath };
              }

              // Continue searching
              // Sequential DFS is intentional to avoid deep concurrent recursion
              // eslint-disable-next-line no-await-in-loop
              const result = await checkDependencies(dep, lookingFor, newPath);
              if (result.found) {
                return result;
              }
            }
          }
        }
      } catch (err) {
        debug(`Could not check dependencies for ${configId}`, { error: err });
      }

      return { found: false, fullPath: path };
    };

    // Check if targetConfig (or its dependencies) depends on sourceConfig
    const result = await checkDependencies(targetConfig, sourceConfig, chain);

    return {
      hasCircularDependency: result.found,
      chain: result.found ? result.fullPath : chain,
    };
  }

  /**
   * Handle API errors
   */
  private handleApiError(err: unknown, context: string): Error {
    const normalizedError = err instanceof Error ? err : new Error(String(err));
    logError(context, normalizedError);

    const response = this.extractErrorResponse(err);
    if (response != null) {
      const errorData = response.data as TeamCityErrorResponse | undefined;
      const status = response.status ?? 500;
      const message = errorData?.message ?? normalizedError.message ?? 'Request failed';
      return new TeamCityAPIError(`${context}: ${message}`, `HTTP_${status}`, status);
    }

    return normalizedError;
  }

  private extractErrorResponse(
    err: unknown
  ): { status?: number; data?: { message?: string } } | undefined {
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const response = (err as { response?: { status?: number; data?: { message?: string } } })
        .response;
      if (response != null) {
        return response;
      }
    }
    return undefined;
  }
}
