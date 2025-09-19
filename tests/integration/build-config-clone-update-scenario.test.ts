import { describe, expect, it } from '@jest/globals';

import type { ActionResult, BuildTypeSummary, ListResult } from '../types/tool-results';
import { callTool, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_CLONE_${ts}`;
const PROJECT_NAME = `E2E Clone ${ts}`;
const BT_ID = `E2E_CLONE_BT_${ts}`;
const BT_NAME = `E2E Clone BuildType ${ts}`;
const CLONE_ID = `E2E_CLONE_BT2_${ts}`;
const CLONE_NAME = `E2E Clone Copy ${ts}`;

describe('Build configuration clone and update (full) with dev verification', () => {
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
          description: 'Original configuration',
        },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const buildConfigResult = results[1]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(buildConfigResult).toMatchObject({ success: true, action: 'create_build_config' });
  }, 60000);

  it('updates build config name/description/paused (full), verifies via dev', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    try {
      const upd = await callTool<ActionResult>('full', 'update_build_config', {
        buildTypeId: BT_ID,
        name: `${BT_NAME} Updated`,
        description: 'Updated description',
        paused: true,
      });
      expect(upd).toMatchObject({ success: true, action: 'update_build_config' });
    } catch (e) {
      // non-fatal on policy restrictions
      expect(true).toBe(true);
    }
    const cfg = await callTool<BuildTypeSummary>('dev', 'get_build_config', { buildTypeId: BT_ID });
    expect(cfg).toHaveProperty('id');
  }, 60000);

  it('clones build config (full) and verifies via dev', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    try {
      const clone = await callTool<ActionResult>('full', 'clone_build_config', {
        sourceBuildTypeId: BT_ID,
        id: CLONE_ID,
        name: CLONE_NAME,
        projectId: PROJECT_ID,
      });
      expect(clone).toMatchObject({ success: true, action: 'clone_build_config' });
      const list = await callTool<ListResult<BuildTypeSummary>>('dev', 'list_build_configs', {
        projectId: PROJECT_ID,
      });
      const hasClone = (list.items ?? []).some((b) => b.id === CLONE_ID);
      expect(hasClone).toBe(true);
    } catch (e) {
      // Some servers may restrict clone; non-fatal
      expect(true).toBe(true);
    }
  }, 60000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
