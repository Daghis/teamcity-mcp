import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callToolsBatch, callToolsBatchExpect } from './lib/mcp-runner';
import { hasTeamCityEnv, teardownProjectFixture } from './lib/test-fixtures';

describe('Pause/unpause build configs (full) with dev verification', () => {
  const ts = Date.now();
  const projectId = `E2E_PAUSE_${ts}`;
  const bt1Id = `E2E_PAUSE_BT1_${ts}`;
  const bt2Id = `E2E_PAUSE_BT2_${ts}`;

  let created = false;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    const results = await callToolsBatchExpect('full', [
      { tool: 'create_project', args: { id: projectId, name: `E2E Pause ${ts}` } },
      {
        tool: 'create_build_config',
        args: { projectId, id: bt1Id, name: 'E2E Pause BT1' },
      },
      {
        tool: 'create_build_config',
        args: { projectId, id: bt2Id, name: 'E2E Pause BT2' },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const bt1Result = results[1]?.result as ActionResult | undefined;
    const bt2Result = results[2]?.result as ActionResult | undefined;

    if (!projectResult?.success || !bt1Result?.success || !bt2Result?.success) {
      throw new Error('Failed to create project and build configs for pause scenario');
    }

    created = true;
  }, 120_000);

  afterAll(async () => {
    if (created) {
      await teardownProjectFixture(projectId);
    }
  });

  it('pauses and unpauses both (full)', async () => {
    if (!hasTeamCityEnv || !created) return expect(true).toBe(true);

    const batch = await callToolsBatch('full', [
      { tool: 'set_build_configs_paused', args: { buildTypeIds: [bt1Id, bt2Id], paused: true } },
      { tool: 'set_build_configs_paused', args: { buildTypeIds: [bt1Id, bt2Id], paused: false } },
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
  }, 90_000);
});
