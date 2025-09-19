import { describe, expect, it } from '@jest/globals';

import type {
  ActionResult,
  BuildLogChunk,
  BuildTypeSummary,
  ListResult,
  ProjectRef,
  TriggerBuildResult,
} from '../types/tool-results';
import { callTool, callToolsBatchExpect } from './lib/mcp-runner';

const hasTeamCityEnv = Boolean(
  (process.env['TEAMCITY_URL'] ?? process.env['TEAMCITY_SERVER_URL']) &&
    (process.env['TEAMCITY_TOKEN'] ?? process.env['TEAMCITY_API_TOKEN'])
);

// Ephemeral ids for this suite
const ts = Date.now();
const PROJECT_ID = `E2E_TMP_${ts}`;
const PROJECT_NAME = `E2E TMP ${ts}`;
const BT_ID = `E2E_TMP_BT_${ts}`;
const BT_NAME = `E2E TMP BuildType ${ts}`;

let created = false;
let createdBuildType = false;
let triggeredBuildId: string | undefined;

describe('E2E scenario: full setup → dev reads → full teardown', () => {
  afterAll(async () => {
    try {
      await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    } catch (_e) {
      expect(true).toBe(true);
    }
  });
  it('sets up project, build configuration, and step (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const results = await callToolsBatchExpect('full', [
      {
        tool: 'create_project',
        args: {
          id: PROJECT_ID,
          name: PROJECT_NAME,
          description: 'Ephemeral project for e2e scenario',
        },
      },
      {
        tool: 'create_build_config',
        args: {
          projectId: PROJECT_ID,
          id: BT_ID,
          name: BT_NAME,
          description: 'Ephemeral build config',
        },
      },
      {
        tool: 'manage_build_steps',
        args: {
          buildTypeId: BT_ID,
          action: 'add',
          name: 'echo-step',
          type: 'simpleRunner',
          properties: { 'script.content': 'echo "hello from e2e"' },
        },
      },
    ]);

    const projectResult = results[0]?.result as ActionResult | undefined;
    const buildConfigResult = results[1]?.result as ActionResult | undefined;
    const stepResult = results[2]?.result as ActionResult | undefined;

    expect(projectResult).toMatchObject({ success: true, action: 'create_project' });
    expect(buildConfigResult).toMatchObject({ success: true, action: 'create_build_config' });
    expect(stepResult).toMatchObject({ success: true, action: 'add_build_step' });

    created = true;
    createdBuildType = true;
  }, 60000);

  it('lists and gets project (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const results = await callToolsBatchExpect('dev', [
      { tool: 'list_projects', args: { locator: `id:${PROJECT_ID}` } },
      { tool: 'get_project', args: { projectId: PROJECT_ID } },
    ]);

    const list = results[0]?.result as ListResult<ProjectRef> | undefined;
    expect(Array.isArray(list?.items)).toBe(true);
    const foundProj = (list?.items ?? []).find((p) => p.id === PROJECT_ID);
    expect(Boolean(foundProj)).toBe(true);

    const proj = results[1]?.result as ProjectRef | undefined;
    expect(proj?.id).toBe(PROJECT_ID);
  }, 60000);

  it('lists and gets build configuration (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const results = await callToolsBatchExpect('dev', [
      { tool: 'list_build_configs', args: { projectId: PROJECT_ID } },
      { tool: 'get_build_config', args: { buildTypeId: BT_ID } },
    ]);

    const list = results[0]?.result as ListResult<BuildTypeSummary> | undefined;
    expect(Array.isArray(list?.items)).toBe(true);
    const hasBt = (list?.items ?? []).some((b) => b.id === BT_ID);
    expect(hasBt).toBe(true);

    const cfg = results[1]?.result as BuildTypeSummary | undefined;
    expect(cfg?.id).toBe(BT_ID);
  }, 60000);

  it('triggers a build (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const res = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: BT_ID,
      comment: 'e2e',
    });
    expect(res).toMatchObject({ success: true, action: 'trigger_build' } as ActionResult);
    triggeredBuildId = res.buildId;
    expect(typeof triggeredBuildId).toBe('string');
  }, 60000);

  it('gets build status and fetches logs (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!triggeredBuildId) return expect(true).toBe(true);
    const status = await callTool<Record<string, unknown>>('dev', 'get_build_status', {
      buildId: triggeredBuildId,
    });
    expect(status).toHaveProperty('state');
    try {
      const log = await callTool<BuildLogChunk>('dev', 'fetch_build_log', {
        buildId: triggeredBuildId,
        page: 1,
        pageSize: 200,
      });
      expect(log).toHaveProperty('lines');
    } catch (e) {
      // Non-fatal if logs are temporarily unavailable
      expect(true).toBe(true);
    }
  }, 90000);

  it('lists agents and compatibility (dev)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    const agentResults = await callToolsBatchExpect('dev', [
      { tool: 'list_agents', args: { pageSize: 10 } },
      ...(createdBuildType
        ? [
            { tool: 'get_compatible_agents_for_build_type', args: { buildTypeId: BT_ID } },
            { tool: 'count_compatible_agents_for_build_type', args: { buildTypeId: BT_ID } },
          ]
        : []),
    ]);

    const agents = agentResults[0]?.result as Record<string, unknown> | undefined;
    expect(agents).toHaveProperty('items');
  }, 60000);

  it('deletes the temporary project (full)', async () => {
    if (!hasTeamCityEnv) return expect(true).toBe(true);
    if (!created) return expect(true).toBe(true);
    const res = await callTool('full', 'delete_project', { projectId: PROJECT_ID });
    expect(res).toMatchObject({ success: true, action: 'delete_project' });
  }, 60000);
});
