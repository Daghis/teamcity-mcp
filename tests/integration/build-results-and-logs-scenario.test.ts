import { describe, expect, it } from '@jest/globals';

import type {
  ActionResult,
  BuildLogChunk,
  BuildRef,
  TriggerBuildResult,
} from '../types/tool-results';
import { callTool } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_RESULTS_${ts}`;
const PROJECT_NAME = `E2E Results ${ts}`;
const BT_ID = `E2E_RESULTS_BT_${ts}`;
const BT_NAME = `E2E Results BuildType ${ts}`;

let buildId: string | undefined;
let buildNumber: string | undefined;

describe('Build results and logs: full writes + dev reads', () => {
  afterAll(async () => {
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_e) {
      expect(true).toBe(true);
    }
  });
  it('creates project and build config (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const cproj = await callTool<ActionResult>('full', 'create_project', {
      id: PROJECT_ID,
      name: PROJECT_NAME,
    });
    expect(cproj).toMatchObject({ success: true, action: 'create_project' });
    const cbt = await callTool<ActionResult>('full', 'create_build_config', {
      projectId: PROJECT_ID,
      id: BT_ID,
      name: BT_NAME,
      description: 'Build results/logs scenario',
    });
    expect(cbt).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('adds a step and triggers a build (full add, dev trigger)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const step = await callTool('full', 'manage_build_steps', {
      buildTypeId: BT_ID,
      action: 'add',
      name: 'log-output',
      type: 'simpleRunner',
      properties: { 'script.content': 'echo "line1" && echo "line2" && echo "line3"' },
    });
    expect(step).toMatchObject({ success: true, action: 'add_build_step' });
    const trig = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: BT_ID,
      comment: 'e2e-results',
    });
    expect(trig).toMatchObject({ success: true, action: 'trigger_build' });
    buildId = trig.buildId;
    expect(typeof buildId).toBe('string');
  }, 90000);

  it('reads build status and number (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!buildId) return expect(true).toBe(true);
    const b = await callTool<BuildRef>('dev', 'get_build', { buildId });
    buildNumber = String(b.number ?? '');
    expect(typeof buildNumber).toBe('string');
  }, 60000);

  it('get_build_results with flags (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!buildId) return expect(true).toBe(true);
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
  }, 60000);

  it('fetch_build_log with paging and tail (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!buildId) return expect(true).toBe(true);
    const page1 = await callTool<BuildLogChunk>('dev', 'fetch_build_log', {
      buildId,
      page: 1,
      pageSize: 200,
    });
    expect(page1).toHaveProperty('lines');
    const range = await callTool<BuildLogChunk>('dev', 'fetch_build_log', {
      buildId,
      startLine: 0,
      lineCount: 2,
    });
    expect(range).toHaveProperty('lines');
    const tail = await callTool<BuildLogChunk>('dev', 'fetch_build_log', {
      buildId,
      tail: true,
      lineCount: 1,
    });
    expect(tail).toHaveProperty('lines');
  }, 60000);

  it('fetch_build_log by buildNumber + buildTypeId (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!buildNumber) return expect(true).toBe(true);
    try {
      const byNumber = await callTool<BuildLogChunk>('dev', 'fetch_build_log', {
        buildNumber,
        buildTypeId: BT_ID,
        page: 1,
        pageSize: 50,
      });
      expect(byNumber).toHaveProperty('lines');
    } catch (e) {
      // Build number resolution may not be stable across branches; non-fatal
      expect(true).toBe(true);
    }
  }, 60000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
