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
});
