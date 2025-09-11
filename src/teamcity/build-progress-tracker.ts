/**
 * Build Progress Tracker for TeamCity
 * Provides real-time build progress monitoring and estimation
 */
import { EventEmitter } from 'events';

import type { BuildStatusManager, BuildStatusResult } from './build-status-manager';

/**
 * Progress update event data
 */
export interface ProgressUpdate extends BuildStatusResult {
  velocity?: number; // Percentage per second
  estimatedTimeRemaining?: number; // Seconds
  isOverdue?: boolean;
  overdueSeconds?: number;
  stageDuration?: number;
  stageProgress?: number;
}

/**
 * Options for progress tracking
 */
export interface ProgressOptions {
  pollingInterval?: number; // Milliseconds between polls (default: 5000)
  calculateVelocity?: boolean; // Calculate progress velocity
  useHistoricalData?: boolean; // Use historical averages for estimation
  trackStages?: boolean; // Track stage changes
  calculateStageMetrics?: boolean; // Calculate per-stage metrics
  includeTests?: boolean; // Include test results in updates
  includeProblems?: boolean; // Include build problems
  stallThreshold?: number; // Time without progress before considered stalled (ms)
  maxRetries?: number; // Maximum retry attempts on error
  maxDuration?: number; // Maximum tracking duration (ms)
}

/**
 * Tracking state for a build
 */
interface TrackingState {
  buildId: string;
  buildTypeId?: string;
  emitter: EventEmitter;
  timer?: NodeJS.Timeout;
  lastUpdate?: BuildStatusResult;
  lastProgress?: number;
  lastProgressTime?: Date;
  currentStage?: string;
  stageStartTime?: Date;
  stageStartProgress?: number;
  pollCount: number;
  errorCount: number;
  startTime: Date;
  options: ProgressOptions;
}

/**
 * Stage completion metrics
 */
export interface StageMetrics {
  stageName: string;
  duration: number; // Seconds
  percentageOfBuild: number;
  startProgress: number;
  endProgress: number;
}

/**
 * Build Progress Tracker implementation
 */
export class BuildProgressTracker {
  private statusManager: BuildStatusManager;
  private tracking: Map<string, TrackingState>;
  private historicalAverages: Map<string, number>; // buildTypeId -> average duration

  constructor(statusManager: BuildStatusManager) {
    this.statusManager = statusManager;
    this.tracking = new Map();
    this.historicalAverages = new Map();
  }

  /**
   * Start tracking build progress
   */
  trackBuildProgress(buildId: string, options: ProgressOptions = {}): EventEmitter {
    // Stop any existing tracking for this build
    this.stopTracking(buildId);

    // Set default options
    const trackingOptions: ProgressOptions = {
      pollingInterval: 5000,
      calculateVelocity: false,
      useHistoricalData: false,
      trackStages: false,
      calculateStageMetrics: false,
      includeTests: false,
      includeProblems: false,
      stallThreshold: 30000,
      maxRetries: 3,
      ...options,
    };

    // Create tracking state
    const emitter = new EventEmitter();
    const state: TrackingState = {
      buildId,
      emitter,
      pollCount: 0,
      errorCount: 0,
      startTime: new Date(),
      options: trackingOptions,
    };

    this.tracking.set(buildId, state);

    // Schedule first poll
    this.schedulePoll(buildId);

    // Handle max duration if specified
    if (trackingOptions.maxDuration) {
      setTimeout(() => {
        if (this.tracking.has(buildId)) {
          emitter.emit('stopped', 'maxDurationExceeded');
          this.stopTracking(buildId);
        }
      }, trackingOptions.maxDuration);
    }

    return emitter;
  }

  /**
   * Perform a single poll without scheduling next
   */
  async pollOnce(buildId: string): Promise<BuildStatusResult | null> {
    const state = this.tracking.get(buildId);
    if (!state) {
      // Create temporary state for one-off poll
      const tempState: TrackingState = {
        buildId,
        emitter: new EventEmitter(),
        pollCount: 0,
        errorCount: 0,
        startTime: new Date(),
        options: {},
      };
      this.tracking.set(buildId, tempState);

      try {
        const result = await this.pollBuildStatus(buildId);
        this.tracking.delete(buildId);
        return result;
      } catch (error) {
        this.tracking.delete(buildId);
        throw error;
      }
    }

    return this.pollBuildStatus(buildId);
  }

  /**
   * Stop tracking a specific build
   */
  stopTracking(buildId: string): void {
    const state = this.tracking.get(buildId);
    if (state) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
      state.emitter.emit('stopped', 'manual');
      this.tracking.delete(buildId);
    }
  }

  /**
   * Stop all active tracking
   */
  stopAllTracking(): void {
    const buildIds = Array.from(this.tracking.keys());
    buildIds.forEach((id) => this.stopTracking(id));
  }

  /**
   * Get list of actively tracked builds
   */
  getActiveTracking(): string[] {
    return Array.from(this.tracking.keys());
  }

  /**
   * Get tracking information for a build
   */
  getTrackingInfo(buildId: string): unknown {
    const state = this.tracking.get(buildId);
    if (!state) {
      return null;
    }

    return {
      buildId,
      isTracking: true,
      lastUpdate: state.lastUpdate,
      pollCount: state.pollCount,
      errorCount: state.errorCount,
      startTime: state.startTime,
      currentStage: state.currentStage,
    };
  }

  /**
   * Set historical average duration for a build type
   */
  setHistoricalAverage(buildTypeId: string, averageDuration: number): void {
    this.historicalAverages.set(buildTypeId, averageDuration);
  }

  /**
   * Schedule next poll for a build
   */
  private schedulePoll(buildId: string): void {
    const state = this.tracking.get(buildId);
    if (!state) {
      return;
    }

    // Immediate poll for first time, otherwise use interval
    const delay = state.pollCount === 0 ? 0 : (state.options.pollingInterval ?? 5000);

    state.timer = setTimeout(async () => {
      try {
        await this.pollBuildStatus(buildId);

        // Schedule next poll if build is still running
        const currentState = this.tracking.get(buildId);
        if (
          currentState?.lastUpdate &&
          (currentState.lastUpdate.state === 'running' ||
            currentState.lastUpdate.state === 'queued')
        ) {
          this.schedulePoll(buildId);
        }
      } catch (error) {
        this.handlePollError(buildId, error as Error);
      }
    }, delay);
  }

  /**
   * Poll build status and emit events
   */
  private async pollBuildStatus(buildId: string): Promise<BuildStatusResult | null> {
    const state = this.tracking.get(buildId);
    if (!state) {
      return null;
    }

    try {
      // Get current status
      const status = await this.statusManager.getBuildStatus({
        buildId,
        includeTests: state.options.includeTests,
        includeProblems: state.options.includeProblems,
        forceRefresh: true,
      });

      state.pollCount++;
      state.errorCount = 0; // Reset error count on success

      // Store build type ID if available
      if (status.buildTypeId && !state.buildTypeId) {
        state.buildTypeId = status.buildTypeId;
      }

      // Process the status update
      const update = this.processStatusUpdate(state, status);

      // Emit appropriate events
      this.emitEvents(state, update);

      // Update state
      state.lastUpdate = status;

      // Only update lastProgressTime when progress actually changes
      if (state.lastProgress !== status.percentageComplete) {
        state.lastProgress = status.percentageComplete;
        state.lastProgressTime = new Date();
      } else if (state.lastProgress === undefined) {
        // First time seeing progress
        state.lastProgress = status.percentageComplete;
        state.lastProgressTime = new Date();
      }

      return status;
    } catch (error) {
      state.errorCount++;
      state.emitter.emit('error', error);

      if (state.errorCount >= (state.options.maxRetries ?? 3)) {
        state.emitter.emit('stopped', 'maxRetriesExceeded');
        this.stopTracking(buildId);
      } else {
        // Retry
        this.schedulePoll(buildId);
      }

      throw error;
    }
  }

  /**
   * Process status update and calculate additional metrics
   */
  private processStatusUpdate(state: TrackingState, status: BuildStatusResult): ProgressUpdate {
    const update: ProgressUpdate = { ...status };

    // Calculate velocity if requested
    if (
      state.options.calculateVelocity &&
      state.lastProgress !== undefined &&
      state.lastProgressTime
    ) {
      const progressDelta = status.percentageComplete - state.lastProgress;
      const timeDelta = (new Date().getTime() - state.lastProgressTime.getTime()) / 1000;

      if (timeDelta > 0 && progressDelta > 0) {
        update.velocity = progressDelta / timeDelta;

        // Estimate time remaining based on velocity
        const remainingProgress = 100 - status.percentageComplete;
        if (update.velocity > 0) {
          update.estimatedTimeRemaining = remainingProgress / update.velocity;
        }
      }
    }

    // Use historical data for estimation if available
    if (state.options.useHistoricalData && state.buildTypeId) {
      const historicalAverage = this.historicalAverages.get(state.buildTypeId);
      if (historicalAverage && !update.estimatedTotalSeconds) {
        update.estimatedTotalSeconds = historicalAverage;

        if (status.percentageComplete > 0) {
          const estimatedElapsed = (historicalAverage * status.percentageComplete) / 100;
          update.estimatedTimeRemaining = historicalAverage - estimatedElapsed;
        }
      }
    }

    // Check if build is overdue
    if (status.estimatedTotalSeconds && status.elapsedSeconds) {
      if (status.elapsedSeconds > status.estimatedTotalSeconds) {
        update.isOverdue = true;
        update.overdueSeconds = status.elapsedSeconds - status.estimatedTotalSeconds;
      }
    }

    // Track stage metrics
    if (state.options.trackStages && status.currentStageText) {
      if (status.currentStageText !== state.currentStage) {
        // Stage changed
        if (state.currentStage && state.options.calculateStageMetrics) {
          const stageMetrics = this.calculateStageMetrics(state, status);
          if (stageMetrics) {
            state.emitter.emit('stageCompleted', stageMetrics);
          }
        }

        state.currentStage = status.currentStageText;
        state.stageStartTime = new Date();
        state.stageStartProgress = status.percentageComplete;

        state.emitter.emit('stageChanged', status.currentStageText);
      }

      // Calculate current stage progress
      if (state.stageStartProgress !== undefined) {
        update.stageProgress = status.percentageComplete - state.stageStartProgress;
      }

      if (state.stageStartTime) {
        update.stageDuration = (new Date().getTime() - state.stageStartTime.getTime()) / 1000;
      }
    }

    return update;
  }

  /**
   * Calculate metrics for completed stage
   */
  private calculateStageMetrics(
    state: TrackingState,
    currentStatus: BuildStatusResult
  ): StageMetrics | null {
    if (
      !state.currentStage ||
      state.stageStartTime === undefined ||
      state.stageStartProgress === undefined
    ) {
      return null;
    }

    const duration = (new Date().getTime() - state.stageStartTime.getTime()) / 1000;
    const percentageOfBuild = currentStatus.percentageComplete - state.stageStartProgress;

    return {
      stageName: state.currentStage,
      duration,
      percentageOfBuild,
      startProgress: state.stageStartProgress,
      endProgress: currentStatus.percentageComplete,
    };
  }

  /**
   * Emit appropriate events based on status changes
   */
  private emitEvents(state: TrackingState, update: ProgressUpdate): void {
    const prevState = state.lastUpdate?.state;
    const currentState = update.state;

    // Always emit progress update
    state.emitter.emit('progress', update);

    // State transition events
    if (prevState !== currentState) {
      switch (currentState) {
        case 'queued':
          state.emitter.emit('queued', {
            buildId: update.buildId,
            queuePosition: update.queuePosition,
            estimatedStartTime: update.estimatedStartTime,
          });
          break;

        case 'running':
          if (prevState === 'queued') {
            state.emitter.emit('started', {
              buildId: update.buildId,
              startDate: update.startDate,
            });
          }
          break;

        case 'finished':
          if (update.status === 'SUCCESS') {
            state.emitter.emit('completed', {
              buildId: update.buildId,
              status: update.status,
              elapsedSeconds: update.elapsedSeconds,
              finishDate: update.finishDate,
            });
          } else {
            state.emitter.emit('failed', {
              buildId: update.buildId,
              status: update.status,
              statusText: update.statusText,
              failureReason: update.failureReason,
            });
          }
          this.stopTracking(update.buildId);
          break;

        case 'canceled':
          state.emitter.emit('canceled', {
            buildId: update.buildId,
            canceledBy: update.canceledBy,
            canceledDate: update.canceledDate,
          });
          this.stopTracking(update.buildId);
          break;
      }
    }

    // Check for stalled build
    if (
      state.options.stallThreshold &&
      currentState === 'running' &&
      state.lastProgress === update.percentageComplete &&
      state.lastProgressTime
    ) {
      const timeSinceProgress = new Date().getTime() - state.lastProgressTime.getTime();
      if (timeSinceProgress > state.options.stallThreshold) {
        state.emitter.emit('stalled', {
          buildId: update.buildId,
          percentageComplete: update.percentageComplete,
          timeSinceProgress,
        });
      }
    }
  }

  /**
   * Handle polling errors
   */
  private handlePollError(buildId: string, error: Error): void {
    const state = this.tracking.get(buildId);
    if (!state) {
      return;
    }

    state.errorCount++;
    state.emitter.emit('error', error);

    if (state.errorCount >= (state.options.maxRetries ?? 3)) {
      state.emitter.emit('stopped', 'maxRetriesExceeded');
      this.stopTracking(buildId);
    } else {
      // Schedule retry
      this.schedulePoll(buildId);
    }
  }
}
