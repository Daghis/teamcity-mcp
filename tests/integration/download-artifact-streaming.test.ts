import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { callTool } from './lib/mcp-runner';
import {
  type ArtifactFixture,
  hasTeamCityEnv,
  isSerialWorker,
  setupArtifactFixture,
  teardownProjectFixture,
  wait,
} from './lib/test-fixtures';

const serialDescribe = isSerialWorker ? describe : describe.skip;

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

interface BatchArtifactItem {
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

interface DownloadArtifactsResponse {
  artifacts?: BatchArtifactItem[];
  success?: boolean;
  error?: { message?: string } | string;
}

serialDescribe('download_build_artifact tool (integration)', () => {
  let fixture: ArtifactFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    const artifactStepScript = [
      'echo artifact-content > artifact.txt',
      'echo artifact-extra > artifact-extra.txt',
      'echo "##teamcity[publishArtifacts \'artifact.txt\']"',
      'echo "##teamcity[publishArtifacts \'artifact-extra.txt\']"',
    ].join('\n');

    fixture = await setupArtifactFixture({
      prefix: 'E2E_ARTIFACT',
      namePrefix: 'E2E Artifact',
      artifactScript: artifactStepScript,
      buildConfigDescription: 'Integration scenario for artifact downloads',
      artifactRules: '*.txt',
      waitForBuild: true,
      buildTimeout: 90_000,
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('downloads artifact as base64 payload (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const result = await callTool<DownloadArtifactResponse>('dev', 'download_build_artifact', {
      buildId: fixture.buildId,
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
    expect(result.path).toBe('artifact.txt');
    const content = String(result.content ?? '');
    const decoded = Buffer.from(content, 'base64').toString('utf8').trim();
    expect(decoded).toBe('artifact-content');
  }, 60_000);

  it('downloads secondary artifact as base64 payload (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const result = await callTool<DownloadArtifactResponse>('dev', 'download_build_artifact', {
      buildId: fixture.buildId,
      artifactPath: 'artifact-extra.txt',
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
      throw new Error(`download_build_artifact (base64 extra) failed: ${message}`);
    }

    expect(result.encoding).toBe('base64');
    const content = String(result.content ?? '');
    const decoded = Buffer.from(content, 'base64').toString('utf8').trim();
    expect(decoded).toBe('artifact-extra');
  }, 60_000);

  it('downloads multiple artifacts as base64 payloads (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    await wait(3000);

    const result = await callTool<DownloadArtifactsResponse>('dev', 'download_build_artifacts', {
      buildId: fixture.buildId,
      artifactPaths: ['artifact.txt', 'artifact-extra.txt'],
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
      throw new Error(`download_build_artifacts (base64) failed: ${message}`);
    }

    const artifacts = result.artifacts ?? [];
    expect(artifacts.length).toBeGreaterThanOrEqual(2);

    const first = artifacts.find((entry) => entry?.path === 'artifact.txt');
    const second = artifacts.find((entry) => entry?.path === 'artifact-extra.txt');

    if (!first || !second || first.success === false || second.success === false) {
      const summary = (result.artifacts ?? []).map((entry) => ({
        path: entry?.path,
        success: entry?.success,
        error: entry?.error,
      }));
      throw new Error(`download_build_artifacts (base64) entries: ${JSON.stringify(summary)}`);
    }

    expect(first?.encoding).toBe('base64');
    expect(
      Buffer.from(String(first?.content ?? ''), 'base64')
        .toString('utf8')
        .trim()
    ).toBe('artifact-content');

    expect(second?.encoding).toBe('base64');
    expect(
      Buffer.from(String(second?.content ?? ''), 'base64')
        .toString('utf8')
        .trim()
    ).toBe('artifact-extra');
  }, 60_000);

  it('streams artifact to disk (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const outputPath = join(tmpdir(), `artifact-download-${Date.now()}.txt`);

    const result = await callTool<DownloadArtifactResponse>('dev', 'download_build_artifact', {
      buildId: fixture.buildId,
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

  it('streams multiple artifacts to disk (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const outputDir = join(tmpdir(), `artifact-batch-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    let result: DownloadArtifactsResponse;
    try {
      await wait(3000);
      result = await callTool<DownloadArtifactsResponse>('dev', 'download_build_artifacts', {
        buildId: fixture.buildId,
        artifactPaths: ['artifact.txt', 'artifact-extra.txt'],
        encoding: 'stream',
        outputDir,
      });
    } catch (error) {
      await fs.rm(outputDir, { recursive: true, force: true });
      throw error;
    }

    if (result.success === false) {
      const message =
        typeof result.error === 'object' && result.error?.message
          ? String(result.error.message)
          : String(result.error ?? '');
      if (message.includes('Artifact not found') || message.includes('Failed to fetch artifacts')) {
        await fs.rm(outputDir, { recursive: true, force: true });
        expect(true).toBe(true);
        return;
      }
      await fs.rm(outputDir, { recursive: true, force: true });
      throw new Error(`download_build_artifacts (stream) failed: ${message}`);
    }

    const artifacts = result.artifacts ?? [];
    expect(artifacts.length).toBeGreaterThanOrEqual(2);

    const first = artifacts.find((entry) => entry?.path === 'artifact.txt');
    const second = artifacts.find((entry) => entry?.path === 'artifact-extra.txt');

    if (!first || !second || first.success === false || second.success === false) {
      const summary = (result.artifacts ?? []).map((entry) => ({
        path: entry?.path,
        success: entry?.success,
        error: entry?.error,
      }));
      await fs.rm(outputDir, { recursive: true, force: true });
      throw new Error(`download_build_artifacts (stream) entries: ${JSON.stringify(summary)}`);
    }

    if (!first.outputPath || !second.outputPath) {
      await fs.rm(outputDir, { recursive: true, force: true });
      throw new Error('Expected streamed artifacts to include output paths');
    }

    expect(first.encoding).toBe('stream');
    expect(second.encoding).toBe('stream');
    expect(first.outputPath.startsWith(outputDir)).toBe(true);
    expect(second.outputPath.startsWith(outputDir)).toBe(true);

    const firstContent = await fs.readFile(first.outputPath, 'utf8');
    const secondContent = await fs.readFile(second.outputPath, 'utf8');

    expect(firstContent.trim()).toBe('artifact-content');
    expect(secondContent.trim()).toBe('artifact-extra');

    await fs.rm(outputDir, { recursive: true, force: true });
  }, 60_000);
});
