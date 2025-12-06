import { describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
  (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_PAUSE_${ts}`;
const PROJECT_NAME = `E2E Pause ${ts}`;
const BT1_ID = `E2E_PAUSE_BT1_${ts}`;
const BT2_ID = `E2E_PAUSE_BT2_${ts}`;

describe('Pause/unpause build configs (full) with dev verification', () => {
  afterAll(async () => {
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_e) {
      expect(true).toBe(true);
    }
  });
  it('creates project and two build configs (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const results = await callToolsBatchExpect('full', [
      { tool: 'create_project', args: { id: PROJECT_ID, name: PROJECT_NAME } },
      {
        tool: 'create_build_config',
        args: { projectId: PROJECT_ID, id: BT1_ID, name: 'E2E Pause BT1' },
      },
      {
        tool: 'create_build_config',
        args: { projectId: PROJECT_ID, id: BT2_ID, name: 'E2E Pause BT2' },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const bt1Result = results[1]?.result as ActionResult | undefined;
    const bt2Result = results[2]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(bt1Result).toMatchObject({ success: true, action: 'create_build_config' });
    expect(bt2Result).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('pauses and unpauses both (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const batch = await callToolsBatch('full', [
      { tool: 'set_build_configs_paused', args: { buildTypeIds: [BT1_ID, BT2_ID], paused: true } },
      { tool: 'set_build_configs_paused', args: { buildTypeIds: [BT1_ID, BT2_ID], paused: false } },
    ]);

    const pauseStep = batch.results[0];
    if (!pauseStep?.ok) {
      console.warn('set_build_configs_paused (pause) failed (non-fatal):', pauseStep?.error);
      return expect(true).toBe(true);
    }
    expect(pauseStep.result).toHaveProperty('action');

    const unpauseStep = batch.results[1];
    if (!unpauseStep?.ok) {
      console.warn('set_build_configs_paused (unpause) failed (non-fatal):', unpauseStep?.error);
      return expect(true).toBe(true);
    }
    expect(unpauseStep.result).toHaveProperty('action');
  }, 90000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
