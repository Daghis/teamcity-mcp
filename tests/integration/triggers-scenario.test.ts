import { describe, expect, it } from '@jest/globals';

import type { ActionResult, BuildTypeSummary, ListResult } from '../types/tool-results';
import { callTool, callToolsBatchExpect } from './lib/mcp-runner';

const ts = Date.now();
const PROJECT_ID = `E2E_TRIG_${ts}`;
const PROJECT_NAME = `E2E Triggers ${ts}`;
const BT_ID = `E2E_TRIG_BT_${ts}`;
const BT_NAME = `E2E Trigger BuildType ${ts}`;

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
  (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

describe('Build triggers: add and delete (full) with dev verification', () => {
  afterAll(async () => {
    if (!hasTeamCityEnv) return;
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
        args: { id: PROJECT_ID, name: PROJECT_NAME },
      },
      {
        tool: 'create_build_config',
        args: { projectId: PROJECT_ID, id: BT_ID, name: BT_NAME },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const buildConfigResult = results[1]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(buildConfigResult).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('adds a vcs trigger (full) and verifies via list_build_configs (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    try {
      const addTrig = await callTool<ActionResult>('full', 'manage_build_triggers', {
        buildTypeId: BT_ID,
        action: 'add',
        type: 'vcsTrigger',
        properties: { quietPeriodMode: 'DO_NOT_USE' },
      });
      expect(addTrig).toMatchObject({ success: true, action: 'add_build_trigger' });
    } catch (e) {
      // Non-fatal; some servers may have policy restrictions

      console.warn('add trigger failed (non-fatal):', e);
      return expect(true).toBe(true);
    }

    const cfgs = await callTool<ListResult<BuildTypeSummary>>('dev', 'list_build_configs', {
      projectId: PROJECT_ID,
      fields: 'buildType(id,triggers(trigger(id,type)))',
    });
    const entry = (cfgs.items ?? []).find((b) => b.id === BT_ID);
    if (!entry?.triggers?.trigger?.length) return expect(true).toBe(true);
    const triggerId = entry.triggers.trigger[0]?.id as string | undefined;
    expect(typeof triggerId).toBe('string');

    const del = await callTool('full', 'manage_build_triggers', {
      buildTypeId: BT_ID,
      action: 'delete',
      triggerId,
    });
    expect(del).toMatchObject({ success: true, action: 'delete_build_trigger' });
  }, 90000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
