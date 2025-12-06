/**
 * Configuration-Branch Matcher for TeamCity
 *
 * Provides bidirectional matching between branches and build configurations,
 * determining which configurations can build specific branches and vice versa.
 */
import type { Logger } from 'winston';

import type { BuildType } from '@/teamcity-client';
import { globToRegex } from '@/utils/pattern';

import { type BranchSpec, BranchSpecificationParser } from './branch-specification-parser';
import type { TeamCityUnifiedClient } from './types/client';

/**
 * VCS Root information extracted from build configuration
 */
export interface VcsRootInfo {
  id: string;
  name: string;
  defaultBranch?: string;
  url?: string;
}

/**
 * Build configuration that matches a branch
 */
export interface MatchedConfiguration {
  id: string;
  name: string;
  projectId: string;
  matchedSpec: string;
  confidence: number;
  vcsRoots?: VcsRootInfo[];
}

/**
 * Branch information for a configuration
 */
export interface ConfigurationBranches {
  configId: string;
  configName: string;
  defaultBranch?: string;
  branchSpecs: BranchSpec[];
  vcsRoots: VcsRootInfo[];
}

export class ConfigurationBranchMatcher {
  private parser: BranchSpecificationParser;

  constructor(
    private readonly client: TeamCityUnifiedClient,
    private readonly logger: Logger,
    parser?: BranchSpecificationParser
  ) {
    this.parser = parser ?? new BranchSpecificationParser();
  }

  /**
   * Find all build configurations that can build a specific branch
   */
  async getConfigurationsForBranch(
    projectId: string,
    branchName: string
  ): Promise<MatchedConfiguration[]> {
    try {
      this.logger.debug('Finding configurations for branch', { projectId, branchName });

      // Get all build configurations in the project
      const buildTypesResponse = await this.client.modules.buildTypes.getAllBuildTypes(
        `project:(id:${projectId})`
      );

      if (buildTypesResponse?.data?.buildType == null) {
        return [];
      }

      const matchedConfigs: MatchedConfiguration[] = [];

      // Check each configuration
      for (const buildType of buildTypesResponse.data.buildType) {
        try {
          // Get full build type details including VCS roots
          if (buildType.id == null || buildType.id.length === 0) {
            continue;
          }
          // Intentional per-config fetch to evaluate branch specs and VCS roots
          // eslint-disable-next-line no-await-in-loop
          const fullBuildTypeResponse = await this.client.modules.buildTypes.getBuildType(
            buildType.id
          );
          const fullBuildType = fullBuildTypeResponse.data;

          // Extract branch specification
          const branchSpec = this.extractBranchSpecification(fullBuildType);
          const vcsRoots = this.extractVcsRoots(fullBuildType);

          // Check if branch matches
          let matched = false;
          let matchedSpec = '';
          let confidence = 0;

          if (!branchSpec) {
            // No branch spec means only default branch
            const defaultBranch = vcsRoots[0]?.defaultBranch ?? 'refs/heads/main';
            if (branchName === defaultBranch || branchName === 'main' || branchName === 'master') {
              matched = true;
              matchedSpec = '<default>';
              confidence = 1.0;
            }
          } else {
            // Parse and check branch specifications
            const specs = this.parser.parseMultipleSpecifications(branchSpec);
            const branchToTest = branchName.startsWith('refs/heads/')
              ? branchName
              : `refs/heads/${branchName}`;

            matched = this.parser.matchBranch(branchToTest, specs);

            if (matched) {
              // Find the matching spec
              for (const spec of specs) {
                if (spec.type === 'include' && this.testBranchAgainstSpec(branchToTest, spec)) {
                  matchedSpec = spec.pattern;
                  confidence = this.calculateConfidence(spec.pattern);
                  break;
                }
              }
            }
          }

          if (
            matched &&
            buildType.id != null &&
            buildType.id.length > 0 &&
            buildType.name != null &&
            buildType.name.length > 0 &&
            buildType.projectId != null &&
            buildType.projectId.length > 0
          ) {
            matchedConfigs.push({
              id: buildType.id,
              name: buildType.name,
              projectId: buildType.projectId,
              matchedSpec,
              confidence,
              vcsRoots,
            });
          }
        } catch (error) {
          this.logger.error('Failed to check configuration', {
            configId: buildType.id,
            error,
          });
        }
      }

      // Sort by confidence (highest first)
      matchedConfigs.sort((a, b) => b.confidence - a.confidence);

      this.logger.debug('Found matching configurations', {
        branchName,
        count: matchedConfigs.length,
      });

      return matchedConfigs;
    } catch (error) {
      this.logger.error('Failed to get configurations for branch', {
        projectId,
        branchName,
        error,
      });
      return [];
    }
  }

  /**
   * Get all branches that can be built by a specific configuration
   */
  async getBranchesForConfiguration(configId: string): Promise<ConfigurationBranches> {
    try {
      this.logger.debug('Getting branches for configuration', { configId });

      // Get full build type details
      const buildTypeResponse = await this.client.modules.buildTypes.getBuildType(configId);
      const buildType = buildTypeResponse.data;

      // Extract branch specification and VCS roots
      const branchSpec = this.extractBranchSpecification(buildType);
      const vcsRoots = this.extractVcsRoots(buildType);
      const defaultBranch = vcsRoots[0]?.defaultBranch;

      // Parse branch specifications
      let branchSpecs: BranchSpec[];
      if (!branchSpec) {
        // No spec means only default branch
        branchSpecs = [
          {
            pattern: '<default>',
            type: 'include',
            isDefault: true,
          },
        ];
      } else {
        branchSpecs = this.parser.parseMultipleSpecifications(branchSpec);
      }

      return {
        configId: buildType.id ?? 'unknown',
        configName: buildType.name ?? 'Unknown',
        defaultBranch,
        branchSpecs,
        vcsRoots,
      };
    } catch (error) {
      this.logger.error('Failed to get branches for configuration', {
        configId,
        error,
      });

      return {
        configId,
        configName: 'Unknown',
        branchSpecs: [],
        vcsRoots: [],
      };
    }
  }

  /**
   * Extract branch specification from build type parameters
   */
  private extractBranchSpecification(buildType: BuildType): string {
    const properties = buildType.parameters?.property;
    if (!properties) {
      return '';
    }

    const branchFilterParam = properties.find(
      (prop) => prop.name === 'teamcity.vcsTrigger.branchFilter'
    );

    return branchFilterParam?.value ?? '';
  }

  /**
   * Extract VCS root information from build type
   */
  private extractVcsRoots(buildType: BuildType): VcsRootInfo[] {
    const roots: VcsRootInfo[] = [];

    if (!buildType['vcs-root-entries']?.['vcs-root-entry']) {
      return roots;
    }

    for (const entry of buildType['vcs-root-entries']['vcs-root-entry']) {
      const vcsRoot = entry['vcs-root'];
      if (!vcsRoot) {
        continue;
      }

      const properties = vcsRoot.properties?.property ?? [];
      const branchProp = properties.find((p) => p.name === 'branch');
      const urlProp = properties.find((p) => p.name === 'url');

      if (
        vcsRoot.id != null &&
        vcsRoot.id.length > 0 &&
        vcsRoot.name != null &&
        vcsRoot.name.length > 0
      ) {
        roots.push({
          id: vcsRoot.id,
          name: vcsRoot.name,
          defaultBranch: branchProp?.value,
          url: urlProp?.value,
        });
      }
    }

    return roots;
  }

  /**
   * Test if a branch matches a specific branch specification
   */
  private testBranchAgainstSpec(branchName: string, spec: BranchSpec): boolean {
    if (spec.regex) {
      return spec.regex.test(branchName);
    }

    // Fallback to simple pattern matching (with proper escaping)
    const regex = globToRegex(spec.pattern);
    return regex.test(branchName);
  }

  /**
   * Calculate confidence score based on pattern specificity
   */
  private calculateConfidence(pattern: string): number {
    // Exact match (no wildcards)
    if (!pattern.includes('*') && !pattern.includes('?')) {
      return 1.0;
    }

    // Regex groups - check before wildcards since they can contain wildcards
    if (pattern.includes('(') && pattern.includes(')')) {
      return 0.8;
    }

    // Single wildcard
    if (pattern.split('*').length === 2 && !pattern.includes('**')) {
      return 0.9;
    }

    // Double wildcard
    if (pattern.includes('**')) {
      // Complex pattern with multiple wildcards
      if (pattern.split('*').length > 3) {
        return 0.6;
      }
      return 0.7;
    }

    // Default for other patterns
    return 0.5;
  }
}
