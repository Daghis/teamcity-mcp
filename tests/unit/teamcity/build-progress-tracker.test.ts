/**
 * Tests for BuildProgressTracker
 */
import { EventEmitter } from 'events';

import { BuildProgressTracker, type ProgressUpdate } from '@/teamcity/build-progress-tracker';
import { BuildStatusManager } from '@/teamcity/build-status-manager';

describe('BuildProgressTracker', () => {
  let tracker: BuildProgressTracker;
  let mockStatusManager: jest.Mocked<BuildStatusManager>;
  let _eventEmitter: EventEmitter;

  beforeEach(() => {
    // Set up fake timers
    jest.useFakeTimers();

    // Create mock status manager
    mockStatusManager = {
      getBuildStatus: jest.fn(),
      getBuildStatusByLocator: jest.fn(),
      clearCache: jest.fn(),
    } as unknown as jest.Mocked<BuildStatusManager>;

    _eventEmitter = new EventEmitter();
    tracker = new BuildProgressTracker(mockStatusManager);
  });

  afterEach(() => {
    // Clean up any active tracking
    tracker.stopAllTracking();
    jest.clearAllTimers();
    // Restore real timers
    jest.useRealTimers();
  });

  describe('trackBuildProgress', () => {
    describe('Progress Updates', () => {
      // Note: We don't use global fake timers because the initial poll
      // happens with delay 0 which needs to complete before we can control timing

      it('should emit progress updates for running builds', async () => {
        const buildId = '12345';
        const progressUpdates: ProgressUpdate[] = [];

        // Mock build status responses
        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 25,
            currentStageText: 'Compiling sources',
            elapsedSeconds: 30,
            estimatedTotalSeconds: 120,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 50,
            currentStageText: 'Running tests',
            elapsedSeconds: 60,
            estimatedTotalSeconds: 120,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 75,
            currentStageText: 'Publishing artifacts',
            elapsedSeconds: 90,
            estimatedTotalSeconds: 120,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'finished',
            status: 'SUCCESS',
            percentageComplete: 100,
            elapsedSeconds: 115,
          });

        // Start tracking with immediate initial poll
        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 5000,
        });

        emitter.on('progress', (update: ProgressUpdate) => {
          progressUpdates.push(update);
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll (immediate)
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Advance timers for subsequent polls
        jest.advanceTimersByTime(5000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(5000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(5000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Verify progress updates
        expect(progressUpdates).toHaveLength(4);
        expect(progressUpdates[0]).toMatchObject({
          buildId,
          state: 'running',
          percentageComplete: 25,
          currentStageText: 'Compiling sources',
        });
        expect(progressUpdates[3]).toMatchObject({
          state: 'finished',
          status: 'SUCCESS',
          percentageComplete: 100,
        });
      });

      it('should calculate progress velocity', async () => {
        const buildId = '12346';
        let lastUpdate: ProgressUpdate | undefined;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 20,
            elapsedSeconds: 20,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 40,
            elapsedSeconds: 35,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 5000,
          calculateVelocity: true,
        });

        emitter.on('progress', (update: ProgressUpdate) => {
          lastUpdate = update;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll (immediate)
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Advance timers for subsequent polls
        jest.advanceTimersByTime(5000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Velocity = (40 - 20) / 5s polling interval = 20 / 5 = 4% per second
        expect(lastUpdate).toBeDefined();
        if (lastUpdate == null) {
          throw new Error('Expected lastUpdate to be defined');
        }
        expect(lastUpdate.velocity).toBeCloseTo(4, 1);
        expect(lastUpdate.estimatedTimeRemaining).toBeDefined();
      });

      it('should handle stalled builds', async () => {
        const buildId = '12347';
        let stalledEventFired = false;

        // First poll shows progress
        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 30,
            elapsedSeconds: 60,
          })
          // Subsequent polls show no progress (same percentage)
          .mockResolvedValue({
            buildId,
            state: 'running',
            percentageComplete: 30,
            elapsedSeconds: 60,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          stallThreshold: 3000, // 3 seconds
        });

        emitter.on('stalled', () => {
          stalledEventFired = true;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll (establishes lastProgress)
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Now advance time and do polls with no progress
        // Intentional sequential timer advancement to simulate ticks
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < 4; i++) {
          jest.advanceTimersByTime(1000);
          await jest.runOnlyPendingTimers();
          await Promise.resolve();
        }
        /* eslint-enable no-await-in-loop */

        expect(stalledEventFired).toBe(true);
      });
    });

    describe('Build State Transitions', () => {
      it('should emit queued event when build is queued', async () => {
        const buildId = '12348';
        let queuedEventData: unknown;

        mockStatusManager.getBuildStatus.mockResolvedValue({
          buildId,
          state: 'queued',
          percentageComplete: 0,
          queuePosition: 3,
          estimatedStartTime: new Date('2025-08-29T10:30:00Z'),
        });

        const emitter = tracker.trackBuildProgress(buildId);

        emitter.on('queued', (data: unknown) => {
          queuedEventData = data;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Trigger initial poll
        await tracker.pollOnce(buildId);

        expect(queuedEventData as Record<string, unknown>).toMatchObject({
          buildId,
          queuePosition: 3,
          estimatedStartTime: expect.any(Date),
        });
      });

      it('should emit started event when build starts', async () => {
        const buildId = '12349';
        let startedEventData: unknown;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'queued',
            percentageComplete: 0,
            queuePosition: 1,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 0,
            startDate: new Date('2025-08-29T10:31:00Z'),
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
        });

        emitter.on('started', (data: unknown) => {
          startedEventData = data;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(1000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(startedEventData as Record<string, unknown>).toMatchObject({
          buildId,
          startDate: expect.any(Date),
        });
      });

      it('should emit completed event when build finishes', async () => {
        const buildId = '12350';
        let completedEventData: unknown;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 95,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'finished',
            status: 'SUCCESS',
            percentageComplete: 100,
            elapsedSeconds: 120,
            finishDate: new Date('2025-08-29T10:33:00Z'),
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
        });

        emitter.on('completed', (data: unknown) => {
          completedEventData = data;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(1000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(completedEventData as Record<string, unknown>).toMatchObject({
          buildId,
          status: 'SUCCESS',
          elapsedSeconds: 120,
          finishDate: expect.any(Date),
        });
      });

      it('should emit failed event when build fails', async () => {
        const buildId = '12351';
        let failedEventData: unknown;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 60,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'finished',
            status: 'FAILURE',
            statusText: 'Tests failed',
            failureReason: '5 tests failed',
            percentageComplete: 60,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
        });

        emitter.on('failed', (data: unknown) => {
          failedEventData = data;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(1000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(failedEventData as Record<string, unknown>).toMatchObject({
          buildId,
          status: 'FAILURE',
          statusText: 'Tests failed',
          failureReason: '5 tests failed',
        });
      });

      it('should emit canceled event when build is canceled', async () => {
        const buildId = '12352';
        let canceledEventData: unknown;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 30,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'canceled',
            percentageComplete: 30,
            canceledBy: 'john.doe',
            canceledDate: new Date('2025-08-29T10:35:00Z'),
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
        });

        emitter.on('canceled', (data: unknown) => {
          canceledEventData = data;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(1000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        expect(canceledEventData as Record<string, unknown>).toMatchObject({
          buildId,
          canceledBy: 'john.doe',
          canceledDate: expect.any(Date),
        });
      });
    });

    describe('Error Handling', () => {
      it('should emit error event on API failures', async () => {
        const buildId = '12353';
        let errorEventData: unknown;

        mockStatusManager.getBuildStatus.mockRejectedValue(new Error('Network error'));

        const emitter = tracker.trackBuildProgress(buildId);

        emitter.on('error', (error) => {
          errorEventData = error;
        });

        // Wait for initial poll to complete
        await jest.runOnlyPendingTimers();

        expect(errorEventData).toBeInstanceOf(Error);
        const err = errorEventData as Error;
        expect(err.message).toBe('Network error');
      });

      it('should retry on transient errors', async () => {
        const buildId = '12354';

        mockStatusManager.getBuildStatus
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({
            buildId,
            state: 'finished',
            status: 'SUCCESS',
            percentageComplete: 100,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          maxRetries: 3,
        });

        let progressUpdate: ProgressUpdate | undefined;
        emitter.on('progress', (update) => {
          progressUpdate = update;
        });
        emitter.on('error', () => {
          // Expected error on first attempt
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(1000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Wait a bit more to ensure no additional calls are made
        await jest.advanceTimersByTime(1000);
        await Promise.resolve();

        expect(progressUpdate).toBeDefined();
        if (progressUpdate == null) {
          throw new Error('Expected progressUpdate to be defined');
        }
        expect(progressUpdate).toMatchObject({
          percentageComplete: 100,
        });
        // Should have initial failure + retry success + possible completion check
        expect(mockStatusManager.getBuildStatus).toHaveBeenCalledTimes(3);
      });

      it('should stop tracking after max retries exceeded', async () => {
        const buildId = '12355';
        let stopEventFired = false;

        mockStatusManager.getBuildStatus.mockRejectedValue(new Error('Persistent failure'));

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          maxRetries: 2,
        });

        emitter.on('stopped', () => {
          stopEventFired = true;
        });
        emitter.on('error', () => {
          // Expected errors
        });

        // Wait for initial poll (counts as first attempt)
        await jest.runOnlyPendingTimers();

        // Retry 1
        jest.advanceTimersByTime(1000);
        await Promise.resolve();

        // Should stop after max retries

        // Give time for async operations
        await jest.runOnlyPendingTimers();

        expect(stopEventFired).toBe(true);
        expect(mockStatusManager.getBuildStatus).toHaveBeenCalledTimes(2);
      });
    });

    describe('Progress Estimation', () => {
      it('should estimate completion time based on velocity', async () => {
        const buildId = '12356';
        let lastUpdate: ProgressUpdate | undefined;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 30,
            elapsedSeconds: 30,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            percentageComplete: 50,
            elapsedSeconds: 50,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          calculateVelocity: true,
        });

        emitter.on('progress', (update) => {
          lastUpdate = update;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        jest.advanceTimersByTime(1000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Velocity = 20% in 1s polling interval = 20% per second
        // Remaining = 50% at 20% per second = 2.5 seconds
        expect(lastUpdate).toBeDefined();
        if (lastUpdate == null) {
          throw new Error('Expected lastUpdate to be defined');
        }
        expect(lastUpdate.estimatedTimeRemaining).toBeCloseTo(2.5, 1);
      });

      it('should use historical data for initial estimates', async () => {
        const buildId = '12357';
        const buildTypeId = 'Build_Config_1';
        let progressUpdate: ProgressUpdate | undefined;

        // Set historical average
        tracker.setHistoricalAverage(buildTypeId, 180); // 3 minutes average

        mockStatusManager.getBuildStatus.mockResolvedValue({
          buildId,
          buildTypeId,
          state: 'running',
          percentageComplete: 33,
          elapsedSeconds: 60,
        });

        const emitter = tracker.trackBuildProgress(buildId, {
          useHistoricalData: true,
        });

        emitter.on('progress', (update) => {
          progressUpdate = update;
        });

        await tracker.pollOnce(buildId);

        // At 33% with 180s average = ~120s remaining
        expect(progressUpdate).toBeDefined();
        if (progressUpdate == null) {
          throw new Error('Expected progressUpdate to be defined');
        }
        expect(progressUpdate.estimatedTotalSeconds).toBeCloseTo(180, -1);
      });

      it('should handle builds running longer than estimated', async () => {
        const buildId = '12358';
        let progressUpdate: ProgressUpdate | undefined;

        mockStatusManager.getBuildStatus.mockResolvedValue({
          buildId,
          state: 'running',
          percentageComplete: 95,
          elapsedSeconds: 300,
          estimatedTotalSeconds: 200, // Original estimate was 200s
        });

        const emitter = tracker.trackBuildProgress(buildId);

        emitter.on('progress', (update) => {
          progressUpdate = update;
        });
        emitter.on('error', () => {
          /* ignore */
        });

        await tracker.pollOnce(buildId);

        // Should show build is overdue
        expect(progressUpdate).toBeDefined();
        if (progressUpdate == null) {
          throw new Error('Expected progressUpdate to be defined');
        }
        expect(progressUpdate.isOverdue).toBe(true);
        expect(progressUpdate.overdueSeconds).toBe(100);
      });
    });

    describe('Stage Tracking', () => {
      it('should track build stage changes', async () => {
        const buildId = '12359';
        const stageChanges: string[] = [];

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Checkout',
            percentageComplete: 10,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Compile',
            percentageComplete: 30,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Test',
            percentageComplete: 60,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Package',
            percentageComplete: 90,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          trackStages: true,
        });

        emitter.on('stageChanged', (stage) => {
          stageChanges.push(stage);
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Intentional sequential timer advancement for stage progression
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < 3; i++) {
          jest.advanceTimersByTime(1000);
          await jest.runOnlyPendingTimers();
          await Promise.resolve();
        }
        /* eslint-enable no-await-in-loop */

        expect(stageChanges).toEqual(['Checkout', 'Compile', 'Test', 'Package']);
      });

      it('should calculate stage duration', async () => {
        const buildId = '12360';
        let stageMetrics: Record<string, unknown> | undefined;

        mockStatusManager.getBuildStatus
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Tests',
            percentageComplete: 50,
            elapsedSeconds: 60,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Tests',
            percentageComplete: 70,
            elapsedSeconds: 90,
          })
          .mockResolvedValueOnce({
            buildId,
            state: 'running',
            currentStageText: 'Deploy',
            percentageComplete: 80,
            elapsedSeconds: 100,
          });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          trackStages: true,
          calculateStageMetrics: true,
        });

        emitter.on('stageCompleted', (metrics) => {
          stageMetrics = metrics;
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Intentional sequential timer advancement for metrics
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < 2; i++) {
          jest.advanceTimersByTime(1000);
          await jest.runOnlyPendingTimers();
          await Promise.resolve();
        }
        /* eslint-enable no-await-in-loop */

        expect(stageMetrics).toMatchObject({
          stageName: 'Tests',
          duration: 2, // Time between polls in seconds
          percentageOfBuild: 30, // 80 - 50
        });
      });
    });

    describe('Multiple Build Tracking', () => {
      it('should track multiple builds simultaneously', async () => {
        const buildIds = ['12361', '12362', '12363'];
        const progressUpdates: Map<string, ProgressUpdate> = new Map();

        buildIds.forEach((id, index) => {
          mockStatusManager.getBuildStatus.mockResolvedValueOnce({
            buildId: id,
            state: 'running',
            percentageComplete: (index + 1) * 25,
          });
        });

        buildIds.forEach((id) => {
          const emitter = tracker.trackBuildProgress(id);
          emitter.on('progress', (update) => {
            progressUpdates.set(id, update);
          });
        });

        await Promise.all(buildIds.map((id) => tracker.pollOnce(id)));

        expect(progressUpdates.size).toBe(3);
        expect(progressUpdates.get('12361')?.percentageComplete).toBe(25);
        expect(progressUpdates.get('12362')?.percentageComplete).toBe(50);
        expect(progressUpdates.get('12363')?.percentageComplete).toBe(75);
      });

      it('should stop tracking specific build', () => {
        const buildIds = ['12364', '12365'];

        buildIds.forEach((id) => {
          tracker.trackBuildProgress(id);
        });

        expect(tracker.getActiveTracking()).toHaveLength(2);

        tracker.stopTracking('12364');

        expect(tracker.getActiveTracking()).toHaveLength(1);
        expect(tracker.getActiveTracking()).toContain('12365');
      });

      it('should stop all tracking', () => {
        const buildIds = ['12366', '12367', '12368'];

        buildIds.forEach((id) => {
          tracker.trackBuildProgress(id);
        });

        expect(tracker.getActiveTracking()).toHaveLength(3);

        tracker.stopAllTracking();

        expect(tracker.getActiveTracking()).toHaveLength(0);
      });
    });

    describe('Options and Configuration', () => {
      it('should respect custom polling intervals', async () => {
        const buildId = '12369';

        mockStatusManager.getBuildStatus.mockResolvedValue({
          buildId,
          state: 'running',
          percentageComplete: 50,
        });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 10000, // 10 seconds
        });
        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();
        expect(mockStatusManager.getBuildStatus).toHaveBeenCalledTimes(1); // Initial poll

        jest.advanceTimersByTime(10000);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();
        expect(mockStatusManager.getBuildStatus).toHaveBeenCalledTimes(2); // Second poll at 10s
      });

      it('should stop tracking when maxDuration exceeded', async () => {
        const buildId = '12370';
        let stoppedEventFired = false;
        let _stoppedReason = '';

        mockStatusManager.getBuildStatus.mockResolvedValue({
          buildId,
          state: 'running',
          percentageComplete: 50,
        });

        const emitter = tracker.trackBuildProgress(buildId, {
          pollingInterval: 1000,
          maxDuration: 2000, // Stop after 2 seconds
        });

        const stopPromise = new Promise<string>((resolve) => {
          emitter.on('stopped', (reason) => {
            stoppedEventFired = true;
            _stoppedReason = reason;
            resolve(reason);
          });
        });

        emitter.on('error', () => {
          /* ignore */
        });

        // Wait for initial poll
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Advance time to exceed maxDuration (2000ms)
        jest.advanceTimersByTime(2001);
        await jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Wait for the stopped event
        const reason = await stopPromise;

        expect(stoppedEventFired).toBe(true);
        expect(reason).toBe('maxDurationExceeded');
      });

      it('should include optional data when requested', async () => {
        const buildId = '12371';
        let progressUpdate: ProgressUpdate | undefined;

        mockStatusManager.getBuildStatus.mockResolvedValue({
          buildId,
          state: 'running',
          percentageComplete: 50,
          testSummary: {
            total: 100,
            passed: 45,
            failed: 0,
            ignored: 5,
          },
          problems: [],
        });

        const emitter = tracker.trackBuildProgress(buildId, {
          includeTests: true,
          includeProblems: true,
        });

        emitter.on('progress', (update) => {
          progressUpdate = update;
        });

        await tracker.pollOnce(buildId);

        expect(progressUpdate).toBeDefined();
        if (progressUpdate == null) {
          throw new Error('Expected progressUpdate to be defined');
        }
        expect(progressUpdate.testSummary).toBeDefined();
        expect(progressUpdate.testSummary?.passed).toBe(45);
        expect(progressUpdate.problems).toBeDefined();
      });
    });
  });

  describe('pollOnce', () => {
    it('should perform a single poll without scheduling next', async () => {
      const buildId = '12372';

      mockStatusManager.getBuildStatus.mockResolvedValue({
        buildId,
        state: 'running',
        percentageComplete: 75,
      });

      const result = await tracker.pollOnce(buildId);

      expect(result).toMatchObject({
        buildId,
        state: 'running',
        percentageComplete: 75,
      });
      expect(mockStatusManager.getBuildStatus).toHaveBeenCalledTimes(1);

      // Verify no additional polls are scheduled
      jest.advanceTimersByTime(10000);
      await jest.runOnlyPendingTimers();
      await Promise.resolve();

      expect(mockStatusManager.getBuildStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTrackingInfo', () => {
    it('should return current tracking information', async () => {
      const buildId = '12373';

      mockStatusManager.getBuildStatus.mockResolvedValue({
        buildId,
        state: 'running',
        percentageComplete: 60,
        elapsedSeconds: 120,
      });

      tracker.trackBuildProgress(buildId);
      await tracker.pollOnce(buildId);

      const info = tracker.getTrackingInfo(buildId);

      expect(info).toMatchObject({
        buildId,
        isTracking: true,
        lastUpdate: expect.any(Object),
        pollCount: 1,
        startTime: expect.any(Date),
      });
    });

    it('should return null for untracked builds', () => {
      const info = tracker.getTrackingInfo('unknown');
      expect(info).toBeNull();
    });
  });

  describe('setHistoricalAverage', () => {
    it('should store and use historical build duration', async () => {
      const buildId = '12374';
      const buildTypeId = 'Build_Config_2';

      tracker.setHistoricalAverage(buildTypeId, 240); // 4 minutes average

      mockStatusManager.getBuildStatus.mockResolvedValue({
        buildId,
        buildTypeId,
        state: 'running',
        percentageComplete: 25,
        elapsedSeconds: 60,
      });

      const emitter = tracker.trackBuildProgress(buildId, {
        useHistoricalData: true,
      });

      let progressUpdate: ProgressUpdate | undefined;
      emitter.on('progress', (update) => {
        progressUpdate = update;
      });

      await tracker.pollOnce(buildId);

      // Should estimate based on historical average
      expect(progressUpdate).toBeDefined();
      if (progressUpdate == null) {
        throw new Error('Expected progressUpdate to be defined');
      }
      expect(progressUpdate.estimatedTotalSeconds).toBe(240);
      expect(progressUpdate.estimatedTimeRemaining).toBeCloseTo(180, -1);
    });
  });
});
