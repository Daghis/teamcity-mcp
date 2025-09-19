/**
 * Tests for Build Queue Manager
 */
import { ResolvedBuildConfiguration } from '@/teamcity/build-configuration-resolver';
import { ParameterSet, ParameterType } from '@/teamcity/build-parameters-manager';
import { BuildQueueManager, BuildStatus, QueueBuildOptions } from '@/teamcity/build-queue-manager';

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
});
