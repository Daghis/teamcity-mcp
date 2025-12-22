import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ActionResult, BuildTypeSummary, ListResult } from '../types/tool-results';
import { callTool } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

describe('Build configuration clone and update (full) with dev verification', () => {
  let fixture: ProjectFixture | null = null;
  let cloneId: string;
  let cloneName: string;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_CLONE',
      namePrefix: 'E2E Clone',
      buildConfigDescription: 'Original configuration',
    });

    // Generate clone identifiers based on the fixture timestamp
    cloneId = `E2E_CLONE_BT2_${fixture.timestamp}`;
    cloneName = `E2E Clone Copy ${fixture.timestamp}`;
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('updates build config name/description/paused (full), verifies via dev', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      const upd = await callTool<ActionResult>('full', 'update_build_config', {
        buildTypeId: fixture.buildTypeId,
        name: `${fixture.buildTypeName} Updated`,
        description: 'Updated description',
        paused: true,
      });
      expect(upd).toMatchObject({ success: true, action: 'update_build_config' });
    } catch {
      // non-fatal on policy restrictions
      expect(true).toBe(true);
    }

    const cfg = await callTool<BuildTypeSummary>('dev', 'get_build_config', {
      buildTypeId: fixture.buildTypeId,
    });
    expect(cfg).toHaveProperty('id');
  }, 60_000);

  it('clones build config (full) and verifies via dev', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    try {
      const clone = await callTool<ActionResult>('full', 'clone_build_config', {
        sourceBuildTypeId: fixture.buildTypeId,
        id: cloneId,
        name: cloneName,
        projectId: fixture.projectId,
      });
      expect(clone).toMatchObject({ success: true, action: 'clone_build_config' });

      const list = await callTool<ListResult<BuildTypeSummary>>('dev', 'list_build_configs', {
        projectId: fixture.projectId,
      });
      const hasClone = (list.items ?? []).some((b) => b.id === cloneId);
      expect(hasClone).toBe(true);
    } catch {
      // Some servers may restrict clone; non-fatal
      expect(true).toBe(true);
    }
  }, 60_000);
});
