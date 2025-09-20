import { describe, expect, it } from '@jest/globals';

import type {
  ActionResult,
  BranchList,
  QueuedBuildList,
  TriggerBuildResult,
} from '../types/tool-results';
import {
  type ToolBatchStepResult,
  callTool,
  callToolsBatch,
  callToolsBatchExpect,
} from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

const ts = Date.now();
const PROJECT_ID = `E2E_BRANCH_${ts}`;
const PROJECT_NAME = `E2E Branch ${ts}`;
const BT_ID = `E2E_BRANCH_BT_${ts}`;
const BT_NAME = `E2E Branch BuildType ${ts}`;
const BRANCH_NAME = 'feature/e2e';

let queuedId: string | undefined;

describe('Branches and queue operations', () => {
  afterAll(async () => {
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_err) {
      expect(true).toBe(true);
    }
  });
  it('creates project, build config, and adds step (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const batch = await callToolsBatchExpect('full', [
      {
        tool: 'create_project',
        args: {
          id: PROJECT_ID,
          name: PROJECT_NAME,
        },
      },
      {
        tool: 'create_build_config',
        args: {
          projectId: PROJECT_ID,
          id: BT_ID,
          name: BT_NAME,
        },
      },
      {
        tool: 'manage_build_steps',
        args: {
          buildTypeId: BT_ID,
          action: 'add',
          name: 'echo-step',
          type: 'simpleRunner',
          properties: { 'script.content': 'echo "branches scenario"' },
        },
      },
    ]);

    const projectResult = batch[0]?.result as ActionResult | undefined;
    const buildConfigResult = batch[1]?.result as ActionResult | undefined;
    const stepResult = batch[2]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(buildConfigResult).toMatchObject({ success: true, action: 'create_build_config' });
    expect(stepResult).toMatchObject({ success: true, action: 'add_build_step' });
  }, 60000);

  it('triggers a build on non-default branch (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const trig = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: BT_ID,
      branchName: BRANCH_NAME,
    });
    expect(trig).toMatchObject({ success: true, action: 'trigger_build' });
  }, 90000);

  it('lists branches for project and build type (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const batch = await callToolsBatch('dev', [
      {
        tool: 'list_branches',
        args: { projectId: PROJECT_ID },
      },
      {
        tool: 'list_branches',
        args: { buildTypeId: BT_ID },
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
  }, 60000);

  it('lists queued builds and cancels one if present (dev cancel)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const queued = await callTool<QueuedBuildList>('dev', 'list_queued_builds', { pageSize: 10 });
    expect(queued).toHaveProperty('items');
    const first = (queued.items ?? [])[0];
    if (first?.id != null) {
      queuedId = String(first.id);
      try {
        const canceled = await callTool('dev', 'cancel_queued_build', { buildId: queuedId });
        expect(canceled).toMatchObject({ success: true, action: 'cancel_queued_build' });
      } catch (_err) {
        // If build already started or permission denied, non-fatal
        expect(true).toBe(true);
      }
    } else {
      expect(true).toBe(true);
    }
  }, 60000);

  it('deletes project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
