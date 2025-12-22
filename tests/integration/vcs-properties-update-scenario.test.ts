import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult, ListResult } from '../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';
import { hasTeamCityEnv, teardownProjectFixture } from './lib/test-fixtures';

describe('VCS root property updates: full mode', () => {
  const ts = Date.now();
  const projectId = `E2E_VCS_PROPS_${ts}`;
  const vcsId = `E2E_VCS_ROOT_PROPS_${ts}`;

  let created = false;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    const results = await callToolsBatchExpect('full', [
      {
        tool: 'create_project',
        args: { id: projectId, name: `E2E VCS Props ${ts}` },
      },
      {
        tool: 'create_vcs_root',
        args: {
          projectId,
          id: vcsId,
          name: `E2E VCS Root Props ${ts}`,
          vcsName: 'jetbrains.git',
          url: 'https://example.com/repo.git',
          branch: 'refs/heads/main',
        },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const vcsResult = results[1]?.result as ActionResult | undefined;

    if (!projectResult?.success || !vcsResult?.success) {
      throw new Error('Failed to create project and VCS root for VCS props scenario');
    }

    created = true;
  }, 120_000);

  afterAll(async () => {
    if (created) {
      await teardownProjectFixture(projectId);
    }
  });

  it('updates branch and branchSpec via MCP and verifies', async () => {
    if (!hasTeamCityEnv || !created) return expect(true).toBe(true);

    const update = await callTool<ActionResult>('full', 'update_vcs_root_properties', {
      id: vcsId,
      branch: 'refs/heads/main',
      branchSpec: ['+:refs/heads/*', '+:refs/pull/*/head'],
    });
    expect(update).toMatchObject({ success: true, action: 'update_vcs_root_properties' });

    // VCS tools are now full-only
    const devBatch = await callToolsBatch('full', [
      { tool: 'get_vcs_root', args: { id: vcsId } },
      { tool: 'list_vcs_roots', args: { projectId } },
    ]);

    const getStep = devBatch.results[0];
    if (!getStep?.ok) {
      throw new Error(`get_vcs_root failed: ${getStep?.error}`);
    }
    const get = getStep.result as {
      id: string;
      properties?: { property?: Array<{ name?: string; value?: string }> };
    };
    expect(get.id).toBe(vcsId);
    const props = get.properties?.property ?? [];
    const branch = props.find((p) => p.name === 'branch');
    const branchSpec = props.find((p) => p.name === 'branchSpec');
    expect(branch?.value).toBe('refs/heads/main');
    expect(branchSpec?.value?.includes('+:refs/heads/*')).toBe(true);
    expect(branchSpec?.value?.includes('+:refs/pull/*/head')).toBe(true);

    const listStep = devBatch.results[1];
    if (!listStep?.ok) {
      throw new Error(`list_vcs_roots failed: ${listStep?.error}`);
    }
    const list = listStep.result as ListResult<{ id: string }>;
    const found = (list.items ?? []).some((r) => r.id === vcsId);
    expect(found).toBe(true);
  }, 60_000);

  it('sets multiple refs via JSON update and verifies persistence', async () => {
    if (!hasTeamCityEnv || !created) return expect(true).toBe(true);

    // Update via JSON batch with array input; tool joins with newlines
    const update2 = await callTool<ActionResult>('full', 'update_vcs_root_properties', {
      id: vcsId,
      branchSpec: ['+:refs/heads/*', '+:refs/tags/*'],
    });
    expect(update2).toMatchObject({ success: true, action: 'update_vcs_root_properties' });

    // VCS tools are now full-only
    const get2 = (await callTool('full', 'get_vcs_root', { id: vcsId })) as unknown as {
      id: string;
      properties?: { property?: Array<{ name?: string; value?: string }> };
    };
    expect(get2.id).toBe(vcsId);
    const props2 = get2.properties?.property ?? [];
    const branchSpec2 = props2.find((p) => p.name === 'branchSpec');
    expect(branchSpec2?.value?.includes('+:refs/heads/*')).toBe(true);
    expect(branchSpec2?.value?.includes('+:refs/tags/*')).toBe(true);
    // Optionally assert it contains exactly two lines
    const lines = (branchSpec2?.value ?? '').split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
  }, 60_000);
});
