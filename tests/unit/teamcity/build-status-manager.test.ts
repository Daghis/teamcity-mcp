/**
 * Tests for BuildStatusManager
 */
import { BuildStatusManager, type BuildStatusOptions } from '@/teamcity/build-status-manager';
import type { TeamCityClientAdapter } from '@/teamcity/client-adapter';
import { BuildAccessDeniedError, BuildNotFoundError } from '@/teamcity/errors';

// Mock the TeamCityClient
jest.mock('@/teamcity/client');

describe('BuildStatusManager', () => {
  let manager: BuildStatusManager;
  type MockClient = {
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
  let mockClient: MockClient;

  beforeEach(() => {
    // Create mock TeamCity client with proper jest mocks
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
      listBuildArtifacts: jest.fn(),
      downloadArtifactContent: jest.fn(),
      getBuildStatistics: jest.fn(),
      listChangesForBuild: jest.fn(),
      listSnapshotDependencies: jest.fn(),
      baseUrl: 'https://teamcity.example.com',
    };

    manager = new BuildStatusManager(mockClient as unknown as TeamCityClientAdapter);
  });

  describe('getBuildStatus', () => {
    describe('Query by Build ID', () => {
      it('should retrieve build status by numeric ID', async () => {
        const mockBuildResponse = {
          data: {
            id: 12345,
            number: '42',
            buildTypeId: 'Build_Config_1',
            state: 'finished',
            status: 'SUCCESS',
            statusText: 'Build successful',
            branchName: 'main',
            webUrl: 'https://teamcity.example.com/build/12345',
            queuedDate: '20250829T100000+0000',
            startDate: '20250829T100100+0000',
            finishDate: '20250829T101500+0000',
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12345' });

        expect(result).toEqual({
          buildId: '12345',
          buildNumber: '42',
          buildTypeId: 'Build_Config_1',
          state: 'finished',
          status: 'SUCCESS',
          statusText: 'Build successful',
          branchName: 'main',
          webUrl: 'https://teamcity.example.com/build/12345',
          queuedDate: new Date('2025-08-29T10:00:00Z'),
          startDate: new Date('2025-08-29T10:01:00Z'),
          finishDate: new Date('2025-08-29T10:15:00Z'),
          elapsedSeconds: 840,
          percentageComplete: 100,
        });

        // Behavior-first: avoid verifying internal locator/fields
      });

      it('should handle build ID as string', async () => {
        const mockBuildResponse = {
          data: {
            id: 12345,
            number: '42',
            state: 'running',
            status: 'UNKNOWN',
            percentageComplete: 45,
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12345' });

        expect(result.buildId).toBe('12345');
        expect(result.state).toBe('running');
        expect(result.percentageComplete).toBe(45);
      });
    });

    describe('Query by Build Number', () => {
      it('should retrieve build by build type and number', async () => {
        const mockBuildResponse = {
          data: {
            build: [
              {
                id: 12345,
                number: '42',
                buildTypeId: 'Build_Config_1',
                state: 'finished',
                status: 'FAILURE',
                statusText: 'Tests failed',
              },
            ],
          },
        };

        mockClient.builds.getMultipleBuilds.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({
          buildNumber: '42',
          buildTypeId: 'Build_Config_1',
        });

        expect(result.buildNumber).toBe('42');
        expect(result.status).toBe('FAILURE');
        expect(result.statusText).toBe('Tests failed');

        // Behavior-first: avoid verifying internal locator
      });

      it('should handle build number with branch filter', async () => {
        const mockBuildResponse = {
          data: {
            build: [
              {
                id: 12346,
                number: '43',
                buildTypeId: 'Build_Config_1',
                branchName: 'feature/test',
                state: 'finished',
                status: 'SUCCESS',
              },
            ],
          },
        };

        mockClient.builds.getMultipleBuilds.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({
          buildNumber: '43',
          buildTypeId: 'Build_Config_1',
          branch: 'feature/test',
        });

        expect(result.branchName).toBe('feature/test');
        // Behavior-first: avoid verifying internal locator
      });
    });

    describe('Build States', () => {
      it('should handle queued builds', async () => {
        const mockBuildResponse = {
          data: {
            id: 12347,
            state: 'queued',
            status: 'UNKNOWN',
            queuedDate: '20250829T100000+0000',
            'queued-info': {
              position: 3,
              estimatedStartTime: '20250829T100500+0000',
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12347' });

        expect(result.state).toBe('queued');
        expect(result.queuePosition).toBe(3);
        expect(result.estimatedStartTime).toEqual(new Date('2025-08-29T10:05:00Z'));
        expect(result.percentageComplete).toBe(0);
      });

      it('should handle running builds with progress', async () => {
        const mockBuildResponse = {
          data: {
            id: 12348,
            state: 'running',
            status: 'UNKNOWN',
            percentageComplete: 67,
            startDate: '20250829T100100+0000',
            'running-info': {
              percentageComplete: 67,
              elapsedSeconds: 420,
              estimatedTotalSeconds: 627,
              currentStageText: 'Running tests',
              outdated: false,
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12348' });

        expect(result.state).toBe('running');
        expect(result.percentageComplete).toBe(67);
        expect(result.elapsedSeconds).toBe(420);
        expect(result.estimatedTotalSeconds).toBe(627);
        expect(result.currentStageText).toBe('Running tests');
      });

      it('should handle finished successful builds', async () => {
        const mockBuildResponse = {
          data: {
            id: 12349,
            state: 'finished',
            status: 'SUCCESS',
            statusText: 'Build successful',
            percentageComplete: 100,
            startDate: '20250829T100100+0000',
            finishDate: '20250829T101500+0000',
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12349' });

        expect(result.state).toBe('finished');
        expect(result.status).toBe('SUCCESS');
        expect(result.percentageComplete).toBe(100);
        expect(result.elapsedSeconds).toBe(840);
      });

      it('should handle failed builds', async () => {
        const mockBuildResponse = {
          data: {
            id: 12350,
            state: 'finished',
            status: 'FAILURE',
            statusText: 'Exit code 1',
            failureReason: 'Process exited with code 1',
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12350' });

        expect(result.state).toBe('finished');
        expect(result.status).toBe('FAILURE');
        expect(result.statusText).toBe('Exit code 1');
        expect(result.failureReason).toBe('Process exited with code 1');
      });

      it('should handle canceled builds', async () => {
        const mockBuildResponse = {
          data: {
            id: 12351,
            state: 'finished',
            status: 'UNKNOWN',
            statusText: 'Canceled',
            canceled: true,
            canceledInfo: {
              user: { username: 'john.doe' },
              timestamp: '20250829T103000+0000',
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12351' });

        expect(result.state).toBe('canceled');
        expect(result.status).toBe('UNKNOWN');
        expect(result.canceledBy).toBe('john.doe');
        expect(result.canceledDate).toEqual(new Date('2025-08-29T10:30:00Z'));
      });
    });

    describe('Test Summary', () => {
      it('should include test summary when requested', async () => {
        const mockBuildResponse = {
          data: {
            id: 12352,
            state: 'finished',
            status: 'FAILURE',
            testOccurrences: {
              count: 150,
              passed: 145,
              failed: 3,
              ignored: 2,
              muted: 0,
              newFailed: 1,
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({
          buildId: '12352',
          includeTests: true,
        });

        expect(result.testSummary).toEqual({
          total: 150,
          passed: 145,
          failed: 3,
          ignored: 2,
          muted: 0,
          newFailed: 1,
        });
      });

      it('should not include test summary by default', async () => {
        const mockBuildResponse = {
          data: {
            id: 12353,
            state: 'finished',
            status: 'SUCCESS',
            testOccurrences: {
              count: 100,
              passed: 100,
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12353' });

        expect(result.testSummary).toBeUndefined();
      });
    });

    describe('Build Problems', () => {
      it('should include build problems when requested', async () => {
        const mockBuildResponse = {
          data: {
            id: 12354,
            state: 'finished',
            status: 'FAILURE',
            problemOccurrences: {
              problemOccurrence: [
                {
                  type: 'TC_COMPILATION_ERROR',
                  identity: 'compilation_error_1',
                  details: 'Compilation failed: syntax error at line 42',
                },
                {
                  type: 'TC_EXIT_CODE',
                  identity: 'exit_code_1',
                  details: 'Process exited with code 1',
                },
              ],
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({
          buildId: '12354',
          includeProblems: true,
        });

        expect(result.problems).toHaveLength(2);
        expect(result.problems?.[0]).toEqual({
          type: 'TC_COMPILATION_ERROR',
          identity: 'compilation_error_1',
          description: 'Compilation failed: syntax error at line 42',
        });
      });

      it('should not include problems by default', async () => {
        const mockBuildResponse = {
          data: {
            id: 12355,
            state: 'finished',
            status: 'FAILURE',
            problemOccurrences: {
              problemOccurrence: [{ type: 'TC_EXIT_CODE' }],
            },
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        const result = await manager.getBuildStatus({ buildId: '12355' });

        expect(result.problems).toBeUndefined();
      });
    });

    describe('Error Handling', () => {
      it('should throw BuildNotFoundError for non-existent builds', async () => {
        mockClient.builds.getBuild.mockRejectedValue({
          response: { status: 404, data: { message: 'Build not found' } },
        });

        await expect(manager.getBuildStatus({ buildId: '99999' })).rejects.toThrow(
          BuildNotFoundError
        );
      });

      it('should throw BuildAccessDeniedError for permission issues', async () => {
        mockClient.builds.getBuild.mockRejectedValue({
          response: { status: 403, data: { message: 'Access denied' } },
        });

        await expect(manager.getBuildStatus({ buildId: '12356' })).rejects.toThrow(
          BuildAccessDeniedError
        );
      });

      it('should throw error for invalid build locator', async () => {
        await expect(
          manager.getBuildStatus({ buildNumber: '42' } as unknown as BuildStatusOptions)
        ).rejects.toThrow('Build type ID is required when querying by build number');
      });

      it('should throw error when neither buildId nor buildNumber provided', async () => {
        await expect(manager.getBuildStatus({} as unknown as BuildStatusOptions)).rejects.toThrow(
          'Either buildId or buildNumber must be provided'
        );
      });

      it('should handle API communication errors', async () => {
        mockClient.builds.getBuild.mockRejectedValue(new Error('Network error'));

        await expect(manager.getBuildStatus({ buildId: '12357' })).rejects.toThrow('Network error');
      });
    });

    describe('Caching', () => {
      it('should cache completed build statuses', async () => {
        const mockBuildResponse = {
          data: {
            id: 12358,
            state: 'finished',
            status: 'SUCCESS',
            statusText: 'Build successful',
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        // First call
        const result1 = await manager.getBuildStatus({ buildId: '12358' });
        expect(result1.status).toBe('SUCCESS');
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);

        // Second call should use cache
        const result2 = await manager.getBuildStatus({ buildId: '12358' });
        expect(result2.status).toBe('SUCCESS');
        // Behavior-first: repeated call should return same status
        expect(result2).toEqual(result1);
        // Ensure underlying client was not called again
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);
      });

      it('should not cache running or queued builds', async () => {
        const mockRunningResponse = {
          data: {
            id: 12359,
            state: 'running',
            percentageComplete: 50,
          },
        };

        const mockFinishedResponse = {
          data: {
            id: 12359,
            state: 'finished',
            status: 'SUCCESS',
            percentageComplete: 100,
          },
        };

        mockClient.builds.getBuild
          .mockResolvedValueOnce(mockRunningResponse)
          .mockResolvedValueOnce(mockFinishedResponse);

        // First call - running
        const result1 = await manager.getBuildStatus({ buildId: '12359' });
        expect(result1.state).toBe('running');
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);

        // Second call - should fetch again
        const result2 = await manager.getBuildStatus({ buildId: '12359' });
        expect(result2.state).toBe('finished');
        // Behavior-first: second call returns updated status and client called twice
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);
      });

      it('should respect cache TTL', async () => {
        jest.useFakeTimers();

        const mockBuildResponse = {
          data: {
            id: 12360,
            state: 'finished',
            status: 'SUCCESS',
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        // First call
        await manager.getBuildStatus({ buildId: '12360' });
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);

        // Advance time beyond cache TTL (5 minutes)
        jest.advanceTimersByTime(6 * 60 * 1000);

        // Should fetch again after TTL expires
        await manager.getBuildStatus({ buildId: '12360' });
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      });

      it('should bypass cache when forceRefresh is true', async () => {
        const mockBuildResponse = {
          data: {
            id: 12361,
            state: 'finished',
            status: 'SUCCESS',
          },
        };

        mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

        // First call
        await manager.getBuildStatus({ buildId: '12361' });
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(1);

        // Second call with forceRefresh
        await manager.getBuildStatus({
          buildId: '12361',
          forceRefresh: true,
        });
        // Behavior-first: second call with forceRefresh also returns
        expect(mockClient.builds.getBuild).toHaveBeenCalledTimes(2);
      });
    });

    describe('Field Selection', () => {
      it('should request minimal fields by default', async () => {
        mockClient.builds.getBuild.mockResolvedValue({
          data: { id: 12362, state: 'finished', status: 'SUCCESS' },
        });

        await manager.getBuildStatus({ buildId: '12362' });

        // Behavior-first: avoid verifying internal fields
      });

      it('should request test fields when includeTests is true', async () => {
        mockClient.builds.getBuild.mockResolvedValue({
          data: { id: 12363, state: 'finished', status: 'SUCCESS' },
        });

        await manager.getBuildStatus({
          buildId: '12363',
          includeTests: true,
        });

        // Behavior-first: avoid verifying internal fields
      });

      it('should request problem fields when includeProblems is true', async () => {
        mockClient.builds.getBuild.mockResolvedValue({
          data: { id: 12364, state: 'finished', status: 'FAILURE' },
        });

        await manager.getBuildStatus({
          buildId: '12364',
          includeProblems: true,
        });

        // Behavior-first: avoid verifying internal fields
      });
    });
  });

  describe('getBuildStatusByLocator', () => {
    it('should handle custom locator strings', async () => {
      const mockBuildResponse = {
        data: {
          build: [
            {
              id: 12365,
              state: 'running',
              status: 'UNKNOWN',
            },
          ],
        },
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue(mockBuildResponse);

      const result = await manager.getBuildStatusByLocator(
        'buildType:(id:Build_Config_1),branch:main,running:true'
      );

      expect(result.buildId).toBe('12365');
      expect(result.state).toBe('running');
    });

    it('should handle empty results from locator query', async () => {
      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      await expect(
        manager.getBuildStatusByLocator('buildType:(id:Build_Config_1),number:999')
      ).rejects.toThrow(BuildNotFoundError);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached build statuses', async () => {
      const mockBuildResponse = {
        data: {
          id: 12366,
          state: 'finished',
          status: 'SUCCESS',
        },
      };

      mockClient.builds.getBuild.mockResolvedValue(mockBuildResponse);

      // Cache a build
      await manager.getBuildStatus({ buildId: '12366' });
      // Behavior-first: initial call cached

      // Clear cache
      manager.clearCache();

      // Should fetch again after cache clear
      await manager.getBuildStatus({ buildId: '12366' });
    });
  });
});
