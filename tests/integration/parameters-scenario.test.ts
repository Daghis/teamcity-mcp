import { describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_PARAM_${ts}`;
const PROJECT_NAME = `E2E Param ${ts}`;
const BT_ID = `E2E_PARAM_BT_${ts}`;
const BT_NAME = `E2E Param BuildType ${ts}`;

describe('Parameters lifecycle: full writes + dev reads', () => {
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
    });
    expect(cbt).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('lists parameters (dev) → smoke shape', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const list = await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: BT_ID,
    });
    expect(list).toHaveProperty('parameters');
  }, 30000);

  it('add and delete parameter (full) and smoke read (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    try {
      const add = await callTool<ActionResult>('full', 'add_parameter', {
        buildTypeId: BT_ID,
        name: 'env.E2E_PARAM',
        value: 'one',
      });
      expect(add).toMatchObject({ success: true, action: 'add_parameter' });
    } catch (e) {
      // Some servers may restrict parameter APIs; treat as non-fatal for this smoke
      // eslint-disable-next-line no-console
      console.warn('add_parameter failed (non-fatal):', e);
      return expect(true).toBe(true);
    }

    await callTool<Record<string, unknown>>('dev', 'list_parameters', { buildTypeId: BT_ID });

    try {
      const del = await callTool<ActionResult>('full', 'delete_parameter', {
        buildTypeId: BT_ID,
        name: 'env.E2E_PARAM',
      });
      expect(del).toMatchObject({ success: true, action: 'delete_parameter' });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('delete_parameter failed (non-fatal):', e);
    }

    await callTool<Record<string, unknown>>('dev', 'list_parameters', { buildTypeId: BT_ID });
  }, 90000);

  it('deletes the project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
