/**
 * Build Configuration Resolver for TeamCity
 *
 * Provides intelligent resolution of TeamCity build configurations from various
 * context clues including IDs, names, commits, PRs, and issue keys.
 */
import type { Logger } from 'winston';

import type { BuildType } from '@/teamcity-client';

import type { TeamCityClientAdapter } from './client-adapter';

/**
 * Resolved build configuration with normalized data
 */
export interface ResolvedBuildConfiguration {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  webUrl?: string;
  description?: string;
  paused: boolean;
  templateFlag: boolean;
  allowPersonalBuilds: boolean;
  vcsRootIds?: string[];
  parameters?: Record<string, string>;
}

/**
 * Resolution context for finding build configurations
 */
export interface ResolutionContext {
  commitHash?: string;
  pullRequestNumber?: string;
  issueKey?: string;
  branch?: string;
  projectHint?: string;
  additionalContext?: string;
}

/**
 * Options for name-based resolution
 */
export interface NameResolutionOptions {
  projectName: string;
  buildTypeName: string;
  additionalContext?: string;
}

/**
 * Fuzzy match result
 */
export interface BuildConfigurationMatch {
  configuration: ResolvedBuildConfiguration;
  score: number;
  matchedOn: string[];
}

/**
 * Resolver configuration options
 */
export interface ResolverOptions {
  fuzzyMatchThreshold?: number;
  maxCacheSize?: number;
  cacheEnabled?: boolean;
}

/**
 * Batch resolution request
 */
export interface BatchResolutionRequest {
  type: 'id' | 'name' | 'context';
  value: string | NameResolutionOptions | ResolutionContext;
}

/**
 * Custom error classes
 */
export class BuildConfigurationNotFoundError extends Error {
  constructor(
    message: string,
    public readonly searchCriteria?: unknown
  ) {
    super(message);
    this.name = 'BuildConfigurationNotFoundError';
  }
}

export class AmbiguousBuildConfigurationError extends Error {
  constructor(
    message: string,
    public readonly candidates: ResolvedBuildConfiguration[],
    public readonly suggestions: string[]
  ) {
    super(message);
    this.name = 'AmbiguousBuildConfigurationError';
  }
}

export class BuildConfigurationPermissionError extends Error {
  constructor(
    message: string,
    public readonly configurationId?: string
  ) {
    super(message);
    this.name = 'BuildConfigurationPermissionError';
  }
}

/**
 * Cache implementation for build configurations
 */
export class BuildConfigurationCache {
  private cache: Map<string, { data: ResolvedBuildConfiguration; timestamp: number }>;
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(options: { ttl?: number; maxSize?: number } = {}) {
    this.cache = new Map();
    this.ttl = options.ttl ?? 300000; // 5 minutes default
    this.maxSize = options.maxSize ?? 1000;
  }

  get(key: string): ResolvedBuildConfiguration | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  set(key: string, data: ResolvedBuildConfiguration): void {
    // Implement LRU eviction if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }
}

/**
 * Main resolver class
 */
export class BuildConfigurationResolver {
  private client: TeamCityClientAdapter;
  private logger: Logger;
  private cache: BuildConfigurationCache;
  private fuzzyMatchThreshold: number;

  constructor(config: {
    client: TeamCityClientAdapter;
    logger: Logger;
    cache?: BuildConfigurationCache;
    options?: ResolverOptions;
  }) {
    this.client = config.client;
    this.logger = config.logger;
    this.cache = config.cache ?? new BuildConfigurationCache();
    this.fuzzyMatchThreshold = config.options?.fuzzyMatchThreshold ?? 0.7;
  }

  /**
   * Resolve build configuration by exact ID
   */
  async resolveByConfigurationId(
    configurationId: string,
    _options?: { checkPermissions?: boolean }
  ): Promise<ResolvedBuildConfiguration> {
    // Check cache first
    const cacheKey = `id:${configurationId}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`Build configuration ${configurationId} resolved from cache`);
      return cached;
    }

    try {
      const response = await this.client.buildTypes.getBuildType(
        configurationId,
        'id,name,projectId,projectName,webUrl,description,paused,templateFlag,settings,parameters,vcs-root-entries'
      );
      const buildType = (response.data ?? null) as Partial<BuildType> | null;
      if (!buildType) {
        throw new BuildConfigurationNotFoundError(
          `Build configuration with ID '${configurationId}' not found`
        );
      }

      const resolved = this.normalizeBuildType(buildType);
      this.cache.set(cacheKey, resolved);

      return resolved;
    } catch (error) {
      const err = error as { response?: { status?: number } };
      if (err.response?.status === 404) {
        throw new BuildConfigurationNotFoundError(
          `Build configuration with ID '${configurationId}' not found`
        );
      }
      if (err.response?.status === 403) {
        throw new BuildConfigurationPermissionError(
          `Access denied to build configuration '${configurationId}'`,
          configurationId
        );
      }
      const errorWithMessage = error as { message?: string };
      if (errorWithMessage.message?.includes('ECONNREFUSED') === true) {
        throw new Error('Failed to connect to TeamCity server');
      }
      throw error;
    }
  }

  /**
   * Resolve by project and build type names
   */
  async resolveByName(options: NameResolutionOptions): Promise<ResolvedBuildConfiguration> {
    const cacheKey = `name:${options.projectName}:${options.buildTypeName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch all build types (with caching)
    const allBuildTypes = await this.getAllBuildTypes();

    // Score all build types
    const scoredCandidates = allBuildTypes
      .map((bt) => {
        const projectScore = this.fuzzyMatch(options.projectName, bt.projectName ?? '');
        const projectIdScore = this.fuzzyMatch(options.projectName, bt.projectId ?? '');
        const nameScore = this.fuzzyMatch(options.buildTypeName, bt.name ?? '');

        // Use the best project match (projectName or projectId)
        const bestProjectScore = Math.max(projectScore, projectIdScore);

        // Both project and name must have some match
        if (bestProjectScore < 0.1 || nameScore < 0.1) {
          return null;
        }

        // Calculate combined score, heavily weighting exact matches
        let totalScore = bestProjectScore * nameScore;

        // Boost for exact matches
        if (projectScore === 1.0 && nameScore === 1.0) {
          totalScore = 2.0; // Highest priority
        } else if (projectScore === 1.0 || nameScore === 1.0) {
          totalScore = 1.5 + totalScore * 0.5; // High priority
        }

        return {
          buildType: bt,
          score: totalScore,
          projectScore: bestProjectScore,
          nameScore,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) {
      throw new BuildConfigurationNotFoundError(
        `No build configuration found matching project '${options.projectName}' and build type '${options.buildTypeName}'`,
        options
      );
    }

    // If the top candidate has a significantly higher score, use it
    const topCandidate = scoredCandidates[0];
    if (
      scoredCandidates.length === 1 ||
      (topCandidate && topCandidate.score > (scoredCandidates[1]?.score ?? -Infinity) * 1.5)
    ) {
      if (!topCandidate) {
        throw new Error('Unexpected empty candidate list');
      }
      const resolved = this.normalizeBuildType(topCandidate.buildType);
      this.cache.set(cacheKey, resolved);
      return resolved;
    }

    // Multiple close matches - try to resolve with additional context
    const topCandidates = scoredCandidates.slice(0, 3); // Top 3 candidates

    if (options.additionalContext) {
      const ctx = options.additionalContext.toLowerCase();
      const contextFiltered = topCandidates.filter(
        (candidate) =>
          (candidate.buildType.description ?? '').toLowerCase().includes(ctx) ||
          (candidate.buildType.name ?? '').toLowerCase().includes(ctx)
      );

      if (contextFiltered.length === 1) {
        const only = contextFiltered[0];
        if (!only) {
          throw new Error('Unexpected empty filtered candidate');
        }
        const resolved = this.normalizeBuildType(only.buildType);
        this.cache.set(cacheKey, resolved);
        return resolved;
      }
    }

    // Still ambiguous
    const normalizedCandidates = topCandidates.map((c) => this.normalizeBuildType(c.buildType));
    throw new AmbiguousBuildConfigurationError(
      `Multiple build configurations match. Please be more specific.`,
      normalizedCandidates,
      normalizedCandidates.map((c) => c.id)
    );
  }

  /**
   * Resolve from various context clues
   */
  async resolveFromContext(context: ResolutionContext): Promise<ResolvedBuildConfiguration> {
    const allBuildTypes = await this.getAllBuildTypes();
    let candidates = [...allBuildTypes];

    // Filter by project hint
    if (context.projectHint) {
      const hintLower = context.projectHint.toLowerCase();
      candidates = candidates.filter((bt) => {
        const nameLower = (bt.projectName ?? '').toLowerCase();
        const idLower = (bt.projectId ?? '').toLowerCase();
        return nameLower.includes(hintLower) ? true : idLower.includes(hintLower);
      });
    }

    // Filter by pull request support
    if (context.pullRequestNumber) {
      const prCandidates = candidates.filter((bt) => {
        const params = bt.parameters?.property ?? [];
        return params.some((p) => Boolean(p.name?.toLowerCase().match(/pull_request|\bpr\b/)));
      });
      if (prCandidates.length > 0) {
        candidates = prCandidates;
      }
    }

    // Filter by issue key prefix
    if (context.issueKey) {
      const prefix = context.issueKey.split('-')[0]?.toLowerCase() ?? '';
      const issueCandidates = candidates.filter(
        (bt) =>
          (bt.projectName ?? '').toLowerCase().includes(prefix) ||
          (bt.projectId ?? '').toLowerCase().includes(prefix) ||
          (bt.name ?? '').toLowerCase().includes(prefix)
      );
      if (issueCandidates.length > 0) {
        candidates = issueCandidates;
      }
    }

    // Filter by branch name patterns
    if (context.branch) {
      const branchLower = context.branch.toLowerCase();
      const branchCandidates = candidates.filter((bt) => {
        const nameLower = (bt.name ?? '').toLowerCase();
        const projectLower = (bt.projectName ?? '').toLowerCase();

        // Check for platform-specific builds (ios, android, etc.)
        if (
          branchLower.includes('ios') &&
          (nameLower.includes('ios') || projectLower.includes('ios'))
        ) {
          return true;
        }
        if (
          branchLower.includes('android') &&
          (nameLower.includes('android') || projectLower.includes('android'))
        ) {
          return true;
        }
        if (
          branchLower.includes('web') &&
          (nameLower.includes('web') || projectLower.includes('web'))
        ) {
          return true;
        }

        return false;
      });

      if (branchCandidates.length > 0) {
        candidates = branchCandidates;
      }
    }

    if (candidates.length === 0) {
      throw new BuildConfigurationNotFoundError(
        'No build configuration found matching the provided context',
        context
      );
    }

    if (candidates.length === 1) {
      const first = candidates[0];
      return this.normalizeBuildType(first as BuildType);
    }

    // If still multiple, prefer the "main" or "default" build
    const defaultCandidates = candidates.filter(
      (bt) =>
        (bt.name ?? '').toLowerCase().includes('main') ||
        (bt.name ?? '').toLowerCase().includes('default') ||
        (bt.name ?? '').toLowerCase().includes('build')
    );

    if (defaultCandidates.length === 1) {
      const firstDefault = defaultCandidates[0];
      return this.normalizeBuildType(firstDefault as BuildType);
    }

    // Return the first one with a warning
    this.logger.warn(`Multiple build configurations match context, returning first match`, {
      context,
      candidates: candidates.map((c) => c.id),
    });

    return this.normalizeBuildType(candidates[0] as BuildType);
  }

  /**
   * Find configurations using fuzzy string matching
   */
  async findFuzzyMatches(query: string): Promise<BuildConfigurationMatch[]> {
    const allBuildTypes = await this.getAllBuildTypes();
    const matches: BuildConfigurationMatch[] = [];

    for (const buildType of allBuildTypes) {
      const matchedOn: string[] = [];
      let totalScore = 0;
      let matchCount = 0;

      // Match against name
      const nameScore = this.fuzzyMatch(query, buildType.name ?? '');
      if (nameScore > this.fuzzyMatchThreshold) {
        matchedOn.push('name');
        totalScore += nameScore * 2; // Weight name matches higher
        matchCount++;
      }

      // Match against project name
      const projectScore = this.fuzzyMatch(query, buildType.projectName ?? '');
      if (projectScore > this.fuzzyMatchThreshold) {
        matchedOn.push('projectName');
        totalScore += projectScore;
        matchCount++;
      }

      // Match against description
      const descScore = this.fuzzyMatch(query, buildType.description ?? '');
      if (descScore > this.fuzzyMatchThreshold) {
        matchedOn.push('description');
        totalScore += descScore * 0.5; // Weight description lower
        matchCount++;
      }

      if (matchCount > 0) {
        matches.push({
          configuration: this.normalizeBuildType(buildType),
          score: totalScore / (matchCount + 1), // Average score
          matchedOn,
        });
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  /**
   * Resolve multiple configurations in batch
   */
  async resolveBatch(
    requests: BatchResolutionRequest[],
    options?: { allowPartialFailure?: boolean }
  ): Promise<ResolvedBuildConfiguration[]> {
    const promises = requests.map(async (request) => {
      try {
        let result: ResolvedBuildConfiguration;

        switch (request.type) {
          case 'id':
            result = await this.resolveByConfigurationId(request.value as string);
            break;
          case 'name':
            result = await this.resolveByName(request.value as NameResolutionOptions);
            break;
          case 'context':
            result = await this.resolveFromContext(request.value as ResolutionContext);
            break;
          default:
            throw new Error(`Unknown resolution type: ${request.type}`);
        }

        return result;
      } catch (error) {
        if (options?.allowPartialFailure) {
          this.logger.warn(`Failed to resolve build configuration`, { request, error });
          return null;
        }
        throw error;
      }
    });

    const resolvedResults = await Promise.all(promises);

    return resolvedResults.filter((r): r is ResolvedBuildConfiguration => r !== null);
  }

  /**
   * Main resolve method that intelligently determines the resolution strategy
   */
  async resolve(input: string): Promise<ResolvedBuildConfiguration> {
    // Try as exact ID first
    if (input.match(/^[A-Za-z0-9_]+$/)) {
      try {
        return await this.resolveByConfigurationId(input);
      } catch (error) {
        // Not an ID, try other strategies
      }
    }

    // Try as a context (commit SHA, PR#, issue key)
    const isSha = /^[a-f0-9]{7,40}$/.test(input);
    const isPR = /^PR#\d+$/.test(input);
    const isIssue = /^[A-Z]+-\d+$/.test(input);
    if (isSha || isPR || isIssue) {
      try {
        return await this.resolveFromContext({
          commitHash: input.match(/^[a-f0-9]{7,40}$/) ? input : undefined,
          pullRequestNumber: input.match(/^PR#(\d+)$/) ? input.substring(3) : undefined,
          issueKey: input.match(/^[A-Z]+-\d+$/) ? input : undefined,
        });
      } catch (error) {
        // Not a context, try name
      }
    }

    // Try as a name (with optional project prefix)
    const parts = input.split('::');
    if (parts.length === 2) {
      const projectName = parts[0] ?? '';
      const buildTypeName = parts[1] ?? '';
      return await this.resolveByName({
        projectName,
        buildTypeName,
      });
    } else {
      // Use the input as build type name without project
      return await this.resolveByName({
        projectName: '',
        buildTypeName: input,
      });
    }
  }

  /**
   * Get all build types with caching
   */
  private async getAllBuildTypes(): Promise<Array<Partial<BuildType>>> {
    const cacheKey = 'all:buildTypes';
    const cached = this.cache.get(cacheKey);

    if (cached) {
      // This should not happen - getAllBuildTypes results are not cached this way
      // in the current implementation. Skip cache for now.
    }

    const response = await this.client.buildTypes.getAllBuildTypes(
      undefined,
      'buildType(id,name,projectId,projectName,webUrl,description,paused,templateFlag,settings,parameters,vcs-root-entries)'
    );
    const data = (response.data ?? {}) as { buildType?: Array<Partial<BuildType>> };

    return data.buildType ?? [];
  }

  /**
   * Normalize build type data to resolved configuration
   */
  private normalizeBuildType(buildType: Partial<BuildType>): ResolvedBuildConfiguration {
    if (!buildType.id) {
      throw new Error('Invalid build configuration data: missing ID');
    }

    const settings = buildType.settings?.property ?? [];
    const allowPersonalBuilds = settings.some(
      (s) => s.name === 'allowPersonalBuildTriggering' && s.value === 'true'
    );

    const parameters: Record<string, string> = {};
    if (buildType.parameters?.property) {
      for (const param of buildType.parameters.property) {
        if (param.name && param.value) {
          parameters[param.name] = param.value;
        }
      }
    }

    const vcsRootIds: string[] = [];
    if (buildType['vcs-root-entries']?.['vcs-root-entry']) {
      for (const entry of buildType['vcs-root-entries']['vcs-root-entry']) {
        if (entry['vcs-root']?.id) {
          vcsRootIds.push(entry['vcs-root'].id);
        }
      }
    }

    return {
      id: buildType.id,
      name: buildType.name ?? 'Unknown',
      projectId: buildType.projectId ?? '',
      projectName: buildType.projectName ?? '',
      webUrl: buildType.webUrl,
      description: buildType.description,
      paused: buildType.paused ?? false,
      templateFlag: buildType.templateFlag ?? false,
      allowPersonalBuilds,
      vcsRootIds: vcsRootIds.length > 0 ? vcsRootIds : undefined,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };
  }

  /**
   * Fuzzy string matching
   */
  private fuzzyMatch(query: string, target: string): number {
    const queryLower = query.toLowerCase().trim();
    const targetLower = target.toLowerCase().trim();

    // Exact match
    if (queryLower === targetLower) {
      return 1.0;
    }

    // Contains match
    {
      const contains = targetLower.includes(queryLower) ? true : queryLower.includes(targetLower);
      if (contains) {
        const longer = Math.max(queryLower.length, targetLower.length);
        const shorter = Math.min(queryLower.length, targetLower.length);
        return (shorter / longer) * 0.9;
      }
    }

    // Token-based matching
    const queryTokens = queryLower.split(/[\s_\-.]+/);
    const targetTokens = targetLower.split(/[\s_\-.]+/);

    let matches = 0;
    for (const qToken of queryTokens) {
      for (const tToken of targetTokens) {
        if (qToken === tToken || tToken.includes(qToken) || qToken.includes(tToken)) {
          matches++;
          break;
        }
      }
    }

    if (matches > 0) {
      return (matches / Math.max(queryTokens.length, targetTokens.length)) * 0.8;
    }

    // Levenshtein distance for close matches
    const distance = this.levenshteinDistance(queryLower, targetLower);
    const maxLength = Math.max(queryLower.length, targetLower.length);
    const similarity = 1 - distance / maxLength;

    return similarity * 0.7;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      (matrix[0] as number[])[j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          (matrix[i] as number[])[j] = (matrix[i - 1] as number[])[j - 1] as number;
        } else {
          (matrix[i] as number[])[j] = Math.min(
            ((matrix[i - 1] as number[])[j - 1] as number) + 1, // substitution
            ((matrix[i] as number[])[j - 1] as number) + 1, // insertion
            ((matrix[i - 1] as number[])[j] as number) + 1 // deletion
          );
        }
      }
    }

    return (matrix[str2.length] as number[])[str1.length] as number;
  }
}
