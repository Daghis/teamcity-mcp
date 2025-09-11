import type { Logger } from 'winston';

import type { Project, Projects } from '@/teamcity-client/models';
import { ProjectManager } from '@/teamcity/project-manager';

describe('ProjectManager', () => {
  const logger: Logger = { error: jest.fn() } as unknown as Logger;

  const makeClient = (
    impl: Partial<{
      getAllProjects: (locator?: string, fields?: string) => Promise<{ data: Projects }>;
      getProject: (id: string, fields?: string) => Promise<{ data: Project }>;
      getAllSubprojectsOrdered: (id: string, fields?: string) => Promise<{ data: Projects }>;
    }>
  ) => {
    return {
      projects: {
        getAllProjects:
          impl.getAllProjects ?? (async () => ({ data: { project: [] } as Projects })),
        getProject:
          impl.getProject ??
          (async (id: string) => ({ data: { id, name: id } as unknown as Project })),
        getAllSubprojectsOrdered:
          impl.getAllSubprojectsOrdered ?? (async () => ({ data: { project: [] } as Projects })),
      },
    } as unknown as import('@/teamcity/client').TeamCityClient;
  };

  it('lists, filters, sorts and paginates projects', async () => {
    const projects: Projects = {
      project: [
        {
          id: 'B',
          name: 'Beta',
          archived: false,
          buildTypes: { count: 0 },
        } as unknown as Project,
        {
          id: 'A',
          name: 'Alpha',
          archived: true,
          buildTypes: { count: 2 },
          parameters: { property: [{ name: 'k', value: 'v' }] },
          projects: { count: 1 },
        } as unknown as Project,
      ],
    };

    const captured: { locator?: string; fields?: string }[] = [];
    const client = makeClient({
      getAllProjects: async (locator?: string, fields?: string) => {
        captured.push({ locator, fields });
        return { data: projects };
      },
    });

    const pm = new ProjectManager(client, logger);
    const res = await pm.listProjects({
      filters: { archived: true, parentProjectId: 'PARENT', namePattern: 'A*', hasBuilds: true },
      sort: { by: 'id', order: 'desc' },
      pagination: { page: 1, pageSize: 1 },
      includeStatistics: true,
    });

    // Behavior-first: avoid verifying internal locator/fields construction

    // After filters (name A* and hasBuilds true), only project A remains
    expect(res.projects.length).toBe(1);
    const first = res.projects[0];
    expect(first?.id).toBe('A');
    expect(first?.parameters).toEqual({ k: 'v' });
    expect(res.pagination.totalCount).toBe(1);
  });

  it('getProjectHierarchy builds structure and tracks levels and paths', async () => {
    const client = makeClient({
      getProject: async (id: string) => ({ data: { id, name: id } as unknown as Project }),
      getAllSubprojectsOrdered: async (id: string) => ({
        data: {
          project: id === '_Root' ? ([{ id: 'A' }] as unknown as Project[]) : [],
        } as Projects,
      }),
    });

    const pm = new ProjectManager(client, logger);
    const root = await pm.getProjectHierarchy('_Root', 5);
    expect(root.project.id).toBe('_Root');
    const child0 = root.children[0];
    expect(child0?.project.id).toBe('A');
    expect(child0?.project.level).toBe(1);
    expect(child0?.project.path).toEqual(['_Root', 'A']);
  });

  it('getProjectHierarchy throws on circular reference', async () => {
    const client = makeClient({
      getProject: async (id: string) => ({ data: { id, name: id } as unknown as Project }),
      getAllSubprojectsOrdered: async (id: string) => ({
        data: { project: [{ id }] as unknown as Project[] } as Projects, // child points to itself
      }),
    });

    const pm = new ProjectManager(client, logger);
    await expect(pm.getProjectHierarchy('_Root', 5)).rejects.toThrow(/Circular reference/);
  });

  it('getProjectAncestors builds chain up to _Root', async () => {
    const chain: Record<string, Project> = {
      C: { id: 'C', name: 'C', parentProjectId: 'B' } as unknown as Project,
      B: { id: 'B', name: 'B', parentProjectId: '_Root' } as unknown as Project,
    };
    const client = makeClient({
      getProject: async (id: string) => ({ data: chain[id] ?? ({ id } as unknown as Project) }),
    });
    const pm = new ProjectManager(client, logger);
    const ancestors = await pm.getProjectAncestors('C');
    expect(ancestors.map((p) => p.id)).toEqual(['B', 'C']);
  });

  it('getProjectDescendants collects normalized descendants with levels', async () => {
    const sub: Record<string, Projects> = {
      _Root: { project: [{ id: 'A', name: 'A' } as unknown as Project] },
      A: { project: [{ id: 'A1', name: 'A1' } as unknown as Project] },
      A1: { project: [] },
    };
    const client = makeClient({
      getAllSubprojectsOrdered: async (id: string) => ({ data: sub[id] ?? { project: [] } }),
    });
    const pm = new ProjectManager(client, logger);
    const descendants = await pm.getProjectDescendants('_Root', 5);
    const ids = descendants.map((d) => d.id);
    expect(ids).toEqual(['A', 'A1']);
    expect(descendants.find((d) => d.id === 'A')?.level).toBe(1);
    expect(descendants.find((d) => d.id === 'A1')?.level).toBe(2);
  });

  it('listProjects logs and rethrows on API error', async () => {
    const client = makeClient({
      getAllProjects: async () => {
        throw new Error('boom');
      },
    });
    const logger: Logger = { error: jest.fn() } as unknown as Logger;
    const pm = new ProjectManager(client, logger);
    await expect(pm.listProjects()).rejects.toThrow('boom');
    expect((logger.error as jest.Mock).mock.calls[0]?.[0]).toMatch(/Failed to list projects/);
  });

  it('getProjectHierarchy logs and rethrows on project error', async () => {
    const client = makeClient({
      getProject: async () => {
        throw new Error('nope');
      },
    });
    const logger: Logger = { error: jest.fn() } as unknown as Logger;
    const pm = new ProjectManager(client, logger);
    await expect(pm.getProjectHierarchy('_Root', 2)).rejects.toThrow('nope');
    expect((logger.error as jest.Mock).mock.calls[0]?.[0]).toMatch(
      /Failed to get project hierarchy/
    );
  });

  it('sortProjects by id and level with desc order', async () => {
    const client = makeClient({});
    const pm = new ProjectManager(client, { error: jest.fn() } as unknown as Logger);
    const projects: Array<{ id: string; name: string; level?: number }> = [
      { id: 'B', name: 'B', level: 1 },
      { id: 'A', name: 'A', level: 2 },
      { id: 'C', name: 'C', level: 0 },
    ];
    const byIdDesc = (
      pm as unknown as {
        sortProjects: (
          p: Array<{ id: string; name: string; level?: number }>,
          s: { by?: 'name' | 'id' | 'level'; order?: 'asc' | 'desc' }
        ) => Array<{ id: string; name: string; level?: number }>;
      }
    ).sortProjects(projects, { by: 'id', order: 'desc' });
    expect(byIdDesc.map((p) => p.id)).toEqual(['C', 'B', 'A']);
    const byLevelDesc = (
      pm as unknown as {
        sortProjects: (
          p: Array<{ id: string; name: string; level?: number }>,
          s: { by?: 'name' | 'id' | 'level'; order?: 'asc' | 'desc' }
        ) => Array<{ id: string; name: string; level?: number }>;
      }
    ).sortProjects(projects, { by: 'level', order: 'desc' });
    expect(byLevelDesc.map((p) => p.level)).toEqual([2, 1, 0]);
  });
});
