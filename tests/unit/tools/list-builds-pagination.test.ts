import { getRequiredTool } from '@/tools';

const getAllBuildsMock = jest.fn((locator?: string) => {
  const startMatch = locator?.match(/start:(\d+)/);
  const countMatch = locator?.match(/count:(\d+)/);
  const start = startMatch?.[1] ? parseInt(startMatch[1], 10) : 0;
  const count = countMatch?.[1] ? parseInt(countMatch[1], 10) : 100;

  const items = [] as Array<{ id: number }>;
  for (let i = start; i < start + count && i < 3; i++) {
    items.push({ id: i + 1 });
  }

  const nextHref = start + count < 3 ? '/next' : undefined;
  return Promise.resolve({ data: { build: items, count: 3, nextHref } });
});

jest.mock('@/api-client', () => ({
  TeamCityAPI: {
    getInstance: () => ({
      builds: {
        getAllBuilds: getAllBuildsMock,
      },
      modules: {
        builds: {
          getAllBuilds: getAllBuildsMock,
        },
      },
    }),
  },
}));

beforeEach(() => {
  getAllBuildsMock.mockClear();
});

describe('list_builds pagination', () => {
  it('returns first page when all is not set', async () => {
    const res = await getRequiredTool('list_builds').handler({ pageSize: 2 });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(2);
    expect(payload.pagination.page).toBe(1);
  });

  it('fetches all pages when all=true', async () => {
    const res = await getRequiredTool('list_builds').handler({ pageSize: 2, all: true });
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.items).toHaveLength(3);
    expect(payload.pagination.mode).toBe('all');
  });
});

describe('list_builds branch normalization', () => {
  it('wraps branch name locators with parentheses when locator argument is used', async () => {
    await getRequiredTool('list_builds').handler({
      locator: 'branch:name:refs/heads/feature/test-123',
    });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:(name:refs/heads/feature/test-123)');
  });

  it('splits top-level locator segments while preserving nested commas', async () => {
    await getRequiredTool('list_builds').handler({
      locator: 'branch:(name:refs/heads/feature/test-123,default:false),status:SUCCESS',
    });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:(name:refs/heads/feature/test-123,default:false)');
    expect(locatorArg).toContain(',status:SUCCESS');
  });

  it('ignores empty locator segments when splitting', async () => {
    await getRequiredTool('list_builds').handler({
      locator: 'branch:default:any,,status:SUCCESS',
    });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg?.startsWith('branch:default:any,status:SUCCESS')).toBe(true);
  });

  it('adds branch filter when branch argument is provided', async () => {
    await getRequiredTool('list_builds').handler({ branch: 'refs/heads/main' });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:(refs/heads/main)');
  });

  it('preserves wildcard branch filters without adding parentheses', async () => {
    await getRequiredTool('list_builds').handler({ branch: 'feature/*' });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:feature/*');
    expect(locatorArg).not.toContain('branch:(feature/*)');
  });

  it('supports default branch selectors without wrapping', async () => {
    await getRequiredTool('list_builds').handler({ branch: 'default:any' });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:default:any');
    expect(locatorArg).not.toContain('branch:(default:any)');
  });

  it('preserves policy selectors coming from branch argument', async () => {
    await getRequiredTool('list_builds').handler({ branch: 'policy:ALL_BRANCHES' });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:policy:ALL_BRANCHES');
    expect(locatorArg).not.toContain('branch:(policy:ALL_BRANCHES)');
  });

  it('wraps branch arguments containing whitespace', async () => {
    await getRequiredTool('list_builds').handler({ branch: 'feature branch' });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:(feature branch)');
  });

  it('respects already wrapped branch arguments', async () => {
    await getRequiredTool('list_builds').handler({ branch: 'branch:(refs/heads/develop)' });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:(refs/heads/develop)');
    expect(locatorArg?.match(/branch:\(\(refs\/heads\/develop\)\)/)).toBeNull();
  });

  it('avoids duplicating branch filters when locator already includes one', async () => {
    await getRequiredTool('list_builds').handler({
      locator: 'branch:default:any',
      branch: 'refs/heads/ignored',
    });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('branch:default:any');
    expect(locatorArg).not.toContain('refs/heads/ignored');
  });

  it('appends project, build type, and status filters', async () => {
    await getRequiredTool('list_builds').handler({
      projectId: 'MyProject',
      buildTypeId: 'MyBuildType',
      status: 'SUCCESS',
    });

    const [locatorArg] = getAllBuildsMock.mock.calls[0] ?? [];
    expect(locatorArg).toContain('project:(id:MyProject)');
    expect(locatorArg).toContain('buildType:(id:MyBuildType)');
    expect(locatorArg).toContain('status:SUCCESS');
  });
});
