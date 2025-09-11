/**
 * Tests for BranchSpecificationParser
 */
import {
  BranchMatcher,
  BranchSpec,
  BranchSpecificationParser,
} from '@/teamcity/branch-specification-parser';

describe('BranchSpecificationParser', () => {
  let parser: BranchSpecificationParser;

  beforeEach(() => {
    parser = new BranchSpecificationParser();
  });

  describe('parseSpecification', () => {
    describe('inclusion rules', () => {
      it('should parse simple inclusion rule', () => {
        const spec = parser.parseSpecification('+:refs/heads/main');

        expect(spec).toEqual({
          pattern: 'refs/heads/main',
          type: 'include',
          isDefault: false,
          regex: expect.any(RegExp),
        });
      });

      it('should parse wildcard inclusion rule', () => {
        const spec = parser.parseSpecification('+:refs/heads/*');

        expect(spec).toEqual({
          pattern: 'refs/heads/*',
          type: 'include',
          isDefault: false,
          regex: expect.any(RegExp),
        });

        // Test the regex matches correctly
        expect(spec.regex?.test('refs/heads/main')).toBe(true);
        expect(spec.regex?.test('refs/heads/feature')).toBe(true);
        expect(spec.regex?.test('refs/heads/feature/test')).toBe(false); // Single wildcard doesn't match nested paths
        expect(spec.regex?.test('refs/tags/v1.0')).toBe(false);
      });

      it('should parse multi-level wildcard', () => {
        const spec = parser.parseSpecification('+:refs/heads/**');

        expect(spec).toEqual({
          pattern: 'refs/heads/**',
          type: 'include',
          isDefault: false,
          regex: expect.any(RegExp),
        });

        // Test double wildcard matches nested paths
        expect(spec.regex?.test('refs/heads/main')).toBe(true);
        expect(spec.regex?.test('refs/heads/feature/deep/nested')).toBe(true);
      });

      it('should handle implicit inclusion (no prefix)', () => {
        const spec = parser.parseSpecification('refs/heads/main');

        expect(spec).toEqual({
          pattern: 'refs/heads/main',
          type: 'include',
          isDefault: false,
          regex: expect.any(RegExp),
        });
      });
    });

    describe('exclusion rules', () => {
      it('should parse simple exclusion rule', () => {
        const spec = parser.parseSpecification('-:refs/heads/legacy');

        expect(spec).toEqual({
          pattern: 'refs/heads/legacy',
          type: 'exclude',
          isDefault: false,
          regex: expect.any(RegExp),
        });
      });

      it('should parse wildcard exclusion rule', () => {
        const spec = parser.parseSpecification('-:refs/heads/experimental/*');

        expect(spec).toEqual({
          pattern: 'refs/heads/experimental/*',
          type: 'exclude',
          isDefault: false,
          regex: expect.any(RegExp),
        });

        expect(spec.regex?.test('refs/heads/experimental/feature1')).toBe(true);
        expect(spec.regex?.test('refs/heads/main')).toBe(false);
      });
    });

    describe('default branch handling', () => {
      it('should detect default branch marker', () => {
        const spec = parser.parseSpecification('+:refs/heads/main (default)');

        expect(spec).toEqual({
          pattern: 'refs/heads/main',
          type: 'include',
          isDefault: true,
          regex: expect.any(RegExp),
        });
      });

      it('should detect <default> placeholder', () => {
        const spec = parser.parseSpecification('<default>');

        expect(spec).toEqual({
          pattern: '<default>',
          type: 'include',
          isDefault: true,
          regex: expect.any(RegExp),
        });
      });
    });

    describe('special patterns', () => {
      it('should handle pull request patterns', () => {
        const spec = parser.parseSpecification('+:pull/*/head');

        expect(spec.regex?.test('pull/123/head')).toBe(true);
        expect(spec.regex?.test('pull/456/head')).toBe(true);
        expect(spec.regex?.test('pull/123/merge')).toBe(false);
      });

      it('should handle merge request patterns', () => {
        const spec = parser.parseSpecification('+:merge-requests/*/head');

        expect(spec.regex?.test('merge-requests/789/head')).toBe(true);
        expect(spec.regex?.test('merge-requests/123/merge')).toBe(false);
      });

      it('should handle regex groups in patterns', () => {
        const spec = parser.parseSpecification('+:refs/heads/(feature|bugfix)/*');

        expect(spec.regex?.test('refs/heads/feature/new-login')).toBe(true);
        expect(spec.regex?.test('refs/heads/bugfix/fix-crash')).toBe(true);
        expect(spec.regex?.test('refs/heads/hotfix/urgent')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty specification', () => {
        expect(() => parser.parseSpecification('')).toThrow('Empty branch specification');
      });

      it('should handle whitespace', () => {
        const spec = parser.parseSpecification('  +:refs/heads/main  ');

        expect(spec.pattern).toBe('refs/heads/main');
      });

      it('should handle special characters in branch names', () => {
        const spec = parser.parseSpecification('+:refs/heads/feature-#123');

        expect(spec.regex?.test('refs/heads/feature-#123')).toBe(true);
        expect(spec.regex?.test('refs/heads/feature-#456')).toBe(false);
      });
    });
  });

  describe('parseMultipleSpecifications', () => {
    it('should parse multiple specifications', () => {
      const specs = parser.parseMultipleSpecifications([
        '+:refs/heads/*',
        '-:refs/heads/experimental/*',
        '+:refs/tags/*',
      ]);

      expect(specs).toHaveLength(3);
      expect(specs[0]?.type).toBe('include');
      expect(specs[1]?.type).toBe('exclude');
      expect(specs[2]?.type).toBe('include');
    });

    it('should handle single specification string with newlines', () => {
      const specs = parser.parseMultipleSpecifications(
        '+:refs/heads/*\n-:refs/heads/legacy/*\n+:refs/tags/*'
      );

      expect(specs).toHaveLength(3);
    });

    it('should skip empty lines', () => {
      const specs = parser.parseMultipleSpecifications([
        '+:refs/heads/*',
        '',
        '  ',
        '-:refs/heads/legacy/*',
      ]);

      expect(specs).toHaveLength(2);
    });

    it('should preserve order', () => {
      const specs = parser.parseMultipleSpecifications([
        '+:refs/heads/main',
        '-:refs/heads/experimental/*',
        '+:refs/heads/feature/*',
        '-:refs/heads/feature/old-*',
      ]);

      expect(specs[0]?.pattern).toBe('refs/heads/main');
      expect(specs[1]?.pattern).toBe('refs/heads/experimental/*');
      expect(specs[2]?.pattern).toBe('refs/heads/feature/*');
      expect(specs[3]?.pattern).toBe('refs/heads/feature/old-*');
    });
  });

  describe('convertWildcardToRegex', () => {
    it('should convert single wildcard', () => {
      const regex = parser.convertWildcardToRegex('refs/heads/*');

      expect(regex.test('refs/heads/main')).toBe(true);
      expect(regex.test('refs/heads/feature')).toBe(true);
      expect(regex.test('refs/heads/feature/nested')).toBe(false);
    });

    it('should convert double wildcard', () => {
      const regex = parser.convertWildcardToRegex('refs/heads/**');

      expect(regex.test('refs/heads/main')).toBe(true);
      expect(regex.test('refs/heads/feature/nested/deep')).toBe(true);
    });

    it('should escape special regex characters', () => {
      const regex = parser.convertWildcardToRegex('refs/heads/feature.test');

      expect(regex.test('refs/heads/feature.test')).toBe(true);
      expect(regex.test('refs/heads/featurextest')).toBe(false);
    });

    it('should handle multiple wildcards', () => {
      const regex = parser.convertWildcardToRegex('refs/*/feature-*');

      expect(regex.test('refs/heads/feature-123')).toBe(true);
      expect(regex.test('refs/remotes/feature-456')).toBe(true);
      expect(regex.test('refs/heads/main')).toBe(false);
    });
  });

  describe('extractDefaultBranch', () => {
    it('should extract default branch from specs', () => {
      const specs: BranchSpec[] = [
        { pattern: 'refs/heads/develop', type: 'include', isDefault: false, regex: /.*/ },
        { pattern: 'refs/heads/main', type: 'include', isDefault: true, regex: /.*/ },
        { pattern: 'refs/heads/feature/*', type: 'include', isDefault: false, regex: /.*/ },
      ];

      const defaultBranch = parser.extractDefaultBranch(specs);

      expect(defaultBranch).toBe('refs/heads/main');
    });

    it('should return null if no default branch', () => {
      const specs: BranchSpec[] = [
        { pattern: 'refs/heads/develop', type: 'include', isDefault: false, regex: /.*/ },
        { pattern: 'refs/heads/main', type: 'include', isDefault: false, regex: /.*/ },
      ];

      const defaultBranch = parser.extractDefaultBranch(specs);

      expect(defaultBranch).toBeNull();
    });

    it('should handle <default> placeholder', () => {
      const specs: BranchSpec[] = [
        { pattern: '<default>', type: 'include', isDefault: true, regex: /.*/ },
      ];

      const defaultBranch = parser.extractDefaultBranch(specs);

      expect(defaultBranch).toBe('<default>');
    });
  });
});

describe('BranchMatcher', () => {
  let matcher: BranchMatcher;
  let parser: BranchSpecificationParser;

  beforeEach(() => {
    parser = new BranchSpecificationParser();
    matcher = new BranchMatcher(parser);
  });

  describe('matchBranch', () => {
    it('should match branch against single specification', () => {
      const specs = parser.parseMultipleSpecifications(['+:refs/heads/*']);

      expect(matcher.matchBranch('refs/heads/main', specs)).toBe(true);
      expect(matcher.matchBranch('refs/tags/v1.0', specs)).toBe(false);
    });

    it('should respect exclusion rules', () => {
      const specs = parser.parseMultipleSpecifications([
        '+:refs/heads/*',
        '-:refs/heads/experimental/*',
      ]);

      expect(matcher.matchBranch('refs/heads/main', specs)).toBe(true);
      expect(matcher.matchBranch('refs/heads/experimental/feature', specs)).toBe(false);
    });

    it('should apply rules in order', () => {
      const specs = parser.parseMultipleSpecifications([
        '+:refs/heads/*',
        '-:refs/heads/feature/*',
        '+:refs/heads/feature/important',
      ]);

      expect(matcher.matchBranch('refs/heads/main', specs)).toBe(true);
      expect(matcher.matchBranch('refs/heads/feature/test', specs)).toBe(false);
      expect(matcher.matchBranch('refs/heads/feature/important', specs)).toBe(true);
    });

    it('should handle no matching rules', () => {
      const specs = parser.parseMultipleSpecifications(['+:refs/heads/*']);

      expect(matcher.matchBranch('refs/tags/v1.0', specs)).toBe(false);
    });

    it('should handle empty specifications', () => {
      expect(matcher.matchBranch('refs/heads/main', [])).toBe(false);
    });
  });

  describe('getMatchingConfigurations', () => {
    it('should find configurations that match a branch', () => {
      const configurations = [
        {
          id: 'config1',
          name: 'Main Build',
          branchSpecs: ['+:refs/heads/main', '+:refs/heads/develop'],
        },
        {
          id: 'config2',
          name: 'Feature Build',
          branchSpecs: ['+:refs/heads/feature/*', '-:refs/heads/feature/experimental/*'],
        },
        {
          id: 'config3',
          name: 'Release Build',
          branchSpecs: ['+:refs/heads/release/*', '+:refs/tags/*'],
        },
      ];

      const mainMatches = matcher.getMatchingConfigurations('refs/heads/main', configurations);
      expect(mainMatches).toEqual([
        {
          configId: 'config1',
          configName: 'Main Build',
          matchedSpec: 'refs/heads/main',
          confidence: 1.0,
        },
      ]);

      const featureMatches = matcher.getMatchingConfigurations(
        'refs/heads/feature/new-ui',
        configurations
      );
      expect(featureMatches).toEqual([
        {
          configId: 'config2',
          configName: 'Feature Build',
          matchedSpec: 'refs/heads/feature/*',
          confidence: 0.8,
        },
      ]);

      const experimentalMatches = matcher.getMatchingConfigurations(
        'refs/heads/feature/experimental/test',
        configurations
      );
      expect(experimentalMatches).toEqual([]);
    });

    it('should calculate confidence scores', () => {
      const configurations = [
        {
          id: 'config1',
          name: 'Exact Match',
          branchSpecs: ['+:refs/heads/main'],
        },
        {
          id: 'config2',
          name: 'Wildcard Match',
          branchSpecs: ['+:refs/heads/*'],
        },
        {
          id: 'config3',
          name: 'Deep Wildcard',
          branchSpecs: ['+:refs/**'],
        },
      ];

      const matches = matcher.getMatchingConfigurations('refs/heads/main', configurations);

      expect(matches).toHaveLength(3);
      expect(matches[0]?.confidence).toBe(1.0); // Exact match
      expect(matches[1]?.confidence).toBe(0.8); // Single wildcard
      expect(matches[2]?.confidence).toBe(0.6); // Double wildcard
    });
  });

  describe('getBranchesForConfiguration', () => {
    it('should extract potential branches from specifications', () => {
      const specs = [
        '+:refs/heads/main',
        '+:refs/heads/develop',
        '+:refs/heads/feature/*',
        '-:refs/heads/feature/old-*',
      ];

      const branches = matcher.getBranchesForConfiguration(specs);

      expect(branches).toContain('refs/heads/main');
      expect(branches).toContain('refs/heads/develop');
      expect(branches.some((b) => b.includes('feature/*'))).toBe(true);
    });

    it('should identify default branch', () => {
      const specs = [
        '+:refs/heads/main (default)',
        '+:refs/heads/develop',
        '+:refs/heads/feature/*',
      ];

      // We only need default branch here
      const defaultBranch = parser.extractDefaultBranch(parser.parseMultipleSpecifications(specs));

      expect(defaultBranch).toBe('refs/heads/main');
    });
  });
});
