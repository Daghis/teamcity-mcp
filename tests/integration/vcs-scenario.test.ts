import { describe, expect, it } from '@jest/globals';

import type { ActionResult, ListResult, VcsRootRef } from '../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_VCS_${ts}`;
const PROJECT_NAME = `E2E VCS ${ts}`;
const VCS_ID = `E2E_VCS_ROOT_${ts}`;
const VCS_NAME = `E2E VCS Root ${ts}`;
const BT_ID = `E2E_VCS_BT_${ts}`;
const BT_NAME = `E2E VCS BuildType ${ts}`;

describe('VCS roots: full writes + dev reads', () => {
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

  it('creates VCS root and verifies with get/list (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const createBatch = await callToolsBatchExpect('full', [
      {
        tool: 'create_vcs_root',
        args: {
          projectId: PROJECT_ID,
          id: VCS_ID,
          name: VCS_NAME,
          vcsName: 'jetbrains.git',
          url: 'https://example.com/repo.git',
          branch: 'refs/heads/main',
        },
      },
    ]);
    const createVcs = createBatch[0]?.result as ActionResult | undefined;
    expect(createVcs).toMatchObject({ success: true, action: 'create_vcs_root' });

    const devBatch = await callToolsBatch('dev', [
      { tool: 'get_vcs_root', args: { id: VCS_ID } },
      { tool: 'list_vcs_roots', args: { projectId: PROJECT_ID } },
    ]);

    const getResult = devBatch.results[0];
    if (getResult?.ok) {
      const payload = getResult.result as VcsRootRef | undefined;
      expect(payload?.id).toBe(VCS_ID);
    } else {
      throw new Error(`get_vcs_root failed: ${getResult?.error}`);
    }

    const listResult = devBatch.results[1];
    if (listResult?.ok) {
      const payload = listResult.result as ListResult<VcsRootRef> | undefined;
      const found = (payload?.items ?? []).some((r) => r.id === VCS_ID);
      expect(found).toBe(true);
    } else {
      throw new Error(`list_vcs_roots failed: ${listResult?.error}`);
    }
  }, 60000);

  it('attaches VCS root to build config (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const attach = await callTool<ActionResult>('full', 'add_vcs_root_to_build', {
      buildTypeId: BT_ID,
      vcsRootId: VCS_ID,
      checkoutRules: '+:refs/heads/*',
    });
    expect(attach).toMatchObject({ success: true, action: 'add_vcs_root_to_build' });
  }, 60000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
