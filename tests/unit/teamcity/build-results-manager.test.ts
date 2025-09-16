import { BuildResultsManager } from '@/teamcity/build-results-manager';
import type { TeamCityClientAdapter } from '@/teamcity/client-adapter';

type MockAdapter = {
  modules: {
    builds: {
      getBuild: jest.Mock;
      getMultipleBuilds: jest.Mock;
      getBuildProblems: jest.Mock;
    };
  };
  request: jest.Mock;
  builds: {
    getBuild: jest.Mock;
    getMultipleBuilds: jest.Mock;
    getBuildProblems: jest.Mock;
  };
  listBuildArtifacts: jest.Mock;
  downloadArtifactContent: jest.Mock;
  getBuildStatistics: jest.Mock;
  listChangesForBuild: jest.Mock;
  listSnapshotDependencies: jest.Mock;
  baseUrl: string;
};

describe('BuildResultsManager', () => {
  let manager: BuildResultsManager;
  let mockClient: MockAdapter;

  beforeEach(() => {
    const builds = {
      getBuild: jest.fn(),
      getMultipleBuilds: jest.fn(),
      getBuildProblems: jest.fn(),
    };

    mockClient = {
      modules: {
        builds,
      },
      request: jest.fn(),
      builds,
      listBuildArtifacts: jest.fn().mockResolvedValue({ data: {} }),
      downloadArtifactContent: jest.fn().mockResolvedValue({ data: new ArrayBuffer(0) }),
      getBuildStatistics: jest.fn().mockResolvedValue({ data: { property: [] } }),
      listChangesForBuild: jest.fn().mockResolvedValue({ data: {} }),
      listSnapshotDependencies: jest.fn().mockResolvedValue({ data: {} }),
      baseUrl: 'https://teamcity.example.com',
    };

    manager = new BuildResultsManager(mockClient as unknown as TeamCityClientAdapter);
    type PrivateAccess = { cache: Map<string, unknown> };
    (manager as unknown as PrivateAccess).cache.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const basicBuild = () => ({
    data: {
      id: 12345,
      buildTypeId: 'MyBuildConfig',
      number: '42',
      status: 'SUCCESS',
      state: 'finished',
      statusText: 'Build completed',
      webUrl: 'https://teamcity.example.com/viewLog.html?buildId=12345',
    },
  });

  describe('Build Summary Retrieval', () => {
    it('returns normalized build information', async () => {
      const mockBuild = {
        data: {
          ...basicBuild().data,
          branchName: 'main',
          queuedDate: '20250829T115500+0000',
          startDate: '20250829T120000+0000',
          finishDate: '20250829T121500+0000',
          triggered: {
            type: 'user',
            user: { username: 'developer', name: 'John Doe' },
            date: '20250829T115500+0000',
          },
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);

      const result = await manager.getBuildResults('12345');

      expect(mockClient.builds.getBuild).toHaveBeenCalledWith('id:12345', expect.any(String));
      expect(result.build.id).toBe(12345);
      expect(result.build.branchName).toBe('main');
      expect(result.build.triggered?.user).toBe('developer');
    });

    it('handles missing optional fields', async () => {
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);

      const result = await manager.getBuildResults('12345');

      expect(result.build.branchName).toBeUndefined();
      expect(result.build.triggered).toBeUndefined();
    });

    it('computes duration from start and finish dates', async () => {
      const mockBuild = {
        data: {
          ...basicBuild().data,
          startDate: '20250829T120000+0000',
          finishDate: '20250829T121500+0000',
        },
      };
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);

      const result = await manager.getBuildResults('12345');
      expect(result.build.duration).toBe(15 * 60 * 1000);
    });
  });

  describe('Artifact Management', () => {
    it('lists artifacts when requested', async () => {
      const mockBuild = basicBuild();
      const mockArtifacts = {
        file: [
          {
            name: 'app.jar',
            fullName: 'target/app.jar',
            size: 10485760,
            modificationTime: '20250829T121400+0000',
            content: { href: '/app/rest/builds/id:12345/artifacts/content/target/app.jar' },
          },
          {
            name: 'test-report.html',
            fullName: 'reports/test-report.html',
            size: 524288,
            modificationTime: '20250829T121430+0000',
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listBuildArtifacts.mockResolvedValue({ data: mockArtifacts } as never);

      const result = await manager.getBuildResults('12345', { includeArtifacts: true });

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts?.[0]?.name).toBe('app.jar');
    });

    it('filters artifacts using glob patterns', async () => {
      const mockBuild = basicBuild();
      const mockArtifacts = {
        file: [
          { name: 'app.jar', fullName: 'target/app.jar' },
          { name: 'lib.jar', fullName: 'target/lib.jar' },
          { name: 'notes.txt', fullName: 'docs/notes.txt' },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listBuildArtifacts.mockResolvedValue({ data: mockArtifacts } as never);

      const result = await manager.getBuildResults('12345', {
        includeArtifacts: true,
        artifactFilter: '*.jar',
      });

      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts?.map((a) => a?.name)).toEqual(['app.jar', 'lib.jar']);
    });

    it('embeds base64 content for small downloads', async () => {
      const mockBuild = basicBuild();
      const mockArtifacts = {
        file: [
          {
            name: 'version.txt',
            fullName: 'version.txt',
            size: 10,
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listBuildArtifacts.mockResolvedValue({ data: mockArtifacts } as never);
      const payload = Buffer.from('1.0.0');
      mockClient.downloadArtifactContent.mockResolvedValue({ data: payload } as never);

      const result = await manager.getBuildResults('12345', {
        includeArtifacts: true,
        downloadArtifacts: ['version.txt'],
        maxArtifactSize: 1024,
      });

      expect(result.artifacts?.[0]?.content).toBe(Buffer.from('1.0.0').toString('base64'));
    });

    it('skips downloads when artifact exceeds max size', async () => {
      const mockBuild = basicBuild();
      const mockArtifacts = {
        file: [
          {
            name: 'large.zip',
            fullName: 'large.zip',
            size: 5 * 1024 * 1024,
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listBuildArtifacts.mockResolvedValue({ data: mockArtifacts } as never);

      await manager.getBuildResults('12345', {
        includeArtifacts: true,
        downloadArtifacts: ['large.zip'],
        maxArtifactSize: 1024,
      });

      expect(mockClient.downloadArtifactContent).not.toHaveBeenCalled();
    });

    it('ignores download failures gracefully', async () => {
      const mockBuild = basicBuild();
      const mockArtifacts = {
        file: [
          {
            name: 'info.txt',
            fullName: 'info.txt',
            size: 10,
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listBuildArtifacts.mockResolvedValue({ data: mockArtifacts } as never);
      mockClient.downloadArtifactContent.mockRejectedValueOnce(new Error('download failed'));

      const result = await manager.getBuildResults('12345', {
        includeArtifacts: true,
        downloadArtifacts: ['info.txt'],
      });

      expect(result.artifacts?.[0]?.content).toBeUndefined();
    });
  });

  describe('Statistics Extraction', () => {
    it('maps TeamCity properties to friendly names', async () => {
      const mockBuild = basicBuild();
      const statsPayload = {
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

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.getBuildStatistics.mockResolvedValue({ data: statsPayload } as never);

      const result = await manager.getBuildResults('12345', { includeStatistics: true });

      expect(result.statistics?.buildDuration).toBe(95000);
      expect(result.statistics?.testCount).toBe(150);
      expect(result.statistics?.codeCoverage).toBe(92.3);
    });

    it('returns empty object when no stats available', async () => {
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.getBuildStatistics.mockResolvedValue({ data: { property: [] } } as never);

      const result = await manager.getBuildResults('12345', { includeStatistics: true });
      expect(result.statistics).toEqual({});
    });
  });

  describe('Dependencies Tracking', () => {
    it('normalizes snapshot dependencies', async () => {
      const mockBuild = basicBuild();
      const depsPayload = {
        build: [
          { id: 12340, number: '41', buildTypeId: 'CoreLib', status: 'SUCCESS' },
          { id: 12342, number: '38', buildTypeId: 'AuthModule', status: 'SUCCESS' },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listSnapshotDependencies.mockResolvedValue({ data: depsPayload } as never);

      const result = await manager.getBuildResults('12345', { includeDependencies: true });

      expect(result.dependencies).toHaveLength(2);
      expect(result.dependencies?.[0]?.buildId).toBe(12340);
    });

    it('returns empty array when dependencies missing', async () => {
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listSnapshotDependencies.mockResolvedValue({ data: { build: [] } } as never);

      const result = await manager.getBuildResults('12345', { includeDependencies: true });
      expect(result.dependencies).toEqual([]);
    });
  });

  describe('Change Tracking', () => {
    it('maps VCS changes payload', async () => {
      const mockBuild = basicBuild();
      const changePayload = {
        change: [
          {
            version: 'abc123',
            username: 'alice',
            date: '20250829T120000+0000',
            comment: 'Fix issue',
            files: { file: [{ name: 'src/app.ts', changeType: 'MODIFIED' }] },
          },
        ],
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listChangesForBuild.mockResolvedValue({ data: changePayload } as never);

      const result = await manager.getBuildResults('12345', { includeChanges: true });

      expect(result.changes).toHaveLength(1);
      expect(result.changes?.[0]?.files?.[0]?.path).toBe('src/app.ts');
    });

    it('handles empty change responses', async () => {
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listChangesForBuild.mockResolvedValue({ data: {} } as never);

      const result = await manager.getBuildResults('12345', { includeChanges: true });
      expect(result.changes).toEqual([]);
    });
  });

  describe('Caching Behaviour', () => {
    it('caches finished build results', async () => {
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);

      await manager.getBuildResults('12345');
      await manager.getBuildResults('12345');

      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);
    });

    it('does not cache running builds', async () => {
      const runningBuild = {
        data: {
          ...basicBuild().data,
          state: 'running',
        },
      };
      mockClient.builds.getBuild.mockResolvedValue(runningBuild as never);

      await manager.getBuildResults('12345');
      await manager.getBuildResults('12345');

      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);
    });

    it('expires cache entries after TTL', async () => {
      jest.useFakeTimers();
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);

      await manager.getBuildResults('12345');
      jest.advanceTimersByTime(9 * 60 * 1000);
      await manager.getBuildResults('12345');

      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(2 * 60 * 1000);
      await manager.getBuildResults('12345');

      expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('surfaces not found errors directly', async () => {
      mockClient.builds.getBuild.mockRejectedValue(new Error('Build not found'));
      await expect(manager.getBuildResults('99999')).rejects.toThrow('Build not found');
    });

    it('wraps unknown errors with friendly message', async () => {
      mockClient.builds.getBuild.mockRejectedValue(new Error('Network error'));
      await expect(manager.getBuildResults('12345')).rejects.toThrow(
        'Failed to fetch build results: Network error'
      );
    });

    it('keeps core data when artifacts request fails', async () => {
      const mockBuild = basicBuild();
      mockClient.builds.getBuild.mockResolvedValue(mockBuild as never);
      mockClient.listBuildArtifacts.mockRejectedValue(new Error('Artifact API error'));

      const result = await manager.getBuildResults('12345', { includeArtifacts: true });

      expect(result.build.id).toBe(12345);
      expect(result.artifacts).toEqual([]);
    });
  });
});
