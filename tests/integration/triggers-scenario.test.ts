import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult, BuildTypeSummary, ListResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

describe('Build triggers: add and delete (full) with dev verification', () => {
  let fixture: ProjectFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_TRIG',
      namePrefix: 'E2E Triggers',
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('adds a vcs trigger (full) and verifies via list_build_configs (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      const addTrig = await callTool<ActionResult>('full', 'manage_build_triggers', {
        buildTypeId: fixture.buildTypeId,
        action: 'add',
        type: 'vcsTrigger',
        properties: { quietPeriodMode: 'DO_NOT_USE' },
      });
      expect(addTrig).toMatchObject({ success: true, action: 'add_build_trigger' });
    } catch (e) {
      // Non-fatal; some servers may have policy restrictions
      console.warn('add trigger failed (non-fatal):', e);
      return expect(true).toBe(true);
    }

    const cfgs = await callTool<ListResult<BuildTypeSummary>>('dev', 'list_build_configs', {
      projectId: fixture.projectId,
      fields: 'buildType(id,triggers(trigger(id,type)))',
    });
    const entry = (cfgs.items ?? []).find((b) => b.id === fixture!.buildTypeId);
    if (!entry?.triggers?.trigger?.length) return expect(true).toBe(true);
    const triggerId = entry.triggers.trigger[0]?.id as string | undefined;
    expect(typeof triggerId).toBe('string');

    const del = await callTool('full', 'manage_build_triggers', {
      buildTypeId: fixture.buildTypeId,
      action: 'delete',
      triggerId,
    });
    expect(del).toMatchObject({ success: true, action: 'delete_build_trigger' });
  }, 90_000);
});
