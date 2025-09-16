/**
 * Build Parameters Manager for TeamCity
 *
 * Handles parameter parsing, validation, merging, and branch resolution
 * for TeamCity build configurations.
 */
import type { Logger } from 'winston';

import type { ResolvedBuildConfiguration } from './build-configuration-resolver';
import type { TeamCityClientAdapter } from './client-adapter';

/**
 * Parameter types in TeamCity
 */
export enum ParameterType {
  ENVIRONMENT = 'env',
  SYSTEM = 'system',
  CONFIGURATION = 'config',
  BUILD = 'build',
}

/**
 * Parameter definition
 */
export interface ParameterDefinition {
  name: string;
  value: string;
  type: ParameterType;
  description?: string;
  required?: boolean;
  hidden?: boolean;
}

/**
 * Parameter value with metadata
 */
export interface ParameterValue {
  name: string;
  value: string;
  type: ParameterType;
  source?: 'user' | 'template' | 'config' | 'default';
  overridden?: boolean;
}

/**
 * Branch resolution options
 */
export interface BranchResolutionOptions {
  branchName?: string;
  vcsRootId?: string;
  tagName?: string;
  pullRequestNumber?: string;
  useDefault?: boolean;
  validateExists?: boolean;
  preferMergeRef?: boolean;
}

/**
 * Personal build options
 */
export interface PersonalBuildOptions {
  isPersonal: boolean;
  userId?: string;
  description?: string;
  patches?: Array<{
    file: string;
    content: string;
  }>;
}

/**
 * Parameter validation options
 */
export interface ValidationOptions {
  requiredParameters?: string[];
  parameterSchemas?: Record<string, ParameterSchema>;
  throwOnMissing?: boolean;
  throwOnInvalid?: boolean;
}

/**
 * Parameter schema for validation
 */
export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean';
  enum?: string[];
  pattern?: string;
  min?: number;
  max?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
}

/**
 * Parameter conflict
 */
export interface ParameterConflict {
  parameter: string;
  values: string[];
  sources: string[];
}

/**
 * Dependency validation result
 */
export interface DependencyValidation {
  satisfied: string[];
  missing: string[];
  disabled: string[];
}

/**
 * Custom error classes
 */
export class ParameterValidationError extends Error {
  constructor(
    message: string,
    public readonly parameter?: string
  ) {
    super(message);
    this.name = 'ParameterValidationError';
  }
}

export class RequiredParameterError extends Error {
  constructor(
    message: string,
    public readonly missingParameters: string[]
  ) {
    super(message);
    this.name = 'RequiredParameterError';
  }
}

export class ParameterConflictError extends Error {
  constructor(
    message: string,
    public readonly conflicts: ParameterConflict[]
  ) {
    super(message);
    this.name = 'ParameterConflictError';
  }
}

/**
 * Parameter set for managing collections of parameters
 */
export class ParameterSet {
  private _parameters: Map<string, ParameterValue>;
  public metadata?: Record<string, unknown>;

  constructor(parameters: ParameterValue[] = []) {
    this._parameters = new Map();
    for (const param of parameters) {
      this._parameters.set(param.name, param);
    }
  }

  get length(): number {
    return this._parameters.size;
  }

  get parameters(): ParameterValue[] {
    return Array.from(this._parameters.values());
  }

  getParameter(name: string): ParameterValue | undefined {
    return this._parameters.get(name);
  }

  setParameter(param: ParameterValue): void {
    this._parameters.set(param.name, param);
  }

  hasParameter(name: string): boolean {
    return this._parameters.has(name);
  }

  removeParameter(name: string): boolean {
    return this._parameters.delete(name);
  }

  merge(other: ParameterSet, overwrite = true): void {
    for (const param of other.parameters) {
      if (overwrite || !this.hasParameter(param.name)) {
        this.setParameter(param);
      }
    }
  }

  toArray(): ParameterValue[] {
    return Array.from(this._parameters.values());
  }

  toObject(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [name, param] of this._parameters) {
      obj[name] = param.value;
    }
    return obj;
  }
}

/**
 * Main manager class
 */
export class BuildParametersManager {
  private client: TeamCityClientAdapter;
  private logger: Logger;

  constructor(config: { client: TeamCityClientAdapter; logger: Logger }) {
    this.client = config.client;
    this.logger = config.logger;
  }

  /**
   * Parse parameters from various input formats
   */
  parseParameters(input: Record<string, string>): ParameterValue[] {
    const parameters: ParameterValue[] = [];

    for (const [name, value] of Object.entries(input)) {
      if (!this.isValidParameterName(name)) {
        throw new ParameterValidationError(`Invalid parameter name: ${name}`, name);
      }

      parameters.push({
        name,
        value,
        type: this.detectParameterType(name),
        source: 'user',
      });
    }

    return parameters;
  }

  /**
   * Parse parameters from CLI arguments
   */
  parseFromCLI(args: string[]): ParameterValue[] {
    const parameters: ParameterValue[] = [];

    for (const arg of args) {
      if (arg.startsWith('-P')) {
        const paramStr = arg.substring(2);
        const [name, ...valueParts] = paramStr.split('=');
        const value = valueParts.join('=');

        if (name && name.length > 0 && value !== undefined) {
          parameters.push({
            name,
            value,
            type: this.detectParameterType(name),
            source: 'user',
          });
        }
      }
    }

    return parameters;
  }

  /**
   * Validate parameters against build configuration
   */
  validateParameters(
    parameters: ParameterValue[],
    _buildConfig: ResolvedBuildConfiguration,
    options: ValidationOptions = {}
  ): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      missingRequired: [],
    };

    // Check required parameters
    if (options.requiredParameters) {
      const providedNames = new Set(parameters.map((p) => p.name));
      for (const required of options.requiredParameters) {
        if (!providedNames.has(required)) {
          result.missingRequired.push(required);
          result.errors.push(`Required parameter missing: ${required}`);
          result.valid = false;
        }
      }
    }

    // Validate parameter schemas
    if (options.parameterSchemas) {
      for (const param of parameters) {
        const schema = options.parameterSchemas[param.name];
        if (schema) {
          const validation = this.validateParameterValue(param, schema);
          if (validation.error) {
            result.warnings.push(validation.error);
          }
        }
      }
    }

    return result;
  }

  /**
   * Validate required parameters
   */
  validateRequiredParameters(
    parameters: ParameterValue[],
    required: string[],
    options: { throwOnMissing?: boolean } = {}
  ): string[] {
    const providedNames = new Set(parameters.map((p) => p.name));
    const missing = required.filter((r) => !providedNames.has(r));

    if (missing.length > 0 && options.throwOnMissing === true) {
      throw new RequiredParameterError(
        `Missing required parameters: ${missing.join(', ')}`,
        missing
      );
    }

    return missing;
  }

  /**
   * Merge parameters with build configuration defaults
   */
  mergeParameters(
    userParameters: ParameterValue[],
    buildConfig: ResolvedBuildConfiguration
  ): ParameterSet {
    const paramSet = new ParameterSet();

    // Add build configuration defaults
    if (buildConfig.parameters) {
      for (const [name, value] of Object.entries(buildConfig.parameters)) {
        paramSet.setParameter({
          name,
          value,
          type: this.detectParameterType(name),
          source: 'config',
        });
      }
    }

    // Override with user parameters
    for (const param of userParameters) {
      const existing = paramSet.getParameter(param.name);
      paramSet.setParameter({
        ...param,
        overridden: Boolean(existing),
      });
    }

    return paramSet;
  }

  /**
   * Merge parameters with precedence
   */
  mergeParametersWithPrecedence(
    userParams: ParameterValue[],
    templateParams: ParameterValue[],
    buildConfig: ResolvedBuildConfiguration
  ): ParameterSet {
    const paramSet = new ParameterSet();

    // Lowest precedence: build config
    if (buildConfig.parameters) {
      for (const [name, value] of Object.entries(buildConfig.parameters)) {
        paramSet.setParameter({
          name,
          value,
          type: this.detectParameterType(name),
          source: 'config',
        });
      }
    }

    // Medium precedence: template
    for (const param of templateParams) {
      paramSet.setParameter({
        ...param,
        source: 'template',
      });
    }

    // Highest precedence: user
    for (const param of userParams) {
      paramSet.setParameter({
        ...param,
        source: 'user',
      });
    }

    return paramSet;
  }

  /**
   * Detect parameter conflicts
   */
  detectConflicts(params1: ParameterValue[], params2: ParameterValue[]): ParameterConflict[] {
    const conflicts: ParameterConflict[] = [];
    const map1 = new Map(params1.map((p) => [p.name, p.value]));

    for (const param of params2) {
      const value1 = map1.get(param.name);
      if (value1 !== undefined && value1 !== param.value) {
        conflicts.push({
          parameter: param.name,
          values: [value1, param.value],
          sources: ['params1', 'params2'],
        });
      }
    }

    return conflicts;
  }

  /**
   * Resolve parameter conflicts
   */
  resolveConflicts(
    params1: ParameterValue[],
    params2: ParameterValue[],
    options: { throwOnConflict?: boolean } = {}
  ): ParameterValue[] {
    const conflicts = this.detectConflicts(params1, params2);

    if (conflicts.length > 0 && options.throwOnConflict === true) {
      throw new ParameterConflictError(
        `Parameter conflicts detected: ${conflicts.map((c) => c.parameter).join(', ')}`,
        conflicts
      );
    }

    // Default resolution: params2 wins
    const result = new Map<string, ParameterValue>();

    for (const param of params1) {
      result.set(param.name, param);
    }

    for (const param of params2) {
      result.set(param.name, param);
    }

    return Array.from(result.values());
  }

  /**
   * Resolve parameter references (e.g., %param.name%)
   */
  resolveReferences(parameters: ParameterValue[]): ParameterSet {
    const paramSet = new ParameterSet(parameters);
    const resolved = new Set<string>();
    const resolving = new Set<string>();

    const resolveParam = (name: string, value: string): string => {
      if (resolving.has(name)) {
        throw new Error(`Circular reference detected: ${name}`);
      }

      resolving.add(name);

      // Replace all references
      let resolvedValue = value;
      const refPattern = /%([^%]+)%/g;
      let match;

      while ((match = refPattern.exec(value)) !== null) {
        const refName = match[1];
        if (!refName) {
          continue;
        }

        const refParam = paramSet.getParameter(refName);

        if (refParam) {
          if (!resolved.has(refName)) {
            const refValue = resolveParam(refName, refParam.value);
            paramSet.setParameter({ ...refParam, value: refValue });
            resolved.add(refName);
          }
          resolvedValue = resolvedValue.replace(match[0], refParam.value);
        }
      }

      resolving.delete(name);
      return resolvedValue;
    };

    // Resolve all parameters
    for (const param of paramSet.parameters) {
      if (!resolved.has(param.name)) {
        const resolvedValue = resolveParam(param.name, param.value);
        paramSet.setParameter({ ...param, value: resolvedValue });
        resolved.add(param.name);
      }
    }

    return paramSet;
  }

  /**
   * Resolve branch name
   */
  resolveBranch(options: BranchResolutionOptions): string {
    if (!options.vcsRootId || options.vcsRootId.length === 0) {
      // Return as-is if no VCS root specified
      if (options.branchName && options.branchName.length > 0) {
        return options.branchName;
      }
      if (options.tagName && options.tagName.length > 0) {
        return `refs/tags/${options.tagName}`;
      }
      if (options.pullRequestNumber && options.pullRequestNumber.length > 0) {
        return options.preferMergeRef === true
          ? `refs/pull/${options.pullRequestNumber}/merge`
          : `refs/pull/${options.pullRequestNumber}/head`;
      }
      return 'refs/heads/main'; // Default
    }

    // Fetch branches from VCS root
    try {
      // Note: Using mock response until full VCS root API is implemented
      const response = { data: { branch: [] as unknown[] } };
      const branches: unknown[] = response.data.branch ?? [];

      this.logger?.debug(`Fetching branches for VCS root: ${options.vcsRootId}`);

      return this.resolveBranchFromList(options, branches);
    } catch (error) {
      this.logger?.error(`Failed to fetch branches for VCS root ${options.vcsRootId}:`, error);
      throw error;
    }
  }

  /**
   * Resolve branch from list of available branches
   */
  private resolveBranchFromList(options: BranchResolutionOptions, branches: unknown[]): string {
    // Type guard for branch objects
    const isBranchObject = (b: unknown): b is { name: string; default?: boolean } => {
      return (
        typeof b === 'object' &&
        b !== null &&
        'name' in b &&
        typeof (b as { name: unknown }).name === 'string'
      );
    };

    // Find default branch
    if (options.useDefault === true) {
      const defaultBranch = branches.find(
        (b): b is { name: string; default: boolean } =>
          isBranchObject(b) && (b as { default?: boolean }).default === true
      );
      if (defaultBranch) {
        return defaultBranch.name;
      }
    }

    // Find specific branch
    if (options.branchName && options.branchName.length > 0) {
      const fullName = `refs/heads/${options.branchName}`;
      const branch = branches.find(
        (b): b is { name: string } =>
          isBranchObject(b) &&
          (b.name === options.branchName ||
            b.name === fullName ||
            b.name.endsWith(`/${options.branchName}`))
      );

      if (branch) {
        return branch.name;
      }

      if (options.validateExists === true) {
        throw new Error(`Branch not found: ${options.branchName}`);
      }

      return fullName;
    }

    // Handle tags
    if (options.tagName && options.tagName.length > 0) {
      const fullName = `refs/tags/${options.tagName}`;
      const tag = branches.find(
        (b): b is { name: string } => isBranchObject(b) && b.name === fullName
      );

      if (tag) {
        return tag.name;
      }

      if (options.validateExists === true) {
        throw new Error(`Tag not found: ${options.tagName}`);
      }

      return fullName;
    }

    // Handle pull requests
    if (options.pullRequestNumber && options.pullRequestNumber.length > 0) {
      const prRef =
        options.preferMergeRef === true
          ? `refs/pull/${options.pullRequestNumber}/merge`
          : `refs/pull/${options.pullRequestNumber}/head`;

      const pr = branches.find((b): b is { name: string } => isBranchObject(b) && b.name === prRef);
      if (pr) {
        return pr.name;
      }

      return prRef;
    }

    // Default to main/master
    const defaultBranch = branches.find(
      (b): b is { name: string; default: boolean } =>
        isBranchObject(b) && (b as { default?: boolean }).default === true
    );
    return defaultBranch?.name ?? 'refs/heads/main';
  }

  /**
   * Configure parameters for personal build
   */
  configurePersonalBuild(
    parameters: ParameterValue[],
    buildConfig: ResolvedBuildConfiguration,
    options: PersonalBuildOptions
  ): ParameterSet {
    if (options.isPersonal && !buildConfig.allowPersonalBuilds) {
      throw new Error('Personal builds are not allowed for this configuration');
    }

    const paramSet = new ParameterSet(parameters);

    if (options.isPersonal) {
      // Add personal build parameters
      paramSet.setParameter({
        name: 'teamcity.build.personal',
        value: 'true',
        type: ParameterType.SYSTEM,
        source: 'user',
      });

      if (options.userId) {
        paramSet.setParameter({
          name: 'teamcity.build.triggeredBy',
          value: options.userId,
          type: ParameterType.SYSTEM,
          source: 'user',
        });
      }

      // Add metadata
      paramSet.metadata = {
        ...paramSet.metadata,
        isPersonal: true,
        description: options.description,
        patches: options.patches,
      };
    }

    return paramSet;
  }

  /**
   * Validate parameter dependencies
   */
  validateDependencies(
    parameters: ParameterValue[],
    dependencies: Record<string, { requires: string; value: string; default?: string }>
  ): DependencyValidation {
    const paramMap = new Map(parameters.map((p) => [p.name, p.value]));
    const result: DependencyValidation = {
      satisfied: [],
      missing: [],
      disabled: [],
    };

    for (const [depName, dep] of Object.entries(dependencies)) {
      const requiredValue = paramMap.get(dep.requires);

      if (requiredValue === dep.value) {
        if (paramMap.has(depName)) {
          result.satisfied.push(depName);
        } else {
          result.missing.push(depName);
        }
      } else {
        result.disabled.push(depName);
      }
    }

    return result;
  }

  /**
   * Add dependent parameters
   */
  addDependentParameters(
    parameters: ParameterValue[],
    dependencies: Record<string, { requires: string; value: string; default?: string }>
  ): ParameterSet {
    const paramSet = new ParameterSet(parameters);
    const validation = this.validateDependencies(parameters, dependencies);

    for (const missing of validation.missing) {
      const dep = dependencies[missing];
      if (dep?.default) {
        paramSet.setParameter({
          name: missing,
          value: dep?.default ?? '',
          type: this.detectParameterType(missing),
          source: 'default',
        });
      }
    }

    return paramSet;
  }

  /**
   * Serialize parameters for TeamCity API
   */
  serializeForAPI(paramSet: ParameterSet): { property: Array<{ name: string; value: string }> } {
    return {
      property: paramSet.parameters.map((p) => ({
        name: p.name,
        value: p.value,
      })),
    };
  }

  /**
   * Serialize parameters to CLI format
   */
  serializeToCLI(paramSet: ParameterSet): string[] {
    return paramSet.parameters.map((p) => `-P${p.name}=${p.value}`);
  }

  /**
   * Export parameters to environment variables
   */
  exportToEnvironment(paramSet: ParameterSet): Record<string, string> {
    const env: Record<string, string> = {};

    for (const param of paramSet.parameters) {
      // Convert parameter name to env var name
      let envName = param.name;

      // Remove common prefixes
      if (envName.startsWith('env.')) {
        envName = envName.substring(4);
      } else if (envName.startsWith('system.')) {
        envName = `SYSTEM_${envName.substring(7)}`;
      } else if (envName.startsWith('build.')) {
        envName = `BUILD_${envName.substring(6)}`;
      }

      // Convert to uppercase and replace dots with underscores
      envName = envName.toUpperCase().replace(/\./g, '_');

      env[envName] = param.value;
    }

    return env;
  }

  /**
   * Detect parameter type from name
   */
  private detectParameterType(name: string): ParameterType {
    if (name.startsWith('env.')) {
      return ParameterType.ENVIRONMENT;
    }
    if (name.startsWith('system.')) {
      return ParameterType.SYSTEM;
    }
    if (name.startsWith('teamcity.')) {
      return ParameterType.SYSTEM;
    }
    if (name.startsWith('build.')) {
      return ParameterType.BUILD;
    }
    return ParameterType.CONFIGURATION;
  }

  /**
   * Validate parameter name
   */
  private isValidParameterName(name: string): boolean {
    if (!name || name.trim() === '') {
      return false;
    }

    // Check for invalid characters
    const invalidChars = /[\s<>"|\\]/;
    if (invalidChars.test(name)) {
      return false;
    }

    // Check for valid format (alphanumeric, dots, underscores, hyphens)
    const validFormat = /^[a-zA-Z0-9._-]+$/;
    return validFormat.test(name);
  }

  /**
   * Validate parameter value against schema
   */
  private validateParameterValue(
    param: ParameterValue,
    schema: ParameterSchema
  ): { valid: boolean; error?: string } {
    const { name, value } = param;

    switch (schema.type) {
      case 'number': {
        const num = Number(value);
        if (isNaN(num)) {
          return { valid: false, error: `Parameter '${name}' should be a number` };
        }
        if (schema.min !== undefined && num < schema.min) {
          return { valid: false, error: `Parameter '${name}' should be >= ${schema.min}` };
        }
        if (schema.max !== undefined && num > schema.max) {
          return { valid: false, error: `Parameter '${name}' should be <= ${schema.max}` };
        }
        break;
      }

      case 'boolean':
        if (value !== 'true' && value !== 'false') {
          return { valid: false, error: `Parameter '${name}' should be 'true' or 'false'` };
        }
        break;

      case 'string':
        if (schema.enum && !schema.enum.includes(value)) {
          return {
            valid: false,
            error: `Parameter '${name}' should be one of: ${schema.enum.join(', ')} (got '${value}')`,
          };
        }
        if (schema.pattern) {
          const regex = new RegExp(schema.pattern);
          if (!regex.test(value)) {
            return {
              valid: false,
              error: `Parameter '${name}' does not match pattern: ${schema.pattern}`,
            };
          }
        }
        break;
    }

    return { valid: true };
  }
}
