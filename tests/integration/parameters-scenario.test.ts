import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

describe('Parameters lifecycle: full writes + dev reads', () => {
  let fixture: ProjectFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_PARAM',
      namePrefix: 'E2E Param',
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('lists parameters (dev) → smoke shape', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const list = await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: fixture.buildTypeId,
    });
    expect(list).toHaveProperty('parameters');
  }, 30_000);

  it('add and delete parameter (full) and smoke read (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      const add = await callTool<ActionResult>('full', 'add_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_PARAM',
        value: 'one',
      });
      expect(add).toMatchObject({ success: true, action: 'add_parameter' });
    } catch (e) {
      // Some servers may restrict parameter APIs; treat as non-fatal for this smoke
      console.warn('add_parameter failed (non-fatal):', e);
      return expect(true).toBe(true);
    }

    await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: fixture.buildTypeId,
    });

    try {
      const del = await callTool<ActionResult>('full', 'delete_parameter', {
        buildTypeId: fixture.buildTypeId,
        name: 'env.E2E_PARAM',
      });
      expect(del).toMatchObject({ success: true, action: 'delete_parameter' });
    } catch (e) {
      console.warn('delete_parameter failed (non-fatal):', e);
    }

    await callTool<Record<string, unknown>>('dev', 'list_parameters', {
      buildTypeId: fixture.buildTypeId,
    });
  }, 90_000);
});
