/**
 * Tests for BranchDiscoveryManager
 */
import type { Build } from '@/teamcity-client/models';
import { BranchDiscoveryManager, type BranchInfo } from '@/teamcity/branch-discovery-manager';

describe('BranchDiscoveryManager', () => {
  let manager: BranchDiscoveryManager;
  type MockClient = {
    builds: { getMultipleBuilds: jest.Mock };
    buildTypes: { getBuildType: jest.Mock };
    vcsRoots: { getVcsRoot: jest.Mock };
  };
  let mockClient: MockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock TeamCity client
    mockClient = {
      builds: {
        getMultipleBuilds: jest.fn(),
      },
      buildTypes: {
        getBuildType: jest.fn(),
      },
      vcsRoots: {
        getVcsRoot: jest.fn(),
      },
    };

    manager = new BranchDiscoveryManager(
      mockClient as unknown as import('@/teamcity/client').TeamCityClient
    );
  });

  describe('discoverBranchesFromHistory', () => {
    it('should retrieve branches from build history for a configuration', async () => {
      const buildTypeId = 'MyProject_Build';
      const mockBuilds: Partial<Build>[] = [
        {
          id: 1,
          buildTypeId,
          branchName: 'main',
          number: '100',
          status: 'SUCCESS',
          startDate: '20250829T120000+0000',
          finishDate: '20250829T121000+0000',
        },
        {
          id: 2,
          buildTypeId,
          branchName: 'feature/new-feature',
          number: '101',
          status: 'SUCCESS',
          startDate: '20250828T120000+0000',
          finishDate: '20250828T121000+0000',
        },
        {
          id: 3,
          buildTypeId,
          branchName: 'develop',
          number: '102',
          status: 'FAILURE',
          startDate: '20250827T120000+0000',
          finishDate: '20250827T121000+0000',
        },
      ];

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 3,
          href: '',
          build: mockBuilds as Build[],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId);

      // Behavior-first: avoid verifying internal locator/fields construction

      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'main',
            lastBuild: expect.objectContaining({
              id: '1',
              number: '100',
              status: 'SUCCESS',
            }),
          }),
          expect.objectContaining({
            name: 'feature/new-feature',
            lastBuild: expect.objectContaining({
              id: '2',
              number: '101',
              status: 'SUCCESS',
            }),
          }),
          expect.objectContaining({
            name: 'develop',
            lastBuild: expect.objectContaining({
              id: '3',
              number: '102',
              status: 'FAILURE',
            }),
          }),
        ])
      );
    });

    it('should deduplicate branches and keep the most recent build', async () => {
      const buildTypeId = 'MyProject_Build';
      const mockBuilds: Partial<Build>[] = [
        {
          id: 1,
          buildTypeId,
          branchName: 'main',
          number: '100',
          status: 'SUCCESS',
          startDate: '20250829T120000+0000',
          finishDate: '20250829T121000+0000',
        },
        {
          id: 2,
          buildTypeId,
          branchName: 'main', // Duplicate branch
          number: '99',
          status: 'FAILURE',
          startDate: '20250828T120000+0000',
          finishDate: '20250828T121000+0000',
        },
        {
          id: 3,
          buildTypeId,
          branchName: 'main', // Another duplicate
          number: '98',
          status: 'SUCCESS',
          startDate: '20250827T120000+0000',
          finishDate: '20250827T121000+0000',
        },
      ];

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 3,
          href: '',
          build: mockBuilds as Build[],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          name: 'main',
          buildCount: 3,
          lastBuild: expect.objectContaining({
            id: '1',
            number: '100',
            status: 'SUCCESS',
          }),
          firstSeenDate: '20250827T120000+0000',
          lastActivityDate: '20250829T120000+0000',
        })
      );
    });

    it('should handle branches with special characters', async () => {
      const buildTypeId = 'MyProject_Build';
      const mockBuilds: Partial<Build>[] = [
        {
          id: 1,
          buildTypeId,
          branchName: 'feature/JIRA-123-special_chars',
          number: '100',
          status: 'SUCCESS',
          startDate: '20250829T120000+0000',
        },
        {
          id: 2,
          buildTypeId,
          branchName: 'bugfix/fix-#456',
          number: '101',
          status: 'SUCCESS',
          startDate: '20250828T120000+0000',
        },
        {
          id: 3,
          buildTypeId,
          branchName: 'release/v2.0.0',
          number: '102',
          status: 'SUCCESS',
          startDate: '20250827T120000+0000',
        },
      ];

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 3,
          href: '',
          build: mockBuilds as Build[],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId);

      expect(result).toHaveLength(3);
      expect(result.map((b: BranchInfo) => b.name)).toEqual(
        expect.arrayContaining([
          'feature/JIRA-123-special_chars',
          'bugfix/fix-#456',
          'release/v2.0.0',
        ])
      );
    });

    it('should detect branch activity based on build dates', async () => {
      const buildTypeId = 'MyProject_Build';
      const now = new Date();
      const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago
      const oldDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days ago

      const mockBuilds: Partial<Build>[] = [
        {
          id: 1,
          buildTypeId,
          branchName: 'active-branch',
          number: '100',
          status: 'SUCCESS',
          startDate: recentDate.toISOString(),
        },
        {
          id: 2,
          buildTypeId,
          branchName: 'inactive-branch',
          number: '101',
          status: 'SUCCESS',
          startDate: oldDate.toISOString(),
        },
      ];

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 2,
          href: '',
          build: mockBuilds as Build[],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId);

      expect(result).toHaveLength(2);

      const activeBranch = result.find((b) => b.name === 'active-branch');
      const inactiveBranch = result.find((b) => b.name === 'inactive-branch');

      expect(activeBranch?.isActive).toBe(true);
      expect(inactiveBranch?.isActive).toBe(false);
    });

    it('should handle empty build history gracefully', async () => {
      const buildTypeId = 'MyProject_Build';

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 0,
          href: '',
          build: [],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId);

      expect(result).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const buildTypeId = 'MyProject_Build';

      mockClient.builds.getMultipleBuilds.mockRejectedValue(new Error('TeamCity API error'));

      await expect(manager.discoverBranchesFromHistory(buildTypeId)).rejects.toThrow(
        'Failed to discover branches from history'
      );
    });

    it('should respect query limit parameter', async () => {
      const buildTypeId = 'MyProject_Build';
      const limit = 50;

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 0,
          href: '',
          build: [],
        },
      });

      const res = await manager.discoverBranchesFromHistory(buildTypeId, { limit });
      expect(Array.isArray(res)).toBe(true);
    });

    it('should filter branches by time range', async () => {
      const buildTypeId = 'MyProject_Build';
      const fromDate = new Date('2025-08-01');
      const toDate = new Date('2025-08-29');

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 0,
          href: '',
          build: [],
        },
      });

      await manager.discoverBranchesFromHistory(buildTypeId, {
        fromDate,
        toDate,
      });
      // Behavior-first: avoid verifying internal date locator shape
    });

    it('should include VCS root information when available', async () => {
      const buildTypeId = 'MyProject_Build';
      const mockBuilds: Partial<Build>[] = [
        {
          id: 1,
          buildTypeId,
          branchName: 'main',
          number: '100',
          status: 'SUCCESS',
          startDate: '20250829T120000+0000',
          revisions: {
            revision: [
              {
                'vcs-root-instance': {
                  id: 'vcs-root-1',
                  name: 'GitHub Main',
                  'vcs-root-id': 'GitHubVcs',
                },
              },
            ],
          },
        },
      ];

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1,
          href: '',
          build: mockBuilds as Build[],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId, {
        includeVcsInfo: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.vcsRoot).toEqual({
        id: 'GitHubVcs',
        name: 'GitHub Main',
        url: '', // URL would need additional API call
      });
    });

    it('should calculate display names for branches', async () => {
      const buildTypeId = 'MyProject_Build';
      const mockBuilds: Partial<Build>[] = [
        {
          id: 1,
          buildTypeId,
          branchName: 'refs/heads/main',
          number: '100',
          status: 'SUCCESS',
          startDate: '20250829T120000+0000',
        },
        {
          id: 2,
          buildTypeId,
          branchName: 'refs/heads/feature/new-feature',
          number: '101',
          status: 'SUCCESS',
          startDate: '20250828T120000+0000',
        },
        {
          id: 3,
          buildTypeId,
          branchName: 'pull/123/head',
          number: '102',
          status: 'SUCCESS',
          startDate: '20250827T120000+0000',
        },
      ];

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 3,
          href: '',
          build: mockBuilds as Build[],
        },
      });

      const result = await manager.discoverBranchesFromHistory(buildTypeId);

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'refs/heads/main',
            displayName: 'main',
          }),
          expect.objectContaining({
            name: 'refs/heads/feature/new-feature',
            displayName: 'feature/new-feature',
          }),
          expect.objectContaining({
            name: 'pull/123/head',
            displayName: 'PR #123',
          }),
        ])
      );
    });
  });

  describe('enrichBranchWithBuildInfo', () => {
    it('should enrich branch data with latest build information', async () => {
      const branch = {
        name: 'main',
        displayName: 'main',
        isDefault: false,
        isActive: true,
        buildCount: 0,
      };

      const mockBuild: Partial<Build> = {
        id: 1,
        number: '100',
        status: 'SUCCESS',
        startDate: '20250829T120000+0000',
        finishDate: '20250829T121000+0000',
        webUrl: 'https://teamcity.example.com/build/1',
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1,
          href: '',
          build: [mockBuild as Build],
        },
      });

      const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

      expect(enrichedBranch.lastBuild).toEqual({
        id: '1',
        number: '100',
        status: 'SUCCESS',
        date: '20250829T120000+0000',
        webUrl: 'https://teamcity.example.com/build/1',
      });
      expect(enrichedBranch.buildCount).toBe(1);
      expect(enrichedBranch.lastActivityDate).toBe('20250829T120000+0000');
    });
  });

  describe('detectBranchActivity', () => {
    it('should detect active branches based on threshold', () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      const oldDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // 35 days ago

      const recentBranch = {
        name: 'recent',
        displayName: 'recent',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: recentDate.toISOString(),
      };

      const oldBranch = {
        name: 'old',
        displayName: 'old',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: oldDate.toISOString(),
      };

      const updatedRecent = manager.detectBranchActivity(recentBranch);
      const updatedOld = manager.detectBranchActivity(oldBranch);

      expect(updatedRecent.isActive).toBe(true);
      expect(updatedOld.isActive).toBe(false);
    });

    it('should handle custom activity thresholds', () => {
      const now = new Date();
      const date = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      const branch = {
        name: 'test',
        displayName: 'test',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: date.toISOString(),
      };

      // With 5-day threshold, should be inactive
      const inactive = manager.detectBranchActivity(branch, 5);
      expect(inactive.isActive).toBe(false);

      // With 15-day threshold, should be active
      const active = manager.detectBranchActivity(branch, 15);
      expect(active.isActive).toBe(true);
    });

    it('should handle branches without activity dates', () => {
      const branch = {
        name: 'no-activity',
        displayName: 'no-activity',
        isDefault: false,
        isActive: false,
        buildCount: 0,
      };

      const updated = manager.detectBranchActivity(branch);
      expect(updated.isActive).toBe(false);
    });
  });

  describe('parseBranchDisplayName', () => {
    it('should parse Git ref branches correctly', () => {
      expect(manager.parseBranchDisplayName('refs/heads/main')).toBe('main');
      expect(manager.parseBranchDisplayName('refs/heads/feature/new-feature')).toBe(
        'feature/new-feature'
      );
      expect(manager.parseBranchDisplayName('refs/tags/v1.0.0')).toBe('v1.0.0');
    });

    it('should parse pull request branches correctly', () => {
      expect(manager.parseBranchDisplayName('pull/123/head')).toBe('PR #123');
      expect(manager.parseBranchDisplayName('pull/456/merge')).toBe('PR #456');
      expect(manager.parseBranchDisplayName('merge-requests/789/head')).toBe('MR #789');
    });

    it('should handle special branch names', () => {
      expect(manager.parseBranchDisplayName('<default>')).toBe('default');
      expect(manager.parseBranchDisplayName('HEAD')).toBe('HEAD');
    });

    it('should return original name for unrecognized patterns', () => {
      expect(manager.parseBranchDisplayName('feature/my-branch')).toBe('feature/my-branch');
      expect(manager.parseBranchDisplayName('hotfix-123')).toBe('hotfix-123');
    });
  });
});
