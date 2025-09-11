/**
 * Tests for BuildResultsManager
 */
import axios from 'axios';

import { BuildResultsManager } from '@/teamcity/build-results-manager';
import type { TeamCityClient } from '@/teamcity/client';

jest.mock('axios');

describe('BuildResultsManager', () => {
  let manager: BuildResultsManager;
  let mockClient: { builds: { getBuild: jest.Mock } };

  beforeEach(() => {
    // Create mock TeamCity client
    mockClient = {
      builds: {
        getBuild: jest.fn(),
      },
    };

    // Mock axios for direct API calls
    const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
    mockedAxios.get = jest.fn().mockResolvedValue({ data: {} });

    manager = new BuildResultsManager(mockClient as unknown as TeamCityClient);

    // Clear cache before each test without using `any`
    type PrivateAccess = { cache: Map<string, unknown> };
    (manager as unknown as PrivateAccess).cache.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Build Summary Retrieval', () => {
    it('should fetch basic build information', async () => {
      const mockBuild = {
        data: {
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
          triggered: {
            type: 'user',
            user: { username: 'developer', name: 'John Doe' },
            date: '20250829T115500+0000',
          },
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      const result = await manager.getBuildResults('12345');

      expect(mockClient.builds.getBuild).toHaveBeenCalledWith('id:12345', expect.any(String));

      expect(result.build.id).toBe(12345);
      expect(result.build.number).toBe('42');
      expect(result.build.status).toBe('SUCCESS');
      expect(result.build.triggered?.type).toBe('user');
      expect(result.build.triggered?.user).toBe('developer');
    });

    it('should handle builds without optional fields', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      const result = await manager.getBuildResults('12345');

      expect(result.build.id).toBe(12345);
      expect(result.build.branchName).toBeUndefined();
      expect(result.build.startDate).toBeUndefined();
      expect(result.build.triggered).toBeUndefined();
    });

    it('should calculate build duration when dates are available', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          startDate: '20250829T120000+0000',
          finishDate: '20250829T121500+0000',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      const result = await manager.getBuildResults('12345');

      expect(result.build.duration).toBe(900000); // 15 minutes in milliseconds
    });
  });

  describe('Artifact Management', () => {
    it('should fetch artifact listing when requested', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      const mockArtifacts = {
        file: [
          {
            name: 'app.jar',
            fullName: 'target/app.jar',
            size: 10485760,
            modificationTime: '20250829T121400+0000',
            href: '/app/rest/builds/id:12345/artifacts/metadata/target/app.jar',
            content: { href: '/app/rest/builds/id:12345/artifacts/content/target/app.jar' },
          },
          {
            name: 'test-report.html',
            fullName: 'reports/test-report.html',
            size: 524288,
            modificationTime: '20250829T121430+0000',
            href: '/app/rest/builds/id:12345/artifacts/metadata/reports/test-report.html',
            content: {
              href: '/app/rest/builds/id:12345/artifacts/content/reports/test-report.html',
            },
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: mockArtifacts });

      const result = await manager.getBuildResults('12345', { includeArtifacts: true });

      expect(result.artifacts).toHaveLength(2);
      const a0 = result.artifacts?.[0];
      const a1 = result.artifacts?.[1];
      expect(a0?.name).toBe('app.jar');
      expect(a0?.path).toBe('target/app.jar');
      expect(a0?.size).toBe(10485760);
      expect(a1?.name).toBe('test-report.html');
    });

    it('should filter artifacts by pattern', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      const mockArtifacts = {
        file: [
          {
            name: 'app.jar',
            fullName: 'target/app.jar',
            size: 10485760,
            modificationTime: '20250829T121400+0000',
          },
          {
            name: 'lib.jar',
            fullName: 'target/lib.jar',
            size: 2097152,
            modificationTime: '20250829T121400+0000',
          },
          {
            name: 'test-report.html',
            fullName: 'reports/test-report.html',
            size: 524288,
            modificationTime: '20250829T121430+0000',
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: mockArtifacts });

      const result = await manager.getBuildResults('12345', {
        includeArtifacts: true,
        artifactFilter: '*.jar',
      });

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts?.[0]?.name).toBe('app.jar');
      expect(result.artifacts?.[1]?.name).toBe('lib.jar');
    });

    it('should include base64 content for small artifacts', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      const mockArtifacts = {
        file: [
          {
            name: 'version.txt',
            fullName: 'version.txt',
            size: 10,
            modificationTime: '20250829T121400+0000',
            content: { href: '/app/rest/builds/id:12345/artifacts/content/version.txt' },
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get
        .mockResolvedValueOnce({ data: mockArtifacts })
        .mockResolvedValueOnce({ data: '1.0.0' });

      const result = await manager.getBuildResults('12345', {
        includeArtifacts: true,
        downloadArtifacts: ['version.txt'],
        maxArtifactSize: 1024,
      });

      expect(result.artifacts?.[0]?.content).toBe('MS4wLjA='); // Base64 of '1.0.0'
    });
  });

  describe('Statistics Extraction', () => {
    it('should fetch build statistics when requested', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      const mockStatistics = {
        property: [
          { name: 'BuildDuration', value: '95000' },
          { name: 'TestCount', value: '150' },
          { name: 'PassedTestCount', value: '148' },
          { name: 'FailedTestCount', value: '2' },
          { name: 'IgnoredTestCount', value: '0' },
          { name: 'CodeCoverageL', value: '85.5' },
          { name: 'CodeCoverageB', value: '92.3' },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: mockStatistics });

      const result = await manager.getBuildResults('12345', { includeStatistics: true });

      expect(result.statistics?.buildDuration).toBe(95000);
      expect(result.statistics?.testCount).toBe(150);
      expect(result.statistics?.passedTests).toBe(148);
      expect(result.statistics?.failedTests).toBe(2);
      expect(result.statistics?.ignoredTests).toBe(0);
      expect(result.statistics?.codeCoverage).toBe(92.3); // Takes the higher of L and B coverage
    });

    it('should handle missing statistics gracefully', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: { property: [] } });

      const result = await manager.getBuildResults('12345', { includeStatistics: true });

      expect(result.statistics).toEqual({});
    });
  });

  describe('Dependencies Tracking', () => {
    it('should fetch build dependencies when requested', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      const mockDependencies = {
        build: [
          {
            id: 12340,
            number: '41',
            buildTypeId: 'CoreLib',
            status: 'SUCCESS',
          },
          {
            id: 12342,
            number: '38',
            buildTypeId: 'AuthModule',
            status: 'SUCCESS',
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: mockDependencies });

      const result = await manager.getBuildResults('12345', { includeDependencies: true });

      expect(result.dependencies).toHaveLength(2);
      const dep0 = result.dependencies?.[0];
      expect(dep0).toBeDefined();
      if (!dep0) {
        throw new Error('Expected first dependency');
      }
      expect(dep0.buildId).toBe(12340);
      expect(dep0.buildNumber).toBe('41');
      expect(dep0.buildTypeId).toBe('CoreLib');
      expect(dep0.status).toBe('SUCCESS');
    });

    it('should handle missing dependencies gracefully', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: { build: [] } });

      const result = await manager.getBuildResults('12345', { includeDependencies: true });

      expect(result.dependencies).toEqual([]);
    });
  });

  describe('Change Tracking', () => {
    it('should fetch VCS changes when requested', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      const mockChanges = {
        change: [
          {
            id: 567,
            version: 'abc123def456',
            username: 'developer',
            date: '20250829T110000+0000',
            comment: 'Fix authentication bug',
            files: {
              file: [
                { name: 'src/Auth.java', changeType: 'edited' },
                { name: 'test/AuthTest.java', changeType: 'added' },
              ],
            },
          },
          {
            id: 568,
            version: 'def456ghi789',
            username: 'another.dev',
            date: '20250829T111500+0000',
            comment: 'Update dependencies',
            files: {
              file: [{ name: 'pom.xml', changeType: 'edited' }],
            },
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);
      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockResolvedValue({ data: mockChanges });

      const result = await manager.getBuildResults('12345', { includeChanges: true });

      expect(result.changes).toHaveLength(2);
      const ch0 = result.changes?.[0];
      expect(ch0).toBeDefined();
      if (!ch0) {
        throw new Error('Expected first change');
      }
      expect(ch0.revision).toBe('abc123def456');
      expect(ch0.author).toBe('developer');
      expect(ch0.comment).toBe('Fix authentication bug');
      expect(ch0.files).toHaveLength(2);
    });
  });

  describe('Parallel Data Fetching', () => {
    it('should fetch multiple data types in parallel', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      const axiosGetSpy = mockedAxios.get
        .mockResolvedValueOnce({ data: { file: [] } }) // artifacts
        .mockResolvedValueOnce({ data: { property: [] } }) // statistics
        .mockResolvedValueOnce({ data: { change: [] } }); // changes

      const startTime = Date.now();

      await manager.getBuildResults('12345', {
        includeArtifacts: true,
        includeStatistics: true,
        includeChanges: true,
      });

      const endTime = Date.now();

      // All three API calls should be made
      expect(axiosGetSpy).toHaveBeenCalledTimes(3);

      // Should execute in parallel (not take 3x the time)
      expect(endTime - startTime).toBeLessThan(100); // Should be fast in tests
    });
  });

  describe('Caching', () => {
    it('should cache results for completed builds', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      // First call
      await manager.getBuildResults('12345');

      // Second call should use cache
      await manager.getBuildResults('12345');

      // Should only call API once
      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);
    });

    it('should not cache results for running builds', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'running',
          statusText: 'Tests running...',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      // First call
      await manager.getBuildResults('12345');

      // Second call should not use cache
      await manager.getBuildResults('12345');

      // Should call API twice
      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);
    });

    it('should respect cache TTL', async () => {
      jest.useFakeTimers();

      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      // First call
      await manager.getBuildResults('12345');

      // Advance time by 9 minutes (still within TTL)
      jest.advanceTimersByTime(9 * 60 * 1000);
      await manager.getBuildResults('12345');

      // Should still use cache
      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);

      // Advance time by 2 more minutes (total 11 minutes, exceeds TTL)
      jest.advanceTimersByTime(2 * 60 * 1000);
      await manager.getBuildResults('12345');

      // Should make new API call
      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should handle build not found errors', async () => {
      mockClient.builds.getBuild.mockRejectedValue(new Error('Build not found'));

      await expect(manager.getBuildResults('99999')).rejects.toThrow('Build not found');
    });

    it('should handle network errors gracefully', async () => {
      mockClient.builds.getBuild.mockRejectedValue(new Error('Network error'));

      await expect(manager.getBuildResults('12345')).rejects.toThrow(
        'Failed to fetch build results'
      );
    });

    it('should handle artifact fetch errors without failing entire request', async () => {
      const mockBuild = {
        data: {
          id: 12345,
          buildTypeId: 'MyBuildConfig',
          number: '42',
          status: 'SUCCESS',
          state: 'finished',
          statusText: 'Build completed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild);

      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      mockedAxios.get.mockRejectedValue(new Error('Artifact API error'));

      const result = await manager.getBuildResults('12345', { includeArtifacts: true });

      // Should return build data even if artifacts fail
      expect(result.build.id).toBe(12345);
      expect(result.artifacts).toEqual([]);
    });
  });
});
