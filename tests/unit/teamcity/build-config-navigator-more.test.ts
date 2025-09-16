import { BuildConfigNavigator } from '@/teamcity/build-config-navigator';

import { createMockTeamCityClient } from '../../test-utils/mock-teamcity-client';

describe('BuildConfigNavigator (more branches)', () => {
  let navigator: BuildConfigNavigator;
  let mockClient: ReturnType<typeof createMockTeamCityClient>;

  beforeEach(() => {
    mockClient = createMockTeamCityClient();
    mockClient.clearAllMocks();
    navigator = new BuildConfigNavigator(mockClient);
    // clear cache
    type PrivateNav = { cache: Map<string, unknown> };
    (navigator as unknown as PrivateNav).cache.clear();
  });

  it('extracts parameters when includeParameters is true', async () => {
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: {
        count: 1,
        buildType: [
          {
            id: 'B1',
            name: 'With Params',
            projectId: 'P',
            projectName: 'Proj',
            parameters: {
              property: [
                { name: 'env.FOO', value: 'bar' },
                { name: 'system.debug', value: 'true' },
              ],
            },
          },
        ],
      },
    });

    const res = await navigator.listBuildConfigs({ includeParameters: true });
    expect(res.buildConfigs[0]?.parameters).toEqual({ 'env.FOO': 'bar', 'system.debug': 'true' });
  });

  it('extracts project hierarchy when includeProjectHierarchy is true', async () => {
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: {
        count: 1,
        buildType: [{ id: 'B1', name: 'With Hier', projectId: 'P2', projectName: 'Project 2' }],
      },
    });
    // parent chain: _Root -> P1 -> P2
    mockClient.projects.getProject.mockImplementation(async (id: string) => {
      if (id === 'P2') {
        return {
          data: {
            id: 'P2',
            name: 'Project 2',
            parentProject: {
              id: 'P1',
              name: 'Project 1',
              parentProject: { id: '_Root', name: 'Root' },
            },
          },
        };
      }
      return { data: { id, name: id } };
    });

    const res = await navigator.listBuildConfigs({ includeProjectHierarchy: true });
    expect(res.buildConfigs[0]?.projectHierarchy).toEqual([
      { id: '_Root', name: 'Root' },
      { id: 'P1', name: 'Project 1' },
      { id: 'P2', name: 'Project 2' },
    ]);
  });

  it('applies statusFilter on lastBuildStatus, paused, hasRecentActivity and activeSince', async () => {
    const buildType = (
      overrides: Partial<{ lastBuildStatus: string; paused: boolean; lastBuildDate: string }>
    ) => ({
      id: 'B',
      name: 'N',
      projectId: 'P',
      projectName: 'Proj',
      ...overrides,
    });
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: {
        count: 4,
        buildType: [
          buildType({
            lastBuildStatus: 'SUCCESS',
            paused: false,
            lastBuildDate: '2025-01-02T00:00:00Z',
          }),
          buildType({
            lastBuildStatus: 'FAILURE',
            paused: true,
            lastBuildDate: '2025-01-01T00:00:00Z',
          }),
          buildType({ lastBuildStatus: 'SUCCESS', paused: true }), // no lastBuildDate
          buildType({
            lastBuildStatus: 'SUCCESS',
            paused: false,
            lastBuildDate: '2024-12-31T00:00:00Z',
          }),
        ],
      },
    });

    // Filter: only SUCCESS, not paused, has recent activity since Jan 1, 2025
    const res = await navigator.listBuildConfigs({
      statusFilter: {
        lastBuildStatus: 'SUCCESS',
        paused: false,
        hasRecentActivity: true,
        activeSince: new Date('2025-01-01T00:00:00Z'),
      },
    });
    expect(res.buildConfigs).toHaveLength(1);
    expect(res.buildConfigs[0]?.lastBuildDate).toBe('2025-01-02T00:00:00Z');
  });

  it('filters by vcsRootFilter url/branch/vcsName and handles missing roots', async () => {
    const make = (url?: string, branch?: string, vcsName: string = 'git') => ({
      id: 'B',
      name: 'N',
      projectId: 'P',
      projectName: 'Proj',
      'vcs-root-entries': {
        'vcs-root-entry': [
          {
            'vcs-root': {
              id: 'R',
              name: 'Repo',
              vcsName,
              properties: {
                property: [
                  { name: 'url', value: url },
                  { name: 'branch', value: branch },
                ],
              },
            },
          },
        ],
      },
    });

    // Two configs: only the second matches url and branch
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: {
        count: 2,
        buildType: [make('https://a', 'main'), make('https://match', 'dev')],
      },
    });

    const res = await navigator.listBuildConfigs({
      includeVcsRoots: true,
      vcsRootFilter: { url: 'match', branch: 'dev', vcsName: 'git' },
    });
    expect(res.buildConfigs).toHaveLength(1);

    // No roots present → filter cannot apply; item passes through
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: { count: 1, buildType: [{ id: 'X', name: 'X' }] },
    });
    const res2 = await navigator.listBuildConfigs({
      includeVcsRoots: true,
      vcsRootFilter: { url: 'x' },
    });
    expect(res2.buildConfigs).toHaveLength(1);
  });

  it('sorts by project then name, and lastModified combinations', async () => {
    const b = (name: string, projectName: string, last?: string) => ({
      id: name,
      name,
      projectId: projectName,
      projectName,
      lastBuildDate: last,
    });
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: {
        count: 4,
        buildType: [b('B', 'P1'), b('A', 'P1'), b('C', 'P2', '2025-01-01'), b('D', 'P3')],
      },
    });

    // Sort by project with tiebreaker on name
    const res = await navigator.listBuildConfigs({ sortBy: 'project', sortOrder: 'asc' });
    expect(res.buildConfigs.map((x) => x.name)).toEqual(['A', 'B', 'C', 'D']);

    // Sort by lastModified with missing values: current impl places entries without dates first for desc
    const res2 = await navigator.listBuildConfigs({ sortBy: 'lastModified', sortOrder: 'desc' });
    expect(['A', 'B', 'D']).toContain(res2.buildConfigs[0]?.name);
    expect(res2.buildConfigs.map((x) => x.name)).toContain('C');
  });

  it('calculateHasMore returns false if limit missing or count below limit', async () => {
    mockClient.buildTypes.getAllBuildTypes.mockResolvedValue({
      data: { count: 3, buildType: [{ id: '1', name: '1' }] },
    });
    const res = await navigator.listBuildConfigs();
    expect(res.hasMore).toBe(false);

    const res2 = await navigator.listBuildConfigs({ pagination: { limit: 10, offset: 0 } });
    expect(res2.hasMore).toBe(false);
  });

  it('transformError covers various cases (401/403/404/timeout/5xx/generic)', async () => {
    const err401 = { response: { status: 401 } };
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(err401);
    await expect(navigator.listBuildConfigs()).rejects.toThrow(/Authentication failed/);

    const err403 = { response: { status: 403 } };
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(err403);
    await expect(navigator.listBuildConfigs()).rejects.toThrow(/Permission denied/);

    const err404 = { response: { status: 404 } };
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(err404);
    await expect(navigator.listBuildConfigs({ projectId: 'P' })).rejects.toThrow(
      /Project P not found/
    );

    const timeoutByName = { name: 'ECONNABORTED' };
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(timeoutByName);
    await expect(navigator.listBuildConfigs()).rejects.toThrow(/Request timed out/);

    const timeoutByMessage = new Error('socket timeout');
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(timeoutByMessage);
    await expect(navigator.listBuildConfigs()).rejects.toThrow(/Request timed out/);

    const serverErr = { response: { status: 500 }, message: 'Internal' };
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(serverErr);
    await expect(navigator.listBuildConfigs()).rejects.toThrow(/TeamCity API error/);

    const genericErr = new Error('oops');
    mockClient.buildTypes.getAllBuildTypes.mockRejectedValueOnce(genericErr);
    await expect(navigator.listBuildConfigs()).rejects.toThrow(/oops/);
  });
});
