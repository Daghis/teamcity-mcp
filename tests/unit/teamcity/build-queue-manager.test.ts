/**
 * Tests for Build Queue Manager
 */
import { ResolvedBuildConfiguration } from '@/teamcity/build-configuration-resolver';
import { ParameterSet, ParameterType } from '@/teamcity/build-parameters-manager';
import {
  BuildQueueManager,
  BuildStatus,
  QueueBuildOptions,
  QueuedBuild,
} from '@/teamcity/build-queue-manager';

import { createAxiosError, createNetworkError, createServerError } from '../../test-utils/errors';
import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

// Helper to wrap response in Axios format
const wrapResponse = <T>(data: T) => ({ data });

// Helper to create a mock parameter set
const createMockParameterSet = (params?: Record<string, string>): ParameterSet => {
  const paramSet = new ParameterSet();
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      paramSet.setParameter({
        name,
        value,
        type: ParameterType.CONFIGURATION,
        source: 'user',
      });
    }
  }
  return paramSet;
};

// Helper to create mock build configuration
const createMockBuildConfig = (
  overrides?: Partial<ResolvedBuildConfiguration>
): ResolvedBuildConfiguration => ({
  id: 'Build1',
  name: 'Test Build',
  projectId: 'Project1',
  projectName: 'Test Project',
  description: 'Test build configuration',
  vcsRootIds: ['VcsRoot1'],
  templateFlag: false,
  paused: false,
  allowPersonalBuilds: false,
  webUrl: 'https://teamcity.example.com/viewType.html?buildTypeId=Build1',
  ...overrides,
});

describe('BuildQueueManager', () => {
  let manager: BuildQueueManager;
  let mockClient: MockTeamCityClient;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockTeamCityClient();
    manager = new BuildQueueManager(mockClient);
  });

  describe('Single Build Queueing', () => {
    it('should queue a simple build', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet({
        'env.TEST': 'value',
      });

      mockClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12345,
          buildTypeId: 'Build1',
          state: 'queued',
          branchName: 'refs/heads/main',
          href: '/app/rest/buildQueue/id:12345',
          webUrl: 'https://teamcity.example.com/viewQueued.html?itemId=12345',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));

      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        branch: 'refs/heads/main',
      });

      expect(result.buildId).toBe('12345');
      expect(result.buildTypeId).toBe('Build1');
      expect(result.webUrl).toBe('https://teamcity.example.com/viewQueued.html?itemId=12345');
      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          buildType: { id: 'Build1' },
          branchName: 'refs/heads/main',
        })
      );
    });

    it('should queue a build with custom comment', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12346,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        comment: 'Triggered by PR #123',
      });

      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          comment: { text: 'Triggered by PR #123' },
        })
      );
    });

    it('should queue a personal build', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12347,
          buildTypeId: 'Build1',
          personal: true,
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        personal: true,
      });

      expect(result.personal).toBe(true);
      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          personal: true,
        })
      );
    });

    it('should handle queueing errors', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Mock should reject, and since it's not a 4xx error, it will be retried and eventually thrown
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const serverError: HttpError = new Error('Access denied');
      serverError.response = { status: 500 }; // Server error will be retried
      mockClient.buildQueue.addBuildToQueue
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError); // Retry up to 3 times

      await expect(
        manager.queueBuild({
          buildConfiguration: buildConfig,
          parameters,
        })
      ).rejects.toThrow('Access denied');
    });

    it('should move build to top of queue when requested', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12348,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12349', buildTypeId: 'Build2' },
            { id: '12348', buildTypeId: 'Build1' },
          ],
        })
      );

      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.buildQueue.setQueuedBuildsOrder.mockResolvedValue({});

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        moveToTop: true,
      });

      expect(result.buildId).toBe('12348');
      expect(mockClient.buildQueue.setQueuedBuildsOrder).toHaveBeenCalledWith(undefined, {
        build: [{ id: 12348 }],
      });
    });
  });

  describe('Batch Build Queueing', () => {
    it('should queue multiple builds in batch', async () => {
      const builds: QueueBuildOptions[] = [
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build1' }),
          parameters: createMockParameterSet({ 'env.VAR': 'value1' }),
        },
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build2' }),
          parameters: createMockParameterSet({ 'env.VAR': 'value2' }),
        },
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build3' }),
          parameters: createMockParameterSet({ 'env.VAR': 'value3' }),
        },
      ];

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      mockClient.buildQueue.addBuildToQueue
        .mockResolvedValueOnce(
          wrapResponse({
            id: 101,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        )
        .mockResolvedValueOnce(
          wrapResponse({
            id: 102,
            buildTypeId: 'Build2',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        )
        .mockResolvedValueOnce(
          wrapResponse({
            id: 103,
            buildTypeId: 'Build3',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        );

      const results = await manager.queueBuilds(builds);

      expect(results).toHaveLength(3);
      expect(results[0]?.buildId).toBe('101');
      expect(results[1]?.buildId).toBe('102');
      expect(results[2]?.buildId).toBe('103');
      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(3);
    });

    it('should handle partial batch failures', async () => {
      const builds: QueueBuildOptions[] = [
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build1' }),
          parameters: createMockParameterSet(),
        },
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build2' }),
          parameters: createMockParameterSet(),
        },
      ];

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      mockClient.buildQueue.addBuildToQueue
        .mockResolvedValueOnce(
          wrapResponse({
            id: 201,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        )
        .mockRejectedValueOnce(new Error('Queue limit exceeded'));

      const results = await manager.queueBuilds(builds);

      expect(results).toHaveLength(1);
      expect(results[0]?.buildId).toBe('201');
    });
  });

  describe('Build Dependencies', () => {
    it('should queue builds with dependencies', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 401,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
          'snapshot-dependencies': {
            build: [{ id: '400' }],
          },
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        dependencies: [{ buildId: '400', waitForFinish: true }],
      });

      expect(result.buildId).toBe('401');
      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          'snapshot-dependencies': {
            build: [{ id: '400' }],
          },
        })
      );
    });

    it('should detect circular dependencies', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      await expect(
        manager.queueBuild({
          buildConfiguration: buildConfig,
          parameters,
          dependencies: [
            { buildId: '500' },
            { buildId: '500' }, // Duplicate
          ],
        })
      ).rejects.toThrow('Circular dependency detected');
    });
  });

  describe('Queue Position Management', () => {
    it('should get queue position for a build', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            { id: '12346', buildTypeId: 'Build2' },
            { id: '12347', buildTypeId: 'Build3' },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12346');

      expect(position.buildId).toBe('12346');
      expect(position.position).toBe(2);
      expect(position.canMoveToTop).toBe(true);
    });

    it('should move build to top of queue', async () => {
      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            { id: '12346', buildTypeId: 'Build2' },
          ],
        })
      );

      mockClient.buildQueue.setQueuedBuildsOrder.mockResolvedValueOnce({});

      await manager.moveToTop('12346');

      expect(mockClient.buildQueue.setQueuedBuildsOrder).toHaveBeenCalledWith(undefined, {
        build: [{ id: 12346 }],
      });
    });

    it('should reorder queue', async () => {
      const buildIds = ['12347', '12345', '12346'];

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            { id: '12346', buildTypeId: 'Build2' },
            { id: '12347', buildTypeId: 'Build3' },
          ],
        })
      );

      mockClient.buildQueue.setQueuedBuildsOrder.mockResolvedValueOnce({});

      await manager.reorderQueue(buildIds);

      expect(mockClient.buildQueue.setQueuedBuildsOrder).toHaveBeenCalledWith(undefined, {
        build: buildIds.map((id) => ({ id: parseInt(id) })),
      });
    });

    it('should not move build with dependencies to top', async () => {
      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            {
              id: '12346',
              buildTypeId: 'Build2',
              'snapshot-dependencies': {
                build: [{ id: '12345' }],
              },
            },
          ],
        })
      );

      await expect(manager.moveToTop('12346')).rejects.toThrow(
        'Cannot move to top: blocked by builds 12345'
      );
    });
  });

  describe('Build Status Monitoring', () => {
    it('should get build status', async () => {
      mockClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'running',
          status: 'SUCCESS',
          statusText: 'Tests passed',
          percentageComplete: 75,
          'running-info': {
            currentStageText: 'Running tests',
            elapsedSeconds: 120,
            estimatedTotalSeconds: 160,
          },
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await manager.getBuildStatus('700');

      expect(status.buildId).toBe('700');
      expect(status.state).toBe('running');
      expect(status.status).toBe('SUCCESS');
      expect(status.percentageComplete).toBe(75);
      expect(status.currentStageText).toBe('Running tests');
    });

    it('should monitor build progress', async () => {
      const statusUpdates: BuildStatus[] = [];

      mockClient.builds.getBuild
        .mockResolvedValueOnce(
          wrapResponse({
            id: '701',
            state: 'queued',
            webUrl: 'https://teamcity.example.com/viewQueued.html?itemId=701',
          })
        )
        .mockResolvedValueOnce(
          wrapResponse({
            id: '701',
            state: 'running',
            status: 'SUCCESS',
            percentageComplete: 50,
            webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
          })
        )
        .mockResolvedValueOnce(
          wrapResponse({
            id: '701',
            state: 'finished',
            status: 'SUCCESS',
            statusText: 'Build successful',
            webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
          })
        );

      const completed = new Promise<void>((resolve) => {
        manager.once('build:completed', () => resolve());
      });

      await manager.monitorBuild(
        '701',
        (status) => {
          statusUpdates.push(status);
        },
        { pollInterval: 10 }
      );

      await completed;

      expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
      expect(statusUpdates[statusUpdates.length - 1]?.state).toBe('finished');
    });

    it('should cancel a build', async () => {
      mockClient.buildQueue.cancelQueuedBuild.mockResolvedValueOnce({});

      await manager.cancelBuild('12345', 'No longer needed');

      expect(mockClient.buildQueue.cancelQueuedBuild).toHaveBeenCalledWith('12345');
    });
  });

  describe('Queue Limitations', () => {
    it('should get queue limitations', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: {
            property: [{ name: 'maximumConcurrentBuilds', value: '3' }],
          },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '801', buildTypeId: 'Build1' },
            { id: '802', buildTypeId: 'Build1' },
          ],
        })
      );

      freshClient.builds.getAllBuilds.mockResolvedValueOnce(wrapResponse({ count: 1 }));
      freshClient.agents.getAllAgents.mockResolvedValueOnce(wrapResponse({ count: 5 }));

      const limitations = await freshManager.getQueueLimitations('Build1');

      expect(limitations.maxConcurrentBuilds).toBe(3);
      expect(limitations.currentlyRunning).toBe(1);
      expect(limitations.queuedBuilds).toBe(2);
      expect(limitations.availableAgents).toBe(5);
    });

    it('should prevent queueing when max concurrent builds reached', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      // Set up all mocks needed for getQueueLimitations
      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: {
            property: [{ name: 'maximumConcurrentBuilds', value: '1' }],
          },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));

      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 1 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 1 }));

      await expect(
        freshManager.queueBuild({
          buildConfiguration: buildConfig,
          parameters,
        })
      ).rejects.toThrow('Maximum concurrent builds (1) reached');
    });
  });

  describe('Error Handling and Retries', () => {
    it('should retry on transient failures', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      mockClient.buildQueue.addBuildToQueue
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockRejectedValueOnce({ response: { status: 503 } })
        .mockResolvedValueOnce(
          wrapResponse({
            id: 900,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        );

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.buildId).toBe('900');
      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const clientError: HttpError = new Error('Forbidden');
      clientError.response = { status: 403, data: { message: 'Forbidden' } };
      mockClient.buildQueue.addBuildToQueue.mockRejectedValueOnce(clientError);

      await expect(
        manager.queueBuild({
          buildConfiguration: buildConfig,
          parameters,
        })
      ).rejects.toThrow('Forbidden');

      expect(mockClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Emissions', () => {
    it('should emit build:queued event', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();
      let emittedEvent: { buildId: string } | null = null;

      manager.on('build:queued', (event) => {
        emittedEvent = event;
      });

      mockClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 1000,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(emittedEvent).toBeTruthy();
      expect((emittedEvent as unknown as { buildId: string }).buildId).toBe('1000');
    });

    it('should emit build:error event on failure', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();
      let emittedError: { error?: string } | null = null;

      manager.on('build:error', (event) => {
        emittedError = event;
      });

      mockClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Mock should reject, and since it's not a 4xx error, it will be retried and eventually thrown
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const serverError: HttpError = new Error('Queue error');
      serverError.response = { status: 500 }; // Server error will be retried
      mockClient.buildQueue.addBuildToQueue
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError); // Retry up to 3 times

      await expect(
        manager.queueBuild({
          buildConfiguration: buildConfig,
          parameters,
        })
      ).rejects.toThrow();

      expect(emittedError).toBeTruthy();
      expect((emittedError as unknown as { error?: string }).error).toBe('Queue error');
    });
  });

  describe('Constructor Options Fallbacks', () => {
    it('should use default values when options are undefined', () => {
      const managerWithDefaults = new BuildQueueManager(mockClient);
      // The manager should be created without errors; defaults are used internally
      expect(managerWithDefaults).toBeInstanceOf(BuildQueueManager);
    });

    it('should use default values when options object is empty', () => {
      const managerWithEmpty = new BuildQueueManager(mockClient, {});
      expect(managerWithEmpty).toBeInstanceOf(BuildQueueManager);
    });

    it('should use provided options over defaults', () => {
      const customManager = new BuildQueueManager(mockClient, {
        maxRetries: 5,
        retryDelay: 2000,
        pollingInterval: 10000,
      });
      expect(customManager).toBeInstanceOf(BuildQueueManager);
    });

    it('should use partial options with remaining defaults', () => {
      const partialManager = new BuildQueueManager(mockClient, {
        maxRetries: 1,
        // retryDelay and pollingInterval use defaults
      });
      expect(partialManager).toBeInstanceOf(BuildQueueManager);
    });
  });

  describe('Queue Position Edge Cases', () => {
    it('should return position 0 for already running build', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      // First call returns empty queue (build not found)
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));

      // Then check if build is running/finished
      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '12345',
          state: 'running',
        })
      );

      const position = await freshManager.getQueuePosition('12345');

      expect(position.buildId).toBe('12345');
      expect(position.position).toBe(0);
      expect(position.canMoveToTop).toBe(false);
    });

    it('should return position 0 for already finished build', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '12346',
          state: 'finished',
        })
      );

      const position = await freshManager.getQueuePosition('12346');

      expect(position.position).toBe(0);
      expect(position.canMoveToTop).toBe(false);
    });

    it('should throw when build not found in queue and not running/finished', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '99999',
          state: 'queued', // Still queued but not in queue list - inconsistent state
        })
      );

      await expect(freshManager.getQueuePosition('99999')).rejects.toThrow(
        'Build 99999 not found in queue'
      );
    });

    it('should handle queue response with undefined build array', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      // Response with no build property
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({}));

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({ id: '12345', state: 'running' })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.position).toBe(0);
    });

    it('should handle queue response with null data', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce({ data: null });
      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({ id: '12345', state: 'finished' })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.position).toBe(0);
    });

    it('should handle entries with undefined id in queue', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { buildTypeId: 'Build1' }, // No id
            { id: '12346', buildTypeId: 'Build2' },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12346');
      expect(position.position).toBe(2);
    });

    it('should include estimatedStartTime when available', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            {
              id: '12345',
              buildTypeId: 'Build1',
              estimatedStartTime: '2024-06-15T12:00:00Z',
            },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.estimatedStartTime).toBeInstanceOf(Date);
      expect(position.estimatedStartTime?.toISOString()).toBe('2024-06-15T12:00:00.000Z');
    });

    it('should not include estimatedStartTime when missing', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [{ id: '12345', buildTypeId: 'Build1' }],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.estimatedStartTime).toBeUndefined();
    });

    it('should estimate wait time when waitReason includes "agent"', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12344', buildTypeId: 'Build0' },
            { id: '12345', buildTypeId: 'Build1', waitReason: 'Waiting for agent' },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.estimatedWaitTime).toBeDefined();
      expect(typeof position.estimatedWaitTime).toBe('number');
    });

    it('should not estimate wait time when waitReason does not include "agent"', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [{ id: '12345', buildTypeId: 'Build1', waitReason: 'Waiting for dependencies' }],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.estimatedWaitTime).toBeUndefined();
    });

    it('should not estimate wait time when waitReason is undefined', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [{ id: '12345', buildTypeId: 'Build1' }],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.estimatedWaitTime).toBeUndefined();
    });

    it('should wrap non-Error exceptions in getQueuePosition', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockRejectedValueOnce('string error');

      await expect(freshManager.getQueuePosition('12345')).rejects.toThrow(
        'Failed to get queue position: Unknown error'
      );
    });
  });

  describe('Move to Top Edge Cases', () => {
    it('should return current position when already at top', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [{ id: '12345', buildTypeId: 'Build1' }],
        })
      );

      const position = await freshManager.moveToTop('12345');

      expect(position.position).toBe(1);
      expect(freshClient.buildQueue.setQueuedBuildsOrder).not.toHaveBeenCalled();
    });

    it('should throw generic error when cannot move and no blockedBy', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      // Build at position 2 but canMoveToTop is false (due to blocking)
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12344', buildTypeId: 'Build0' },
            {
              id: '12345',
              buildTypeId: 'Build1',
              'snapshot-dependencies': { build: [{ id: '12344' }] },
            },
          ],
        })
      );

      await expect(freshManager.moveToTop('12345')).rejects.toThrow(
        'Cannot move to top: blocked by builds 12344'
      );
    });

    it('should wrap non-Error exceptions in moveToTop', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockRejectedValueOnce({ custom: 'error' });

      await expect(freshManager.moveToTop('12345')).rejects.toThrow('Failed to move build to top:');
    });
  });

  describe('Reorder Queue Edge Cases', () => {
    it('should throw when a build in reorder list is blocked', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            {
              id: '12346',
              buildTypeId: 'Build2',
              'snapshot-dependencies': { build: [{ id: '12345' }] },
            },
          ],
        })
      );

      await expect(freshManager.reorderQueue(['12346', '12345'])).rejects.toThrow(
        'Build 12346 is blocked by 12345'
      );
    });

    it('should wrap non-Error exceptions in reorderQueue', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockRejectedValueOnce(42);

      await expect(freshManager.reorderQueue(['12345'])).rejects.toThrow(
        'Failed to reorder queue:'
      );
    });
  });

  describe('Build Status Edge Cases', () => {
    it.each([
      ['queued', 'queued'],
      ['running', 'running'],
      ['finished', 'finished'],
      ['failed', 'failed'],
      ['canceled', 'canceled'],
      ['QUEUED', 'queued'],
      ['RUNNING', 'running'],
      ['unknown_state', 'queued'],
    ] as const)('should map state "%s" to "%s"', async (inputState, expectedState) => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: inputState,
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.state).toBe(expectedState);
    });

    it('should handle build with no running-info', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'queued',
          webUrl: 'https://teamcity.example.com/viewQueued.html?itemId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.currentStageText).toBeUndefined();
      expect(status.elapsedTime).toBeUndefined();
      expect(status.estimatedTotalTime).toBeUndefined();
    });

    it('should handle build with partial running-info', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'running',
          'running-info': {
            currentStageText: 'Compiling',
            // elapsedSeconds and estimatedTotalSeconds are missing
          },
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.currentStageText).toBe('Compiling');
      expect(status.elapsedTime).toBeUndefined();
      expect(status.estimatedTotalTime).toBeUndefined();
    });

    it('should convert running-info seconds to milliseconds', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'running',
          'running-info': {
            elapsedSeconds: 60,
            estimatedTotalSeconds: 120,
          },
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.elapsedTime).toBe(60000);
      expect(status.estimatedTotalTime).toBe(120000);
    });

    it('should handle build with artifacts', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'finished',
          artifacts: {
            count: 5,
            href: '/app/rest/builds/id:700/artifacts',
          },
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.artifacts).toEqual({
        count: 5,
        href: '/app/rest/builds/id:700/artifacts',
      });
    });

    it('should handle build with partial artifacts info', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'finished',
          artifacts: {}, // Empty artifacts object
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.artifacts).toEqual({ count: 0, href: '' });
    });

    it('should handle build with test occurrences', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'finished',
          testOccurrences: {
            count: 100,
            passed: 95,
            failed: 3,
            ignored: 2,
          },
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.tests).toEqual({
        count: 100,
        passed: 95,
        failed: 3,
        ignored: 2,
      });
    });

    it('should handle build with partial test occurrences', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'finished',
          testOccurrences: {}, // Empty test occurrences
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.tests).toEqual({
        count: 0,
        passed: 0,
        failed: 0,
        ignored: 0,
      });
    });

    it('should handle null response data in getBuildStatus', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce({ data: null });

      const status = await freshManager.getBuildStatus('700');
      expect(status.buildId).toBe('');
      expect(status.state).toBe('queued');
      expect(status.webUrl).toBe('');
    });

    it('should wrap non-Error exceptions in getBuildStatus', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockRejectedValueOnce(null);

      await expect(freshManager.getBuildStatus('700')).rejects.toThrow(
        'Failed to get build status: Unknown error'
      );
    });

    it('should parse startDate and finishDate when present', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'finished',
          startDate: '2024-06-15T10:00:00Z',
          finishDate: '2024-06-15T10:30:00Z',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.startDate).toBeInstanceOf(Date);
      expect(status.finishDate).toBeInstanceOf(Date);
    });

    it('should leave startDate and finishDate undefined when missing', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '700',
          state: 'queued',
          webUrl: 'https://teamcity.example.com/viewQueued.html?itemId=700',
        })
      );

      const status = await freshManager.getBuildStatus('700');
      expect(status.startDate).toBeUndefined();
      expect(status.finishDate).toBeUndefined();
    });
  });

  describe('Monitor Build Edge Cases', () => {
    it('should stop monitoring on failed state', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);
      const statusUpdates: BuildStatus[] = [];

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '701',
          state: 'failed',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      const completed = new Promise<void>((resolve) => {
        freshManager.once('build:completed', () => resolve());
      });

      await freshManager.monitorBuild('701', (status) => statusUpdates.push(status), {
        pollInterval: 10,
      });

      await completed;
      expect(statusUpdates[0]?.state).toBe('failed');
    });

    it('should stop monitoring on canceled state', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);
      const statusUpdates: BuildStatus[] = [];

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({
          id: '701',
          state: 'canceled',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      const completed = new Promise<void>((resolve) => {
        freshManager.once('build:completed', () => resolve());
      });

      await freshManager.monitorBuild('701', (status) => statusUpdates.push(status), {
        pollInterval: 10,
      });

      await completed;
      expect(statusUpdates[0]?.state).toBe('canceled');
    });

    it('should emit timeout event when monitoring exceeds timeout', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValue(
        wrapResponse({
          id: '701',
          state: 'running',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      const timeoutPromise = new Promise<{ buildId: string; timeout: number }>((resolve) => {
        freshManager.once('build:timeout', (event) => resolve(event));
      });

      await freshManager.monitorBuild('701', () => {}, {
        pollInterval: 5,
        timeout: 1, // Very short timeout
      });

      const timeoutEvent = await timeoutPromise;
      expect(timeoutEvent.buildId).toBe('701');
      expect(timeoutEvent.timeout).toBe(1);
    });

    it('should emit monitor:error and continue monitoring on error', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          wrapResponse({
            id: '701',
            state: 'finished',
            webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
          })
        );

      const errorPromise = new Promise<{ buildId: string; error: string }>((resolve) => {
        freshManager.once('monitor:error', (event) => resolve(event));
      });

      const completedPromise = new Promise<void>((resolve) => {
        freshManager.once('build:completed', () => resolve());
      });

      await freshManager.monitorBuild('701', () => {}, { pollInterval: 10 });

      const errorEvent = await errorPromise;
      expect(errorEvent.buildId).toBe('701');
      // Error is wrapped by getBuildStatus
      expect(errorEvent.error).toContain('Network error');

      await completedPromise;
    });

    it('should emit monitor:error with Unknown error for non-Error exceptions', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockRejectedValueOnce('string error').mockResolvedValueOnce(
        wrapResponse({
          id: '701',
          state: 'finished',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      const errorPromise = new Promise<{ buildId: string; error: string }>((resolve) => {
        freshManager.once('monitor:error', (event) => resolve(event));
      });

      await freshManager.monitorBuild('701', () => {}, { pollInterval: 10 });

      const errorEvent = await errorPromise;
      // Error is wrapped by getBuildStatus which handles non-Error exceptions
      expect(errorEvent.error).toContain('Unknown error');
    });

    it('should use default polling interval when options not provided', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient, { pollingInterval: 50 });

      freshClient.builds.getBuild.mockResolvedValue(
        wrapResponse({
          id: '701',
          state: 'finished',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      const completed = new Promise<void>((resolve) => {
        freshManager.once('build:completed', () => resolve());
      });

      await freshManager.monitorBuild('701', () => {});

      await completed;
    });

    it('should clear existing monitor before starting new one', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.builds.getBuild.mockResolvedValue(
        wrapResponse({
          id: '701',
          state: 'running',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      // Start first monitor
      await freshManager.monitorBuild('701', () => {}, { pollInterval: 100 });

      // Start second monitor (should clear first)
      freshClient.builds.getBuild.mockResolvedValue(
        wrapResponse({
          id: '701',
          state: 'finished',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      const completed = new Promise<void>((resolve) => {
        freshManager.once('build:completed', () => resolve());
      });

      await freshManager.monitorBuild('701', () => {}, { pollInterval: 10 });

      await completed;
    });
  });

  describe('Stop Monitoring Edge Cases', () => {
    it('should not emit event when stopping non-existent monitor', () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const stoppedHandler = jest.fn();
      freshManager.on('monitor:stopped', stoppedHandler);

      // Try to stop a monitor that doesn't exist
      freshManager.stopMonitoring('non-existent-build');

      expect(stoppedHandler).not.toHaveBeenCalled();
    });

    it('should emit monitor:stopped for each active monitor in stopAllMonitoring', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);
      const stoppedBuilds: string[] = [];

      freshClient.builds.getBuild.mockResolvedValue(
        wrapResponse({
          id: '701',
          state: 'running',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=701',
        })
      );

      freshManager.on('monitor:stopped', ({ buildId }) => stoppedBuilds.push(buildId));

      // Start multiple monitors
      await freshManager.monitorBuild('701', () => {}, { pollInterval: 1000 });

      freshClient.builds.getBuild.mockResolvedValue(
        wrapResponse({
          id: '702',
          state: 'running',
          webUrl: 'https://teamcity.example.com/viewLog.html?buildId=702',
        })
      );
      await freshManager.monitorBuild('702', () => {}, { pollInterval: 1000 });

      // Stop all
      freshManager.stopAllMonitoring();

      expect(stoppedBuilds).toContain('701');
      expect(stoppedBuilds).toContain('702');
    });

    it('should handle stopAllMonitoring with no active monitors', () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      // Should not throw
      expect(() => freshManager.stopAllMonitoring()).not.toThrow();
    });
  });

  describe('Cancel Build Edge Cases', () => {
    it('should wrap non-Error exceptions in cancelBuild', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.cancelQueuedBuild.mockRejectedValueOnce({ code: 'UNKNOWN' });

      await expect(freshManager.cancelBuild('12345')).rejects.toThrow(
        'Failed to cancel build: Unknown error'
      );
    });

    it('should emit build:canceled event without comment', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);
      let canceledEvent: { buildId: string; comment?: string } | null = null;

      freshManager.on('build:canceled', (event) => {
        canceledEvent = event;
      });

      freshClient.buildQueue.cancelQueuedBuild.mockResolvedValueOnce({});

      await freshManager.cancelBuild('12345');

      expect(canceledEvent).toEqual({ buildId: '12345', comment: undefined });
    });
  });

  describe('Queue Limitations Edge Cases', () => {
    it('should return undefined maxConcurrentBuilds when setting not found', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: {
            property: [{ name: 'otherSetting', value: 'value' }],
          },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValueOnce(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValueOnce(wrapResponse({ count: 1 }));

      const limitations = await freshManager.getQueueLimitations('Build1');
      expect(limitations.maxConcurrentBuilds).toBeUndefined();
    });

    it('should return undefined maxConcurrentBuilds when settings.property is undefined', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: {},
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValueOnce(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValueOnce(wrapResponse({ count: 1 }));

      const limitations = await freshManager.getQueueLimitations('Build1');
      expect(limitations.maxConcurrentBuilds).toBeUndefined();
    });

    it('should return default values on API error', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockRejectedValueOnce(
        createServerError('Internal error')
      );

      const limitations = await freshManager.getQueueLimitations('Build1');
      expect(limitations).toEqual({
        currentlyRunning: 0,
        queuedBuilds: 0,
        availableAgents: 1,
      });
    });

    it('should handle null count in running builds response', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValueOnce(wrapResponse({}));
      freshClient.agents.getAllAgents.mockResolvedValueOnce(wrapResponse({}));

      const limitations = await freshManager.getQueueLimitations('Build1');
      expect(limitations.currentlyRunning).toBe(0);
      expect(limitations.availableAgents).toBe(0);
    });

    it('should filter queued builds by buildTypeId', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '1', buildTypeId: 'Build1' },
            { id: '2', buildTypeId: 'Build2' },
            { id: '3', buildTypeId: 'Build1' },
          ],
        })
      );
      freshClient.builds.getAllBuilds.mockResolvedValueOnce(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValueOnce(wrapResponse({ count: 0 }));

      const limitations = await freshManager.getQueueLimitations('Build1');
      expect(limitations.queuedBuilds).toBe(2);
    });

    it('should handle queue entries with undefined buildTypeId', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '1' }, // No buildTypeId
            { id: '2', buildTypeId: 'Build1' },
          ],
        })
      );
      freshClient.builds.getAllBuilds.mockResolvedValueOnce(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValueOnce(wrapResponse({ count: 0 }));

      const limitations = await freshManager.getQueueLimitations('Build1');
      expect(limitations.queuedBuilds).toBe(1);
    });
  });

  describe('Personal Build Limit', () => {
    // Note: The personal build limit check in queueBuild requires:
    // - options.personal === true
    // - limitations.personalBuildLimit to be defined
    // - limitations.userPersonalBuilds to be defined
    // - limitations.userPersonalBuilds >= limitations.personalBuildLimit
    // Currently getQueueLimitations doesn't return personalBuildLimit or userPersonalBuilds
    // from the API, so this branch cannot be triggered without modifying the implementation.
    // This test documents that the branch exists but is effectively unreachable with current code.
    it('should allow personal builds when no limit is configured', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 1 }));

      freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12345,
          buildTypeId: 'Build1',
          personal: true,
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        personal: true,
      });

      expect(result.personal).toBe(true);
    });
  });

  describe('Retry Operation Edge Cases', () => {
    it('should not retry on 4xx errors', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockRejectedValue(
        createAxiosError({ status: 400, message: 'Bad Request' })
      );

      await expect(
        freshManager.queueBuild({ buildConfiguration: buildConfig, parameters })
      ).rejects.toThrow();

      expect(freshClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx errors up to maxRetries', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient, {
        maxRetries: 2,
        retryDelay: 1,
      });

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockRejectedValue(createServerError('Server error'));

      await expect(
        freshManager.queueBuild({ buildConfiguration: buildConfig, parameters })
      ).rejects.toThrow();

      // Initial attempt + 2 retries = 3 calls
      expect(freshClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient, {
        maxRetries: 1,
        retryDelay: 1,
      });

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue
        .mockRejectedValueOnce(createNetworkError())
        .mockResolvedValueOnce(
          wrapResponse({
            id: 123,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.buildId).toBe('123');
      expect(freshClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(2);
    });

    it('should emit retry event on each retry attempt', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient, {
        maxRetries: 2,
        retryDelay: 1,
      });

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();
      const retryEvents: Array<{ attempt: number; maxRetries: number; error: string }> = [];

      freshManager.on('retry', (event) => retryEvents.push(event));

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockRejectedValue(createServerError('Server error'));

      await expect(
        freshManager.queueBuild({ buildConfiguration: buildConfig, parameters })
      ).rejects.toThrow();

      expect(retryEvents).toHaveLength(2);
      expect(retryEvents[0]).toEqual({ attempt: 1, maxRetries: 2, error: 'Server error' });
      expect(retryEvents[1]).toEqual({ attempt: 2, maxRetries: 2, error: 'Server error' });
    });

    it('should handle errors without response property', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient, {
        maxRetries: 1,
        retryDelay: 1,
      });

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Error without response property - should be retried
      freshClient.buildQueue.addBuildToQueue
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(
          wrapResponse({
            id: 456,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.buildId).toBe('456');
    });

    it('should handle errors with response but undefined status', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient, {
        maxRetries: 1,
        retryDelay: 1,
      });

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Error with response but undefined status - should be retried
      const errorWithUndefinedStatus = new Error('Weird error') as Error & {
        response?: { status?: number };
      };
      errorWithUndefinedStatus.response = {};

      freshClient.buildQueue.addBuildToQueue
        .mockRejectedValueOnce(errorWithUndefinedStatus)
        .mockResolvedValueOnce(
          wrapResponse({
            id: 789,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.buildId).toBe('789');
    });
  });

  describe('Map to Queued Build Edge Cases', () => {
    it('should handle build with all undefined optional fields', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          // Minimal build - most fields undefined
        })
      );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.buildId).toBe('');
      expect(result.buildTypeId).toBe('');
      expect(result.branchName).toBeUndefined();
      expect(result.queuePosition).toBe(0);
      expect(result.webUrl).toBe('');
      expect(result.personal).toBe(false);
      expect(result.triggeredBy).toBe('system');
      expect(result.parameters).toEqual({});
    });

    it('should handle build with triggered user', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 123,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
          triggered: {
            user: {
              username: 'testuser',
            },
          },
        })
      );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.triggeredBy).toBe('testuser');
    });

    it('should handle build with triggered but no user', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 123,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
          triggered: {}, // No user
        })
      );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.triggeredBy).toBe('system');
    });

    it('should extract parameters from build properties', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 123,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
          properties: {
            property: [
              { name: 'env.VAR1', value: 'value1' },
              { name: 'env.VAR2', value: 'value2' },
            ],
          },
        })
      );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.parameters).toEqual({
        'env.VAR1': 'value1',
        'env.VAR2': 'value2',
      });
    });

    it('should handle estimated start time in queued build', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 123,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
          estimatedStartTime: '2024-01-01T10:30:00Z',
          estimatedDuration: 300,
        })
      );

      const result = await freshManager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
      });

      expect(result.estimatedStartTime).toBeInstanceOf(Date);
      expect(result.estimatedDuration).toBe(300);
    });
  });

  describe('Find Blocking Builds Edge Cases', () => {
    it('should return empty array when build not found in queue', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            { id: '12346', buildTypeId: 'Build2' },
          ],
        })
      );

      freshClient.builds.getBuild.mockResolvedValueOnce(
        wrapResponse({ id: '99999', state: 'running' })
      );

      // Build 99999 is not in queue but is running, so no blockedBy
      const position = await freshManager.getQueuePosition('99999');
      expect(position.blockedBy).toBeUndefined();
    });

    it('should handle snapshot-dependencies with build not in queue', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            {
              id: '12345',
              buildTypeId: 'Build1',
              'snapshot-dependencies': {
                build: [{ id: '99999' }], // Dependency not in queue
              },
            },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      // Dependency 99999 is not in queue, so not blocking
      expect(position.blockedBy).toBeUndefined();
      expect(position.canMoveToTop).toBe(false); // Already at position 1
    });

    it('should handle snapshot-dependencies with undefined id in dependency', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12344', buildTypeId: 'Build0' },
            {
              id: '12345',
              buildTypeId: 'Build1',
              'snapshot-dependencies': {
                build: [{ id: undefined }], // Dependency with undefined id
              },
            },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.blockedBy).toBeUndefined();
    });

    it('should handle snapshot-dependencies with null build array', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '12344', buildTypeId: 'Build0' },
            {
              id: '12345',
              buildTypeId: 'Build1',
              'snapshot-dependencies': { build: null },
            },
          ],
        })
      );

      const position = await freshManager.getQueuePosition('12345');
      expect(position.canMoveToTop).toBe(true);
    });
  });

  describe('Queue Build Error Emission', () => {
    it('should emit build:error with Unknown error for non-Error exceptions', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();
      let emittedError: { error?: string; buildConfiguration?: string } | null = null;

      freshManager.on('build:error', (event) => {
        emittedError = event;
      });

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Non-Error exception
      freshClient.buildQueue.addBuildToQueue.mockRejectedValue('string error');

      await expect(
        freshManager.queueBuild({ buildConfiguration: buildConfig, parameters })
      ).rejects.toBe('string error');

      expect(emittedError).toEqual({
        error: 'Unknown error',
        buildConfiguration: 'Build1',
      });
    });
  });

  describe('Batch Build Queueing Edge Cases', () => {
    it('should emit batch:partial event when some builds fail', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      interface BatchPartialEvent {
        successful: QueuedBuild[];
        failed: Array<{ index: number; error: unknown }>;
      }
      const receivedEvents: BatchPartialEvent[] = [];

      freshManager.on('batch:partial', (event: BatchPartialEvent) => {
        receivedEvents.push(event);
      });

      const builds: QueueBuildOptions[] = [
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build1' }),
          parameters: createMockParameterSet(),
        },
        {
          buildConfiguration: createMockBuildConfig({ id: 'Build2' }),
          parameters: createMockParameterSet(),
        },
      ];

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      freshClient.buildQueue.addBuildToQueue
        .mockResolvedValueOnce(
          wrapResponse({
            id: 101,
            buildTypeId: 'Build1',
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        )
        .mockRejectedValueOnce(createAxiosError({ status: 400, message: 'Invalid config' }));

      const results = await freshManager.queueBuilds(builds);

      expect(results).toHaveLength(1);
      expect(receivedEvents).toHaveLength(1);
      const event = receivedEvents[0];
      expect(event?.successful).toHaveLength(1);
      expect(event?.failed).toHaveLength(1);
      expect(event?.failed[0]?.index).toBe(1);
    });

    it('should handle more than 5 builds with batching', async () => {
      const freshClient = createMockTeamCityClient();
      const freshManager = new BuildQueueManager(freshClient);

      const builds: QueueBuildOptions[] = Array.from({ length: 7 }, (_, i) => ({
        buildConfiguration: createMockBuildConfig({ id: `Build${i}` }),
        parameters: createMockParameterSet(),
      }));

      freshClient.buildTypes.getBuildType.mockResolvedValue(
        wrapResponse({ id: 'Build1', settings: { property: [] } })
      );
      freshClient.buildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      freshClient.builds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      freshClient.agents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      for (let i = 0; i < 7; i++) {
        freshClient.buildQueue.addBuildToQueue.mockResolvedValueOnce(
          wrapResponse({
            id: 100 + i,
            buildTypeId: `Build${i}`,
            state: 'queued',
            queuedDate: '2024-01-01T10:00:00Z',
          })
        );
      }

      const results = await freshManager.queueBuilds(builds);

      expect(results).toHaveLength(7);
      expect(freshClient.buildQueue.addBuildToQueue).toHaveBeenCalledTimes(7);
    });
  });
});
