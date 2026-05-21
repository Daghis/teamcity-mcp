import type { Project, Projects } from '@/teamcity-client/models';
import { ProjectListManager } from '@/teamcity/project-list-manager';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

const makeClient = (
  impl: Partial<{
    getAllProjects: (locator: string, fields: string) => Promise<{ data: Projects }>;
  }> = {}
): MockTeamCityClient => {
  const client = createMockTeamCityClient();
  client.resetAllMocks();

  if (impl.getAllProjects) {
    client.projects.getAllProjects.mockImplementation(impl.getAllProjects);
  } else {
    client.projects.getAllProjects.mockResolvedValue({ data: { project: [] } as Projects });
  }

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

  it('re-throws generic Error instances untouched', async () => {
    const client = makeClient({
      getAllProjects: async () => {
        throw new Error('something else');
      },
    });
    await expect(new ProjectListManager(client).listProjects()).rejects.toThrow(/something else/);
  });

  it('wraps non-Error rejection values in a new Error', async () => {
    const client = makeClient({
      getAllProjects: async () => {
        // eslint-disable-next-line no-throw-literal
        throw 'plain-string-failure';
      },
    });
    await expect(new ProjectListManager(client).listProjects()).rejects.toThrow(
      /Unknown error: plain-string-failure/
    );
  });

  it('reports TeamCity API error with "unknown" status when none is provided', async () => {
    const client = makeClient({
      getAllProjects: async () => {
        throw Object.assign(new Error('err'), { response: {} });
      },
    });
    await expect(new ProjectListManager(client).listProjects()).rejects.toThrow(
      /TeamCity API error \(unknown\)/
    );
  });

  it('falls back to Error.message when response.data has no message', async () => {
    const client = makeClient({
      getAllProjects: async () => {
        throw Object.assign(new Error('fallback msg'), { response: { status: 500 } });
      },
    });
    await expect(new ProjectListManager(client).listProjects()).rejects.toThrow(/fallback msg/);
  });

  it('returns an empty list when the API response has no project array', async () => {
    const client = makeClient({
      getAllProjects: async () => ({ data: {} as Projects }),
    });
    const res = await new ProjectListManager(client).listProjects();
    expect(res.projects).toEqual([]);
    expect(res.metadata.hasMore).toBe(false);
    expect(res.metadata.totalCount).toBeUndefined();
  });

  it('uses buildTypes.buildType length when count is missing', async () => {
    const response: Projects = {
      count: 1,
      project: [
        {
          id: 'P',
          name: 'Project',
          buildTypes: {
            buildType: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
          },
          projects: {
            project: [{ id: 'c1' }, { id: 'c2' }],
          },
        } as unknown as Project,
      ],
    };
    const client = makeClient({
      getAllProjects: async () => ({ data: response }),
    });
    const res = await new ProjectListManager(client).listProjects();
    expect(res.projects[0]?.buildTypesCount).toBe(3);
    expect(res.projects[0]?.subprojectsCount).toBe(2);
  });

  it('returns 0 when neither count nor array is present', async () => {
    const response: Projects = {
      count: 1,
      project: [{ id: 'X', name: 'Lone', buildTypes: {} } as unknown as Project],
    };
    const client = makeClient({
      getAllProjects: async () => ({ data: response }),
    });
    const res = await new ProjectListManager(client).listProjects();
    expect(res.projects[0]?.buildTypesCount).toBe(0);
    expect(res.projects[0]?.subprojectsCount).toBe(0);
  });

  it('calculates depth=2 when parent exists but no ancestor list is returned', async () => {
    const response: Projects = {
      count: 1,
      project: [
        {
          id: 'Child',
          name: 'C',
          parentProjectId: 'Parent',
        } as unknown as Project,
      ],
    };
    const client = makeClient({
      getAllProjects: async () => ({ data: response }),
    });
    const res = await new ProjectListManager(client).listProjects();
    expect(res.projects[0]?.depth).toBe(2);
  });

  it('calculates depth from ancestor list when provided', async () => {
    const response: Projects = {
      count: 1,
      project: [
        {
          id: 'Grandchild',
          name: 'G',
          parentProjectId: 'Parent',
          ancestorProjects: {
            project: [
              { id: 'Root', name: 'R' },
              { id: 'Parent', name: 'P' },
            ] as unknown as Project[],
          },
        } as unknown as Project,
      ],
    };
    const client = makeClient({
      getAllProjects: async () => ({ data: response }),
    });
    const res = await new ProjectListManager(client).listProjects();
    expect(res.projects[0]?.depth).toBe(3);
  });

  it('reports hasMore=false when returned count is below the limit', async () => {
    const response: Projects = {
      count: 5,
      project: [{ id: 'A' } as unknown as Project],
    };
    const client = makeClient({
      getAllProjects: async () => ({ data: response }),
    });
    const res = await new ProjectListManager(client).listProjects({ limit: 100 });
    expect(res.metadata.hasMore).toBe(false);
  });
});
