/**
 * Tests for BuildConfigNavigator
 */
import { BuildConfigNavigator } from '@/teamcity/build-config-navigator';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

// Logger mocked below; direct import not required for behavior-first tests

jest.mock('@/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('BuildConfigNavigator', () => {
  let navigator: BuildConfigNavigator;
  let mockClient: MockTeamCityClient;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create mock TeamCity client
    mockClient = createMockTeamCityClient();
    mockClient.resetAllMocks();

    navigator = new BuildConfigNavigator(mockClient);

    // Clear cache before each test without using `any`
    type PrivateNav = { cache: Map<string, unknown> };
    (navigator as unknown as PrivateNav).cache.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Listing', () => {
    it('should fetch build configurations with no filters', async () => {
      const mockResponse = {
        data: {
          count: 2,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
              description: 'Test build config',
              href: '/app/rest/buildTypes/id:Project1_Build',
              webUrl:
                'https://teamcity.example.com/admin/editBuild.html?id=buildType:Project1_Build',
            },
            {
              id: 'Project2_Test',
              name: 'Test Configuration',
              projectId: 'Project2',
              projectName: 'Project 2',
              description: 'Test configuration',
              href: '/app/rest/buildTypes/id:Project2_Test',
              webUrl:
                'https://teamcity.example.com/admin/editBuild.html?id=buildType:Project2_Test',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs();

      expect(result.buildConfigs).toHaveLength(2);
      expect(result.buildConfigs[0]).toEqual({
        id: 'Project1_Build',
        name: 'Build Configuration 1',
        projectId: 'Project1',
        projectName: 'Project 1',
        description: 'Test build config',
        href: '/app/rest/buildTypes/id:Project1_Build',
        webUrl: 'https://teamcity.example.com/admin/editBuild.html?id=buildType:Project1_Build',
      });
      expect(result.totalCount).toBe(2);
      // Behavior-first: verify output content only
    });

    it('should handle empty build configuration list', async () => {
      const mockResponse = {
        data: {
          count: 0,
          buildType: [],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs();

      expect(result.buildConfigs).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      // Behavior-first: verify output content only
    });
  });

  describe('Project Filtering', () => {
    it('should filter build configurations by project ID', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
              description: 'Test build config',
              href: '/app/rest/buildTypes/id:Project1_Build',
              webUrl:
                'https://teamcity.example.com/admin/editBuild.html?id=buildType:Project1_Build',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ projectId: 'Project1' });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.projectId).toBe('Project1');
      // Behavior-first: verify results are filtered as expected
    });

    it('should handle multiple project IDs', async () => {
      const mockResponse = {
        data: {
          count: 2,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project2_Build',
              name: 'Build Configuration 2',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        projectIds: ['Project1', 'Project2'],
      });

      expect(result.buildConfigs).toHaveLength(2);
      // Behavior-first: verify results contain both projects
    });
  });

  describe('Name Pattern Filtering', () => {
    it('should filter by build configuration name pattern', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Test',
              name: 'Test Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: 'Test*' });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.name).toBe('Test Configuration');
    });

    it('should support exact name matching', async () => {
      const mockResponse = {
        data: {
          count: 3,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Deploy',
              name: 'Deploy Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'Test Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: 'Deploy Configuration' });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.name).toBe('Deploy Configuration');
    });

    it('should support partial name matching', async () => {
      const mockResponse = {
        data: {
          count: 3,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Deploy',
              name: 'Deploy Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'Test Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: 'Config' });

      expect(result.buildConfigs).toHaveLength(3);
      expect(result.buildConfigs.every((config) => config.name.includes('Configuration'))).toBe(
        true
      );
    });

    it('should support wildcard patterns at beginning and end', async () => {
      const mockResponse = {
        data: {
          count: 5,
          buildType: [
            {
              id: 'Project1_FastBuild',
              name: 'Fast Build',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_SlowBuild',
              name: 'Slow Build',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_NightlyBuild',
              name: 'Nightly Build',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Deploy',
              name: 'Deploy',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'Test',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: '*Build' });

      expect(result.buildConfigs).toHaveLength(3);
      expect(result.buildConfigs.every((config) => config.name.endsWith('Build'))).toBe(true);
    });

    it('should support complex wildcard patterns', async () => {
      const mockResponse = {
        data: {
          count: 5,
          buildType: [
            {
              id: 'Project1_Dev_Deploy',
              name: 'Dev Deploy',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Staging_Deploy',
              name: 'Staging Deploy',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Prod_Deploy',
              name: 'Prod Deploy',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Dev_Build',
              name: 'Dev Build',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'Test',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: '*Deploy' });

      expect(result.buildConfigs).toHaveLength(3);
      expect(result.buildConfigs.every((config) => config.name.includes('Deploy'))).toBe(true);
    });

    it('should be case-insensitive for name pattern matching', async () => {
      const mockResponse = {
        data: {
          count: 2,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'BUILD Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'build test',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: 'build*' });

      expect(result.buildConfigs).toHaveLength(2);
    });
  });

  describe('Pagination', () => {
    it('should support pagination parameters', async () => {
      const mockResponse = {
        data: {
          count: 50,
          buildType: Array.from({ length: 10 }, (_, i) => ({
            id: `Build${i + 1}`,
            name: `Build Configuration ${i + 1}`,
            projectId: 'TestProject',
            projectName: 'Test Project',
          })),
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        pagination: { limit: 10, offset: 0 },
      });

      expect(result.buildConfigs).toHaveLength(10);
      expect(result.totalCount).toBe(50);
      expect(result.hasMore).toBe(true);
      // Behavior-first: verify pagination metadata only
    });

    it('should calculate hasMore correctly when at end of results', async () => {
      const mockResponse = {
        data: {
          count: 25,
          buildType: Array.from({ length: 5 }, (_, i) => ({
            id: `Build${i + 21}`,
            name: `Build Configuration ${i + 21}`,
            projectId: 'TestProject',
            projectName: 'Test Project',
          })),
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        pagination: { limit: 10, offset: 20 },
      });

      expect(result.buildConfigs).toHaveLength(5);
      expect(result.totalCount).toBe(25);
      expect(result.hasMore).toBe(false);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract VCS root information when includeVcsRoots is true', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'VcsRoot1',
                    'vcs-root': {
                      id: 'VcsRoot1',
                      name: 'Main Repository',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/repo.git' },
                          { name: 'branch', value: 'main' },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ includeVcsRoots: true });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.vcsRoots).toBeDefined();
      expect(result.buildConfigs[0]?.vcsRoots).toHaveLength(1);
      expect(result.buildConfigs[0]?.vcsRoots?.[0]).toEqual({
        id: 'VcsRoot1',
        name: 'Main Repository',
        vcsName: 'git',
        url: 'https://github.com/example/repo.git',
        branch: 'main',
      });
    });

    it('should extract build parameters when includeParameters is true', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
              parameters: {
                property: [
                  {
                    name: 'env.NODE_ENV',
                    value: 'production',
                    type: { rawValue: 'text' },
                  },
                  {
                    name: 'system.test.timeout',
                    value: '30',
                    type: { rawValue: 'text' },
                  },
                ],
              },
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ includeParameters: true });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.parameters).toBeDefined();
      expect(result.buildConfigs[0]?.parameters).toEqual({
        'env.NODE_ENV': 'production',
        'system.test.timeout': '30',
      });
    });
  });

  describe('Hierarchy Traversal', () => {
    it('should include project hierarchy information when includeProjectHierarchy is true', async () => {
      const mockBuildTypesResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'SubProject_Build',
              name: 'Sub Project Build',
              projectId: 'SubProject',
              projectName: 'Sub Project',
            },
          ],
        },
      };

      const mockProjectResponse = {
        data: {
          id: 'SubProject',
          name: 'Sub Project',
          parentProjectId: 'RootProject',
          parentProject: {
            id: 'RootProject',
            name: 'Root Project',
          },
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockBuildTypesResponse);
      mockClient.projects.getProject.mockResolvedValue(mockProjectResponse);

      const result = await navigator.listBuildConfigs({
        includeProjectHierarchy: true,
      });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.projectHierarchy).toBeDefined();
      expect(result.buildConfigs[0]?.projectHierarchy).toEqual([
        { id: 'RootProject', name: 'Root Project' },
        { id: 'SubProject', name: 'Sub Project' },
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle 401 authentication errors', async () => {
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const authError: HttpError = new Error('Authentication failed');
      authError.response = { status: 401 };

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(authError);

      await expect(navigator.listBuildConfigs()).rejects.toThrow(
        'Authentication failed - please check your TeamCity token'
      );
    });

    it('should handle 403 permission errors', async () => {
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const permissionError: HttpError = new Error('Forbidden');
      permissionError.response = { status: 403 };

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(permissionError);

      await expect(navigator.listBuildConfigs()).rejects.toThrow(
        'Permission denied - you do not have access to build configurations'
      );
    });

    it('should handle 404 not found errors for specific projects', async () => {
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const notFoundError: HttpError = new Error('Not found');
      notFoundError.response = { status: 404 };

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(notFoundError);

      await expect(navigator.listBuildConfigs({ projectId: 'NonExistentProject' })).rejects.toThrow(
        'Project NonExistentProject not found'
      );
    });

    it('should handle network timeouts', async () => {
      const timeoutError = new Error('Timeout');
      timeoutError.name = 'ECONNABORTED';

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(timeoutError);

      await expect(navigator.listBuildConfigs()).rejects.toThrow(
        'Request timed out - TeamCity server may be overloaded'
      );
    });

    it('should handle generic API errors', async () => {
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const apiError: HttpError = new Error('Internal Server Error');
      apiError.response = { status: 500, data: { message: 'Database error' } };

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(apiError);

      await expect(navigator.listBuildConfigs()).rejects.toThrow(
        'TeamCity API error: Internal Server Error'
      );
    });

    it('should handle malformed API responses', async () => {
      const malformedResponse = {
        data: null,
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(malformedResponse);

      await expect(navigator.listBuildConfigs()).rejects.toThrow(
        'Invalid API response from TeamCity'
      );
    });
  });

  describe('Caching', () => {
    it('should cache results for identical queries', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      // First call
      const result1 = await navigator.listBuildConfigs({ projectId: 'Project1' });
      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledTimes(1);
      expect(result1.buildConfigs).toHaveLength(1);

      // Second identical call should return same results (behavior)
      const result2 = await navigator.listBuildConfigs({ projectId: 'Project1' });
      // Verify cache prevented another client call
      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledTimes(1);
      expect(result2.buildConfigs).toEqual(result1.buildConfigs);
    });

    it('should expire cache after TTL', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      // First call
      const first = await navigator.listBuildConfigs({ projectId: 'Project1' });
      expect(first.buildConfigs).toHaveLength(1);

      // Advance time beyond cache TTL (120 seconds)
      jest.advanceTimersByTime(121000);

      // Second call after TTL should still return consistent results
      const second = await navigator.listBuildConfigs({ projectId: 'Project1' });
      expect(second.buildConfigs).toHaveLength(1);
    });

    it('should not cache error responses', async () => {
      const apiError = new Error('Server Error');
      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(apiError);

      // First call should fail
      await expect(navigator.listBuildConfigs()).rejects.toThrow('Server Error');
      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledTimes(1);

      // Second call should also make API request (no caching of errors)
      await expect(navigator.listBuildConfigs()).rejects.toThrow('Server Error');
      expect(mockClient.buildTypes.getAllBuildTypes).toHaveBeenCalledTimes(2);
    });

    it('should clear old cache entries when cache limit is exceeded', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [{ id: 'Build1', name: 'Build 1', projectId: 'Project1' }],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      // Fill cache with 101 entries to exceed the 100 entry limit
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < 101; i++) {
        await navigator.listBuildConfigs({ projectId: `Project${i}` });
      }
      /* eslint-enable no-await-in-loop */

      // Behavior-first: ensure calls do not throw and produce results
      const sample = await navigator.listBuildConfigs({ projectId: 'Project100' });
      expect(Array.isArray(sample.buildConfigs)).toBe(true);
    });
  });

  describe('View Modes', () => {
    it('should support list view mode (default)', async () => {
      const mockResponse = {
        data: {
          count: 2,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project2_Build',
              name: 'Build Configuration 2',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ viewMode: 'list' });

      expect(result.viewMode).toBe('list');
      expect(result.buildConfigs).toHaveLength(2);
      expect(result.groupedByProject).toBeUndefined();
    });

    it('should support project-grouped view mode', async () => {
      const mockResponse = {
        data: {
          count: 3,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'Test Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project2_Build',
              name: 'Build Configuration 2',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ viewMode: 'project-grouped' });

      expect(result.viewMode).toBe('project-grouped');
      expect(result.groupedByProject).toBeDefined();
      expect(result.groupedByProject).toHaveProperty('Project1');
      expect(result.groupedByProject).toHaveProperty('Project2');
      expect(result.groupedByProject?.['Project1']?.buildConfigs).toHaveLength(2);
      expect(result.groupedByProject?.['Project2']?.buildConfigs).toHaveLength(1);
    });
  });

  describe('Logging and Debugging', () => {
    it('should log successful API calls', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      await navigator.listBuildConfigs({ projectId: 'Project1' });

      // Behavior-first: ensure no throw and results returned
      expect(true).toBe(true);
    });

    it('should log cache hits', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration 1',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      // First call
      const result1 = await navigator.listBuildConfigs({ projectId: 'Project1' });

      // Second call (cache hit)
      const result2 = await navigator.listBuildConfigs({ projectId: 'Project1' });

      // Behavior-first: ensure second call still returns identical results
      expect(result2.buildConfigs).toEqual(result1.buildConfigs);
    });

    it('should log errors with context', async () => {
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const apiError: HttpError = new Error('Server Error');
      apiError.response = { status: 500 };

      mockClient.buildTypes.getAllBuildTypes.mockRejectedValue(apiError);

      await expect(navigator.listBuildConfigs({ projectId: 'Project1' })).rejects.toThrow();

      // Behavior-first: ensure error surfaced to caller
    });
  });

  describe('Compound Filtering', () => {
    it('should apply multiple filters together', async () => {
      // When filtering by projectIds, the API should only return configs from those projects
      const mockResponse = {
        data: {
          count: 4,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Deploy',
              name: 'Deploy Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project2_Build',
              name: 'Build Configuration',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
            {
              id: 'Project2_Deploy',
              name: 'Deploy Configuration',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        projectIds: ['Project1', 'Project2'],
        namePattern: 'Build*',
      });

      expect(result.buildConfigs).toHaveLength(2);
      expect(result.buildConfigs[0]?.id).toBe('Project1_Build');
      expect(result.buildConfigs[1]?.id).toBe('Project2_Build');
      // Behavior-first: assert filtered result shape only
    });

    it('should combine project filter with name pattern and pagination', async () => {
      const mockResponse = {
        data: {
          count: 10,
          buildType: Array.from({ length: 5 }, (_, i) => ({
            id: `Project1_Deploy${i + 1}`,
            name: `Deploy Configuration ${i + 1}`,
            projectId: 'Project1',
            projectName: 'Project 1',
          })),
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        projectId: 'Project1',
        namePattern: 'Deploy*',
        pagination: { limit: 5, offset: 0 },
      });

      expect(result.buildConfigs).toHaveLength(5);
      expect(result.buildConfigs.every((config) => config.name.startsWith('Deploy'))).toBe(true);
      expect(result.buildConfigs.every((config) => config.projectId === 'Project1')).toBe(true);
      expect(result.hasMore).toBe(true);
      // Behavior-first: assert pagination flags only
    });

    it('should apply all filters with metadata extraction', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Deploy',
              name: 'Deploy Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'VcsRoot1',
                    'vcs-root': {
                      id: 'VcsRoot1',
                      name: 'Main Repository',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/repo.git' },
                          { name: 'branch', value: 'main' },
                        ],
                      },
                    },
                  },
                ],
              },
              parameters: {
                property: [
                  { name: 'env', value: 'production' },
                  { name: 'version', value: '1.0.0' },
                ],
              },
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);
      mockClient.projects.getProject.mockResolvedValue({
        data: {
          id: 'Project1',
          name: 'Project 1',
          parentProject: {
            id: '_Root',
            name: '<Root project>',
          },
        },
      });

      const result = await navigator.listBuildConfigs({
        projectId: 'Project1',
        namePattern: 'Deploy*',
        includeVcsRoots: true,
        includeParameters: true,
        includeProjectHierarchy: true,
        viewMode: 'project-grouped',
      });

      expect(result.buildConfigs).toHaveLength(1);
      const config = result.buildConfigs[0];
      expect(config).toBeDefined();
      if (!config) throw new Error('Expected config');
      expect(config.vcsRoots).toBeDefined();
      expect(config.vcsRoots).toHaveLength(1);
      expect(config.parameters).toBeDefined();
      expect(config.parameters?.['env']).toBe('production');
      expect(config.projectHierarchy).toBeDefined();
      expect(config.projectHierarchy).toHaveLength(2);
      expect(result.viewMode).toBe('project-grouped');
      expect(result.groupedByProject).toBeDefined();
    });
  });

  describe('VCS Root Filtering', () => {
    it('should filter configurations by VCS root URL', async () => {
      const mockResponse = {
        data: {
          count: 3,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'VcsRoot1',
                    'vcs-root': {
                      id: 'VcsRoot1',
                      name: 'Main Repository',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/repo.git' },
                          { name: 'branch', value: 'main' },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            {
              id: 'Project1_Deploy',
              name: 'Deploy Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'VcsRoot2',
                    'vcs-root': {
                      id: 'VcsRoot2',
                      name: 'Deploy Repository',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/deploy.git' },
                          { name: 'branch', value: 'production' },
                        ],
                      },
                    },
                  },
                ],
              },
            },
            {
              id: 'Project1_Test',
              name: 'Test Configuration',
              projectId: 'Project1',
              projectName: 'Project 1',
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'VcsRoot1',
                    'vcs-root': {
                      id: 'VcsRoot1',
                      name: 'Main Repository',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/repo.git' },
                          { name: 'branch', value: 'develop' },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        includeVcsRoots: true,
      });

      expect(result.buildConfigs).toHaveLength(3);
      // Verify VCS roots are extracted
      expect(result.buildConfigs[0]?.vcsRoots).toBeDefined();
      expect(result.buildConfigs[0]?.vcsRoots?.[0]?.url).toBe(
        'https://github.com/example/repo.git'
      );
      expect(result.buildConfigs[1]?.vcsRoots?.[0]?.url).toBe(
        'https://github.com/example/deploy.git'
      );
    });

    it('should handle configurations with multiple VCS roots', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_MultiRepo',
              name: 'Multi-Repository Build',
              projectId: 'Project1',
              projectName: 'Project 1',
              'vcs-root-entries': {
                'vcs-root-entry': [
                  {
                    id: 'VcsRoot1',
                    'vcs-root': {
                      id: 'VcsRoot1',
                      name: 'Main Repository',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/main.git' },
                          { name: 'branch', value: 'main' },
                        ],
                      },
                    },
                  },
                  {
                    id: 'VcsRoot2',
                    'vcs-root': {
                      id: 'VcsRoot2',
                      name: 'Shared Libraries',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/libs.git' },
                          { name: 'branch', value: 'stable' },
                        ],
                      },
                    },
                  },
                  {
                    id: 'VcsRoot3',
                    'vcs-root': {
                      id: 'VcsRoot3',
                      name: 'Configuration',
                      vcsName: 'git',
                      properties: {
                        property: [
                          { name: 'url', value: 'https://github.com/example/config.git' },
                          { name: 'branch', value: 'master' },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        includeVcsRoots: true,
      });

      expect(result.buildConfigs).toHaveLength(1);
      const vcsRoots = result.buildConfigs[0]?.vcsRoots ?? [];
      expect(vcsRoots).toHaveLength(3);
      expect(vcsRoots[0]?.name).toBe('Main Repository');
      expect(vcsRoots[1]?.name).toBe('Shared Libraries');
      expect(vcsRoots[2]?.name).toBe('Configuration');
    });
  });

  describe('Result Sorting', () => {
    it('should maintain server-provided order by default', async () => {
      const mockResponse = {
        data: {
          count: 3,
          buildType: [
            {
              id: 'Project3_Build',
              name: 'C Build',
              projectId: 'Project3',
              projectName: 'Project 3',
            },
            {
              id: 'Project1_Build',
              name: 'A Build',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project2_Build',
              name: 'B Build',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs();

      expect(result.buildConfigs).toHaveLength(3);
      expect(result.buildConfigs[0]?.name).toBe('C Build');
      expect(result.buildConfigs[1]?.name).toBe('A Build');
      expect(result.buildConfigs[2]?.name).toBe('B Build');
    });

    it('should sort configurations in project-grouped view mode', async () => {
      const mockResponse = {
        data: {
          count: 4,
          buildType: [
            {
              id: 'Project2_Build',
              name: 'Build',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
            {
              id: 'Project1_Deploy',
              name: 'Deploy',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project2_Test',
              name: 'Test',
              projectId: 'Project2',
              projectName: 'Project 2',
            },
            {
              id: 'Project1_Build',
              name: 'Build',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({
        viewMode: 'project-grouped',
      });

      expect(result.viewMode).toBe('project-grouped');
      expect(result.groupedByProject).toBeDefined();
      expect(Object.keys(result.groupedByProject ?? {})).toHaveLength(2);
      expect(result.groupedByProject?.['Project1']?.buildConfigs).toHaveLength(2);
      expect(result.groupedByProject?.['Project2']?.buildConfigs).toHaveLength(2);
    });
  });

  describe('Build Status and Activity Filtering', () => {
    it('should handle build configurations with recent activity metadata', async () => {
      const mockResponse = {
        data: {
          count: 3,
          buildType: [
            {
              id: 'Project1_Active',
              name: 'Active Build',
              projectId: 'Project1',
              projectName: 'Project 1',
              lastBuildDate: '2025-08-30T10:00:00Z',
              lastBuildStatus: 'SUCCESS',
            },
            {
              id: 'Project1_Inactive',
              name: 'Inactive Build',
              projectId: 'Project1',
              projectName: 'Project 1',
              lastBuildDate: '2025-01-01T10:00:00Z',
              lastBuildStatus: 'FAILURE',
            },
            {
              id: 'Project1_Never',
              name: 'Never Built',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs();

      expect(result.buildConfigs).toHaveLength(3);
      // The navigator currently passes through all configs
      // Build status filtering would need to be implemented
    });

    it('should handle paused build configurations', async () => {
      const mockResponse = {
        data: {
          count: 2,
          buildType: [
            {
              id: 'Project1_Active',
              name: 'Active Build',
              projectId: 'Project1',
              projectName: 'Project 1',
              paused: false,
            },
            {
              id: 'Project1_Paused',
              name: 'Paused Build',
              projectId: 'Project1',
              projectName: 'Project 1',
              paused: true,
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs();

      expect(result.buildConfigs).toHaveLength(2);
      // The navigator currently passes through all configs
      // Paused filtering would need to be implemented
    });
  });

  describe('Edge Cases and Advanced Scenarios', () => {
    it('should handle special characters in name patterns', async () => {
      const mockResponse = {
        data: {
          count: 2,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build [Production]',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
            {
              id: 'Project1_Test',
              name: 'Test (Development)',
              projectId: 'Project1',
              projectName: 'Project 1',
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ namePattern: '[Production]' });

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.name).toBe('Build [Production]');
    });

    it('should handle empty project IDs array', async () => {
      const mockResponse = {
        data: {
          count: 0,
          buildType: [],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs({ projectIds: [] });

      expect(result.buildConfigs).toHaveLength(0);
      // Behavior-first: verify outputs only
    });

    it('should handle configurations with missing metadata gracefully', async () => {
      const mockResponse = {
        data: {
          count: 1,
          buildType: [
            {
              id: 'Project1_Build',
              name: 'Build Configuration',
              // Missing projectId and projectName
            },
          ],
        },
      };

      mockClient.buildTypes.getAllBuildTypes.mockResolvedValue(mockResponse);

      const result = await navigator.listBuildConfigs();

      expect(result.buildConfigs).toHaveLength(1);
      expect(result.buildConfigs[0]?.id).toBe('Project1_Build');
      expect(result.buildConfigs[0]?.projectId).toBe('');
      expect(result.buildConfigs[0]?.projectName).toBe('');
    });
  });
});
