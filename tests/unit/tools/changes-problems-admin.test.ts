import { type ToolDefinition, getRequiredTool } from '@/tools';

// Full mode needed for list_users, list_roles, get_versioned_settings_status
jest.mock('@/config', () => ({
  getTeamCityUrl: () => 'https://example.test',
  getTeamCityToken: () => 'token',
  getMCPMode: () => 'full',
}));

type PaginatedMock = jest.Mock<Promise<{ data: Record<string, unknown> }>, [string?]>;

const createPaginatedMock = (items: unknown[], key: string): PaginatedMock =>
  jest.fn(async (locator?: string) => {
    const startMatch = locator?.match(/start:(\d+)/);
    const countMatch = locator?.match(/count:(\d+)/);
    const start = startMatch?.[1] ? parseInt(startMatch[1], 10) : 0;
    const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : 100;

    const slice = items.slice(start, start + count);
    const nextHref = start + count < items.length ? '/next' : undefined;

    const data: Record<string, unknown> = { count: items.length };
    data[key] = slice;
    if (nextHref) data['nextHref'] = nextHref;

    return { data };
  });

const getAllChanges = createPaginatedMock([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], 'change');
const getAllBuildProblems = createPaginatedMock([{ id: 'p1' }, { id: 'p2' }], 'problem');
const getAllBuildProblemOccurrences = createPaginatedMock(
  [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
  'problemOccurrence'
);
const getAllInvestigations = createPaginatedMock([{ id: 'i1' }, { id: 'i2' }], 'investigation');
const getAllMutedTests = createPaginatedMock([{ id: 'm1' }, { id: 'm2' }], 'mute');
const getVersionedSettingsStatus = jest.fn(async () => ({
  data: { status: 'UP_TO_DATE', revision: '123' },
}));
const getAllUsers = createPaginatedMock(
  [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }],
  'user'
);
const getRoles = jest.fn(async () => ({ data: { role: [{ id: 'SYSTEM_ADMINISTRATOR' }] } }));
const muteMultipleTests = jest.fn(async () => ({ data: { result: 'ok' } }));

jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: () => ({
      changes: { getAllChanges },
      problems: { getAllBuildProblems },
      problemOccurrences: { getAllBuildProblemOccurrences },
      investigations: { getAllInvestigations },
      mutes: { getAllMutedTests, muteMultipleTests },
      versionedSettings: { getVersionedSettingsStatus },
      users: { getAllUsers },
      roles: { getRoles },
    }),
  },
}));

describe('changes/problems/investigation tools', () => {
  beforeEach(() => {
    getAllChanges.mockClear();
    getAllBuildProblems.mockClear();
    getAllBuildProblemOccurrences.mockClear();
    getAllInvestigations.mockClear();
    getAllMutedTests.mockClear();
    getAllUsers.mockClear();
    getVersionedSettingsStatus.mockClear();
    getRoles.mockClear();
    muteMultipleTests.mockClear();
  });

  it('lists changes with helper filters and pagination', async () => {
    const res = await getRequiredTool('list_changes').handler({
      projectId: 'Proj',
      buildId: 'B1',
      pageSize: 2,
      all: true,
    });
    expect(getAllChanges).toHaveBeenCalled();
    const locator = getAllChanges.mock.calls[0]?.[0];
    expect(locator).toContain('project:(id:Proj)');
    expect(locator).toContain('build:(id:B1)');
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(3);
    expect(payload.pagination.mode).toBe('all');
  });

  it('lists build problems with pagination helpers', async () => {
    const res = await getRequiredTool('list_problems').handler({
      projectId: 'Proj',
      all: false,
      pageSize: 1,
    });
    const locator = getAllBuildProblems.mock.calls[0]?.[0];
    expect(locator).toContain('project:(id:Proj)');
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(1);
    expect(payload.pagination.page).toBe(1);
  });

  it('lists problem occurrences and applies helper filters', async () => {
    await getRequiredTool('list_problem_occurrences').handler({
      buildId: 'Build123',
      problemId: 'Problem42',
      pageSize: 3,
    });
    const locator = getAllBuildProblemOccurrences.mock.calls[0]?.[0];
    expect(locator).toContain('build:(id:Build123)');
    expect(locator).toContain('problem:(id:Problem42)');
  });

  it('lists investigations including responsible username helper', async () => {
    await getRequiredTool('list_investigations').handler({
      assigneeUsername: 'alice',
      buildTypeId: 'bt1',
      pageSize: 1,
    });
    const locator = getAllInvestigations.mock.calls[0]?.[0];
    expect(locator).toContain('buildType:(id:bt1)');
    expect(locator).toContain('responsible:(user:(username:alice))');
  });

  it('lists muted tests with helper filters', async () => {
    await getRequiredTool('list_muted_tests').handler({
      projectId: 'Proj',
      testNameId: 'Test123',
    });
    const locator = getAllMutedTests.mock.calls[0]?.[0];
    expect(locator).toContain('project:(id:Proj)');
    expect(locator).toContain('test:(id:Test123)');
  });

  it('fetches Versioned Settings status', async () => {
    const res = await getRequiredTool('get_versioned_settings_status').handler({
      locator: 'project:(id:Proj)',
    });
    expect(getVersionedSettingsStatus).toHaveBeenCalledWith('project:(id:Proj)', undefined);
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.status).toBe('UP_TO_DATE');
  });

  it('lists users with helper filters and pagination', async () => {
    await getRequiredTool('list_users').handler({ groupId: 'devs', all: true, pageSize: 2 });
    const locator = getAllUsers.mock.calls[0]?.[0];
    expect(locator).toContain('group:(id:devs)');
    expect(getAllUsers).toHaveBeenCalledTimes(3);
  });

  it('lists roles and returns items/count', async () => {
    const res = await getRequiredTool('list_roles').handler({});
    expect(getRoles).toHaveBeenCalled();
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(1);
    expect(payload.count).toBe(1);
  });

  it('mutes tests with correct payload and scope helpers', async () => {
    let tool: ToolDefinition | undefined;
    const originalMode = process.env['MCP_MODE'];
    process.env['MCP_MODE'] = 'full';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getRequiredTool: getTool } = require('@/tools') as typeof import('@/tools');
      tool = getTool('mute_tests');
    });
    if (originalMode === undefined) {
      delete process.env['MCP_MODE'];
    } else {
      process.env['MCP_MODE'] = originalMode;
    }

    if (!tool) {
      throw new Error('mute_tests tool not available');
    }

    await tool.handler({
      testNameIds: ['t1', 't2'],
      projectId: 'Proj',
      comment: 'Mute for investigation',
    });
    const call = muteMultipleTests.mock.calls[0];
    if (!call) {
      throw new Error('muteMultipleTests not called');
    }
    const args = call as unknown[];
    const fields = args[0] as string | undefined;
    const payload = args[1] as Record<string, unknown> | undefined;
    expect(fields).toBeUndefined();
    expect(payload).toBeDefined();
    expect(payload).toMatchObject({
      mute: [
        {
          scope: { project: { id: 'Proj' } },
          target: { tests: { test: [{ id: 't1' }, { id: 't2' }] } },
          assignment: { text: 'Mute for investigation' },
        },
      ],
    });
  });
});
