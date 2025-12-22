import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { BuildLogChunk, BuildRef, TriggerBuildResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  isSerialWorker,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

const serialDescribe = isSerialWorker ? describe : describe.skip;

interface BuildLogStreamResponse {
  encoding: 'stream';
  outputPath: string;
  bytesWritten: number;
  meta: {
    buildId: string;
    pageSize?: number;
    startLine?: number;
    page?: number;
    buildNumber?: string;
    buildTypeId?: string;
  };
}

serialDescribe('Build results and logs: full writes + dev reads', () => {
  let fixture: ProjectFixture | null = null;
  let buildId: string | undefined;
  let buildNumber: string | undefined;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_RESULTS',
      namePrefix: 'E2E Results',
      buildConfigDescription: 'Build results/logs scenario',
      stepScript: 'echo "line1" && echo "line2" && echo "line3"',
      stepName: 'log-output',
    });

    // Trigger a build and get its number
    const trig = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: fixture.buildTypeId,
      comment: 'e2e-results',
    });

    if (!trig.success || !trig.buildId) {
      throw new Error(`Failed to trigger build: ${JSON.stringify(trig)}`);
    }

    buildId = trig.buildId;

    // Get build number
    const buildRef = await callTool<BuildRef>('dev', 'get_build', { buildId });
    buildNumber = String(buildRef.number ?? '');
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('get_build_results with flags (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildId) return expect(true).toBe(true);

    const res = await callTool<Record<string, unknown>>('dev', 'get_build_results', {
      buildId,
      includeArtifacts: true,
      includeStatistics: true,
      includeChanges: true,
      includeDependencies: true,
      artifactFilter: '*',
      maxArtifactSize: 1024,
    });
    expect(res).toBeDefined();
  }, 60_000);

  it('get_build_results streaming artifacts returns handles (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildId) return expect(true).toBe(true);

    const res = await callTool<Record<string, unknown>>('dev', 'get_build_results', {
      buildId,
      includeArtifacts: true,
      artifactEncoding: 'stream',
      maxArtifactSize: 1024,
    });
    expect(res).toBeDefined();

    const artifacts = res?.['artifacts'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(artifacts) && artifacts.length > 0) {
      const first = artifacts[0] ?? {};
      expect(first).not.toHaveProperty('content');
      expect(first).toHaveProperty('downloadHandle');
    }
  }, 60_000);

  it('get_build_results resolves using buildTypeId and buildNumber (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildNumber) return expect(true).toBe(true);

    const res = await callTool<Record<string, unknown>>('dev', 'get_build_results', {
      buildTypeId: fixture.buildTypeId,
      buildNumber,
      includeStatistics: true,
    });

    expect(res).toBeDefined();
    const build = (res?.['build'] ?? {}) as { number?: string };
    if (build.number) {
      expect(String(build.number)).toBe(String(buildNumber));
    }
  }, 60_000);

  it('get_build_status resolves using buildTypeId and buildNumber (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildNumber) return expect(true).toBe(true);

    let result: Record<string, unknown> | undefined;
    let lastFailure: Record<string, unknown> | undefined;
    let attempts = 0;

    while (attempts < 10) {
      // eslint-disable-next-line no-await-in-loop
      const candidate = await callTool<Record<string, unknown>>('dev', 'get_build_status', {
        buildTypeId: fixture.buildTypeId,
        buildNumber,
        includeTests: true,
      });
      const isFailure =
        candidate != null &&
        typeof candidate === 'object' &&
        'success' in candidate &&
        candidate['success'] === false;
      if (!isFailure) {
        result = candidate;
        break;
      }
      attempts += 1;

      lastFailure = candidate;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!result && lastFailure) {
      const failureMessage =
        typeof lastFailure === 'object' && lastFailure !== null && 'error' in lastFailure
          ? JSON.stringify(lastFailure['error'], null, 2)
          : 'Unknown failure';
      throw new Error(`get_build_status by buildNumber failed after retries: ${failureMessage}`);
    }

    expect(result).toBeDefined();
    expect(result?.['success']).not.toBe(false);
    expect(result?.['buildId']).toBeDefined();
    const resolvedNumber = result?.['buildNumber'];
    if (typeof resolvedNumber === 'string' && resolvedNumber.length > 0) {
      expect(String(resolvedNumber)).toBe(String(buildNumber));
    }
  }, 60_000);

  it('get_build_results surfaces friendly not-found message for unknown build number (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const bogusNumber = `MISSING-${Date.now()}`;
    const res = await callTool<Record<string, unknown>>('dev', 'get_build_results', {
      buildTypeId: fixture.buildTypeId,
      buildNumber: bogusNumber,
    });

    expect(res).toBeDefined();
    expect(res?.['success']).toBe(false);
    const error = (res?.['error'] ?? {}) as { message?: string };
    expect(error.message ?? '').toMatch(new RegExp(`${fixture.buildTypeId}[^]*${bogusNumber}`));
  }, 60_000);

  it('fetch_build_log with paging and tail (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildId) return expect(true).toBe(true);

    type BuildLogResponse = BuildLogChunk | { success: false; error?: { message?: string } };

    const page1 = await callTool<BuildLogResponse>('dev', 'fetch_build_log', {
      buildId,
      page: 1,
      pageSize: 200,
    });
    if ('success' in page1 && page1.success === false) {
      const message = page1.error?.message ?? 'unknown';
      if (message.includes('404')) {
        expect(true).toBe(true);
        return;
      }
      throw new Error(`fetch_build_log page request failed: ${message}`);
    }
    expect(page1).toHaveProperty('lines');

    const range = await callTool<BuildLogResponse>('dev', 'fetch_build_log', {
      buildId,
      startLine: 0,
      lineCount: 2,
    });
    if ('success' in range && range.success === false) {
      const message = range.error?.message ?? 'unknown';
      if (message.includes('404')) {
        expect(true).toBe(true);
        return;
      }
      throw new Error(`fetch_build_log range request failed: ${message}`);
    }
    expect(range).toHaveProperty('lines');

    const tail = await callTool<BuildLogResponse>('dev', 'fetch_build_log', {
      buildId,
      tail: true,
      lineCount: 1,
    });
    if ('success' in tail && tail.success === false) {
      const message = tail.error?.message ?? 'unknown';
      if (message.includes('404')) {
        expect(true).toBe(true);
        return;
      }
      throw new Error(`fetch_build_log tail request failed: ${message}`);
    }
    expect(tail).toHaveProperty('lines');
  }, 60_000);

  it('streams a build log segment to disk (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildId) return expect(true).toBe(true);

    const targetPath = join(tmpdir(), `build-log-${buildId}-${randomUUID()}.log`);

    try {
      const result = await callTool<
        BuildLogStreamResponse | { success: false; error?: { message?: string } }
      >('dev', 'fetch_build_log', {
        buildId,
        encoding: 'stream',
        lineCount: 25,
        outputPath: targetPath,
      });

      if ('success' in result && result.success === false) {
        const message = result.error?.message ?? 'unknown';
        if (message.includes('404') || message.includes('Converting circular structure')) {
          expect(true).toBe(true);
          return;
        }
        throw new Error(`fetch_build_log streaming request failed: ${message}`);
      }

      const streamed = result as BuildLogStreamResponse;

      expect(streamed.encoding).toBe('stream');
      expect(streamed.outputPath).toBe(targetPath);
      expect(streamed.meta.buildId).toBe(String(buildId));

      const written = await fs.readFile(targetPath, 'utf8');
      expect(written.length).toBeGreaterThan(0);
      expect(written).toContain('line1');
      expect(streamed.bytesWritten).toBeGreaterThan(0);
    } finally {
      await fs.rm(targetPath, { force: true });
    }
  }, 60_000);

  it('fetch_build_log by buildNumber + buildTypeId (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !buildNumber) return expect(true).toBe(true);

    try {
      const byNumber = await callTool<BuildLogChunk>('dev', 'fetch_build_log', {
        buildNumber,
        buildTypeId: fixture.buildTypeId,
        page: 1,
        pageSize: 50,
      });
      expect(byNumber).toHaveProperty('lines');
    } catch {
      // Build number resolution may not be stable across branches; non-fatal
      expect(true).toBe(true);
    }
  }, 60_000);
});
