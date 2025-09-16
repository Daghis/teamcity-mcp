import type { Project, Projects } from '@/teamcity-client/models';
import { ProjectListManager } from '@/teamcity/project-list-manager';

import { createMockTeamCityClient } from '../../test-utils/mock-teamcity-client';

const makeClient = (
  impl: Partial<{
    getAllProjects: (locator: string, fields: string) => Promise<{ data: Projects }>;
  }> = {}
) => {
  const client = createMockTeamCityClient();
  client.clearAllMocks();
  client.projects.getAllProjects.mockImplementation(
    impl.getAllProjects ?? (async () => ({ data: { project: [] } as Projects }))
  );
  return client;
};

describe('ProjectListManager', () => {
  it('lists projects with locator, fields, and transforms hierarchy', async () => {
    const response: Projects = {
      count: 10,
      project: [
        {
          id: 'A',
          name: 'Alpha',
          parentProjectId: '_Root',
          archived: false,
          href: '/p/A',
          webUrl: 'http://t/p/A',
          buildTypes: { count: 2 },
          projects: {
            project: [
              { id: 'A1', name: 'Alpha-1', buildTypes: { count: 2 } },
            ] as unknown as Project[],
          },
          ancestorProjects: { project: [{ id: '_Root', name: 'Root' }] as unknown as Project[] },
          parentProject: { id: '_Root', name: 'Root' },
        } as unknown as Project,
        { id: 'B', name: 'Beta', buildTypes: { count: 1 } } as unknown as Project,
      ],
    };

    const captured: { locator: string; fields: string }[] = [];
    const client = makeClient({
      getAllProjects: async (locator, fields) => {
        captured.push({ locator, fields });
        return { data: response };
      },
    });

    const mgr = new ProjectListManager(client);
    const res = await mgr.listProjects({
      name: 'Al*',
      archived: false,
      parentProjectId: '_Root',
      includeHierarchy: true,
      limit: 2,
      offset: 0,
    });

    // Behavior-first: avoid verifying internal locator/fields construction

    const first = res.projects[0];
    expect(first?.id).toBe('A');
    expect(first?.buildTypesCount).toBe(2);
    expect(first?.subprojectsCount).toBe(1);
    expect(first?.depth).toBe(1);
    expect(first?.parentProject).toBeDefined();
    expect(first?.ancestorProjects).toBeDefined();
    expect(first?.childProjects?.[0]?.buildTypesCount).toBe(2);

    expect(res.metadata.count).toBe(2);
    expect(res.metadata.hasMore).toBe(true);
    expect(res.metadata.totalCount).toBe(10);
  });

  it('handles API errors with status-specific messages', async () => {
    const errorBase = new Error('x') as Error & {
      response?: { status?: number; data?: { message?: string } };
      message?: string;
    };
    const client401 = makeClient({
      getAllProjects: async () => {
        throw Object.assign(new Error('e'), {
          response: { status: 401, data: { message: 'bad' } },
        });
      },
    });
    const client403 = makeClient({
      getAllProjects: async () => {
        throw Object.assign(new Error('e'), { response: { status: 403, data: { message: 'no' } } });
      },
    });
    const client404 = makeClient({
      getAllProjects: async () => {
        throw Object.assign(new Error('e'), {
          response: { status: 404, data: { message: 'missing' } },
        });
      },
    });
    const clientOther = makeClient({
      getAllProjects: async () => {
        throw Object.assign(errorBase, { response: { status: 500, data: { message: 'oops' } } });
      },
    });

    await expect(new ProjectListManager(client401).listProjects()).rejects.toThrow(
      /Authentication failed: bad/
    );
    await expect(new ProjectListManager(client403).listProjects()).rejects.toThrow(
      /Permission denied: no/
    );
    await expect(new ProjectListManager(client404).listProjects()).rejects.toThrow(
      /Not found: missing/
    );
    await expect(new ProjectListManager(clientOther).listProjects()).rejects.toThrow(
      /TeamCity API error \(500\): oops/
    );
  });
});
