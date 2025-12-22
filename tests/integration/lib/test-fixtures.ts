/**
 * Typed fixture helpers for integration test setup/teardown.
 *
 * Provides reusable setup functions that create TeamCity resources (projects, build configs, etc.)
 * and matching teardown functions that clean them up, designed to be used with beforeAll/afterAll.
 */
import type { ActionResult, BuildRef, TriggerBuildResult } from '../../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect, type ToolBatchStep } from './mcp-runner';

/** Check if TeamCity environment variables are configured */
export const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
  (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

/** Check if running in the serial worker (for tests that need exclusive access) */
export const isSerialWorker =
  process.env['JEST_WORKER_ID'] === '1' || process.env['SERIAL_BUILD_TESTS'] === 'true';

/** Sleep helper */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Configuration for creating a basic project fixture
 */
export interface ProjectFixtureConfig {
  /** Unique prefix for resource IDs (e.g., 'E2E_ARTIFACT') */
  prefix: string;
  /** Human-readable prefix for resource names (e.g., 'E2E Artifact') */
  namePrefix: string;
  /** Optional description for the project */
  projectDescription?: string;
  /** Optional description for the build config */
  buildConfigDescription?: string;
  /** Optional build step script content */
  stepScript?: string;
  /** Optional build step name */
  stepName?: string;
  /** Optional artifact rules to set on the build config */
  artifactRules?: string;
}

/**
 * Result of setting up a basic project fixture
 */
export interface ProjectFixture {
  projectId: string;
  projectName: string;
  buildTypeId: string;
  buildTypeName: string;
  timestamp: number;
}

/**
 * Configuration for creating an artifact fixture (project + build config + triggered build)
 */
export interface ArtifactFixtureConfig extends ProjectFixtureConfig {
  /** Script to create artifacts */
  artifactScript: string;
  /** Wait for build completion (default: true) */
  waitForBuild?: boolean;
  /** Build completion timeout in ms (default: 60000) */
  buildTimeout?: number;
}

/**
 * Result of setting up an artifact fixture
 */
export interface ArtifactFixture extends ProjectFixture {
  buildId: string;
  buildNumber?: string;
}

/**
 * Configuration for creating a VCS fixture
 */
export interface VcsFixtureConfig extends ProjectFixtureConfig {
  /** VCS root URL */
  vcsUrl: string;
  /** VCS branch (default: refs/heads/main) */
  vcsBranch?: string;
  /** VCS type (default: jetbrains.git) */
  vcsName?: string;
}

/**
 * Result of setting up a VCS fixture
 */
export interface VcsFixture extends ProjectFixture {
  vcsRootId: string;
  vcsRootName: string;
}

/**
 * Creates a basic project with a build configuration and optional build step.
 * Call in beforeAll with a generous timeout (~120s).
 */
export async function setupProjectFixture(config: ProjectFixtureConfig): Promise<ProjectFixture> {
  const ts = Date.now();
  const projectId = `${config.prefix}_${ts}`;
  const projectName = `${config.namePrefix} ${ts}`;
  const buildTypeId = `${config.prefix}_BT_${ts}`;
  const buildTypeName = `${config.namePrefix} BuildType ${ts}`;

  const batchSteps: ToolBatchStep[] = [
    {
      tool: 'create_project',
      args: {
        id: projectId,
        name: projectName,
        ...(config.projectDescription && { description: config.projectDescription }),
      },
    },
    {
      tool: 'create_build_config',
      args: {
        projectId,
        id: buildTypeId,
        name: buildTypeName,
        ...(config.buildConfigDescription && { description: config.buildConfigDescription }),
      },
    },
  ];

  if (config.stepScript) {
    batchSteps.push({
      tool: 'manage_build_steps',
      args: {
        buildTypeId,
        action: 'add',
        name: config.stepName ?? 'test-step',
        type: 'simpleRunner',
        properties: {
          'script.content': config.stepScript,
          'use.custom.script': 'true',
        },
      },
    });
  }

  const results = await callToolsBatchExpect('full', batchSteps);

  const projectResult = results[0]?.result as ActionResult | undefined;
  const buildConfigResult = results[1]?.result as ActionResult | undefined;

  if (!projectResult?.success) {
    throw new Error(`Failed to create project: ${JSON.stringify(projectResult)}`);
  }
  if (!buildConfigResult?.success) {
    throw new Error(`Failed to create build config: ${JSON.stringify(buildConfigResult)}`);
  }

  if (config.stepScript && results[2]) {
    const stepResult = results[2].result as ActionResult | undefined;
    if (!stepResult?.success) {
      throw new Error(`Failed to add build step: ${JSON.stringify(stepResult)}`);
    }
  }

  // Set artifact rules if specified
  if (config.artifactRules) {
    try {
      await callTool<ActionResult>('full', 'update_build_config', {
        buildTypeId,
        artifactRules: config.artifactRules,
      });
    } catch {
      // Some TeamCity servers restrict artifactRules updates; proceed if it fails
    }
  }

  return {
    projectId,
    projectName,
    buildTypeId,
    buildTypeName,
    timestamp: ts,
  };
}

/**
 * Creates a project with a build configuration that produces artifacts,
 * triggers a build, and waits for completion.
 * Call in beforeAll with a generous timeout (~120s).
 */
export async function setupArtifactFixture(
  config: ArtifactFixtureConfig
): Promise<ArtifactFixture> {
  const fixture = await setupProjectFixture({
    ...config,
    stepScript: config.artifactScript,
  });

  // Trigger the build
  const trigger = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
    buildTypeId: fixture.buildTypeId,
    comment: 'integration-test-setup',
  });

  if (!trigger.success || !trigger.buildId) {
    throw new Error(`Failed to trigger build: ${JSON.stringify(trigger)}`);
  }

  const buildId = trigger.buildId;

  // Try to promote the build in the queue
  try {
    await callTool('full', 'move_queued_build_to_top', { buildId });
  } catch {
    // Non-fatal: queue manipulation may not be permitted
  }

  // Wait for build completion if requested
  if (config.waitForBuild !== false) {
    await waitForBuildCompletion(buildId, config.buildTimeout ?? 60_000);
  }

  // Get build number
  let buildNumber: string | undefined;
  try {
    const buildRef = await callTool<BuildRef>('dev', 'get_build', { buildId });
    buildNumber = buildRef.number ? String(buildRef.number) : undefined;
  } catch {
    // Non-fatal
  }

  return {
    ...fixture,
    buildId,
    buildNumber,
  };
}

/**
 * Creates a project with a VCS root.
 * Call in beforeAll with a generous timeout (~120s).
 */
export async function setupVcsFixture(config: VcsFixtureConfig): Promise<VcsFixture> {
  const ts = Date.now();
  const projectId = `${config.prefix}_${ts}`;
  const projectName = `${config.namePrefix} ${ts}`;
  const buildTypeId = `${config.prefix}_BT_${ts}`;
  const buildTypeName = `${config.namePrefix} BuildType ${ts}`;
  const vcsRootId = `${config.prefix}_VCS_${ts}`;
  const vcsRootName = `${config.namePrefix} VCS Root ${ts}`;

  const batchSteps: ToolBatchStep[] = [
    {
      tool: 'create_project',
      args: {
        id: projectId,
        name: projectName,
        ...(config.projectDescription && { description: config.projectDescription }),
      },
    },
    {
      tool: 'create_build_config',
      args: {
        projectId,
        id: buildTypeId,
        name: buildTypeName,
        ...(config.buildConfigDescription && { description: config.buildConfigDescription }),
      },
    },
    {
      tool: 'create_vcs_root',
      args: {
        projectId,
        id: vcsRootId,
        name: vcsRootName,
        vcsName: config.vcsName ?? 'jetbrains.git',
        url: config.vcsUrl,
        branch: config.vcsBranch ?? 'refs/heads/main',
      },
    },
  ];

  const results = await callToolsBatchExpect('full', batchSteps);

  const projectResult = results[0]?.result as ActionResult | undefined;
  const buildConfigResult = results[1]?.result as ActionResult | undefined;
  const vcsResult = results[2]?.result as ActionResult | undefined;

  if (!projectResult?.success) {
    throw new Error(`Failed to create project: ${JSON.stringify(projectResult)}`);
  }
  if (!buildConfigResult?.success) {
    throw new Error(`Failed to create build config: ${JSON.stringify(buildConfigResult)}`);
  }
  if (!vcsResult?.success) {
    throw new Error(`Failed to create VCS root: ${JSON.stringify(vcsResult)}`);
  }

  return {
    projectId,
    projectName,
    buildTypeId,
    buildTypeName,
    vcsRootId,
    vcsRootName,
    timestamp: ts,
  };
}

/**
 * Deletes a project (cleanup function).
 * Call in afterAll. Swallows errors to ensure cleanup doesn't fail tests.
 */
export async function teardownProjectFixture(projectId: string): Promise<void> {
  if (!hasTeamCityEnv) return;

  try {
    await callTool('full', 'delete_project', { projectId });
  } catch {
    // Swallow cleanup errors - the project may have already been deleted
  }
}

/**
 * Waits for a build to complete with polling.
 * Promotes the build in the queue on first encounter of 'queued' state.
 */
export async function waitForBuildCompletion(buildId: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let promoted = false;

  while (Date.now() < deadline) {
    let status: { state?: string; status?: string } | null = null;
    try {
      status = await callTool<{ state?: string; status?: string }>('dev', 'get_build_status', {
        buildId,
        includeProblems: true,
        includeTests: false,
      });
    } catch (error) {
      console.warn(`Polling build status failed: ${error}`);
    }

    const state = String(status?.state ?? '');
    if (state === 'finished') {
      const outcome = String(status?.status ?? 'UNKNOWN');
      if (outcome !== 'SUCCESS') {
        throw new Error(`Build ${buildId} finished with status ${outcome}`);
      }
      return;
    }

    if (state === 'queued' && !promoted) {
      try {
        await callTool('full', 'move_queued_build_to_top', { buildId });
      } catch (error) {
        console.warn(`move_queued_build_to_top failed (non-fatal): ${error}`);
      } finally {
        promoted = true;
      }
    }

    await wait(2_000);
  }

  throw new Error(`Timed out waiting for build ${buildId} to finish`);
}

/**
 * Creates multiple build configurations in a project.
 */
export async function createMultipleBuildConfigs(
  projectId: string,
  configs: Array<{ id: string; name: string }>
): Promise<void> {
  const batchSteps = configs.map((config) => ({
    tool: 'create_build_config',
    args: {
      projectId,
      id: config.id,
      name: config.name,
    },
  }));

  await callToolsBatchExpect('full', batchSteps);
}

/**
 * Triggers multiple builds and returns their IDs.
 */
export async function triggerMultipleBuilds(
  buildTypeId: string,
  count: number,
  commentPrefix = 'integration-test'
): Promise<string[]> {
  const batchSteps = Array.from({ length: count }, (_, i) => ({
    tool: 'trigger_build',
    args: {
      buildTypeId,
      comment: `${commentPrefix}-${i + 1}`,
    },
  }));

  const batch = await callToolsBatch('dev', batchSteps);
  const buildIds: string[] = [];

  for (const step of batch.results) {
    if (step.ok) {
      const result = step.result as TriggerBuildResult;
      if (result.buildId) {
        buildIds.push(result.buildId);
      }
    }
  }

  return buildIds;
}
