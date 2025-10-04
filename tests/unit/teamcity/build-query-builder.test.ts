/**
 * Tests for BuildQueryBuilder
 */
import { BuildQueryBuilder, type BuildStatus } from '@/teamcity/build-query-builder';

describe('BuildQueryBuilder', () => {
  let builder: BuildQueryBuilder;

  beforeEach(() => {
    builder = new BuildQueryBuilder();
  });

  describe('Basic Filters', () => {
    it('should create locator for project filter', () => {
      const locator = builder.withProject('MyProject').build();

      expect(locator).toBe('project:MyProject');
    });

    it('should create locator for build type filter', () => {
      const locator = builder.withBuildType('MyBuildConfig').build();

      expect(locator).toBe('buildType:MyBuildConfig');
    });

    it('should create locator for status filter', () => {
      const locator = builder.withStatus('SUCCESS').build();

      expect(locator).toBe('status:SUCCESS');
    });

    it('should create locator for branch filter', () => {
      const locator = builder.withBranch('main').build();

      expect(locator).toBe('branch:main');
    });

    it('should create locator for tag filter', () => {
      const locator = builder.withTag('release').build();

      expect(locator).toBe('tag:release');
    });
  });

  describe('Date Filters', () => {
    it('should convert ISO date to TeamCity format for sinceDate', () => {
      const locator = builder.withSinceDate('2025-08-29T12:00:00Z').build();

      expect(locator).toBe('sinceDate:20250829T120000+0000');
    });

    it('should convert ISO date to TeamCity format for untilDate', () => {
      const locator = builder.withUntilDate('2025-08-30T18:30:00Z').build();

      expect(locator).toBe('untilDate:20250830T183000+0000');
    });

    it('should handle date-only format', () => {
      const locator = builder.withSinceDate('2025-08-29').build();

      expect(locator).toBe('sinceDate:20250829T000000+0000');
    });

    it('should handle various ISO date formats', () => {
      const locator = builder.withSinceDate('2025-08-29T12:00:00.000Z').build();

      expect(locator).toBe('sinceDate:20250829T120000+0000');
    });

    it('should throw error for invalid date format', () => {
      expect(() => {
        builder.withSinceDate('invalid-date').build();
      }).toThrow('Invalid date format');
    });
  });

  describe('Boolean Filters', () => {
    it('should add running filter', () => {
      const locator = builder.withRunning(true).build();

      expect(locator).toBe('running:true');
    });

    it('should add canceled filter', () => {
      const locator = builder.withCanceled(false).build();

      expect(locator).toBe('canceled:false');
    });

    it('should add personal filter', () => {
      const locator = builder.withPersonal(true).build();

      expect(locator).toBe('personal:true');
    });

    it('should add failedToStart filter', () => {
      const locator = builder.withFailedToStart(false).build();

      expect(locator).toBe('failedToStart:false');
    });
  });

  describe('Numeric Filters', () => {
    it('should add sinceBuild filter', () => {
      const locator = builder.withSinceBuild(12345).build();

      expect(locator).toBe('sinceBuild:12345');
    });

    it('should add count limit', () => {
      const locator = builder.withCount(50).build();

      expect(locator).toBe('count:50');
    });

    it('should add start offset', () => {
      const locator = builder.withStart(100).build();

      expect(locator).toBe('start:100');
    });
  });

  describe('Wildcard Patterns', () => {
    it('should support wildcard in branch filter', () => {
      const locator = builder.withBranch('feature/*').build();

      expect(locator).toBe('branch:feature/*');
    });

    it('should support wildcard in tag filter', () => {
      const locator = builder.withTag('v*').build();

      expect(locator).toBe('tag:v*');
    });

    it('should support complex wildcard patterns', () => {
      const locator = builder.withBranch('release/*/hotfix').build();

      expect(locator).toBe('branch:release/*/hotfix');
    });
  });

  describe('Special Character Escaping', () => {
    it('should escape special characters in values', () => {
      const locator = builder.withProject('My:Project').build();

      expect(locator).toBe('project:(My:Project)');
    });

    it('should escape parentheses in values', () => {
      const locator = builder.withBranch('feature/(test)').build();

      expect(locator).toBe('branch:(feature/(test))');
    });

    it('should escape commas in values', () => {
      const locator = builder.withTag('version,1.0').build();

      expect(locator).toBe('tag:(version,1.0)');
    });

    it('should escape branch values containing slashes without wildcards', () => {
      const locator = builder.withBranch('refs/heads/main').build();

      expect(locator).toBe('branch:(refs/heads/main)');
    });

    it('should escape branch values containing whitespace', () => {
      const locator = builder.withBranch('feature branch').build();

      expect(locator).toBe('branch:(feature branch)');
    });

    it('should not escape wildcards', () => {
      const locator = builder.withBranch('feature/*:test').build();

      expect(locator).toBe('branch:(feature/*:test)');
    });
  });

  describe('Combining Multiple Filters', () => {
    it('should combine two filters with comma', () => {
      const locator = builder.withProject('MyProject').withStatus('SUCCESS').build();

      expect(locator).toBe('project:MyProject,status:SUCCESS');
    });

    it('should combine multiple filters', () => {
      const locator = builder
        .withProject('MyProject')
        .withBuildType('MyBuildConfig')
        .withStatus('FAILURE')
        .withBranch('main')
        .build();

      expect(locator).toBe('project:MyProject,buildType:MyBuildConfig,status:FAILURE,branch:main');
    });

    it('should combine date filters with other filters', () => {
      const locator = builder
        .withProject('MyProject')
        .withSinceDate('2025-08-29T00:00:00Z')
        .withStatus('SUCCESS')
        .build();

      expect(locator).toBe('project:MyProject,status:SUCCESS,sinceDate:20250829T000000+0000');
    });

    it('should combine boolean and numeric filters', () => {
      const locator = builder
        .withRunning(false)
        .withCanceled(false)
        .withCount(100)
        .withStart(50)
        .build();

      expect(locator).toBe('running:false,canceled:false,count:100,start:50');
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle all filter types together', () => {
      const locator = builder
        .withProject('MyProject')
        .withBuildType('MyBuildConfig')
        .withStatus('SUCCESS')
        .withBranch('feature/*')
        .withTag('release')
        .withSinceDate('2025-08-01T00:00:00Z')
        .withUntilDate('2025-08-31T23:59:59Z')
        .withRunning(false)
        .withPersonal(false)
        .withCount(50)
        .build();

      expect(locator).toBe(
        'project:MyProject,buildType:MyBuildConfig,status:SUCCESS,' +
          'branch:feature/*,tag:release,' +
          'sinceDate:20250801T000000+0000,untilDate:20250831T235959+0000,' +
          'running:false,personal:false,count:50'
      );
    });

    it('should handle filters with special characters and escaping', () => {
      const locator = builder
        .withProject('My:Special,Project')
        .withBranch('feature/(test)*')
        .withTag('v1.0,beta')
        .build();

      expect(locator).toBe('project:(My:Special,Project),branch:(feature/(test)*),tag:(v1.0,beta)');
    });
  });

  describe('Reset and Reuse', () => {
    it('should reset builder state', () => {
      builder.withProject('MyProject').withStatus('SUCCESS');

      const locator1 = builder.build();
      expect(locator1).toBe('project:MyProject,status:SUCCESS');

      builder.reset();
      const locator2 = builder.build();
      expect(locator2).toBe('');
    });

    it('should allow reuse after reset', () => {
      builder.withProject('Project1').build();

      builder.reset();

      const locator = builder.withProject('Project2').withStatus('FAILURE').build();

      expect(locator).toBe('project:Project2,status:FAILURE');
    });
  });

  describe('Validation', () => {
    it('should validate status values', () => {
      expect(() => {
        builder.withStatus('INVALID' as unknown as BuildStatus).build();
      }).toThrow('Invalid status value');
    });

    it('should validate date range logic', () => {
      expect(() => {
        builder.withSinceDate('2025-08-30T00:00:00Z').withUntilDate('2025-08-29T00:00:00Z').build();
      }).toThrow('sinceDate must be before untilDate');
    });

    it('should validate count limit', () => {
      expect(() => {
        builder.withCount(0).build();
      }).toThrow('Count must be between 1 and 10000');

      expect(() => {
        builder.withCount(10001).build();
      }).toThrow('Count must be between 1 and 10000');
    });

    it('should validate start offset', () => {
      expect(() => {
        builder.withStart(-1).build();
      }).toThrow('Start offset must be non-negative');
    });
  });

  describe('Empty Locator', () => {
    it('should return empty string for no filters', () => {
      const locator = builder.build();
      expect(locator).toBe('');
    });

    it('should handle undefined values gracefully', () => {
      const locator = builder
        .withProject(undefined as unknown as string)
        .withStatus(undefined as unknown as BuildStatus)
        .build();

      expect(locator).toBe('');
    });
  });
});
