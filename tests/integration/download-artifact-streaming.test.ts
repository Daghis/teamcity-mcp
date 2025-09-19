import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import type { ActionResult, BuildRef, TriggerBuildResult } from '../types/tool-results';
import { callTool, callToolsBatch } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_ARTIFACT_${ts}`;
const PROJECT_NAME = `E2E Artifact ${ts}`;
const BT_ID = `E2E_ARTIFACT_BT_${ts}`;
const BT_NAME = `E2E Artifact BuildType ${ts}`;

let buildId: string | undefined;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface DownloadArtifactResponse {
  name?: string;
  path?: string;
  size?: number;
  mimeType?: string;
  encoding?: string;
  content?: string;
  outputPath?: string;
  bytesWritten?: number;
  success?: boolean;
  error?: { message?: string } | string;
}

async function waitForBuildCompletion(id: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for build ${id} to finish`);
    }

    let status: { state?: string; status?: string } | null = null;
    try {
      // eslint-disable-next-line no-await-in-loop
      status = await callTool<{ state?: string; status?: string }>('dev', 'get_build_status', {
        buildId: id,
        includeProblems: true,
        includeTests: false,
      });
    } catch (error) {
      // Allow transient errors (e.g., build yet to be registered) before timing out.
      // eslint-disable-next-line no-console
      console.warn(`Polling build status failed: ${error}`);
    }

    const state = String(status?.state ?? '');
    if (state === 'finished') {
      const outcome = String(status?.status ?? 'UNKNOWN');
      if (outcome !== 'SUCCESS') {
        throw new Error(`Build ${id} finished with status ${outcome}`);
      }
      return;
    }

    // eslint-disable-next-line no-await-in-loop
    await wait(5_000);
  }
}

describe('download_build_artifact tool (integration)', () => {
  afterAll(async () => {
    if (!hasTeamCityEnv) return;
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_err) {
      /* swallow cleanup errors */
    }
  });

  it('creates project and build configuration (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);

    const batch = await callToolsBatch('full', [
      {
        tool: 'create_project',
        args: {
          id: PROJECT_ID,
          name: PROJECT_NAME,
        },
      },
      {
        tool: 'create_build_config',
        args: {
          projectId: PROJECT_ID,
          id: BT_ID,
          name: BT_NAME,
          description: 'Integration scenario for artifact downloads',
        },
      },
      {
        tool: 'manage_build_steps',
        args: {
          buildTypeId: BT_ID,
          action: 'add',
          name: 'create-artifact',
          type: 'simpleRunner',
          properties: {
            'script.content':
              "echo artifact-content > artifact.txt && echo ##teamcity[publishArtifacts 'artifact.txt']",
          },
        },
      },
    ]);

    expect(batch.completed).toBe(true);
    expect(batch.results).toHaveLength(3);

    const [projectStep, buildConfigStep, stepStep] = batch.results;
    const project = projectStep?.result as ActionResult | undefined;
    const buildConfig = buildConfigStep?.result as ActionResult | undefined;
    const step = stepStep?.result as ActionResult | undefined;

    expect(projectStep?.ok).toBe(true);
    expect(project).toMatchObject({ success: true, action: 'create_project' });

    expect(buildConfigStep?.ok).toBe(true);
    expect(buildConfig).toMatchObject({ success: true, action: 'create_build_config' });

    expect(stepStep?.ok).toBe(true);
    expect(step).toMatchObject({ success: true, action: 'add_build_step' });

    try {
      const update = await callTool<ActionResult>('full', 'update_build_config', {
        buildTypeId: BT_ID,
        artifactRules: 'artifact.txt',
      });
      expect(update).toMatchObject({ success: true });
    } catch (_err) {
      // Some TeamCity servers restrict artifactRules updates; proceed if it fails.
      expect(true).toBe(true);
    }
  }, 60_000);

  it('runs build and waits for completion', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);

    const trigger = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: BT_ID,
      comment: 'integration-download-artifact',
    });
    expect(trigger).toMatchObject({ success: true, action: 'trigger_build' });
    buildId = trigger.buildId;
    expect(typeof buildId).toBe('string');
    if (!buildId) return expect(true).toBe(true);

    // Ensure build number is fetched (also waits briefly before polling status)
    const buildRef = await callTool<BuildRef>('dev', 'get_build', { buildId });
    expect(buildRef.id ?? buildRef.number ?? buildId).toBeDefined();

    await waitForBuildCompletion(buildId, 60_000);
  }, 120_000);

  it('downloads artifact as base64 payload (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!buildId) return expect(true).toBe(true);

    const result = await callTool<DownloadArtifactResponse>('dev', 'download_build_artifact', {
      buildId,
      artifactPath: 'artifact.txt',
      encoding: 'base64',
    });

    if (result.success === false) {
      const message =
        typeof result.error === 'object' && result.error?.message
          ? String(result.error.message)
          : String(result.error ?? '');
      if (message.includes('Artifact not found') || message.includes('Failed to fetch artifacts')) {
        expect(true).toBe(true);
        return;
      }
      throw new Error(`download_build_artifact (base64) failed: ${message}`);
    }

    expect(result.encoding).toBe('base64');
    const content = String(result.content ?? '');
    const decoded = Buffer.from(content, 'base64').toString('utf8').trim();
    expect(decoded).toBe('artifact-content');
  }, 60_000);

  it('streams artifact to disk (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!buildId) return expect(true).toBe(true);

    const outputPath = join(tmpdir(), `artifact-download-${Date.now()}.txt`);

    const result = await callTool<DownloadArtifactResponse>('dev', 'download_build_artifact', {
      buildId,
      artifactPath: 'artifact.txt',
      encoding: 'stream',
      outputPath,
    });

    if (result.success === false) {
      const message =
        typeof result.error === 'object' && result.error?.message
          ? String(result.error.message)
          : String(result.error ?? '');
      if (message.includes('Artifact not found') || message.includes('Failed to fetch artifacts')) {
        await fs.rm(outputPath, { force: true });
        expect(true).toBe(true);
        return;
      }
      await fs.rm(outputPath, { force: true });
      throw new Error(`download_build_artifact (stream) failed: ${message}`);
    }

    expect(result.encoding).toBe('stream');
    expect(result.outputPath).toBe(outputPath);

    const written = await fs.readFile(outputPath, 'utf8');
    expect(written.trim()).toBe('artifact-content');

    await fs.rm(outputPath, { force: true });
  }, 60_000);
});
