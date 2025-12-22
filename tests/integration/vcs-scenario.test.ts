import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult, ListResult, VcsRootRef } from '../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';
import { hasTeamCityEnv, teardownProjectFixture } from './lib/test-fixtures';

describe('VCS roots: full writes + dev reads', () => {
  const ts = Date.now();
  const projectId = `E2E_VCS_${ts}`;
  const vcsId = `E2E_VCS_ROOT_${ts}`;
  const btId = `E2E_VCS_BT_${ts}`;

  let created = false;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    const results = await callToolsBatchExpect('full', [
      {
        tool: 'create_project',
        args: { id: projectId, name: `E2E VCS ${ts}` },
      },
      {
        tool: 'create_build_config',
        args: { projectId, id: btId, name: `E2E VCS BuildType ${ts}` },
      },
      {
        tool: 'create_vcs_root',
        args: {
          projectId,
          id: vcsId,
          name: `E2E VCS Root ${ts}`,
          vcsName: 'jetbrains.git',
          url: 'https://example.com/repo.git',
          branch: 'refs/heads/main',
        },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const btResult = results[1]?.result as ActionResult | undefined;
    const vcsResult = results[2]?.result as ActionResult | undefined;

    if (!projectResult?.success || !btResult?.success || !vcsResult?.success) {
      throw new Error('Failed to create project, build config, and VCS root for VCS scenario');
    }

    created = true;
  }, 120_000);

  afterAll(async () => {
    if (created) {
      await teardownProjectFixture(projectId);
    }
  });

  it('verifies VCS root with get/list (dev)', async () => {
    if (!hasTeamCityEnv || !created) return expect(true).toBe(true);

    const devBatch = await callToolsBatch('dev', [
      { tool: 'get_vcs_root', args: { id: vcsId } },
      { tool: 'list_vcs_roots', args: { projectId } },
    ]);

    const getResult = devBatch.results[0];
    if (getResult?.ok) {
      const payload = getResult.result as VcsRootRef | undefined;
      expect(payload?.id).toBe(vcsId);
    } else {
      throw new Error(`get_vcs_root failed: ${getResult?.error}`);
    }

    const listResult = devBatch.results[1];
    if (listResult?.ok) {
      const payload = listResult.result as ListResult<VcsRootRef> | undefined;
      const found = (payload?.items ?? []).some((r) => r.id === vcsId);
      expect(found).toBe(true);
    } else {
      throw new Error(`list_vcs_roots failed: ${listResult?.error}`);
    }
  }, 60_000);

  it('attaches VCS root to build config (full)', async () => {
    if (!hasTeamCityEnv || !created) return expect(true).toBe(true);

    const attach = await callTool<ActionResult>('full', 'add_vcs_root_to_build', {
      buildTypeId: btId,
      vcsRootId: vcsId,
      checkoutRules: '+:refs/heads/*',
    });
    expect(attach).toMatchObject({ success: true, action: 'add_vcs_root_to_build' });
  }, 60_000);
});
