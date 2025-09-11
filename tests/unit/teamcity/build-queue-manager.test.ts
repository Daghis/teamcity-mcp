/**
 * Tests for Build Queue Manager
 */
import { ResolvedBuildConfiguration } from '@/teamcity/build-configuration-resolver';
import { ParameterSet, ParameterType } from '@/teamcity/build-parameters-manager';
import { BuildQueueManager, BuildStatus, QueueBuildOptions } from '@/teamcity/build-queue-manager';
import type { TeamCityClient } from '@/teamcity/client';

// Helper to wrap response in Axios format
const wrapResponse = <T>(data: T) => ({ data });

// Mock TeamCity client
const mockBuildQueue = {
  addBuildToQueue: jest.fn(),
  getAllQueuedBuilds: jest.fn(),
  setQueuedBuildsOrder: jest.fn(),
  cancelQueuedBuild: jest.fn(),
};

const mockBuilds = {
  getBuild: jest.fn(),
  getAllBuilds: jest.fn(),
};

const mockBuildTypes = {
  getBuildType: jest.fn(),
};

const mockAgents = {
  getAllAgents: jest.fn(),
};

const mockTeamCityClient = {
  buildQueue: mockBuildQueue,
  builds: mockBuilds,
  buildTypes: mockBuildTypes,
  agents: mockAgents,
};

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

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new BuildQueueManager(mockTeamCityClient as unknown as TeamCityClient);
  });

  describe('Single Build Queueing', () => {
    it('should queue a simple build', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet({
        'env.TEST': 'value',
      });

      mockBuildQueue.addBuildToQueue.mockResolvedValueOnce(
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

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));

      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        branch: 'refs/heads/main',
      });

      expect(result.buildId).toBe('12345');
      expect(result.buildTypeId).toBe('Build1');
      expect(result.webUrl).toBe('https://teamcity.example.com/viewQueued.html?itemId=12345');
      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledWith(
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

      mockBuildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12346,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        comment: 'Triggered by PR #123',
      });

      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          comment: { text: 'Triggered by PR #123' },
        })
      );
    });

    it('should queue a personal build', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockBuildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12347,
          buildTypeId: 'Build1',
          personal: true,
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        personal: true,
      });

      expect(result.personal).toBe(true);
      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          personal: true,
        })
      );
    });

    it('should handle queueing errors', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Mock should reject, and since it's not a 4xx error, it will be retried and eventually thrown
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const serverError: HttpError = new Error('Access denied');
      serverError.response = { status: 500 }; // Server error will be retried
      mockBuildQueue.addBuildToQueue
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

      mockBuildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 12348,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12349', buildTypeId: 'Build2' },
            { id: '12348', buildTypeId: 'Build1' },
          ],
        })
      );

      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));
      mockBuildQueue.setQueuedBuildsOrder.mockResolvedValue({});

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        moveToTop: true,
      });

      expect(result.buildId).toBe('12348');
      expect(mockBuildQueue.setQueuedBuildsOrder).toHaveBeenCalledWith(undefined, {
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

      mockBuildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      mockBuildQueue.addBuildToQueue
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
      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledTimes(3);
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

      mockBuildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      mockBuildQueue.addBuildToQueue
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

      mockBuildQueue.addBuildToQueue.mockResolvedValueOnce(
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

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      const result = await manager.queueBuild({
        buildConfiguration: buildConfig,
        parameters,
        dependencies: [{ buildId: '400', waitForFinish: true }],
      });

      expect(result.buildId).toBe('401');
      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledWith(
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

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

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
      // Explicitly reset all mock functions to clean state
      mockBuildQueue.getAllQueuedBuilds.mockReset();
      mockBuilds.getBuild.mockReset();
      mockBuildTypes.getBuildType.mockReset();
      mockAgents.getAllAgents.mockReset();
      mockBuildQueue.addBuildToQueue.mockReset();
      mockBuildQueue.setQueuedBuildsOrder.mockReset();
      mockBuildQueue.cancelQueuedBuild.mockReset();

      // Create fresh manager instance to avoid contamination
      const freshManager = new BuildQueueManager(mockTeamCityClient as unknown as TeamCityClient);

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
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
      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            { id: '12346', buildTypeId: 'Build2' },
          ],
        })
      );

      mockBuildQueue.setQueuedBuildsOrder.mockResolvedValueOnce({});

      await manager.moveToTop('12346');

      expect(mockBuildQueue.setQueuedBuildsOrder).toHaveBeenCalledWith(undefined, {
        build: [{ id: 12346 }],
      });
    });

    it('should reorder queue', async () => {
      const buildIds = ['12347', '12345', '12346'];

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(
        wrapResponse({
          build: [
            { id: '12345', buildTypeId: 'Build1' },
            { id: '12346', buildTypeId: 'Build2' },
            { id: '12347', buildTypeId: 'Build3' },
          ],
        })
      );

      mockBuildQueue.setQueuedBuildsOrder.mockResolvedValueOnce({});

      await manager.reorderQueue(buildIds);

      expect(mockBuildQueue.setQueuedBuildsOrder).toHaveBeenCalledWith(undefined, {
        build: buildIds.map((id) => ({ id: parseInt(id) })),
      });
    });

    it('should not move build with dependencies to top', async () => {
      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
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
      mockBuilds.getBuild.mockResolvedValueOnce(
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

      mockBuilds.getBuild
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

      await manager.monitorBuild(
        '701',
        (status) => {
          statusUpdates.push(status);
        },
        { pollInterval: 10 }
      );

      // Wait for monitoring to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
      expect(statusUpdates[statusUpdates.length - 1]?.state).toBe('finished');
    });

    it('should cancel a build', async () => {
      mockBuildQueue.cancelQueuedBuild.mockResolvedValueOnce({});

      await manager.cancelBuild('12345', 'No longer needed');

      expect(mockBuildQueue.cancelQueuedBuild).toHaveBeenCalledWith('12345');
    });
  });

  describe('Queue Limitations', () => {
    it('should get queue limitations', async () => {
      // Explicitly reset all mock functions to clean state
      mockBuildQueue.getAllQueuedBuilds.mockReset();
      mockBuilds.getBuild.mockReset();
      mockBuildTypes.getBuildType.mockReset();
      mockAgents.getAllAgents.mockReset();
      mockBuildQueue.addBuildToQueue.mockReset();
      mockBuildQueue.setQueuedBuildsOrder.mockReset();
      mockBuildQueue.cancelQueuedBuild.mockReset();

      // Create fresh manager instance to avoid contamination
      const freshManager = new BuildQueueManager(mockTeamCityClient as unknown as TeamCityClient);

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: {
            property: [{ name: 'maximumConcurrentBuilds', value: '3' }],
          },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(
        wrapResponse({
          build: [
            { id: '801', buildTypeId: 'Build1' },
            { id: '802', buildTypeId: 'Build1' },
          ],
        })
      );

      mockBuilds.getAllBuilds.mockResolvedValueOnce(wrapResponse({ count: 1 })); // Running builds
      mockAgents.getAllAgents.mockResolvedValueOnce(wrapResponse({ count: 5 })); // Available agents

      const limitations = await freshManager.getQueueLimitations('Build1');

      expect(limitations.maxConcurrentBuilds).toBe(3);
      expect(limitations.currentlyRunning).toBe(1);
      expect(limitations.queuedBuilds).toBe(2);
      expect(limitations.availableAgents).toBe(5);
    });

    it('should prevent queueing when max concurrent builds reached', async () => {
      // Explicitly reset all mock functions to clean state
      mockBuildQueue.getAllQueuedBuilds.mockReset();
      mockBuilds.getBuild.mockReset();
      mockBuildTypes.getBuildType.mockReset();
      mockAgents.getAllAgents.mockReset();
      mockBuildQueue.addBuildToQueue.mockReset();
      mockBuildQueue.setQueuedBuildsOrder.mockReset();
      mockBuildQueue.cancelQueuedBuild.mockReset();

      // Create fresh manager instance to avoid contamination
      const freshManager = new BuildQueueManager(mockTeamCityClient as unknown as TeamCityClient);

      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      // Set up all mocks needed for getQueueLimitations
      mockBuildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: {
            property: [{ name: 'maximumConcurrentBuilds', value: '1' }],
          },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));

      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 1 })); // Already 1 running
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 1 }));

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

      mockBuildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      mockBuildQueue.addBuildToQueue
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
      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      const buildConfig = createMockBuildConfig();
      const parameters = createMockParameterSet();

      mockBuildTypes.getBuildType.mockResolvedValue(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValue(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const clientError: HttpError = new Error('Forbidden');
      clientError.response = { status: 403, data: { message: 'Forbidden' } };
      mockBuildQueue.addBuildToQueue.mockRejectedValueOnce(clientError);

      await expect(
        manager.queueBuild({
          buildConfiguration: buildConfig,
          parameters,
        })
      ).rejects.toThrow('Forbidden');

      expect(mockBuildQueue.addBuildToQueue).toHaveBeenCalledTimes(1);
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

      mockBuildQueue.addBuildToQueue.mockResolvedValueOnce(
        wrapResponse({
          id: 1000,
          buildTypeId: 'Build1',
          state: 'queued',
          queuedDate: '2024-01-01T10:00:00Z',
        })
      );

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

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

      mockBuildTypes.getBuildType.mockResolvedValueOnce(
        wrapResponse({
          id: 'Build1',
          settings: { property: [] },
        })
      );

      mockBuildQueue.getAllQueuedBuilds.mockResolvedValueOnce(wrapResponse({ build: [] }));
      mockBuilds.getAllBuilds.mockResolvedValue(wrapResponse({ count: 0 }));
      mockAgents.getAllAgents.mockResolvedValue(wrapResponse({ count: 0 }));

      // Mock should reject, and since it's not a 4xx error, it will be retried and eventually thrown
      interface HttpError extends Error {
        response?: { status?: number; data?: unknown };
      }
      const serverError: HttpError = new Error('Queue error');
      serverError.response = { status: 500 }; // Server error will be retried
      mockBuildQueue.addBuildToQueue
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
