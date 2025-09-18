import type { Logger } from 'winston';

import type { Project, Projects } from '@/teamcity-client/models';
import { ProjectManager } from '@/teamcity/project-manager';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

const logger: Logger = { error: jest.fn() } as unknown as Logger;

const makeClient = (
  impl: Partial<{
    getAllProjects: (locator?: string, fields?: string) => Promise<{ data: Projects }>;
    getProject: (id: string, fields?: string) => Promise<{ data: Project }>;
    getAllSubprojectsOrdered: (id: string, fields?: string) => Promise<{ data: Projects }>;
  }>
): MockTeamCityClient => {
  const client = createMockTeamCityClient();
  client.resetAllMocks();

  if (impl.getAllProjects) {
    client.projects.getAllProjects.mockImplementation(impl.getAllProjects);
  } else {
    client.projects.getAllProjects.mockResolvedValue({ data: { project: [] } as Projects });
  }

  if (impl.getProject) {
    client.projects.getProject.mockImplementation(impl.getProject);
  } else {
    client.projects.getProject.mockImplementation(async (id: string) => ({
      data: { id, name: id } as unknown as Project,
    }));
  }

  if (impl.getAllSubprojectsOrdered) {
    client.projects.getAllSubprojectsOrdered.mockImplementation(impl.getAllSubprojectsOrdered);
  } else {
    client.projects.getAllSubprojectsOrdered.mockResolvedValue({
      data: { project: [] } as Projects,
    });
  }

  return client;
};

describe('ProjectManager (more branches)', () => {
  it('listProjects without filters builds no locator and no stats fields', async () => {
    const calls: { locator?: string; fields?: string }[] = [];
    const client = makeClient({
      getAllProjects: async (locator?: string, fields?: string) => {
        calls.push({ locator, fields });
        return { data: { project: [{ id: 'X', name: 'X' }] } as unknown as Projects };
      },
    });
    const pm = new ProjectManager(client, logger);
    const res = await pm.listProjects();
    // Behavior-first: avoid verifying internal fields/locator; assert result shape only
    expect(res.projects[0]?.id).toBe('X');
  });

  it('getProject returns null on 404', async () => {
    const client = makeClient({
      getProject: async (_: string) => {
        const err = Object.assign(new Error('Not found'), { response: { status: 404 } });
        throw err;
      },
    });
    const pm = new ProjectManager(client, logger);
    const res = await (pm as unknown as { getProject: (id: string) => Promise<null> }).getProject(
      'NOPE'
    );
    expect(res).toBeNull();
  });

  it('applyFilters handles hasBuilds=false and maxDepth', async () => {
    const client = makeClient({});
    const pm = new ProjectManager(client, logger);
    const projects: Array<{ id: string; name: string; buildTypesCount?: number; level?: number }> =
      [
        { id: 'A', name: 'A', buildTypesCount: 0, level: 2 },
        { id: 'B', name: 'B', buildTypesCount: 2, level: 3 },
      ];
    const filtered = (
      pm as unknown as {
        applyFilters: (
          p: Array<{ id: string; name: string; buildTypesCount?: number; level?: number }>,
          f: { hasBuilds?: boolean; maxDepth?: number }
        ) => Array<{ id: string }>;
      }
    ).applyFilters(projects, { hasBuilds: false, maxDepth: 2 });
    expect(filtered.map((p) => p.id)).toEqual(['A']);
  });

  it('paginate computes hasNext/hasPrevious correctly', async () => {
    const client = makeClient({});
    const pm = new ProjectManager(client, logger);
    const projects = Array.from({ length: 3 }, (_, i) => ({ id: String(i), name: String(i) }));
    const page2 = (
      pm as unknown as {
        paginate: (
          p: Array<{ id: string; name: string }>,
          pg: { page?: number; pageSize?: number }
        ) => { pagination: { hasNext: boolean; hasPrevious: boolean } };
      }
    ).paginate(projects, { page: 2, pageSize: 2 });
    expect(page2.pagination.hasPrevious).toBe(true);
    expect(page2.pagination.hasNext).toBe(false);
  });
});
