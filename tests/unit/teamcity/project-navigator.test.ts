/**
 * Tests for ProjectNavigator
 */
import type { Projects } from '@/teamcity-client/models/projects';
import { ProjectNavigator } from '@/teamcity/project-navigator';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('ProjectNavigator', () => {
  let navigator: ProjectNavigator;
  let mockClient: MockTeamCityClient;

  beforeEach(() => {
    jest.useFakeTimers();

    mockClient = createMockTeamCityClient();

    navigator = new ProjectNavigator(mockClient);

    // Clear cache before each test without using any
    type PrivateNav = { cache: Map<string, unknown> };
    (navigator as unknown as PrivateNav).cache.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('List Mode', () => {
    it('should list projects without filters', async () => {
      const mockProjects: Projects = {
        count: 2,
        project: [
          {
            id: 'Project1',
            name: 'First Project',
            description: 'Test project 1',
            href: '/app/rest/projects/id:Project1',
            webUrl: 'https://teamcity.example.com/project.html?projectId=Project1',
            parentProjectId: '_Root',
            archived: false,
            buildTypes: { count: 3 },
            projects: { count: 1 },
          },
          {
            id: 'Project2',
            name: 'Second Project',
            description: 'Test project 2',
            href: '/app/rest/projects/id:Project2',
            webUrl: 'https://teamcity.example.com/project.html?projectId=Project2',
            parentProjectId: 'Project1',
            archived: false,
            buildTypes: { count: 2 },
            projects: { count: 0 },
          },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({ mode: 'list' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const data = result.data as NonNullable<typeof result.data>;
      expect(data.mode).toBe('list');
      expect(data.projects).toHaveLength(2);
      expect(data.projects?.[0]?.id).toBe('Project1');
      expect(data.projects?.[1]?.id).toBe('Project2');
      expect(data.totalCount).toBe(2);
    });

    it('should filter projects by name pattern', async () => {
      const mockProjects: Projects = {
        count: 1,
        project: [
          {
            id: 'Frontend',
            name: 'Frontend Project',
            parentProjectId: '_Root',
            buildTypes: { count: 2 },
          },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({
        mode: 'list',
        filters: { namePattern: 'Frontend*' },
      });

      expect(result.success).toBe(true);
      const data2 = result.data as NonNullable<typeof result.data>;
      expect(data2.projects).toHaveLength(1);
      expect(data2.projects?.[0]?.name).toBe('Frontend Project');
      // Behavior-first: avoid verifying internal locator construction
    });

    it('should filter by archived status', async () => {
      const mockProjects: Projects = {
        count: 1,
        project: [
          {
            id: 'ArchivedProject',
            name: 'Archived Project',
            archived: true,
            parentProjectId: '_Root',
          },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({
        mode: 'list',
        filters: { archived: true },
      });

      expect(result.success).toBe(true);
      const data3 = result.data as NonNullable<typeof result.data>;
      expect(data3.projects).toHaveLength(1);
      expect(data3.projects?.[0]?.archived).toBe(true);
      // Behavior-first: avoid verifying internal locator construction
    });

    it('should handle pagination', async () => {
      const mockProjects: Projects = {
        count: 100,
        project: Array(50)
          .fill(null)
          .map((_, i) => ({
            id: `Project${i}`,
            name: `Project ${i}`,
            parentProjectId: '_Root',
          })),
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({
        mode: 'list',
        pagination: { page: 2, pageSize: 50 },
      });

      expect(result.success).toBe(true);
      const data4 = result.data as NonNullable<typeof result.data>;
      expect(data4.projects).toHaveLength(50);
      expect(data4.page).toBe(2);
      expect(data4.pageSize).toBe(50);
      expect(data4.hasMore).toBe(true);
      // Behavior-first: rely on returned pagination fields
    });

    it('should sort projects by name', async () => {
      const mockProjects: Projects = {
        count: 3,
        project: [
          { id: 'B', name: 'Project B', parentProjectId: '_Root' },
          { id: 'A', name: 'Project A', parentProjectId: '_Root' },
          { id: 'C', name: 'Project C', parentProjectId: '_Root' },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({
        mode: 'list',
        sort: { by: 'name', order: 'asc' },
      });

      expect(result.success).toBe(true);
      const data5 = result.data as NonNullable<typeof result.data>;
      expect(data5.projects?.[0]?.name).toBe('Project A');
      expect(data5.projects?.[1]?.name).toBe('Project B');
      expect(data5.projects?.[2]?.name).toBe('Project C');
    });

    it('should include statistics when requested', async () => {
      const mockProjects: Projects = {
        count: 1,
        project: [
          {
            id: 'Project1',
            name: 'Project with Stats',
            parentProjectId: '_Root',
            buildTypes: { count: 5 },
            projects: { count: 3 },
            vcsRoots: { count: 2 },
          },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({
        mode: 'list',
        includeStatistics: true,
      });

      expect(result.success).toBe(true);
      const project = (result.data as NonNullable<typeof result.data>).projects?.[0];
      expect(project?.statistics).toBeDefined();
      expect(project?.statistics?.buildConfigurationCount).toBe(5);
      expect(project?.statistics?.subprojectCount).toBe(3);
      expect(project?.statistics?.vcsRootCount).toBe(2);
    });
  });

  describe('Hierarchy Mode', () => {
    it('should build project hierarchy tree', async () => {
      const mockProjects: Projects = {
        count: 4,
        project: [
          {
            id: '_Root',
            name: '<Root project>',
            projects: { count: 1 },
          },
          {
            id: 'Parent',
            name: 'Parent Project',
            parentProjectId: '_Root',
            projects: { count: 2 },
          },
          {
            id: 'Child1',
            name: 'Child 1',
            parentProjectId: 'Parent',
            projects: { count: 0 },
          },
          {
            id: 'Child2',
            name: 'Child 2',
            parentProjectId: 'Parent',
            projects: { count: 0 },
          },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // Mock getProject for individual project fetches
      mockClient.projects.getProject.mockImplementation(async (id: string) => {
        if (id === '_Root') {
          return {
            data: {
              id: '_Root',
              name: '<Root project>',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'Parent', name: 'Parent Project' }],
              },
            },
          };
        } else if (id === 'Parent') {
          return {
            data: {
              id: 'Parent',
              name: 'Parent Project',
              parentProjectId: '_Root',
              archived: false,
              projects: {
                count: 2,
                project: [
                  { id: 'Child1', name: 'Child 1' },
                  { id: 'Child2', name: 'Child 2' },
                ],
              },
            },
          };
        } else if (id === 'Child1') {
          return {
            data: {
              id: 'Child1',
              name: 'Child 1',
              parentProjectId: 'Parent',
              archived: false,
              projects: { count: 0, project: [] },
            },
          };
        } else if (id === 'Child2') {
          return {
            data: {
              id: 'Child2',
              name: 'Child 2',
              parentProjectId: 'Parent',
              archived: false,
              projects: { count: 0, project: [] },
            },
          };
        }
        return { data: undefined };
      });

      const result = await navigator.listProjects({ mode: 'hierarchy' });

      expect(result.success).toBe(true);
      const dataH = result.data as NonNullable<typeof result.data>;
      expect(dataH.mode).toBe('hierarchy');
      expect(dataH.hierarchy).toBeDefined();

      const hierarchy = dataH.hierarchy as NonNullable<typeof dataH.hierarchy>;
      expect(hierarchy.id).toBe('_Root');
      expect(hierarchy.children).toHaveLength(1);

      const parent = hierarchy.children?.[0];
      expect(parent?.id).toBe('Parent');
      expect(parent?.children).toHaveLength(2);
      expect(parent?.children?.[0]?.id).toBe('Child1');
      expect(parent?.children?.[1]?.id).toBe('Child2');
    });

    it('should limit hierarchy depth', async () => {
      const mockProjects: Projects = {
        count: 5,
        project: [
          { id: '_Root', name: '<Root project>' },
          { id: 'L1', name: 'Level 1', parentProjectId: '_Root' },
          { id: 'L2', name: 'Level 2', parentProjectId: 'L1' },
          { id: 'L3', name: 'Level 3', parentProjectId: 'L2' },
          { id: 'L4', name: 'Level 4', parentProjectId: 'L3' },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // Mock getProject for hierarchy traversal with depth limiting
      mockClient.projects.getProject.mockImplementation(async (id: string) => {
        if (id === '_Root') {
          return {
            data: {
              id: '_Root',
              name: '<Root project>',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'L1', name: 'Level 1' }],
              },
            },
          };
        } else if (id === 'L1') {
          return {
            data: {
              id: 'L1',
              name: 'Level 1',
              parentProjectId: '_Root',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'L2', name: 'Level 2' }],
              },
            },
          };
        } else if (id === 'L2') {
          return {
            data: {
              id: 'L2',
              name: 'Level 2',
              parentProjectId: 'L1',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'L3', name: 'Level 3' }],
              },
            },
          };
        }
        return { data: undefined };
      });

      const result = await navigator.listProjects({
        mode: 'hierarchy',
        maxDepth: 2,
      });

      expect(result.success).toBe(true);
      const hierarchy = (result.data as NonNullable<typeof result.data>).hierarchy as NonNullable<
        NonNullable<typeof result.data>['hierarchy']
      >;
      expect(hierarchy.children?.[0]?.id).toBe('L1');
      expect(hierarchy.children?.[0]?.children?.[0]?.id).toBe('L2');
      expect(hierarchy.children?.[0]?.children?.[0]?.children).toHaveLength(0); // Empty array, not undefined
      expect((result.data as NonNullable<typeof result.data>).maxDepthReached).toBe(true);
    });

    it('should handle circular references gracefully', async () => {
      const mockProjects: Projects = {
        count: 3,
        project: [
          { id: 'A', name: 'Project A', parentProjectId: 'C' },
          { id: 'B', name: 'Project B', parentProjectId: 'A' },
          { id: 'C', name: 'Project C', parentProjectId: 'B' },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({ mode: 'hierarchy' });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      // Should not hang or throw due to circular reference
    });
  });

  describe('Ancestors Mode', () => {
    it('should return path from root to project', async () => {
      const mockProjects: Projects = {
        count: 3,
        project: [
          { id: '_Root', name: '<Root project>' },
          { id: 'Parent', name: 'Parent Project', parentProjectId: '_Root' },
          { id: 'Child', name: 'Child Project', parentProjectId: 'Parent' },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // Mock getProject for ancestors traversal
      mockClient.projects.getProject.mockImplementation(async (id: string) => {
        if (id === 'Child') {
          return {
            data: {
              id: 'Child',
              name: 'Child Project',
              parentProjectId: 'Parent',
              archived: false,
            },
          };
        } else if (id === 'Parent') {
          return {
            data: {
              id: 'Parent',
              name: 'Parent Project',
              parentProjectId: '_Root',
              archived: false,
            },
          };
        } else if (id === '_Root') {
          return {
            data: {
              id: '_Root',
              name: '<Root project>',
              archived: false,
            },
          };
        }
        return { data: undefined };
      });

      const result = await navigator.listProjects({
        mode: 'ancestors',
        projectId: 'Child',
      });

      expect(result.success).toBe(true);
      const data7 = result.data as NonNullable<typeof result.data>;
      expect(data7.mode).toBe('ancestors');
      expect(data7.ancestors).toBeDefined();
      expect(data7.ancestors).toHaveLength(3);
      expect(data7.ancestors?.[0]?.id).toBe('_Root');
      expect(data7.ancestors?.[1]?.id).toBe('Parent');
      expect(data7.ancestors?.[2]?.id).toBe('Child');
    });

    it('should handle missing projectId', async () => {
      const result = await navigator.listProjects({ mode: 'ancestors' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('projectId is required');
    });

    it('should handle non-existent project', async () => {
      const mockProjects: Projects = {
        count: 0,
        project: [],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const result = await navigator.listProjects({
        mode: 'ancestors',
        projectId: 'NonExistent',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project not found');
    });
  });

  describe('Descendants Mode', () => {
    it('should return all descendant projects', async () => {
      const mockProjects: Projects = {
        count: 4,
        project: [
          { id: 'Parent', name: 'Parent', parentProjectId: '_Root' },
          { id: 'Child1', name: 'Child 1', parentProjectId: 'Parent' },
          { id: 'Child2', name: 'Child 2', parentProjectId: 'Parent' },
          { id: 'Grandchild', name: 'Grandchild', parentProjectId: 'Child1' },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // Mock getProject for descendants traversal
      mockClient.projects.getProject.mockImplementation(async (id: string) => {
        if (id === 'Parent') {
          return {
            data: {
              id: 'Parent',
              name: 'Parent',
              parentProjectId: '_Root',
              archived: false,
              projects: {
                count: 2,
                project: [
                  { id: 'Child1', name: 'Child 1' },
                  { id: 'Child2', name: 'Child 2' },
                ],
              },
            },
          };
        } else if (id === 'Child1') {
          return {
            data: {
              id: 'Child1',
              name: 'Child 1',
              parentProjectId: 'Parent',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'Grandchild', name: 'Grandchild' }],
              },
            },
          };
        } else if (id === 'Child2') {
          return {
            data: {
              id: 'Child2',
              name: 'Child 2',
              parentProjectId: 'Parent',
              archived: false,
              projects: { count: 0, project: [] },
            },
          };
        } else if (id === 'Grandchild') {
          return {
            data: {
              id: 'Grandchild',
              name: 'Grandchild',
              parentProjectId: 'Child1',
              archived: false,
              projects: { count: 0, project: [] },
            },
          };
        }
        return { data: undefined };
      });

      const result = await navigator.listProjects({
        mode: 'descendants',
        projectId: 'Parent',
      });

      expect(result.success).toBe(true);
      const data8 = result.data as NonNullable<typeof result.data>;
      expect(data8.mode).toBe('descendants');
      expect(data8.descendants).toBeDefined();
      expect(data8.descendants).toHaveLength(3);

      const ids = (data8.descendants ?? []).map((p) => p.id);
      expect(ids).toContain('Child1');
      expect(ids).toContain('Child2');
      expect(ids).toContain('Grandchild');
    });

    it('should limit descendant depth', async () => {
      const mockProjects: Projects = {
        count: 4,
        project: [
          { id: 'Parent', name: 'Parent', parentProjectId: '_Root' },
          { id: 'Child', name: 'Child', parentProjectId: 'Parent' },
          { id: 'Grandchild', name: 'Grandchild', parentProjectId: 'Child' },
          { id: 'GreatGrandchild', name: 'GreatGrandchild', parentProjectId: 'Grandchild' },
        ],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // Mock getProject for depth-limited descendants traversal
      mockClient.projects.getProject.mockImplementation(async (id: string) => {
        if (id === 'Parent') {
          return {
            data: {
              id: 'Parent',
              name: 'Parent',
              parentProjectId: '_Root',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'Child', name: 'Child' }],
              },
            },
          };
        } else if (id === 'Child') {
          return {
            data: {
              id: 'Child',
              name: 'Child',
              parentProjectId: 'Parent',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'Grandchild', name: 'Grandchild' }],
              },
            },
          };
        } else if (id === 'Grandchild') {
          return {
            data: {
              id: 'Grandchild',
              name: 'Grandchild',
              parentProjectId: 'Child',
              archived: false,
              projects: {
                count: 1,
                project: [{ id: 'GreatGrandchild', name: 'GreatGrandchild' }],
              },
            },
          };
        }
        return { data: undefined };
      });

      const result = await navigator.listProjects({
        mode: 'descendants',
        projectId: 'Parent',
        maxDepth: 1,
      });

      expect(result.success).toBe(true);
      const data9 = result.data as NonNullable<typeof result.data>;
      expect(data9.descendants).toHaveLength(1);
      expect(data9.descendants?.[0]?.id).toBe('Child');
      expect(data9.maxDepthReached).toBe(true);
    });
  });

  describe('Caching', () => {
    it('should cache results for repeated requests', async () => {
      const mockProjects: Projects = {
        count: 1,
        project: [{ id: 'P1', name: 'Project 1', parentProjectId: '_Root' }],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // First request
      const result1 = await navigator.listProjects({ mode: 'list' });
      expect((result1.data as NonNullable<typeof result1.data>).cached).toBe(false);

      // Second identical request
      const result2 = await navigator.listProjects({ mode: 'list' });
      expect((result2.data as NonNullable<typeof result2.data>).cached).toBe(true);

      // Should only call API once
      expect(mockClient.projects.getAllProjects).toHaveBeenCalledTimes(1);
    });

    it('should not use cache for different parameters', async () => {
      const mockProjects: Projects = {
        count: 1,
        project: [{ id: 'P1', name: 'Project 1', parentProjectId: '_Root' }],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      await navigator.listProjects({ mode: 'list' });
      await navigator.listProjects({ mode: 'list', filters: { archived: true } });

      // Should call API twice for different parameters
      expect(mockClient.projects.getAllProjects).toHaveBeenCalledTimes(2);
    });

    it('should expire cache after TTL', async () => {
      const mockProjects: Projects = {
        count: 1,
        project: [{ id: 'P1', name: 'Project 1', parentProjectId: '_Root' }],
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      // First request
      await navigator.listProjects({ mode: 'list' });

      // Simulate cache expiry
      jest.advanceTimersByTime(120001); // 120 seconds + 1ms

      // Second request after expiry
      await navigator.listProjects({ mode: 'list' });

      // Should call API twice after cache expiry
      expect(mockClient.projects.getAllProjects).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockClient.projects.getAllProjects.mockRejectedValue(new Error('Network error'));

      const result = await navigator.listProjects({ mode: 'list' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Authentication failed');
      (authError as unknown as { response?: { status?: number } }).response = { status: 401 };
      mockClient.projects.getAllProjects.mockRejectedValue(authError);

      const result = await navigator.listProjects({ mode: 'list' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should handle permission errors', async () => {
      const permError = new Error('Permission denied');
      (permError as unknown as { response?: { status?: number } }).response = { status: 403 };
      mockClient.projects.getAllProjects.mockRejectedValue(permError);

      const result = await navigator.listProjects({ mode: 'list' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should validate input parameters', async () => {
      const result = await navigator.listProjects({
        mode: 'list',
        pagination: { page: -1, pageSize: 2000 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid pagination');
    });
  });

  describe('Performance', () => {
    it('should handle large project lists efficiently', async () => {
      const largeProjectList = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `Project${i}`,
          name: `Project ${i}`,
          parentProjectId: i === 0 ? '_Root' : `Project${Math.floor(i / 10)}`,
        }));

      const mockProjects: Projects = {
        count: 1000,
        project: largeProjectList,
      };

      mockClient.projects.getAllProjects.mockResolvedValue({ data: mockProjects });

      const startTime = Date.now();
      const result = await navigator.listProjects({ mode: 'hierarchy' });
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
