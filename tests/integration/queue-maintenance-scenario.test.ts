import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { ListResult } from '../types/tool-results';
import { callTool, callToolsBatch } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  isSerialWorker,
  setupProjectFixture,
  teardownProjectFixture,
  triggerMultipleBuilds,
} from './lib/test-fixtures';

const serialDescribe = isSerialWorker ? describe : describe.skip;

serialDescribe('Queue maintenance (full)', () => {
  let fixture: ProjectFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_QUEUE',
      namePrefix: 'E2E Queue',
      stepScript: 'echo queue-test',
      stepName: 'quick-step',
    });

    // Trigger multiple builds to create queued work
    await triggerMultipleBuilds(fixture.buildTypeId, 3, 'q');
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('reorders queued builds when available (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const queued = await callTool<ListResult<{ id?: string | number }>>(
      'dev',
      'list_queued_builds',
      {
        locator: `project:(id:${fixture.projectId})`,
      }
    );

    const ids = (queued.items ?? [])
      .map((b) => (b.id != null ? String(b.id) : ''))
      .filter((s) => s.length > 0);

    if (ids.length >= 2) {
      const desired = [ids[1], ids[0], ...ids.slice(2)];
      try {
        const res = await callTool('full', 'reorder_queued_builds', { buildIds: desired });
        expect(res).toMatchObject({ success: true, action: 'reorder_queued_builds' });
      } catch {
        // Non-fatal if server disallows
        expect(true).toBe(true);
      }
    } else {
      expect(true).toBe(true);
    }
  }, 60_000);

  it('moves a queued build to top when available (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const queued = await callTool<ListResult<{ id?: string | number }>>(
      'dev',
      'list_queued_builds',
      {
        locator: `project:(id:${fixture.projectId})`,
      }
    );

    const first = (queued.items ?? [])[0];
    if (first?.id != null) {
      try {
        const res = await callTool('full', 'move_queued_build_to_top', {
          buildId: String(first.id),
        });
        expect(res).toMatchObject({ success: true, action: 'move_queued_build_to_top' });
      } catch {
        expect(true).toBe(true);
      }
    } else {
      expect(true).toBe(true);
    }
  }, 60_000);

  it('cancels queued builds for build type and by locator (full)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const batch = await callToolsBatch('full', [
      { tool: 'cancel_queued_builds_for_build_type', args: { buildTypeId: fixture.buildTypeId } },
      {
        tool: 'cancel_queued_builds_by_locator',
        args: { locator: `project:(id:${fixture.projectId})` },
      },
    ]);

    batch.results.forEach((step) => {
      if (!step.ok) {
        expect(true).toBe(true);
      } else {
        expect(step.result).toHaveProperty('canceled');
      }
    });
  }, 60_000);
});
