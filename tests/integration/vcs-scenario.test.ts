import { describe, expect, it } from '@jest/globals';

import type { ActionResult, ListResult, VcsRootRef } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';

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

  it('creates VCS root and verifies with get/list (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const createVcs = await callTool<ActionResult>('full', 'create_vcs_root', {
      projectId: PROJECT_ID,
      id: VCS_ID,
      name: VCS_NAME,
      vcsName: 'jetbrains.git',
      url: 'https://example.com/repo.git',
      branch: 'refs/heads/main',
    });
    expect(createVcs).toMatchObject({ success: true, action: 'create_vcs_root' });

    const get = await callTool<VcsRootRef>('dev', 'get_vcs_root', { id: VCS_ID });
    expect(get.id).toBe(VCS_ID);
    const list = await callTool<ListResult<VcsRootRef>>('dev', 'list_vcs_roots', {
      projectId: PROJECT_ID,
    });
    const found = (list.items ?? []).some((r) => r.id === VCS_ID);
    expect(found).toBe(true);
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
