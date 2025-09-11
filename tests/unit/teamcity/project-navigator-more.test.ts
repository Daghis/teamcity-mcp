/** Additional tests for ProjectNavigator to raise branch coverage */
import { TeamCityAPI } from '@/api-client';
import type { Projects } from '@/teamcity-client/models/projects';
import { ProjectNavigator } from '@/teamcity/project-navigator';

jest.mock('@/api-client');

describe('ProjectNavigator (more cases)', () => {
  let navigator: ProjectNavigator;
  type MockClient = { projects: { getAllProjects: jest.Mock; getProject: jest.Mock } };
  let mockClient: MockClient;

  beforeEach(() => {
    mockClient = { projects: { getAllProjects: jest.fn(), getProject: jest.fn() } };
    (TeamCityAPI.getInstance as jest.Mock).mockReturnValue(mockClient);
    navigator = new ProjectNavigator();
  });

  it('list mode: hasMore is false when fewer items than pageSize', async () => {
    const projects: Projects = {
      count: 2,
      project: [
        { id: 'P1', name: 'P1', parentProjectId: '_Root' },
        { id: 'P2', name: 'P2', parentProjectId: '_Root' },
      ],
    };
    mockClient.projects.getAllProjects.mockResolvedValue({ data: projects });
    const res = await navigator.listProjects({
      mode: 'list',
      pagination: { page: 1, pageSize: 5 },
    });
    expect(res.success).toBe(true);
    expect(res.data?.hasMore).toBe(false);
  });

  it('descendants mode: missing projectId yields validation error', async () => {
    const res = await navigator.listProjects({ mode: 'descendants' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/projectId is required/);
  });

  it('maps 404 errors to Not found message', async () => {
    const err = new Error('Not found');
    (err as unknown as { response?: { status?: number } }).response = { status: 404 };
    mockClient.projects.getAllProjects.mockRejectedValue(err);
    const res = await navigator.listProjects({ mode: 'list' });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Not found');
  });

  it('returns generic message for unexpected errors', async () => {
    // Throw a non-object value to hit generic path
    mockClient.projects.getAllProjects.mockRejectedValue(123 as unknown as Error);
    const res = await navigator.listProjects({ mode: 'list' });
    expect(res.success).toBe(false);
    expect(res.error).toBe('An unexpected error occurred');
  });
});
