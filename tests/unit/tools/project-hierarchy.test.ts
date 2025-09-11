import { getRequiredTool } from '@/tools';

// Mock TeamCityAPI to simulate a small project tree
jest.mock('@/api-client', () => {
  type Project = {
    id: string;
    name: string;
    projects: { project: Array<{ id: string; name: string }> };
  };
  const projects: Record<string, Project> = {
    _Root: {
      id: '_Root',
      name: 'Root',
      projects: {
        project: [
          { id: 'A', name: 'Alpha' },
          { id: 'B', name: 'Beta' },
        ],
      },
    },
    A: { id: 'A', name: 'Alpha', projects: { project: [{ id: 'A1', name: 'Alpha One' }] } },
    B: { id: 'B', name: 'Beta', projects: { project: [] } },
    A1: { id: 'A1', name: 'Alpha One', projects: { project: [] } },
  };

  return {
    TeamCityAPI: {
      getInstance: () => ({
        projects: {
          getProject: async (id: string) => ({ data: projects[id] }),
        },
      }),
    },
  };
});

describe('list_project_hierarchy', () => {
  it('walks the tree and returns children for root', async () => {
    const res = await getRequiredTool('list_project_hierarchy').handler({});
    const payload = JSON.parse((res.content?.[0]?.text as string) ?? '{}');
    expect(payload.children).toEqual([
      { id: 'A', name: 'Alpha' },
      { id: 'B', name: 'Beta' },
    ]);
  });
});
