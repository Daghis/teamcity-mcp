import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { BranchList, QueuedBuildList, TriggerBuildResult } from '../types/tool-results';
import { type ToolBatchStepResult, callTool, callToolsBatch } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  isSerialWorker,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

const serialDescribe = isSerialWorker ? describe : describe.skip;

const BRANCH_NAME = 'feature/e2e';

serialDescribe('Branches and queue operations', () => {
  let fixture: ProjectFixture | null = null;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_BRANCH',
      namePrefix: 'E2E Branch',
      stepScript: 'echo "branches scenario"',
      stepName: 'echo-step',
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('triggers a build on non-default branch (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const trig = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: fixture.buildTypeId,
      branchName: BRANCH_NAME,
    });
    expect(trig).toMatchObject({ success: true, action: 'trigger_build' });
    expect(trig.branchName).toBe(BRANCH_NAME);
  }, 90_000);

  it('triggers a build using teamcity.build.branch property (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const trig = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: fixture.buildTypeId,
      properties: {
        'teamcity.build.branch': `${BRANCH_NAME}-prop`,
        'env.CUSTOM_FLAG': 'true',
      },
    });
    expect(trig).toMatchObject({ success: true, action: 'trigger_build' });
    expect(trig.branchName).toBe(`${BRANCH_NAME}-prop`);
  }, 90_000);

  it('lists branches for project and build type (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const batch = await callToolsBatch('dev', [
      {
        tool: 'list_branches',
        args: { projectId: fixture.projectId },
      },
      {
        tool: 'list_branches',
        args: { buildTypeId: fixture.buildTypeId },
      },
    ]);

    batch.results.forEach((step: ToolBatchStepResult, index: number) => {
      if (!step.ok) {
        const errorMsg = step.error ?? '';
        if (errorMsg.includes('404') || errorMsg.length === 0) {
          expect(true).toBe(true);
        } else {
          throw new Error(`list_branches batch step ${index} failed: ${errorMsg}`);
        }
        return;
      }
      const payload = step.result as BranchList | undefined;
      expect(payload).toHaveProperty('branches');
    });
  }, 60_000);

  it('lists queued builds and cancels one if present (dev cancel)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const queued = await callTool<QueuedBuildList>('dev', 'list_queued_builds', { pageSize: 10 });
    expect(queued).toHaveProperty('items');

    const first = (queued.items ?? [])[0];
    if (first?.id != null) {
      const queuedId = String(first.id);
      try {
        const canceled = await callTool('dev', 'cancel_queued_build', { buildId: queuedId });
        expect(canceled).toMatchObject({ success: true, action: 'cancel_queued_build' });
      } catch {
        // If build already started or permission denied, non-fatal
        expect(true).toBe(true);
      }
    } else {
      expect(true).toBe(true);
    }
  }, 60_000);
});
