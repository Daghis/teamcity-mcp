import { EventEmitter } from 'events';

import type { Build } from '@/teamcity-client/models/build';

import type { ResolvedBuildConfiguration } from './build-configuration-resolver';
import type { ParameterSet } from './build-parameters-manager';
import type { TeamCityClientAdapter } from './client-adapter';

// Extended Build type for queue-specific properties
interface QueuedBuildData extends Build {
  estimatedStartTime?: string;
  estimatedDuration?: number;
  properties?: { property?: Array<{ name: string; value: string }> };
}

type QueueEntry = Partial<QueuedBuildData>;

interface QueueResponse {
  build?: QueueEntry[];
}

export interface QueueBuildOptions {
  buildConfiguration: ResolvedBuildConfiguration;
  parameters?: ParameterSet;
  branch?: string;
  personal?: boolean;
  moveToTop?: boolean;
  comment?: string;
  dependencies?: {
    buildId: string;
    waitForFinish?: boolean;
  }[];
}

export interface QueuedBuild {
  buildId: string;
  buildTypeId: string;
  branchName?: string;
  queuePosition: number;
  queuedDate: Date;
  estimatedStartTime?: Date;
  estimatedDuration?: number;
  webUrl: string;
  personal: boolean;
  triggeredBy: string;
  parameters: Record<string, string>;
}

export interface BuildStatus {
  buildId: string;
  state: 'queued' | 'running' | 'finished' | 'failed' | 'canceled';
  status?: 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
  statusText?: string;
  percentageComplete?: number;
  currentStageText?: string;
  elapsedTime?: number;
  estimatedTotalTime?: number;
  webUrl: string;
  startDate?: Date;
  finishDate?: Date;
  artifacts?: {
    count: number;
    href: string;
  };
  tests?: {
    count: number;
    passed: number;
    failed: number;
    ignored: number;
  };
}

export interface QueuePosition {
  buildId: string;
  position: number;
  estimatedStartTime?: Date;
  estimatedWaitTime?: number;
  canMoveToTop: boolean;
  blockedBy?: string[];
}

export interface QueueLimitations {
  maxConcurrentBuilds?: number;
  currentlyRunning: number;
  queuedBuilds: number;
  availableAgents: number;
  personalBuildLimit?: number;
  userPersonalBuilds?: number;
}

export class BuildQueueManager extends EventEmitter {
  private client: TeamCityClientAdapter;
  private maxRetries: number;
  private retryDelay: number;
  private pollingInterval: number;
  private activeMonitors: Map<string, NodeJS.Timeout>;

  constructor(
    client: TeamCityClientAdapter,
    options?: {
      maxRetries?: number;
      retryDelay?: number;
      pollingInterval?: number;
    }
  ) {
    super();
    this.client = client;
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelay = options?.retryDelay ?? 1000;
    this.pollingInterval = options?.pollingInterval ?? 5000;
    this.activeMonitors = new Map();
  }

  async queueBuild(options: QueueBuildOptions): Promise<QueuedBuild> {
    try {
      // Validate dependencies for circular references
      if (options.dependencies?.length) {
        this.validateDependencies(options.dependencies);
      }

      // Check queue limitations
      const limitations = await this.getQueueLimitations(options.buildConfiguration.id);
      if (
        limitations.maxConcurrentBuilds &&
        limitations.currentlyRunning >= limitations.maxConcurrentBuilds
      ) {
        throw new Error(`Maximum concurrent builds (${limitations.maxConcurrentBuilds}) reached`);
      }

      if (
        options.personal &&
        limitations.personalBuildLimit &&
        limitations.userPersonalBuilds &&
        limitations.userPersonalBuilds >= limitations.personalBuildLimit
      ) {
        throw new Error(`Personal build limit (${limitations.personalBuildLimit}) reached`);
      }

      // Prepare build request as a partial Build type
      const buildRequest: Partial<Build> & {
        buildType: { id: string };
        comment?: { text?: string };
        properties?: { property: Array<{ name: string; value: string }> };
        'snapshot-dependencies'?: { build: Array<{ id: string }> };
      } = {
        buildType: { id: options.buildConfiguration.id },
        branchName: options.branch,
        personal: options.personal,
        comment: { text: options.comment },
      };

      // Add parameters
      if (options.parameters) {
        buildRequest.properties = {
          property: options.parameters.parameters.map((p) => ({
            name: p.name,
            value: p.value,
          })),
        };
      }

      // Add dependencies
      if (options.dependencies?.length) {
        (buildRequest as Record<string, unknown>)['snapshot-dependencies'] = {
          build: options.dependencies.map((dep) => ({ id: dep.buildId })),
        };
      }

      // Queue the build with retry logic
      const response = await this.retryOperation(async () => {
        return await this.client.modules.buildQueue.addBuildToQueue(
          options.moveToTop,
          buildRequest as Build
        );
      });

      const queuedBuild = this.mapToQueuedBuild(response.data as Build);

      // Move to top if requested
      if (options.moveToTop) {
        await this.moveToTop(queuedBuild.buildId);
      }

      this.emit('build:queued', queuedBuild);
      return queuedBuild;
    } catch (error: unknown) {
      this.emit('build:error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        buildConfiguration: options.buildConfiguration.id,
      });
      throw error;
    }
  }

  async queueBuilds(builds: QueueBuildOptions[]): Promise<QueuedBuild[]> {
    const results: QueuedBuild[] = [];
    const errors: Array<{ index: number; error: unknown }> = [];

    // Queue builds in parallel with concurrency limit
    const concurrencyLimit = 5;
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < builds.length; i += concurrencyLimit) {
      const batch = builds.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (build, batchIndex) => {
        const actualIndex = i + batchIndex;
        try {
          const result = await this.queueBuild(build);
          results[actualIndex] = result;
        } catch (error) {
          errors.push({ index: actualIndex, error });
        }
      });
      await Promise.all(batchPromises);
    }
    /* eslint-enable no-await-in-loop */

    const successfulResults = results.filter(
      (result): result is QueuedBuild => result !== undefined
    );

    if (errors.length > 0) {
      this.emit('batch:partial', {
        successful: successfulResults,
        failed: errors,
      });
    }

    return successfulResults;
  }

  async getQueuePosition(buildId: string): Promise<QueuePosition> {
    try {
      const response = await this.client.modules.buildQueue.getAllQueuedBuilds();
      const queueResponse = (response.data ?? {}) as QueueResponse;
      const queue = queueResponse.build ?? [];

      const buildIndex = queue.findIndex((entry) => String(entry?.id ?? '') === buildId);
      if (buildIndex === -1) {
        // Check if build is already running
        const buildResponse = await this.client.builds.getBuild(buildId);
        const build = (buildResponse.data ?? {}) as Partial<Build>;
        if (build.state === 'running' || build.state === 'finished') {
          return {
            buildId,
            position: 0,
            canMoveToTop: false,
          };
        }
        throw new Error(`Build ${buildId} not found in queue`);
      }

      const position = buildIndex + 1;
      const blockedBy = this.findBlockingBuilds(queue, buildId);

      return {
        buildId,
        position,
        estimatedStartTime: (() => {
          const raw = queue[buildIndex]?.estimatedStartTime;
          return raw ? new Date(raw) : undefined;
        })(),
        estimatedWaitTime:
          queue[buildIndex]?.waitReason?.includes('agent') === true
            ? this.estimateWaitTime(queue, buildIndex)
            : undefined,
        canMoveToTop: position > 1 && blockedBy.length === 0,
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get queue position: ${message}`);
    }
  }

  async moveToTop(buildId: string): Promise<QueuePosition> {
    try {
      const position = await this.getQueuePosition(buildId);

      if (!position.canMoveToTop) {
        if (position.blockedBy?.length) {
          throw new Error(`Cannot move to top: blocked by builds ${position.blockedBy.join(', ')}`);
        }
        if (position.position === 1) {
          return position; // Already at top
        }
        throw new Error('Cannot move build to top of queue');
      }

      // Move build to top via API
      await this.client.modules.buildQueue.setQueuedBuildsOrder(undefined, {
        build: [{ id: parseInt(buildId) }],
      });

      // Return updated position
      return await this.getQueuePosition(buildId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to move build to top: ${message}`);
    }
  }

  async reorderQueue(buildIds: string[]): Promise<QueuePosition[]> {
    try {
      // Validate all builds are in queue and can be reordered
      const positions = await Promise.all(buildIds.map((id) => this.getQueuePosition(id)));

      // Check for blocking dependencies
      // Intentional sequential check; need deterministic fail-fast and message aggregation

      for (const pos of positions) {
        if (pos.blockedBy?.length) {
          throw new Error(`Build ${pos.buildId} is blocked by ${pos.blockedBy.join(', ')}`);
        }
      }

      // Reorder queue
      await this.client.modules.buildQueue.setQueuedBuildsOrder(undefined, {
        build: buildIds.map((id) => ({ id: parseInt(id) })),
      });

      // Return updated positions
      return await Promise.all(buildIds.map((id) => this.getQueuePosition(id)));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to reorder queue: ${message}`);
    }
  }

  async getBuildStatus(buildId: string): Promise<BuildStatus> {
    try {
      const response = await this.client.builds.getBuild(buildId);
      const build = (response.data ?? {}) as Partial<Build> & {
        artifacts?: { count?: number; href?: string };
        testOccurrences?: {
          count?: number;
          passed?: number;
          failed?: number;
          ignored?: number;
        };
        ['running-info']?: {
          currentStageText?: string;
          elapsedSeconds?: number;
          estimatedTotalSeconds?: number;
        };
      };

      const status: BuildStatus = {
        buildId: String(build.id ?? ''),
        state: this.mapBuildState(build.state ?? 'queued'),
        status: build.status as BuildStatus['status'],
        statusText: build.statusText,
        percentageComplete: build.percentageComplete,
        currentStageText: build['running-info']?.currentStageText,
        elapsedTime:
          build['running-info']?.elapsedSeconds != null
            ? build['running-info'].elapsedSeconds * 1000
            : undefined,
        estimatedTotalTime:
          build['running-info']?.estimatedTotalSeconds != null
            ? build['running-info'].estimatedTotalSeconds * 1000
            : undefined,
        webUrl: build.webUrl ?? '',
        startDate: build.startDate != null ? new Date(build.startDate) : undefined,
        finishDate: build.finishDate != null ? new Date(build.finishDate) : undefined,
      };

      // Add artifacts info if available
      if (build.artifacts) {
        status.artifacts = {
          count: build.artifacts.count ?? 0,
          href: build.artifacts.href ?? '',
        };
      }

      // Add test info if available
      if (build.testOccurrences) {
        status.tests = {
          count: build.testOccurrences.count ?? 0,
          passed: build.testOccurrences.passed ?? 0,
          failed: build.testOccurrences.failed ?? 0,
          ignored: build.testOccurrences.ignored ?? 0,
        };
      }

      return status;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get build status: ${message}`);
    }
  }

  async monitorBuild(
    buildId: string,
    callback: (status: BuildStatus) => void,
    options?: {
      pollInterval?: number;
      timeout?: number;
    }
  ): Promise<void> {
    const pollInterval = options?.pollInterval ?? this.pollingInterval;
    const timeout = options?.timeout;
    const startTime = Date.now();

    // Clear existing monitor if any
    this.stopMonitoring(buildId);

    const monitor = async () => {
      try {
        const status = await this.getBuildStatus(buildId);
        callback(status);

        if (
          status.state === 'finished' ||
          status.state === 'failed' ||
          status.state === 'canceled'
        ) {
          this.stopMonitoring(buildId);
          this.emit('build:completed', status);
          return;
        }

        if (timeout && Date.now() - startTime > timeout) {
          this.stopMonitoring(buildId);
          this.emit('build:timeout', { buildId, timeout });
          return;
        }

        // Schedule next poll
        const timeoutId = setTimeout(() => monitor(), pollInterval);
        this.activeMonitors.set(buildId, timeoutId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.emit('monitor:error', { buildId, error: message });
        // Continue monitoring unless explicitly stopped
        const timeoutId = setTimeout(() => monitor(), pollInterval);
        this.activeMonitors.set(buildId, timeoutId);
      }
    };

    // Start monitoring
    await monitor();
  }

  stopMonitoring(buildId: string): void {
    const timeoutId = this.activeMonitors.get(buildId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeMonitors.delete(buildId);
      this.emit('monitor:stopped', { buildId });
    }
  }

  stopAllMonitoring(): void {
    for (const [buildId, timeoutId] of this.activeMonitors) {
      clearTimeout(timeoutId);
      this.emit('monitor:stopped', { buildId });
    }
    this.activeMonitors.clear();
  }

  async cancelBuild(buildId: string, comment?: string): Promise<void> {
    try {
      await this.client.modules.buildQueue.cancelQueuedBuild(buildId);
      this.emit('build:canceled', { buildId, comment });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to cancel build: ${message}`);
    }
  }

  async getQueueLimitations(buildTypeId: string): Promise<QueueLimitations> {
    try {
      // Get build type details
      const buildTypeResponse = await this.client.modules.buildTypes.getBuildType(buildTypeId);
      const buildType = (buildTypeResponse.data ?? {}) as {
        settings?: {
          property?: Array<{ name?: string; value?: string }>;
        };
      };

      // Get queue info
      const queueResponse = await this.client.modules.buildQueue.getAllQueuedBuilds();
      const queueData = (queueResponse.data ?? {}) as QueueResponse;
      const queuedBuilds = (queueData.build ?? []).filter(
        (entry) => String(entry?.buildTypeId ?? '') === buildTypeId
      ).length;

      // Get running builds count
      const runningBuildsResponse = await this.client.builds.getAllBuilds(
        `buildType:${buildTypeId},state:running`,
        'count'
      );
      const runningBuilds = (runningBuildsResponse.data ?? {}) as { count?: number };

      // Get agent pool info
      const agentsResponse = await this.client.modules.agents.getAllAgents(
        `compatible:(buildType:${buildTypeId}),enabled:true`,
        'count'
      );
      const agents = (agentsResponse.data ?? {}) as { count?: number };

      return {
        maxConcurrentBuilds: (() => {
          const prop = buildType.settings?.property?.find(
            (p) => p?.name === 'maximumConcurrentBuilds'
          );
          return prop?.value ? parseInt(prop.value, 10) : undefined;
        })(),
        currentlyRunning: runningBuilds.count ?? 0,
        queuedBuilds,
        availableAgents: agents.count ?? 0,
      };
    } catch (error: unknown) {
      // Return basic info if detailed info fails
      return {
        currentlyRunning: 0,
        queuedBuilds: 0,
        availableAgents: 1,
      };
    }
  }

  private validateDependencies(dependencies: Array<{ buildId: string; waitForFinish?: boolean }>) {
    const seen = new Set<string>();
    // Validate linearly; tiny array and readability preferred

    for (const dep of dependencies) {
      if (seen.has(dep.buildId)) {
        throw new Error(`Circular dependency detected: ${dep.buildId} appears multiple times`);
      }
      seen.add(dep.buildId);
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = this.maxRetries
  ): Promise<T> {
    let lastError: unknown;

    // Intentional retries loop; each attempt awaits the operation
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i <= retries; i++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;

        // Don't retry on client errors (4xx)
        if (error != null && typeof error === 'object' && 'response' in error) {
          const httpError = error as { response?: { status?: number } };
          if (
            httpError.response?.status &&
            httpError.response.status >= 400 &&
            httpError.response.status < 500
          ) {
            throw error;
          }
        }

        if (i < retries) {
          const delay = this.retryDelay * Math.pow(2, i); // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.emit('retry', { attempt: i + 1, maxRetries: retries, error: message });
        }
      }
    }
    /* eslint-enable no-await-in-loop */

    throw lastError;
  }

  private mapToQueuedBuild(build: Build): QueuedBuild {
    const queuedBuild = build as QueuedBuildData;
    return {
      buildId: String(build.id ?? ''),
      buildTypeId: build.buildTypeId ?? '',
      branchName: build.branchName,
      queuePosition: build.queuePosition ?? 0,
      queuedDate: new Date(build.queuedDate ?? new Date()),
      estimatedStartTime:
        queuedBuild.estimatedStartTime != null
          ? new Date(queuedBuild.estimatedStartTime)
          : undefined,
      estimatedDuration: queuedBuild.estimatedDuration,
      webUrl: build.webUrl ?? '',
      personal: build.personal ?? false,
      triggeredBy: build.triggered?.user?.username ?? 'system',
      parameters: this.extractParameters(queuedBuild),
    };
  }

  private extractParameters(build: {
    properties?: { property?: Array<{ name: string; value: string }> };
  }): Record<string, string> {
    const params: Record<string, string> = {};
    if (build.properties?.property) {
      for (const prop of build.properties.property) {
        params[prop.name] = prop.value;
      }
    }
    return params;
  }

  private mapBuildState(state: string): BuildStatus['state'] {
    switch (state.toLowerCase()) {
      case 'queued':
        return 'queued';
      case 'running':
        return 'running';
      case 'finished':
        return 'finished';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'canceled';
      default:
        return 'queued';
    }
  }

  private findBlockingBuilds(queue: QueueEntry[], buildId: string): string[] {
    const blocking: string[] = [];
    const build = queue.find((entry) => String(entry?.id ?? '') === buildId);

    if (!build) {
      return blocking;
    }

    // Check for snapshot dependencies
    const deps = (
      build as {
        'snapshot-dependencies'?: { build?: Array<{ id?: string }> };
      }
    )['snapshot-dependencies'];
    if (deps?.build != null) {
      for (const dep of deps.build) {
        if (dep?.id != null && queue.some((entry) => String(entry?.id ?? '') === dep.id)) {
          blocking.push(dep.id);
        }
      }
    }

    return blocking;
  }

  private estimateWaitTime(_queue: QueueEntry[], buildIndex: number): number {
    // Simple estimation based on position and average build time
    // In reality, this would need more sophisticated calculation
    const averageBuildTime = 5 * 60 * 1000; // 5 minutes default
    return buildIndex * averageBuildTime;
  }
}
