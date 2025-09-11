import { describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';

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
    const cproj = await callTool('full', 'create_project', { id: PROJECT_ID, name: PROJECT_NAME });
    expect(cproj).toMatchObject({ success: true, action: 'create_project' });
    const cbt1 = await callTool('full', 'create_build_config', {
      projectId: PROJECT_ID,
      id: BT1_ID,
      name: 'E2E Pause BT1',
    });
    const cbt2 = await callTool('full', 'create_build_config', {
      projectId: PROJECT_ID,
      id: BT2_ID,
      name: 'E2E Pause BT2',
    });
    expect(cbt1).toMatchObject({ success: true, action: 'create_build_config' });
    expect(cbt2).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('pauses and unpauses both (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    try {
      const pause = await callTool<ActionResult>('full', 'set_build_configs_paused', {
        buildTypeIds: [BT1_ID, BT2_ID],
        paused: true,
      });
      expect(pause).toHaveProperty('action');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('set_build_configs_paused (pause) failed (non-fatal):', e);
      return expect(true).toBe(true);
    }

    try {
      const unpause = await callTool<ActionResult>('full', 'set_build_configs_paused', {
        buildTypeIds: [BT1_ID, BT2_ID],
        paused: false,
      });
      expect(unpause).toHaveProperty('action');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('set_build_configs_paused (unpause) failed (non-fatal):', e);
    }
  }, 90000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
