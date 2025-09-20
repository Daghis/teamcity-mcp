import { afterAll, describe, expect, it } from '@jest/globals';

import type { ActionResult, ListResult } from '../types/tool-results';
import { callTool, callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_VCS_PROPS_${ts}`;
const PROJECT_NAME = `E2E VCS Props ${ts}`;
const VCS_ID = `E2E_VCS_ROOT_PROPS_${ts}`;
const VCS_NAME = `E2E VCS Root Props ${ts}`;

describe('VCS root property updates: full writes + dev reads', () => {
  afterAll(async () => {
    if (!hasTeamCityEnv) return;
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_e) {
      // ignore cleanup errors
    }
  });

  it('creates project and VCS root (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const results = await callToolsBatchExpect('full', [
      {
        tool: 'create_project',
        args: { id: PROJECT_ID, name: PROJECT_NAME },
      },
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

    const projectResult = results[0]?.result as ActionResult | undefined;
    const createVcs = results[1]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(createVcs).toMatchObject({ success: true, action: 'create_vcs_root' });
  }, 60000);

  it('updates branch and branchSpec via MCP and verifies with dev', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);

    const update = await callTool<ActionResult>('full', 'update_vcs_root_properties', {
      id: VCS_ID,
      branch: 'refs/heads/main',
      branchSpec: ['+:refs/heads/*', '+:refs/pull/*/head'],
    });
    expect(update).toMatchObject({ success: true, action: 'update_vcs_root_properties' });

    const devBatch = await callToolsBatch('dev', [
      { tool: 'get_vcs_root', args: { id: VCS_ID } },
      { tool: 'list_vcs_roots', args: { projectId: PROJECT_ID } },
    ]);

    const getStep = devBatch.results[0];
    if (!getStep?.ok) {
      throw new Error(`get_vcs_root failed: ${getStep?.error}`);
    }
    const get = getStep.result as {
      id: string;
      properties?: { property?: Array<{ name?: string; value?: string }> };
    };
    expect(get.id).toBe(VCS_ID);
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
    const found = (list.items ?? []).some((r) => r.id === VCS_ID);
    expect(found).toBe(true);
  }, 60000);

  it('sets multiple refs via JSON update and verifies persistence', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);

    // Update via JSON batch with array input; tool joins with newlines
    const update2 = await callTool<ActionResult>('full', 'update_vcs_root_properties', {
      id: VCS_ID,
      branchSpec: ['+:refs/heads/*', '+:refs/tags/*'],
    });
    expect(update2).toMatchObject({ success: true, action: 'update_vcs_root_properties' });

    const get2 = (await callTool('dev', 'get_vcs_root', { id: VCS_ID })) as unknown as {
      id: string;
      properties?: { property?: Array<{ name?: string; value?: string }> };
    };
    expect(get2.id).toBe(VCS_ID);
    const props2 = get2.properties?.property ?? [];
    const branchSpec2 = props2.find((p) => p.name === 'branchSpec');
    expect(branchSpec2?.value?.includes('+:refs/heads/*')).toBe(true);
    expect(branchSpec2?.value?.includes('+:refs/tags/*')).toBe(true);
    // Optionally assert it contains exactly two lines
    const lines = (branchSpec2?.value ?? '').split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
  }, 60000);
});
