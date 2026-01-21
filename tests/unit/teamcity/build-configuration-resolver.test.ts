/**
 * Tests for Build Configuration Resolver
 */
import type { Logger } from 'winston';

import type { BuildType } from '@/teamcity-client';
import type { Project } from '@/teamcity-client/models/project';
import {
  AmbiguousBuildConfigurationError,
  BuildConfigurationCache,
  BuildConfigurationNotFoundError,
  BuildConfigurationPermissionError,
  BuildConfigurationResolver,
} from '@/teamcity/build-configuration-resolver';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

// Mock logger
const mockLogger: Partial<Logger> = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Helper to wrap response in Axios format
const wrapResponse = <T>(data: T) => ({ data });

// Mock TeamCity client
const mockTeamCityClient: MockTeamCityClient = createMockTeamCityClient();

describe('BuildConfigurationResolver', () => {
  let resolver: BuildConfigurationResolver;
  let cache: BuildConfigurationCache;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTeamCityClient.resetAllMocks();
    cache = new BuildConfigurationCache({ ttl: 60000 }); // 1 minute for tests
    resolver = new BuildConfigurationResolver({
      client: mockTeamCityClient,
      logger: mockLogger as unknown as Logger,
      cache,
      options: {
        fuzzyMatchThreshold: 0.7,
        maxCacheSize: 100,
      },
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Direct ID Resolution', () => {
    it('should resolve build configuration by exact ID', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'MyProject_BuildConfig',
        name: 'Build and Test',
        projectId: 'MyProject',
        projectName: 'My Project',
        webUrl: 'https://teamcity.example.com/viewType.html?buildTypeId=MyProject_BuildConfig',
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('MyProject_BuildConfig');

      expect(result).toEqual({
        id: 'MyProject_BuildConfig',
        name: 'Build and Test',
        projectId: 'MyProject',
        projectName: 'My Project',
        webUrl: mockBuildType.webUrl,
        description: undefined,
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      });

      expect(mockTeamCityClient.buildTypes.getBuildType).toHaveBeenCalledWith(
        'MyProject_BuildConfig',
        expect.any(String)
      );
    });

    it('should use cache for repeated ID lookups', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'MyProject_BuildConfig',
        name: 'Build and Test',
        projectId: 'MyProject',
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      // First call - should hit API
      await resolver.resolveByConfigurationId('MyProject_BuildConfig');

      // Second call - should use cache
      const result = await resolver.resolveByConfigurationId('MyProject_BuildConfig');

      expect(mockTeamCityClient.buildTypes.getBuildType).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('MyProject_BuildConfig');
    });

    it('should throw error for non-existent configuration ID', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce({
        response: { status: 404 },
      });

      await expect(resolver.resolveByConfigurationId('NonExistent_Config')).rejects.toThrow(
        BuildConfigurationNotFoundError
      );
    });

    it('should throw permission error for forbidden configuration', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce({
        response: {
          status: 403,
          data: { message: 'Access denied to build configuration' },
        },
      });

      await expect(resolver.resolveByConfigurationId('Forbidden_Config')).rejects.toThrow(
        BuildConfigurationPermissionError
      );
    });
  });

  describe('Name-based Resolution', () => {
    it('should resolve by project and build type name', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project1_Build1',
          name: 'Build and Test',
          projectId: 'Project1',
          projectName: 'Backend Services',
        },
        {
          id: 'Project2_Build1',
          name: 'Build and Deploy',
          projectId: 'Project2',
          projectName: 'Frontend App',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Backend Services',
        buildTypeName: 'Build and Test',
      });

      expect(result.id).toBe('Project1_Build1');
      expect(result.name).toBe('Build and Test');
      expect(result.projectName).toBe('Backend Services');
    });

    it('should handle partial name matches', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Backend_UnitTests',
          name: 'Unit Tests',
          projectId: 'Backend',
          projectName: 'Backend Services',
        },
        {
          id: 'Backend_IntegrationTests',
          name: 'Integration Tests',
          projectId: 'Backend',
          projectName: 'Backend Services',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Backend',
        buildTypeName: 'Unit',
      });

      expect(result.id).toBe('Backend_UnitTests');
    });

    it('should throw error for ambiguous matches', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Test1',
          name: 'Test Suite 1',
          projectId: 'Project',
          projectName: 'Main Project',
        },
        {
          id: 'Project_Test2',
          name: 'Test Suite 2',
          projectId: 'Project',
          projectName: 'Main Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      await expect(
        resolver.resolveByName({
          projectName: 'Main Project',
          buildTypeName: 'Test',
        })
      ).rejects.toThrow(AmbiguousBuildConfigurationError);
    });

    it('should resolve ambiguity with additional context', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Test1',
          name: 'Test Suite 1',
          projectId: 'Project',
          projectName: 'Main Project',
          description: 'Unit tests',
        },
        {
          id: 'Project_Test2',
          name: 'Test Suite 2',
          projectId: 'Project',
          projectName: 'Main Project',
          description: 'Integration tests',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Main Project',
        buildTypeName: 'Test',
        additionalContext: 'integration',
      });

      expect(result.id).toBe('Project_Test2');
    });
  });

  describe('Context-based Resolution', () => {
    it('should resolve from commit hash', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Main Build',
          projectId: 'Project',
          'vcs-root-entries': {
            'vcs-root-entry': [
              {
                'vcs-root': {
                  id: 'VcsRoot1',
                  name: 'GitHub Repo',
                },
              },
            ],
          },
        },
      ];

      // Mock recent build that used this commit
      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolveFromContext({
        commitHash: 'abc123def456',
        branch: 'feature/new-feature',
      });

      expect(result.id).toBe('Project_Build');
    });

    it('should resolve from pull request number', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_PRBuild',
          name: 'Pull Request Build',
          projectId: 'Project',
          projectName: 'Main Project',
          parameters: {
            property: [{ name: 'env.PULL_REQUEST_ENABLED', value: 'true' }],
          },
        },
        {
          id: 'Project_MainBuild',
          name: 'Main Build',
          projectId: 'Project',
          projectName: 'Main Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveFromContext({
        pullRequestNumber: '123',
        projectHint: 'Main Project',
      });

      expect(result.id).toBe('Project_PRBuild');
    });

    it('should resolve from issue key', async () => {
      const mockProjects: Partial<Project>[] = [
        {
          id: 'Backend',
          name: 'Backend Services',
          buildTypes: {
            buildType: [{ id: 'Backend_Build', name: 'Build' }],
          },
        },
        {
          id: 'Frontend',
          name: 'Frontend App',
          buildTypes: {
            buildType: [{ id: 'Frontend_Build', name: 'Build' }],
          },
        },
      ];

      mockTeamCityClient.projects.getAllProjects.mockResolvedValueOnce(
        wrapResponse({
          project: mockProjects,
          count: 2,
        })
      );
      // Mock getAllBuildTypes for resolveFromContext
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Backend_Build',
          name: 'Build',
          projectId: 'Backend',
          projectName: 'Backend Services',
        },
        {
          id: 'Frontend_Build',
          name: 'Build',
          projectId: 'Frontend',
          projectName: 'Frontend App',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Backend_Build',
          name: 'Build',
          projectId: 'Backend',
          projectName: 'Backend Services',
        })
      );

      const result = await resolver.resolveFromContext({
        issueKey: 'BACKEND-123',
      });

      expect(result.id).toBe('Backend_Build');
    });

    it('should handle multiple context clues', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Mobile_IOSBuild',
          name: 'iOS Build',
          projectId: 'Mobile',
          projectName: 'Mobile Apps',
        },
        {
          id: 'Mobile_AndroidBuild',
          name: 'Android Build',
          projectId: 'Mobile',
          projectName: 'Mobile Apps',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveFromContext({
        commitHash: 'def789',
        branch: 'feature/ios-update',
        projectHint: 'Mobile',
      });

      expect(result.id).toBe('Mobile_IOSBuild');
    });
  });

  describe('Caching', () => {
    it('should cache successful resolutions', async () => {
      // Create a completely fresh client mock to avoid cross-test contamination
      const freshMockClient = createMockTeamCityClient();
      freshMockClient.resetAllMocks();

      // Create a completely fresh resolver to avoid cross-test contamination
      const testCache = new BuildConfigurationCache({ ttl: 60000 });
      const testResolver = new BuildConfigurationResolver({
        client: freshMockClient,
        logger: mockLogger as unknown as Logger,
        cache: testCache,
        options: {
          fuzzyMatchThreshold: 0.7,
          maxCacheSize: 100,
        },
      });

      const uniqueId = `Cached_Build_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const mockBuildType: Partial<BuildType> = {
        id: uniqueId,
        name: 'Cached Build',
        projectId: 'Project',
      };

      // Set up the mock for our fresh client
      freshMockClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await testResolver.resolveByConfigurationId(uniqueId);

      // Verify the result first
      expect(result.id).toBe(uniqueId);

      // Check cache directly
      const cached = testCache.get(`id:${uniqueId}`);
      expect(cached).toBeDefined();
      expect(cached?.id).toBe(uniqueId);
    });

    it('should invalidate cache entries after TTL', async () => {
      jest.useFakeTimers();

      const mockBuildType: Partial<BuildType> = {
        id: 'TTL_Build',
        name: 'TTL Build',
        projectId: 'Project',
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValue(wrapResponse(mockBuildType));

      await resolver.resolveByConfigurationId('TTL_Build');

      // Advance time beyond TTL
      jest.advanceTimersByTime(61000); // 61 seconds

      // Should make another API call
      await resolver.resolveByConfigurationId('TTL_Build');

      expect(mockTeamCityClient.buildTypes.getBuildType).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle cache size limits', async () => {
      const smallCache = new BuildConfigurationCache({
        ttl: 60000,
        maxSize: 2,
      });

      const smallResolver = new BuildConfigurationResolver({
        client: mockTeamCityClient,
        logger: mockLogger as unknown as Logger,
        cache: smallCache,
      });

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          name: 'Build 1',
        })
      );

      await smallResolver.resolveByConfigurationId('Build1');
      await smallResolver.resolveByConfigurationId('Build2');
      await smallResolver.resolveByConfigurationId('Build3');

      // First entry should be evicted
      expect(smallCache.get('id:Build1')).toBeUndefined();
      expect(smallCache.get('id:Build2')).toBeDefined();
      expect(smallCache.get('id:Build3')).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should provide helpful error for no matches', async () => {
      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: [],
          count: 0,
        })
      );

      try {
        await resolver.resolveByName({
          projectName: 'NonExistent',
          buildTypeName: 'NoSuchBuild',
        });
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(BuildConfigurationNotFoundError);
        expect((error as Error).message).toContain('NonExistent');
        expect((error as Error).message).toContain('NoSuchBuild');
      }
    });

    it('should list possible matches for ambiguous queries', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build1',
          name: 'Build Config 1',
          projectName: 'Project',
        },
        {
          id: 'Project_Build2',
          name: 'Build Config 2',
          projectName: 'Project',
        },
        {
          id: 'Project_Build3',
          name: 'Build Config 3',
          projectName: 'Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 3,
        })
      );

      try {
        await resolver.resolveByName({
          projectName: 'Project',
          buildTypeName: 'Build',
        });
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(AmbiguousBuildConfigurationError);
        expect((error as AmbiguousBuildConfigurationError).candidates).toHaveLength(3);
        expect((error as AmbiguousBuildConfigurationError).suggestions).toContain('Project_Build1');
      }
    });

    it('should handle network errors gracefully', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(resolver.resolveByConfigurationId('Any_Build')).rejects.toThrow(
        'Failed to connect to TeamCity'
      );
    });

    it('should handle malformed responses', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          // Missing required fields
          name: 'Incomplete Build',
        })
      );

      await expect(resolver.resolveByConfigurationId('Malformed_Build')).rejects.toThrow(
        'Invalid build configuration data'
      );
    });
  });

  describe('Permission Validation', () => {
    it('should check build permissions when requested', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'Restricted_Build',
        name: 'Restricted Build',
        projectId: 'SecureProject',
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('Restricted_Build', {
        checkPermissions: true,
      });

      expect(result.id).toBe('Restricted_Build');
      // Permission check would be done via separate API call in real implementation
    });

    it('should identify personal build support', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'Personal_Build',
        name: 'Personal Build',
        settings: {
          property: [{ name: 'allowPersonalBuildTriggering', value: 'true' }],
        },
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('Personal_Build');

      expect(result.allowPersonalBuilds).toBe(true);
    });
  });

  describe('BuildConfigurationCache', () => {
    it('should delete cached entries', () => {
      const testCache = new BuildConfigurationCache({ ttl: 60000 });
      const testConfig = {
        id: 'TestBuild',
        name: 'Test Build',
        projectId: 'TestProject',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      };

      testCache.set('test:key', testConfig);
      expect(testCache.get('test:key')).toBeDefined();

      const deleted = testCache.delete('test:key');
      expect(deleted).toBe(true);
      expect(testCache.get('test:key')).toBeUndefined();
    });

    it('should return false when deleting non-existent key', () => {
      const testCache = new BuildConfigurationCache({ ttl: 60000 });
      const deleted = testCache.delete('nonexistent:key');
      expect(deleted).toBe(false);
    });

    it('should use default values when options not provided', () => {
      const testCache = new BuildConfigurationCache();
      const testConfig = {
        id: 'TestBuild',
        name: 'Test Build',
        projectId: 'TestProject',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      };

      testCache.set('test:key', testConfig);
      expect(testCache.get('test:key')).toBeDefined();
    });

    it('should evict entries when cache is at capacity', () => {
      const smallCache = new BuildConfigurationCache({ ttl: 60000, maxSize: 2 });
      const createConfig = (id: string) => ({
        id,
        name: `Build ${id}`,
        projectId: 'TestProject',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      });

      smallCache.set('key1', createConfig('Build1'));
      smallCache.set('key2', createConfig('Build2'));
      smallCache.set('key3', createConfig('Build3'));

      // First entry should be evicted (LRU)
      expect(smallCache.get('key1')).toBeUndefined();
      expect(smallCache.get('key2')).toBeDefined();
      expect(smallCache.get('key3')).toBeDefined();
    });

    it('should not evict when updating existing key at capacity', () => {
      const smallCache = new BuildConfigurationCache({ ttl: 60000, maxSize: 2 });
      const createConfig = (id: string) => ({
        id,
        name: `Build ${id}`,
        projectId: 'TestProject',
        projectName: 'Test Project',
        paused: false,
        templateFlag: false,
        allowPersonalBuilds: false,
      });

      smallCache.set('key1', createConfig('Build1'));
      smallCache.set('key2', createConfig('Build2'));

      // Update existing key - should not trigger eviction
      smallCache.set('key1', createConfig('Build1Updated'));

      expect(smallCache.get('key1')).toBeDefined();
      expect(smallCache.get('key1')?.id).toBe('Build1Updated');
      expect(smallCache.get('key2')).toBeDefined();
    });
  });

  describe('resolveByName - Additional Branch Coverage', () => {
    it('should use cache for repeated name lookups', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_ExactBuild',
          name: 'Exact Build',
          projectId: 'ExactProject',
          projectName: 'Exact Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // First call - hits API
      const result1 = await resolver.resolveByName({
        projectName: 'Exact Project',
        buildTypeName: 'Exact Build',
      });

      // Second call - should use cache
      const result2 = await resolver.resolveByName({
        projectName: 'Exact Project',
        buildTypeName: 'Exact Build',
      });

      expect(result1.id).toBe('Project_ExactBuild');
      expect(result2.id).toBe('Project_ExactBuild');
      expect(mockTeamCityClient.buildTypes.getAllBuildTypes).toHaveBeenCalledTimes(1);
    });

    it('should match against projectId when projectName does not match', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'MyProjectId_Build',
          name: 'Build Config',
          projectId: 'MyProjectId',
          projectName: 'Different Display Name',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'MyProjectId',
        buildTypeName: 'Build Config',
      });

      expect(result.id).toBe('MyProjectId_Build');
    });

    it('should boost score for exact project and name match', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Exact_Match',
          name: 'Exact Build',
          projectId: 'ExactProject',
          projectName: 'Exact Project',
        },
        {
          id: 'Partial_Match',
          name: 'Exact Build Partial',
          projectId: 'ExactProjectPartial',
          projectName: 'Exact Project Partial',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Exact Project',
        buildTypeName: 'Exact Build',
      });

      // Exact match should win due to score boost
      expect(result.id).toBe('Exact_Match');
    });

    it('should boost score for exact name match only', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Partial_Project',
          name: 'Exact Build',
          projectId: 'SomeProject',
          projectName: 'Some Project Name',
        },
        {
          id: 'Other_Build',
          name: 'Other Build',
          projectId: 'SomeProject',
          projectName: 'Some Project Name',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Some',
        buildTypeName: 'Exact Build',
      });

      // Exact name match should get boosted
      expect(result.id).toBe('Partial_Project');
    });

    it('should filter out candidates with low scores', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Completely_Unrelated',
          name: 'ZZZZZ',
          projectId: 'XXXXX',
          projectName: 'XXXXX',
        },
        {
          id: 'Good_Match',
          name: 'My Build',
          projectId: 'MyProject',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'My Project',
        buildTypeName: 'My Build',
      });

      expect(result.id).toBe('Good_Match');
    });

    it('should handle null/undefined fields in build type data', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Minimal_Build',
          name: undefined,
          projectId: undefined,
          projectName: undefined,
        },
        {
          id: 'Complete_Build',
          name: 'Complete Build',
          projectId: 'CompleteProject',
          projectName: 'Complete Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Complete Project',
        buildTypeName: 'Complete Build',
      });

      expect(result.id).toBe('Complete_Build');
    });

    it('should disambiguate with context matching name', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Test1',
          name: 'Test Suite Integration',
          projectId: 'Project',
          projectName: 'Main Project',
          description: 'Some tests',
        },
        {
          id: 'Project_Test2',
          name: 'Test Suite Unit',
          projectId: 'Project',
          projectName: 'Main Project',
          description: 'Other tests',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'Main Project',
        buildTypeName: 'Test',
        additionalContext: 'Unit',
      });

      // Should match based on context in name
      expect(result.id).toBe('Project_Test2');
    });
  });

  describe('resolveFromContext - Additional Branch Coverage', () => {
    it('should filter by android branch pattern', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Mobile_AndroidBuild',
          name: 'Android Build',
          projectId: 'Mobile',
          projectName: 'Mobile Apps',
        },
        {
          id: 'Mobile_IOSBuild',
          name: 'iOS Build',
          projectId: 'Mobile',
          projectName: 'Mobile Apps',
        },
        {
          id: 'Web_Build',
          name: 'Web Build',
          projectId: 'Web',
          projectName: 'Web App',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 3,
        })
      );

      const result = await resolver.resolveFromContext({
        branch: 'feature/android-improvements',
      });

      expect(result.id).toBe('Mobile_AndroidBuild');
    });

    it('should filter by web branch pattern', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Mobile_AndroidBuild',
          name: 'Android Build',
          projectId: 'Mobile',
          projectName: 'Mobile Apps',
        },
        {
          id: 'Web_Build',
          name: 'Web Build',
          projectId: 'Web',
          projectName: 'Web App',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveFromContext({
        branch: 'feature/web-portal',
      });

      expect(result.id).toBe('Web_Build');
    });

    it('should match web in project name', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'WebProject_Build',
          name: 'Main Build',
          projectId: 'WebProject',
          projectName: 'Web Services',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolveFromContext({
        branch: 'web-feature',
      });

      expect(result.id).toBe('WebProject_Build');
    });

    it('should throw error when no candidates match context', async () => {
      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: [],
          count: 0,
        })
      );

      await expect(
        resolver.resolveFromContext({
          projectHint: 'NonExistent',
        })
      ).rejects.toThrow(BuildConfigurationNotFoundError);
    });

    it('should filter candidates when projectHint matches projectId but not projectName', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'MyProjId_Build',
          name: 'Build',
          projectId: 'MyProjId',
          projectName: 'Completely Different Display Name',
        },
        {
          id: 'Other_Build',
          name: 'Other Build',
          projectId: 'Other',
          projectName: 'Other Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveFromContext({
        projectHint: 'MyProjId',
      });

      expect(result.id).toBe('MyProjId_Build');
    });

    it('should prefer default/main/build configurations when multiple match', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Deploy',
          name: 'Deploy',
          projectId: 'Project',
          projectName: 'My Project',
        },
        {
          id: 'Project_MainBuild',
          name: 'Main Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
        {
          id: 'Project_Test',
          name: 'Test',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 3,
        })
      );

      const result = await resolver.resolveFromContext({
        projectHint: 'Project',
      });

      // Should prefer the one with "main" in name
      expect(result.id).toBe('Project_MainBuild');
    });

    it('should prefer default configuration', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Deploy',
          name: 'Deploy',
          projectId: 'Project',
          projectName: 'My Project',
        },
        {
          id: 'Project_Default',
          name: 'Default Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const result = await resolver.resolveFromContext({
        projectHint: 'Project',
      });

      expect(result.id).toBe('Project_Default');
    });

    it('should return first match with warning when multiple non-default matches', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Deploy',
          name: 'Deploy',
          projectId: 'Project',
          projectName: 'My Project',
        },
        {
          id: 'Project_Test',
          name: 'Test',
          projectId: 'Project',
          projectName: 'My Project',
        },
        {
          id: 'Project_Lint',
          name: 'Lint',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 3,
        })
      );

      const result = await resolver.resolveFromContext({
        projectHint: 'Project',
      });

      // Should return first and log warning
      expect(result.id).toBe('Project_Deploy');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Multiple build configurations match'),
        expect.any(Object)
      );
    });

    it('should handle issue key with no prefix match', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // Issue key prefix doesn't match any project/name
      const result = await resolver.resolveFromContext({
        issueKey: 'ZZZZZ-123',
      });

      // Should still return the only candidate
      expect(result.id).toBe('Project_Build');
    });

    it('should filter PR candidates with no PR support parameters', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_NoPR',
          name: 'No PR Build',
          projectId: 'Project',
          projectName: 'My Project',
          parameters: {
            property: [{ name: 'env.OTHER_PARAM', value: 'some-value' }],
          },
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolveFromContext({
        pullRequestNumber: '42',
      });

      // Should return even without PR parameters since it's the only match
      expect(result.id).toBe('Project_NoPR');
    });

    it('should handle branch filtering with no platform matches', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Generic Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // Branch doesn't contain ios/android/web
      const result = await resolver.resolveFromContext({
        branch: 'feature/new-feature',
      });

      expect(result.id).toBe('Project_Build');
    });
  });

  describe('findFuzzyMatches', () => {
    let lowThresholdResolver: BuildConfigurationResolver;

    beforeEach(() => {
      // Create a resolver with a lower threshold for fuzzy match tests
      lowThresholdResolver = new BuildConfigurationResolver({
        client: mockTeamCityClient,
        logger: mockLogger as unknown as Logger,
        cache: new BuildConfigurationCache({ ttl: 60000 }),
        options: {
          fuzzyMatchThreshold: 0.3, // Lower threshold for testing
        },
      });
    });

    it('should find matches based on name', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_TestSuite',
          name: 'Test Suite',
          projectId: 'Project',
          projectName: 'My Project',
        },
        {
          id: 'Project_Deploy',
          name: 'Deploy',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const matches = await lowThresholdResolver.findFuzzyMatches('Test Suite');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedOn).toContain('name');
    });

    it('should find matches based on project name', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Backend_Build',
          name: 'Build',
          projectId: 'Backend',
          projectName: 'Backend Services',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const matches = await lowThresholdResolver.findFuzzyMatches('Backend Services');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedOn).toContain('projectName');
    });

    it('should find matches based on description', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Build',
          projectId: 'Project',
          projectName: 'My Project',
          description: 'Integration testing for the main application',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const matches = await lowThresholdResolver.findFuzzyMatches('Integration testing');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.matchedOn).toContain('description');
    });

    it('should return empty array when no matches exceed threshold', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'AAAA',
          projectId: 'Project',
          projectName: 'BBBB',
          description: 'CCCC',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const matches = await resolver.findFuzzyMatches('ZZZZZZZZ');

      expect(matches.length).toBe(0);
    });

    it('should sort matches by score descending', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Partial',
          name: 'Build Something Else',
          projectId: 'Project',
          projectName: 'Build Project', // projectName also matches query
        },
        {
          id: 'Project_Exact',
          name: 'Build',
          projectId: 'Project',
          projectName: 'Build Project', // projectName also matches query
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const matches = await lowThresholdResolver.findFuzzyMatches('Build');

      expect(matches.length).toBe(2);
      // Exact match should have higher score
      expect(matches[0]?.configuration.id).toBe('Project_Exact');
    });

    it('should handle empty or undefined fields', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Minimal_Build',
          name: '',
          projectId: 'Project',
          projectName: '',
          description: '',
        },
        {
          id: 'Complete_Build',
          name: 'Complete Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 2,
        })
      );

      const matches = await lowThresholdResolver.findFuzzyMatches('Complete Build');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0]?.configuration.id).toBe('Complete_Build');
    });
  });

  describe('resolveBatch', () => {
    it('should resolve multiple configurations by ID', async () => {
      mockTeamCityClient.buildTypes.getBuildType
        .mockResolvedValueOnce(
          wrapResponse({
            id: 'Build1',
            name: 'Build One',
            projectId: 'Project',
          })
        )
        .mockResolvedValueOnce(
          wrapResponse({
            id: 'Build2',
            name: 'Build Two',
            projectId: 'Project',
          })
        );

      const results = await resolver.resolveBatch([
        { type: 'id', value: 'Build1' },
        { type: 'id', value: 'Build2' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('Build1');
      expect(results[1]?.id).toBe('Build2');
    });

    it('should resolve by name in batch', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValue(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const results = await resolver.resolveBatch([
        { type: 'name', value: { projectName: 'My Project', buildTypeName: 'Build' } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('Project_Build');
    });

    it('should resolve by context in batch', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Main Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValue(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const results = await resolver.resolveBatch([
        { type: 'context', value: { projectHint: 'Project' } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('Project_Build');
    });

    it('should allow partial failures', async () => {
      mockTeamCityClient.buildTypes.getBuildType
        .mockResolvedValueOnce(
          wrapResponse({
            id: 'Build1',
            name: 'Build One',
            projectId: 'Project',
          })
        )
        .mockRejectedValueOnce({
          response: { status: 404 },
        });

      const results = await resolver.resolveBatch(
        [
          { type: 'id', value: 'Build1' },
          { type: 'id', value: 'NonExistent' },
        ],
        { allowPartialFailure: true }
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('Build1');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should throw on failure when allowPartialFailure is false', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce({
        response: { status: 404 },
      });

      await expect(
        resolver.resolveBatch([{ type: 'id', value: 'NonExistent' }], {
          allowPartialFailure: false,
        })
      ).rejects.toThrow(BuildConfigurationNotFoundError);
    });

    it('should throw on unknown resolution type', async () => {
      await expect(
        resolver.resolveBatch([{ type: 'unknown' as 'id', value: 'something' }])
      ).rejects.toThrow('Unknown resolution type');
    });
  });

  describe('resolve - Main Resolution Method', () => {
    it('should resolve by exact ID for valid ID pattern', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'MyProject_Build',
          name: 'Build',
          projectId: 'MyProject',
        })
      );

      const result = await resolver.resolve('MyProject_Build');

      expect(result.id).toBe('MyProject_Build');
    });

    it('should fall back to name resolution when ID lookup fails', async () => {
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce({
        response: { status: 404 },
      });

      // Use the project::buildType notation for name resolution fallback
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'MyProject_Build',
          name: 'Build',
          projectId: 'MyProject',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // Use project::buildType notation which works better for name resolution
      const result = await resolver.resolve('My Project::Build');

      expect(result.id).toBe('MyProject_Build');
    });

    it('should resolve from commit SHA context', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Main Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolve('abc123def456');

      expect(result.id).toBe('Project_Build');
    });

    it('should resolve from PR number context', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_PRBuild',
          name: 'PR Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolve('PR#123');

      expect(result.id).toBe('Project_PRBuild');
    });

    it('should resolve from issue key context', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'JIRA_Build',
          name: 'JIRA Build',
          projectId: 'JIRA',
          projectName: 'JIRA Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolve('JIRA-456');

      expect(result.id).toBe('JIRA_Build');
    });

    it('should resolve from project::buildType notation', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'MyProject_MyBuild',
          name: 'My Build',
          projectId: 'MyProject',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolve('My Project::My Build');

      expect(result.id).toBe('MyProject_MyBuild');
    });

    it('should resolve using project::buildType notation', async () => {
      // When not an ID, SHA, PR, or issue key, it tries project::buildType notation
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_UniqueConfig',
          name: 'Unique Config',
          projectId: 'UniqueProject',
          projectName: 'Unique Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolve('Unique Project::Unique Config');

      expect(result.id).toBe('Project_UniqueConfig');
    });

    it('should fall back to name resolution when context resolution fails for SHA', async () => {
      // First call for context resolution (fails because no build types)
      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: [],
          count: 0,
        })
      );

      // Second call for name resolution
      // Note: When projectName is empty, the scoring filter (bestProjectScore < 0.1)
      // will reject candidates. The SHA must match as a name/projectId to work.
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Other Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // When SHA context resolution fails and name resolution also fails (due to empty projectName),
      // it should throw BuildConfigurationNotFoundError
      await expect(resolver.resolve('abc1234def')).rejects.toThrow(BuildConfigurationNotFoundError);

      // Verify both calls were made (context resolution then name resolution)
      expect(mockTeamCityClient.buildTypes.getAllBuildTypes).toHaveBeenCalledTimes(2);
    });
  });

  describe('normalizeBuildType - Edge Cases', () => {
    it('should normalize build type with VCS root entries', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'WithVCS_Build',
        name: 'Build with VCS',
        projectId: 'Project',
        projectName: 'My Project',
        'vcs-root-entries': {
          'vcs-root-entry': [
            {
              'vcs-root': {
                id: 'VcsRoot1',
                name: 'GitHub Repo',
              },
            },
            {
              'vcs-root': {
                id: 'VcsRoot2',
                name: 'GitLab Repo',
              },
            },
          ],
        },
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('WithVCS_Build');

      expect(result.vcsRootIds).toEqual(['VcsRoot1', 'VcsRoot2']);
    });

    it('should normalize build type with parameters', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'WithParams_Build',
        name: 'Build with Parameters',
        projectId: 'Project',
        projectName: 'My Project',
        parameters: {
          property: [
            { name: 'param1', value: 'value1' },
            { name: 'param2', value: 'value2' },
            { name: 'emptyParam', value: '' },
            { name: '', value: 'emptyName' },
          ],
        },
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('WithParams_Build');

      expect(result.parameters).toEqual({
        param1: 'value1',
        param2: 'value2',
      });
    });

    it('should handle VCS root entry without id', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'VCSNoId_Build',
        name: 'Build',
        projectId: 'Project',
        'vcs-root-entries': {
          'vcs-root-entry': [
            {
              'vcs-root': {
                name: 'Repo without ID',
              },
            },
            {
              'vcs-root': {
                id: 'ValidId',
                name: 'Valid Repo',
              },
            },
          ],
        },
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('VCSNoId_Build');

      // Should only include the one with a valid ID
      expect(result.vcsRootIds).toEqual(['ValidId']);
    });

    it('should handle parameters with null values', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'NullParams_Build',
        name: 'Build',
        projectId: 'Project',
        parameters: {
          property: [
            { name: 'param1', value: null as unknown as string },
            { name: null as unknown as string, value: 'value' },
            { name: 'validParam', value: 'validValue' },
          ],
        },
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('NullParams_Build');

      expect(result.parameters).toEqual({
        validParam: 'validValue',
      });
    });

    it('should use default values for missing optional fields', async () => {
      const mockBuildType: Partial<BuildType> = {
        id: 'Minimal_Build',
      };

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(wrapResponse(mockBuildType));

      const result = await resolver.resolveByConfigurationId('Minimal_Build');

      expect(result.name).toBe('Unknown');
      expect(result.projectId).toBe('');
      expect(result.projectName).toBe('');
      expect(result.paused).toBe(false);
      expect(result.templateFlag).toBe(false);
      expect(result.allowPersonalBuilds).toBe(false);
      expect(result.vcsRootIds).toBeUndefined();
      expect(result.parameters).toBeUndefined();
    });
  });

  describe('Error Handling - Additional Coverage', () => {
    it('should re-throw unknown errors', async () => {
      const customError = new Error('Custom unknown error');
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce(customError);

      await expect(resolver.resolveByConfigurationId('Any_Build')).rejects.toThrow(
        'Custom unknown error'
      );
    });

    it('should handle ECONNREFUSED within message property', async () => {
      const networkError = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce(networkError);

      await expect(resolver.resolveByConfigurationId('Any_Build')).rejects.toThrow(
        'Failed to connect to TeamCity server'
      );
    });

    it('should handle error without message property', async () => {
      const weirdError = { response: { status: 418 } };
      mockTeamCityClient.buildTypes.getBuildType.mockRejectedValueOnce(weirdError);

      await expect(resolver.resolveByConfigurationId('Any_Build')).rejects.toEqual(weirdError);
    });
  });

  describe('fuzzyMatch - Edge Cases', () => {
    it('should handle token-based matching', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_UnitTest',
          name: 'unit-test-suite',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const result = await resolver.resolveByName({
        projectName: 'My Project',
        buildTypeName: 'unit test',
      });

      expect(result.id).toBe('Project_UnitTest');
    });

    it('should handle reverse containment matching', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Build',
          projectId: 'Project',
          projectName: 'Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // Query is longer than target but target is contained in query
      const result = await resolver.resolveByName({
        projectName: 'My Project',
        buildTypeName: 'Build Config',
      });

      expect(result.id).toBe('Project_Build');
    });

    it('should use levenshtein for close matches', async () => {
      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Deploy',
          name: 'Deploy',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      // Typo: "Deplpy" is close to "Deploy"
      const result = await resolver.resolveByName({
        projectName: 'My Project',
        buildTypeName: 'Deplpy',
      });

      expect(result.id).toBe('Project_Deploy');
    });
  });

  describe('Resolver Construction Options', () => {
    it('should use default cache when none provided', async () => {
      const resolverWithoutCache = new BuildConfigurationResolver({
        client: mockTeamCityClient,
        logger: mockLogger as unknown as Logger,
      });

      mockTeamCityClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Test_Build',
          name: 'Test Build',
          projectId: 'Test',
        })
      );

      const result = await resolverWithoutCache.resolveByConfigurationId('Test_Build');
      expect(result.id).toBe('Test_Build');
    });

    it('should use default fuzzy match threshold when not specified', async () => {
      const resolverWithDefaults = new BuildConfigurationResolver({
        client: mockTeamCityClient,
        logger: mockLogger as unknown as Logger,
        options: {},
      });

      const mockBuildTypes: Partial<BuildType>[] = [
        {
          id: 'Project_Build',
          name: 'Build',
          projectId: 'Project',
          projectName: 'My Project',
        },
      ];

      mockTeamCityClient.buildTypes.getAllBuildTypes.mockResolvedValueOnce(
        wrapResponse({
          buildType: mockBuildTypes,
          count: 1,
        })
      );

      const matches = await resolverWithDefaults.findFuzzyMatches('Build');
      expect(matches.length).toBeGreaterThan(0);
    });
  });
});
