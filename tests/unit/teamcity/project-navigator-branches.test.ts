// Additional branch coverage for ProjectNavigator
import { ProjectNavigator } from '@/teamcity/project-navigator';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

type NavigatorSetup = {
  nav: ProjectNavigator;
  client: MockTeamCityClient;
};

const setupNavigator = (): NavigatorSetup => {
  const client = createMockTeamCityClient();

  client.projects.getAllProjects.mockImplementation(async () => ({
    data: {
      count: 3,
      project: [
        { id: 'B', name: 'B' },
        { id: 'A', name: 'A' },
        { id: 'C', name: 'C' },
      ],
    },
  }));

  client.projects.getProject.mockImplementation(async (id: string) => {
    if (id === 'Root') {
      return {
        data: {
          id: 'Root',
          name: 'Root',
          projects: { project: [{ id: 'A' }, { id: 'B' }] },
        },
      };
    }
    if (id === 'A') {
      return {
        data: {
          id: 'A',
          name: 'A',
          projects: { project: [{ id: 'Root' }] },
        },
      };
    }
    if (id === 'B') {
      return { data: { id: 'B', name: 'B' } };
    }
    if (id === 'C') {
      return {
        data: {
          id: 'C',
          name: 'C',
          projects: { project: [{ id: 'C' }] },
        },
      };
    }
    if (id === 'Child') {
      return {
        data: { id: 'Child', name: 'Child', parentProjectId: 'Parent' },
      };
    }
    if (id === 'Parent') {
      return {
        data: { id: 'Parent', name: 'Parent', parentProjectId: '_Root' },
      };
    }
    return { data: { id, name: id } };
  });

  return { nav: new ProjectNavigator(client), client };
};

describe('ProjectNavigator extra branches', () => {
  it('validateParams: invalid page and pageSize', async () => {
    const { nav } = setupNavigator();
    let res = await nav.listProjects({ pagination: { page: -1, pageSize: 10 } });
    expect(res.success).toBe(false);
    res = await nav.listProjects({ pagination: { page: 1, pageSize: -1 } });
    expect(res.success).toBe(false);
    res = await nav.listProjects({ pagination: { page: 1, pageSize: 2000 } });
    expect(res.success).toBe(false);
  });

  it('validateParams: ancestors/descendants without projectId', async () => {
    const { nav } = setupNavigator();
    let res = await nav.listProjects({ mode: 'ancestors' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('projectId is required');
    res = await nav.listProjects({ mode: 'descendants' });
    expect(res.success).toBe(false);
  });

  it('formatError: returns friendly messages for statuses and fallback', () => {
    const { nav } = setupNavigator();
    const fn = (nav as unknown as { formatError: (e: unknown) => string }).formatError.bind(nav);
    expect(fn({ response: { status: 401 } })).toContain('Authentication failed');
    expect(fn({ response: { status: 403 } })).toContain('Permission denied');
    expect(fn({ response: { status: 404 } })).toContain('Not found');
    expect(fn({ message: 'boom' })).toBe('boom');
    expect(fn('weird')).toBe('An unexpected error occurred');
  });

  it('sortProjects default branch: unknown sort key leaves order stable', () => {
    const { nav } = setupNavigator();
    const sort = (
      nav as unknown as {
        sortProjects: <T extends { name?: string; id?: string; level?: number }>(
          p: T[],
          s: string,
          order: 'asc' | 'desc'
        ) => T[];
      }
    ).sortProjects;
    const items = [{ id: 'B' }, { id: 'A' }];
    const out = sort(items, 'unknown', 'asc');
    expect(out.map((x) => x.id)).toEqual(['B', 'A']);
  });

  it('getList sorting by id and level', async () => {
    const { nav } = setupNavigator();
    let res = await nav.listProjects({ mode: 'list', sort: { by: 'id', order: 'asc' } });
    const idsAsc = (res.data?.projects ?? []).map((p: { id: string }) => p.id);
    expect(idsAsc).toEqual(['A', 'B', 'C']);
    res = await nav.listProjects({ mode: 'list', sort: { by: 'id', order: 'desc' } });
    const idsDesc = (res.data?.projects ?? []).map((p: { id: string }) => p.id);
    expect(idsDesc).toEqual(['C', 'B', 'A']);
    res = await nav.listProjects({ mode: 'list', sort: { by: 'level', order: 'asc' } });
    expect((res.data?.projects ?? []).length).toBe(3);
  });

  it('getAncestors returns normal chain including root', async () => {
    const { nav } = setupNavigator();
    const res = await nav.listProjects({ mode: 'ancestors', projectId: 'Child' });
    expect(res.success).toBe(true);
    const ancestors = res.data?.ancestors ?? [];
    expect(ancestors[0]?.id).toBe('_Root');
    expect(ancestors.map((a: { id: string }) => a.id)).toContain('Parent');
  });

  it('getHierarchy with leaf maxDepth not reached', async () => {
    const { nav } = setupNavigator();
    const res = await nav.listProjects({ mode: 'hierarchy', rootProjectId: 'B', maxDepth: 3 });
    expect(res.success).toBe(true);
    expect(res.data?.maxDepthReached).toBe(false);
  });

  it('getDescendants handles cycles and maxDepth detection', async () => {
    const { nav } = setupNavigator();
    const res = await nav.listProjects({ mode: 'descendants', projectId: 'Root', maxDepth: 1 });
    expect(res.success).toBe(true);
    const data = res.data as NonNullable<typeof res.data>;
    const ids = (data.descendants ?? []).map((d: { id: string }) => d.id);
    expect(new Set(ids)).toEqual(new Set(['A', 'B']));
    expect(data.maxDepthReached).toBe(true);
  });

  it('getHierarchy handles self-referential circular child gracefully', async () => {
    const { nav } = setupNavigator();
    const res = await nav.listProjects({ mode: 'hierarchy', rootProjectId: 'C', maxDepth: 2 });
    expect(res.success).toBe(true);
    const hierarchy = (res.data as NonNullable<typeof res.data>).hierarchy as NonNullable<
      NonNullable<typeof res.data>['hierarchy']
    >;
    expect(Array.isArray(hierarchy.children)).toBe(true);
    expect(hierarchy.children?.length).toBe(0);
  });
});
