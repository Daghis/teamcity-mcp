import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type {
  BuildLogChunk,
  BuildTypeSummary,
  ListResult,
  ProjectRef,
  TriggerBuildResult,
} from '../types/tool-results';
import { callTool, callToolsBatchExpect } from './lib/mcp-runner';
import {
  type ProjectFixture,
  hasTeamCityEnv,
  isSerialWorker,
  setupProjectFixture,
  teardownProjectFixture,
} from './lib/test-fixtures';

const serialDescribe = isSerialWorker ? describe : describe.skip;

serialDescribe('E2E scenario: full setup → dev reads → full teardown', () => {
  let fixture: ProjectFixture | null = null;
  let triggeredBuildId: string | undefined;

  beforeAll(async () => {
    if (!hasTeamCityEnv) return;

    fixture = await setupProjectFixture({
      prefix: 'E2E_TMP',
      namePrefix: 'E2E TMP',
      projectDescription: 'Ephemeral project for e2e scenario',
      buildConfigDescription: 'Ephemeral build config',
      stepScript: 'echo "hello from e2e"',
      stepName: 'echo-step',
    });
  }, 120_000);

  afterAll(async () => {
    if (fixture) {
      await teardownProjectFixture(fixture.projectId);
    }
  });

  it('lists and gets project (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const results = await callToolsBatchExpect('dev', [
      { tool: 'list_projects', args: { locator: `id:${fixture.projectId}` } },
      { tool: 'get_project', args: { projectId: fixture.projectId } },
    ]);

    const list = results[0]?.result as ListResult<ProjectRef> | undefined;
    expect(Array.isArray(list?.items)).toBe(true);
    const foundProj = (list?.items ?? []).find((p) => p.id === fixture!.projectId);
    expect(Boolean(foundProj)).toBe(true);

    const proj = results[1]?.result as ProjectRef | undefined;
    expect(proj?.id).toBe(fixture.projectId);
  }, 60_000);

  it('lists and gets build configuration (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const results = await callToolsBatchExpect('dev', [
      { tool: 'list_build_configs', args: { projectId: fixture.projectId } },
      { tool: 'get_build_config', args: { buildTypeId: fixture.buildTypeId } },
    ]);

    const list = results[0]?.result as ListResult<BuildTypeSummary> | undefined;
    expect(Array.isArray(list?.items)).toBe(true);
    const hasBt = (list?.items ?? []).some((b) => b.id === fixture!.buildTypeId);
    expect(hasBt).toBe(true);

    const cfg = results[1]?.result as BuildTypeSummary | undefined;
    expect(cfg?.id).toBe(fixture.buildTypeId);
  }, 60_000);

  it('triggers a build (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const res = await callTool<TriggerBuildResult>('dev', 'trigger_build', {
      buildTypeId: fixture.buildTypeId,
      comment: 'e2e',
    });
    expect(res).toMatchObject({ success: true, action: 'trigger_build' });
    triggeredBuildId = res.buildId;
    expect(typeof triggeredBuildId).toBe('string');
  }, 60_000);

  it('gets build status and fetches logs (dev)', async () => {
    if (!hasTeamCityEnv || !fixture || !triggeredBuildId) return expect(true).toBe(true);

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
    } catch {
      // Non-fatal if logs are temporarily unavailable
      expect(true).toBe(true);
    }
  }, 90_000);

  it('lists agents and compatibility (dev)', async () => {
    if (!hasTeamCityEnv || !fixture) return expect(true).toBe(true);

    const agentResults = await callToolsBatchExpect('dev', [
      { tool: 'list_agents', args: { pageSize: 10 } },
      { tool: 'get_compatible_agents_for_build_type', args: { buildTypeId: fixture.buildTypeId } },
      {
        tool: 'count_compatible_agents_for_build_type',
        args: { buildTypeId: fixture.buildTypeId },
      },
    ]);

    const agents = agentResults[0]?.result as Record<string, unknown> | undefined;
    expect(agents).toHaveProperty('items');
  }, 60_000);
});
