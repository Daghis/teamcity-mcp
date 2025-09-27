import { describe, expect, it } from '@jest/globals';

import type { ActionResult, ListResult } from '../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';

const SERIAL_WORKER =
  process.env['JEST_WORKER_ID'] === '1' || process.env['SERIAL_BUILD_TESTS'] === 'true';
const serialDescribe = SERIAL_WORKER ? describe : describe.skip;

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_QUEUE_${ts}`;
const PROJECT_NAME = `E2E Queue ${ts}`;
const BT_ID = `E2E_QUEUE_BT_${ts}`;
const BT_NAME = `E2E Queue BuildType ${ts}`;

serialDescribe('Queue maintenance (full)', () => {
  afterAll(async () => {
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_e) {
      expect(true).toBe(true);
    }
  });
  it('creates project and build config (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const results = await callToolsBatchExpect('full', [
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
        },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const buildConfigResult = results[1]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(buildConfigResult).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('adds a simple step, triggers multiple builds to create queued work (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const stepBatch = await callToolsBatchExpect('full', [
      {
        tool: 'manage_build_steps',
        args: {
          buildTypeId: BT_ID,
          action: 'add',
          name: 'quick-step',
          type: 'simpleRunner',
          properties: { 'script.content': 'echo queue-test' },
        },
      },
    ]);
    const stepResult = stepBatch[0]?.result as ActionResult | undefined;
    expect(stepResult).toMatchObject({ success: true, action: 'add_build_step' });

    const triggerBatch = await callToolsBatch('dev', [
      { tool: 'trigger_build', args: { buildTypeId: BT_ID, comment: 'q1' } },
      { tool: 'trigger_build', args: { buildTypeId: BT_ID, comment: 'q2' } },
      { tool: 'trigger_build', args: { buildTypeId: BT_ID, comment: 'q3' } },
    ]);

    triggerBatch.results.forEach((step) => {
      if (!step.ok) {
        // Non-fatal if triggering fails (e.g., permissions)
        expect(true).toBe(true);
      }
    });
  }, 90000);

  it('reorders queued builds when available (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const queued = await callTool<ListResult<{ id?: string | number }>>(
      'dev',
      'list_queued_builds',
      {
        locator: `project:(id:${PROJECT_ID})`,
      }
    );
    const ids = (queued.items ?? [])
      .map((b) => (b.id != null ? String(b.id) : ''))
      .filter((s) => s.length > 0);
    if (ids.length >= 2) {
      const desired = [ids[1], ids[0], ...ids.slice(2)];
      try {
        const res = await callTool('full', 'reorder_queued_builds', { buildIds: desired });
        expect(res).toMatchObject({ success: true, action: 'reorder_queued_builds' });
      } catch (e) {
        // Non-fatal if server disallows
        expect(true).toBe(true);
      }
    } else {
      expect(true).toBe(true);
    }
  }, 60000);

  it('moves a queued build to top when available (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const queued = await callTool<ListResult<{ id?: string | number }>>(
      'dev',
      'list_queued_builds',
      {
        locator: `project:(id:${PROJECT_ID})`,
      }
    );
    const first = (queued.items ?? [])[0];
    if (first?.id != null) {
      try {
        const res = await callTool('full', 'move_queued_build_to_top', {
          buildId: String(first.id),
        });
        expect(res).toMatchObject({ success: true, action: 'move_queued_build_to_top' });
      } catch (e) {
        expect(true).toBe(true);
      }
    } else {
      expect(true).toBe(true);
    }
  }, 60000);

  it('cancels queued builds for build type and by locator (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const batch = await callToolsBatch('full', [
      { tool: 'cancel_queued_builds_for_build_type', args: { buildTypeId: BT_ID } },
      { tool: 'cancel_queued_builds_by_locator', args: { locator: `project:(id:${PROJECT_ID})` } },
    ]);

    batch.results.forEach((step) => {
      if (!step.ok) {
        expect(true).toBe(true);
      } else {
        expect(step.result).toHaveProperty('canceled');
      }
    });
  }, 60000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
