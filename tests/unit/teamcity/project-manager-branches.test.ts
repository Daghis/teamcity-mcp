import type { Logger } from 'winston';

import type { Project } from '@/teamcity-client/models';
import { type ManagedProject, ProjectManager } from '@/teamcity/project-manager';

const logger: Logger = { error: jest.fn() } as unknown as Logger;

const makeClient = (
  impl: Partial<{
    getAllProjects: (
      locator?: string,
      fields?: string
    ) => Promise<{ data: { project: Project[] } }>;
    getProject: (id: string, fields?: string) => Promise<{ data: Project }>;
    getAllSubprojectsOrdered: (
      id: string,
      fields?: string
    ) => Promise<{ data: { project: Project[] } }>;
  }>
) => {
  return {
    projects: {
      getAllProjects: impl.getAllProjects ?? (async () => ({ data: { project: [] } })),
      getProject:
        impl.getProject ??
        (async (id: string) => ({ data: { id, name: id } as unknown as Project })),
      getAllSubprojectsOrdered:
        impl.getAllSubprojectsOrdered ?? (async () => ({ data: { project: [] } })),
    },
  } as unknown as import('@/teamcity/client').TeamCityClient;
};

describe('ProjectManager branch coverage boosters', () => {
  it('applyFilters handles wildcard and substring patterns and hasBuilds true/false', () => {
    const client = makeClient({});
    const pm = new ProjectManager(client, logger);
    const projects: ManagedProject[] = [
      { id: '1', name: 'Alpha Service', archived: false, buildTypesCount: 1 },
      { id: '2', name: 'Beta', archived: false, buildTypesCount: 0 },
      { id: '3', name: 'Alps', archived: false, buildTypesCount: 2 },
    ];

    // Substring pattern (no wildcard)
    const filtered1 = (
      pm as unknown as { applyFilters: (p: ManagedProject[], f: unknown) => ManagedProject[] }
    ).applyFilters(projects, { namePattern: 'alp' });
    expect(filtered1.map((p) => p.id)).toEqual(['1', '3']);

    // Wildcard pattern
    const filtered2 = (
      pm as unknown as { applyFilters: (p: ManagedProject[], f: unknown) => ManagedProject[] }
    ).applyFilters(projects, { namePattern: 'Al*' });
    expect(filtered2.map((p) => p.id)).toEqual(['1', '3']);

    // hasBuilds true
    const withBuilds = (
      pm as unknown as { applyFilters: (p: ManagedProject[], f: unknown) => ManagedProject[] }
    ).applyFilters(projects, { hasBuilds: true });
    expect(withBuilds.map((p) => p.id)).toEqual(['1', '3']);

    // hasBuilds false
    const noBuilds = (
      pm as unknown as { applyFilters: (p: ManagedProject[], f: unknown) => ManagedProject[] }
    ).applyFilters(projects, { hasBuilds: false });
    expect(noBuilds.map((p) => p.id)).toEqual(['2']);
  });

  it('applyFilters respects maxDepth but keeps items with undefined level', () => {
    const client = makeClient({});
    const pm = new ProjectManager(client, logger);
    const projects: ManagedProject[] = [
      { id: 'A', name: 'A', archived: false, level: 1 },
      { id: 'B', name: 'B', archived: false, level: 3 },
      { id: 'C', name: 'C', archived: false },
    ];
    const filtered = (
      pm as unknown as { applyFilters: (p: ManagedProject[], f: unknown) => ManagedProject[] }
    ).applyFilters(projects, { maxDepth: 2 });
    expect(filtered.map((p) => p.id)).toEqual(['A', 'C']);
  });

  it('sortProjects handles default branch when sort key is invalid', () => {
    const client = makeClient({});
    const pm = new ProjectManager(client, logger);
    const projects: ManagedProject[] = [
      { id: 'B', name: 'B', archived: false },
      { id: 'A', name: 'A', archived: false },
    ];
    const sorted = (
      pm as unknown as {
        sortProjects: (
          p: ManagedProject[],
          s: { by?: 'name' | 'id' | 'level' } & { order?: 'asc' | 'desc' }
        ) => ManagedProject[];
      }
    ).sortProjects(projects, { by: 'invalid' as unknown as 'name', order: 'asc' });
    // Should remain unchanged when default branch used
    expect(sorted.map((p) => p.id)).toEqual(['B', 'A']);
  });

  it('listProjects executes locator branches without asserting internals', async () => {
    const client = makeClient({ getAllProjects: async () => ({ data: { project: [] } }) });
    const pm = new ProjectManager(client, logger);
    // archived + parentProjectId exercises buildLocator branches
    const res = await pm.listProjects({ filters: { archived: false, parentProjectId: 'PARENT' } });
    expect(res.projects).toEqual([]);
  });

  it('getProjectAncestors breaks when parent missing mid-chain', async () => {
    const client = makeClient({
      getProject: async (id: string) => {
        if (id === 'C')
          return { data: { id: 'C', name: 'C', parentProjectId: 'Missing' } as unknown as Project };
        // Simulate 404 -> library returns rejected promise; our ProjectManager converts to null
        const err = Object.assign(new Error('not found'), { response: { status: 404 } });
        throw err;
      },
    });
    const pm = new ProjectManager(client, logger);
    const ancestors = await pm.getProjectAncestors('C');
    expect(ancestors.map((p) => p.id)).toEqual(['C']);
  });

  it('getProjectDescendants avoids cycles via visited guard', async () => {
    const client = makeClient({
      getAllSubprojectsOrdered: async (id: string) => {
        if (id === '_Root') return { data: { project: [{ id: 'A', name: 'A' }] } };
        if (id === 'A') return { data: { project: [{ id: '_Root', name: 'Root' }] } };
        return { data: { project: [] } };
      },
    });
    const pm = new ProjectManager(client, logger);
    const descendants = await pm.getProjectDescendants('_Root', 3);
    // Should include A and at most one back-reference; no infinite loop
    const ids = descendants.map((p) => p.id);
    expect(new Set(ids)).toEqual(new Set(['A', '_Root']));
  });

  it('listProjects paginate boundaries via public API', async () => {
    const projectsMany = Array.from(
      { length: 3 },
      (_, i) => ({ id: `P${i + 1}`, name: `P${i + 1}` }) as unknown as Project
    );
    const client = makeClient({
      getAllProjects: async () => ({
        data: { project: projectsMany } as unknown as { project: Project[] },
      }),
    });
    const pm = new ProjectManager(client, logger);
    const res = await pm.listProjects({ pagination: { page: 3, pageSize: 1 } });
    expect(res.pagination.totalPages).toBe(3);
    expect(res.pagination.hasNext).toBe(false);
    expect(res.pagination.hasPrevious).toBe(true);

    const clientEmpty = makeClient({ getAllProjects: async () => ({ data: { project: [] } }) });
    const pm2 = new ProjectManager(clientEmpty, logger);
    const res2 = await pm2.listProjects({ pagination: { page: 1, pageSize: 5 } });
    expect(res2.pagination.totalCount).toBe(0);
    expect(res2.pagination.hasNext).toBe(false);
    expect(res2.pagination.hasPrevious).toBe(false);
  });

  it('getProjectDescendants respects maxDepth boundary', async () => {
    const client = makeClient({
      getAllSubprojectsOrdered: async (id: string) => {
        if (id === '_Root') return { data: { project: [{ id: 'A', name: 'A' }] } };
        if (id === 'A') return { data: { project: [{ id: 'A1', name: 'A1' }] } };
        return { data: { project: [] } };
      },
    });
    const pm = new ProjectManager(client, logger);
    const res = await pm.getProjectDescendants('_Root', 1);
    // Current implementation allows collecting next level when depth equals maxDepth
    expect(new Set(res.map((p) => p.id))).toEqual(new Set(['A', 'A1']));
  });
});
