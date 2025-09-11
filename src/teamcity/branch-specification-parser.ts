/**
 * BranchSpecificationParser - Parses TeamCity branch specifications
 */

export interface BranchSpec {
  pattern: string;
  type: 'include' | 'exclude';
  isDefault: boolean;
  regex?: RegExp;
}

export interface MatchResult {
  configId: string;
  configName: string;
  matchedSpec: string;
  confidence: number;
}

export interface BuildConfiguration {
  id: string;
  name: string;
  branchSpecs: string[];
}

export class BranchSpecificationParser {
  /**
   * Parse a single branch specification
   */
  parseSpecification(spec: string): BranchSpec {
    if (!spec?.trim()) {
      throw new Error('Empty branch specification');
    }

    let trimmedSpec = spec.trim();
    let type: 'include' | 'exclude' = 'include';
    let isDefault = false;

    // Check for default branch marker
    if (trimmedSpec.includes('(default)')) {
      isDefault = true;
      trimmedSpec = trimmedSpec.replace('(default)', '').trim();
    }

    // Check for <default> placeholder
    if (trimmedSpec === '<default>') {
      return {
        pattern: '<default>',
        type: 'include',
        isDefault: true,
        regex: new RegExp('^<default>$'),
      };
    }

    // Parse inclusion/exclusion prefix
    if (trimmedSpec.startsWith('+:')) {
      type = 'include';
      trimmedSpec = trimmedSpec.substring(2);
    } else if (trimmedSpec.startsWith('-:')) {
      type = 'exclude';
      trimmedSpec = trimmedSpec.substring(2);
    }

    const pattern = trimmedSpec;
    const regex = this.convertWildcardToRegex(pattern);

    return {
      pattern,
      type,
      isDefault,
      regex,
    };
  }

  /**
   * Parse multiple branch specifications
   */
  parseMultipleSpecifications(specs: string[] | string): BranchSpec[] {
    let specList: string[];

    if (typeof specs === 'string') {
      specList = specs.split('\n');
    } else {
      specList = specs;
    }

    return specList.filter((spec) => spec?.trim()).map((spec) => this.parseSpecification(spec));
  }

  /**
   * Convert wildcard pattern to regular expression
   */
  convertWildcardToRegex(pattern: string): RegExp {
    // First, temporarily replace ** to avoid confusion with single *
    let regexPattern = pattern.replace(/\*\*/g, '___DOUBLE_WILDCARD___');

    // Escape special regex characters except wildcards and parentheses/pipes for groups
    regexPattern = regexPattern
      .replace(/[.+?^${}[\]\\]/g, '\\$&') // Escape special chars (but not * ( ) |)
      .replace(/\*/g, '[^/]*') // Single wildcard matches anything except /
      .replace(/___DOUBLE_WILDCARD___/g, '.*'); // Double wildcard matches everything

    return new RegExp(`^${regexPattern}$`);
  }

  /**
   * Extract default branch from specifications
   */
  extractDefaultBranch(specs: BranchSpec[]): string | null {
    const defaultSpec = specs.find((spec) => spec.isDefault);
    return defaultSpec ? defaultSpec.pattern : null;
  }

  /**
   * Check if a branch matches the given specifications
   */
  matchBranch(branchName: string, specs: BranchSpec[]): boolean {
    let matched = false;

    // Apply rules in order
    for (const spec of specs) {
      if (spec.regex && spec.regex.test(branchName)) {
        if (spec.type === 'include') {
          matched = true;
        } else if (spec.type === 'exclude') {
          matched = false;
        }
      }
    }

    return matched;
  }
}

export class BranchMatcher {
  constructor(private parser: BranchSpecificationParser) {}

  /**
   * Check if a branch matches the given specifications
   */
  matchBranch(branchName: string, specs: BranchSpec[]): boolean {
    let matched = false;

    // Apply rules in order
    for (const spec of specs) {
      if (spec.regex && spec.regex.test(branchName)) {
        if (spec.type === 'include') {
          matched = true;
        } else if (spec.type === 'exclude') {
          matched = false;
        }
      }
    }

    return matched;
  }

  /**
   * Find configurations that can build a specific branch
   */
  getMatchingConfigurations(
    branchName: string,
    configurations: BuildConfiguration[]
  ): MatchResult[] {
    const results: MatchResult[] = [];

    for (const config of configurations) {
      const specs = this.parser.parseMultipleSpecifications(config.branchSpecs);

      if (this.matchBranch(branchName, specs)) {
        // Find the spec that matched
        let matchedSpec = '';
        let confidence = 0;

        for (const spec of specs) {
          if (spec.type === 'include' && spec.regex && spec.regex.test(branchName)) {
            matchedSpec = spec.pattern;
            confidence = this.calculateConfidence(spec.pattern, branchName);
            break;
          }
        }

        results.push({
          configId: config.id,
          configName: config.name,
          matchedSpec,
          confidence,
        });
      }
    }

    // Sort by confidence (highest first)
    return results.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidence(pattern: string, branchName: string): number {
    // Exact match
    if (pattern === branchName) {
      return 1.0;
    }

    // Count wildcards to determine specificity
    const singleWildcards = (pattern.match(/(?<!\*)\*(?!\*)/g) ?? []).length;
    const doubleWildcards = (pattern.match(/\*\*/g) ?? []).length;

    if (doubleWildcards > 0) {
      return 0.6; // Least specific
    } else if (singleWildcards > 0) {
      return 0.8; // Moderately specific
    }

    return 0.9; // Pattern with regex groups or other patterns
  }

  /**
   * Extract potential branches from configuration specifications
   */
  getBranchesForConfiguration(specs: string[]): string[] {
    const branches: string[] = [];
    const parsedSpecs = this.parser.parseMultipleSpecifications(specs);

    for (const spec of parsedSpecs) {
      if (spec.type === 'include') {
        // For non-wildcard patterns, add them directly
        if (!spec.pattern.includes('*')) {
          branches.push(spec.pattern);
        } else {
          // For wildcard patterns, add a representative example
          branches.push(spec.pattern);
        }
      }
    }

    return branches;
  }
}
