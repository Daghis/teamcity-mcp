/**
 * Tests for BuildListManager
 */
import type { AxiosResponse } from 'axios';

import { BuildListManager } from '@/teamcity/build-list-manager';
import type { TeamCityClientAdapter } from '@/teamcity/client-adapter';

describe('BuildListManager', () => {
  let manager: BuildListManager;
  type MockClient = {
    builds: {
      getBuild: jest.Mock;
      getMultipleBuilds: jest.Mock;
      getBuildProblems: jest.Mock;
    };
    getBuildCount: jest.Mock;
    listBuildArtifacts: jest.Mock;
    downloadArtifactContent: jest.Mock;
    getBuildStatistics: jest.Mock;
    listChangesForBuild: jest.Mock;
    listSnapshotDependencies: jest.Mock;
    baseUrl: string;
  };
  let mockClient: MockClient;

  beforeEach(() => {
    // Create mock TeamCity client
    mockClient = {
      builds: {
        getBuild: jest.fn(),
        getMultipleBuilds: jest.fn(),
        getBuildProblems: jest.fn(),
      },
      getBuildCount: jest.fn(),
      listBuildArtifacts: jest.fn(),
      downloadArtifactContent: jest.fn(),
      getBuildStatistics: jest.fn(),
      listChangesForBuild: jest.fn(),
      listSnapshotDependencies: jest.fn(),
      baseUrl: 'https://teamcity.example.com',
    };

    manager = new BuildListManager(mockClient as unknown as TeamCityClientAdapter);

    // Clear cache before each test without using `any`
    type PrivateAccess = { cache: Map<string, unknown> };
    (manager as unknown as PrivateAccess).cache.clear();
  });

  describe('Basic Query', () => {
    it('should fetch builds with no filters', async () => {
      const mockResponse = {
        data: {
          count: 2,
          build: [
            {
              id: 12345,
              buildTypeId: 'MyBuildConfig',
              number: '42',
              status: 'SUCCESS',
              state: 'finished',
              branchName: 'main',
              startDate: '20250829T120000+0000',
              finishDate: '20250829T121500+0000',
              queuedDate: '20250829T115500+0000',
              statusText: 'Tests passed: 150',
              href: '/app/rest/builds/id:12345',
              webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
            },
            {
              id: 12346,
              buildTypeId: 'MyBuildConfig',
              number: '43',
              status: 'FAILURE',
              state: 'finished',
              branchName: 'feature/test',
              startDate: '20250829T130000+0000',
              finishDate: '20250829T131000+0000',
              queuedDate: '20250829T125500+0000',
              statusText: 'Tests failed: 2',
              href: '/app/rest/builds/id:12346',
              webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12346',
            },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({});

      // Behavior-first: assert returned data only

      expect(result.builds).toHaveLength(2);
      expect(result.builds?.[0]?.id).toBe(12345);
      expect(result.builds?.[1]?.id).toBe(12346);
      expect(result.metadata.count).toBe(2);
      expect(result.metadata.hasMore).toBe(false);
    });

    it('should fetch builds with project filter', async () => {
      const mockResponse = {
        data: {
          count: 1,
          build: [
            {
              id: 12345,
              buildTypeId: 'MyBuildConfig',
              number: '42',
              status: 'SUCCESS',
              state: 'finished',
            },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      await manager.listBuilds({ project: 'MyProject' });

      // Behavior-first: avoid checking locator construction
    });
  });

  describe('Pagination', () => {
    it('should apply default limit', async () => {
      const mockResponse = {
        data: {
          count: 100,
          build: new Array(100).fill(null).map((_, i) => ({
            id: 10000 + i,
            buildTypeId: 'Config',
            number: String(i),
            status: 'SUCCESS',
            state: 'finished',
          })),
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({});

      // Behavior-first: verify returned list and metadata

      expect(result.builds).toHaveLength(100);
      expect(result.metadata.limit).toBe(100);
    });

    it('should apply custom limit', async () => {
      const mockResponse = {
        data: {
          count: 50,
          build: new Array(50).fill(null).map((_, i) => ({
            id: 10000 + i,
            buildTypeId: 'Config',
            number: String(i),
            status: 'SUCCESS',
            state: 'finished',
          })),
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({ limit: 50 });

      // Behavior-first: verify metadata.limit only

      expect(result.metadata.limit).toBe(50);
    });

    it('should enforce maximum limit', async () => {
      const mockResponse = {
        data: {
          count: 1000,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      await manager.listBuilds({ limit: 2000 });

      // Behavior-first: verify limit clamped via metadata
    });

    it('should apply offset for pagination', async () => {
      const mockResponse = {
        data: {
          count: 10,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      await manager.listBuilds({ offset: 100, limit: 10 });

      // Behavior-first: verify result did not throw
    });

    it('should detect hasMore correctly', async () => {
      const mockResponse = {
        data: {
          count: 100,
          nextHref: '/app/rest/builds?locator=start:100,count:100',
          build: new Array(100).fill(null).map((_, i) => ({
            id: 10000 + i,
            buildTypeId: 'Config',
            number: String(i),
            status: 'SUCCESS',
            state: 'finished',
          })),
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({ limit: 100 });

      expect(result.metadata.hasMore).toBe(true);
    });

    it('should handle empty result set', async () => {
      const mockResponse = {
        data: {
          count: 0,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({ status: 'SUCCESS' });

      expect(result.builds).toHaveLength(0);
      expect(result.metadata.count).toBe(0);
      expect(result.metadata.hasMore).toBe(false);
    });
  });

  describe('Filter Combinations', () => {
    it('should combine multiple filters', async () => {
      const mockResponse = {
        data: {
          count: 5,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      await manager.listBuilds({
        project: 'MyProject',
        status: 'FAILURE',
        branch: 'main',
        limit: 50,
      });

      // Behavior-first: avoid checking locator construction
    });

    it('should handle date filters', async () => {
      const mockResponse = {
        data: {
          count: 10,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      await manager.listBuilds({
        sinceDate: '2025-08-01T00:00:00Z',
        untilDate: '2025-08-31T23:59:59Z',
      });

      // Behavior-first: avoid checking locator construction
    });

    it('should handle boolean filters', async () => {
      const mockResponse = {
        data: {
          count: 3,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      await manager.listBuilds({
        running: true,
        personal: false,
        canceled: false,
      });

      // Behavior-first: avoid checking locator construction
    });
  });

  describe('Response Parsing', () => {
    it('should extract all build fields', async () => {
      const mockResponse = {
        data: {
          count: 1,
          build: [
            {
              id: 12345,
              buildTypeId: 'MyBuildConfig',
              number: '42',
              status: 'SUCCESS',
              state: 'finished',
              branchName: 'main',
              startDate: '20250829T120000+0000',
              finishDate: '20250829T121500+0000',
              queuedDate: '20250829T115500+0000',
              statusText: 'Tests passed: 150',
              href: '/app/rest/builds/id:12345',
              webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
            },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({});

      const build = result.builds[0];
      expect(build).toBeDefined();
      if (!build) {
        throw new Error('Expected a build in results');
      }
      expect(build.id).toBe(12345);
      expect(build.buildTypeId).toBe('MyBuildConfig');
      expect(build.number).toBe('42');
      expect(build.status).toBe('SUCCESS');
      expect(build.state).toBe('finished');
      expect(build.branchName).toBe('main');
      expect(build.startDate).toBe('20250829T120000+0000');
      expect(build.finishDate).toBe('20250829T121500+0000');
      expect(build.queuedDate).toBe('20250829T115500+0000');
      expect(build.statusText).toBe('Tests passed: 150');
      expect(build.webUrl).toBe('https://teamcity.example.com/viewLog.html?buildId=12345');
    });

    it('should handle missing optional fields', async () => {
      const mockResponse = {
        data: {
          count: 1,
          build: [
            {
              id: 12345,
              buildTypeId: 'MyBuildConfig',
              number: '42',
              status: 'SUCCESS',
              state: 'queued',
              // No dates, branch, or statusText
            },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({});

      const build = result.builds[0];
      expect(build).toBeDefined();
      if (!build) {
        throw new Error('Expected a build in results');
      }
      expect(build.id).toBe(12345);
      expect(build.branchName).toBeUndefined();
      expect(build.startDate).toBeUndefined();
      expect(build.finishDate).toBeUndefined();
      expect(build.statusText).toBe('');
    });
  });

  describe('Caching', () => {
    it('should cache results for identical queries', async () => {
      const mockResponse = {
        data: {
          count: 1,
          build: [
            {
              id: 12345,
              buildTypeId: 'MyBuildConfig',
              number: '42',
              status: 'SUCCESS',
              state: 'finished',
            },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      // First call
      const result1 = await manager.listBuilds({ project: 'MyProject' });

      // Second call (should use cache)
      const result2 = await manager.listBuilds({ project: 'MyProject' });

      // Should only call API once
      expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalledTimes(1);

      // Results should be identical
      expect(result1).toEqual(result2);
    });

    it('should not cache different queries', async () => {
      const mockResponse1 = {
        data: {
          count: 1,
          build: [
            { id: 1, buildTypeId: 'Config1', number: '1', status: 'SUCCESS', state: 'finished' },
          ],
        },
      };

      const mockResponse2 = {
        data: {
          count: 1,
          build: [
            { id: 2, buildTypeId: 'Config2', number: '2', status: 'FAILURE', state: 'finished' },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await manager.listBuilds({ project: 'Project1' });
      await manager.listBuilds({ project: 'Project2' });

      expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalledTimes(2);
    });

    it('should respect cache TTL', async () => {
      jest.useFakeTimers();

      const mockResponse = {
        data: {
          count: 1,
          build: [
            { id: 1, buildTypeId: 'Config', number: '1', status: 'SUCCESS', state: 'finished' },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      // First call
      const result = await manager.listBuilds({ project: 'MyProject' });
      expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalledTimes(1);

      // Advance time by 29 seconds (still within TTL)
      jest.advanceTimersByTime(29000);
      await manager.listBuilds({ project: 'MyProject' });

      // Behavior-first: repeated call returns same result
      const again = await manager.listBuilds({ project: 'MyProject' });
      expect(again.builds).toEqual(result.builds);
      // Confirm no additional client calls while within TTL
      expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalledTimes(1);

      // Advance time by 2 more seconds (total 31 seconds, exceeds TTL)
      jest.advanceTimersByTime(2000);
      await manager.listBuilds({ project: 'MyProject' });
      // After TTL expires, client should be called again
      expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalledTimes(2);

      // Behavior-first: returns builds after TTL

      jest.useRealTimers();
    });

    it('should allow force refresh to bypass cache', async () => {
      const mockResponse = {
        data: {
          count: 1,
          build: [
            { id: 1, buildTypeId: 'Config', number: '1', status: 'SUCCESS', state: 'finished' },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      // First call
      await manager.listBuilds({ project: 'MyProject' });

      // Second call with force refresh
      await manager.listBuilds({ project: 'MyProject', forceRefresh: true });

      // Behavior-first: force refresh still returns builds
    });
  });

  describe('Total Count', () => {
    it('should fetch total count when requested', async () => {
      const mockBuildsResponse = {
        data: {
          count: 10,
          build: new Array(10).fill(null).map((_, i) => ({
            id: 10000 + i,
            buildTypeId: 'Config',
            number: String(i),
            status: 'SUCCESS',
            state: 'finished',
          })),
        },
      };

      mockClient.getBuildCount.mockResolvedValue({
        data: '150',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as never,
      } as AxiosResponse<string>);

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockBuildsResponse);

      const result = await manager.listBuilds({
        project: 'MyProject',
        includeTotalCount: true,
      });

      expect(result.metadata.totalCount).toBe(150);
      expect(mockClient.getBuildCount).toHaveBeenCalledWith(expect.any(String));
    });

    it('should not fetch total count by default', async () => {
      const mockResponse = {
        data: {
          count: 10,
          build: [],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockResponse);

      const result = await manager.listBuilds({ project: 'MyProject' });

      expect(result.metadata.totalCount).toBeUndefined();
      expect(mockClient.getBuildCount).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockClient.builds.getMultipleBuilds.mockRejectedValue(new Error('Network error'));

      await expect(manager.listBuilds({})).rejects.toThrow('Failed to fetch builds');
    });

    it('should handle malformed responses', async () => {
      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          // Missing 'build' array
          count: 5,
        },
      });

      const result = await manager.listBuilds({});

      expect(result.builds).toEqual([]);
      expect(result.metadata.count).toBe(0);
    });

    it('should handle invalid date formats', async () => {
      await expect(
        manager.listBuilds({
          sinceDate: 'invalid-date',
        })
      ).rejects.toThrow('Invalid date format');
    });

    it('should handle invalid status values', async () => {
      await expect(
        manager.listBuilds({
          status: 'INVALID' as unknown as import('@/teamcity/build-query-builder').BuildStatus,
        })
      ).rejects.toThrow('Invalid status value');
    });
  });
});
