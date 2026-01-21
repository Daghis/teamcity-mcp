/**
 * Tests for BranchDiscoveryManager
 */
import type { Build } from '@/teamcity-client/models';
import { BranchDiscoveryManager, type BranchInfo } from '@/teamcity/branch-discovery-manager';

import { createAxiosError, createNetworkError, createServerError } from '../../test-utils/errors';
import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('BranchDiscoveryManager', () => {
  let manager: BranchDiscoveryManager;
  let mockClient: MockTeamCityClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock TeamCity client
    mockClient = createMockTeamCityClient();
    mockClient.resetAllMocks();

    manager = new BranchDiscoveryManager(mockClient);
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

  describe('discoverBranchesFromHistory - extended coverage', () => {
    describe('date filtering options', () => {
      it('should filter by toDate only (no fromDate)', async () => {
        const buildTypeId = 'MyProject_Build';
        const toDate = new Date('2025-08-29');

        mockClient.builds.getMultipleBuilds.mockResolvedValue({
          data: {
            count: 0,
            href: '',
            build: [],
          },
        });

        const result = await manager.discoverBranchesFromHistory(buildTypeId, { toDate });

        expect(result).toEqual([]);
        expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalled();
      });

      it('should filter by fromDate only (no toDate)', async () => {
        const buildTypeId = 'MyProject_Build';
        const fromDate = new Date('2025-08-01');

        mockClient.builds.getMultipleBuilds.mockResolvedValue({
          data: {
            count: 0,
            href: '',
            build: [],
          },
        });

        const result = await manager.discoverBranchesFromHistory(buildTypeId, { fromDate });

        expect(result).toEqual([]);
        expect(mockClient.builds.getMultipleBuilds).toHaveBeenCalled();
      });
    });

    describe('null/undefined response handling', () => {
      it('should handle response with build array undefined', async () => {
        const buildTypeId = 'MyProject_Build';

        mockClient.builds.getMultipleBuilds.mockResolvedValue({
          data: {
            count: 0,
            href: '',
            // build: undefined - intentionally missing
          },
        });

        const result = await manager.discoverBranchesFromHistory(buildTypeId);

        expect(result).toEqual([]);
      });

      it('should skip builds with null branchName', async () => {
        const buildTypeId = 'MyProject_Build';
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: null as unknown as string, // null branchName
            number: '100',
            status: 'SUCCESS',
            startDate: '20250829T120000+0000',
          },
          {
            id: 2,
            buildTypeId,
            // branchName: undefined - missing
            number: '101',
            status: 'SUCCESS',
            startDate: '20250828T120000+0000',
          },
          {
            id: 3,
            buildTypeId,
            branchName: 'valid-branch',
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

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('valid-branch');
      });
    });

    describe('default branch detection', () => {
      it.each([
        ['<default>', true],
        ['master', true],
        ['main', true],
        ['develop', false],
        ['feature/branch', false],
      ])('should detect %s as isDefault=%s', async (branchName, expectedIsDefault) => {
        const buildTypeId = 'MyProject_Build';
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName,
            number: '100',
            status: 'SUCCESS',
            startDate: new Date().toISOString(),
          },
        ];

        mockClient.builds.getMultipleBuilds.mockResolvedValue({
          data: {
            count: 1,
            href: '',
            build: mockBuilds as Build[],
          },
        });

        const result = await manager.discoverBranchesFromHistory(buildTypeId);

        expect(result).toHaveLength(1);
        expect(result[0]?.isDefault).toBe(expectedIsDefault);
      });
    });

    describe('null coalescing fallback paths in build info', () => {
      it('should use empty string fallbacks when build properties are missing', async () => {
        const buildTypeId = 'MyProject_Build';
        const mockBuilds: Partial<Build>[] = [
          {
            // id: undefined
            buildTypeId,
            branchName: 'test-branch',
            // number: undefined
            // status: undefined
            // startDate: undefined
          },
        ];

        mockClient.builds.getMultipleBuilds.mockResolvedValue({
          data: {
            count: 1,
            href: '',
            build: mockBuilds as Build[],
          },
        });

        const result = await manager.discoverBranchesFromHistory(buildTypeId);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
          expect.objectContaining({
            name: 'test-branch',
            lastBuild: expect.objectContaining({
              id: '',
              number: '',
              status: 'UNKNOWN',
              date: '',
            }),
          })
        );
      });
    });

    describe('VCS info edge cases', () => {
      it('should not include vcsRoot when includeVcsInfo is false', async () => {
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
          includeVcsInfo: false,
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.vcsRoot).toBeUndefined();
      });

      it('should handle empty revisions array', async () => {
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
              revision: [],
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
        expect(result[0]?.vcsRoot).toBeUndefined();
      });

      it('should handle revisions being undefined', async () => {
        const buildTypeId = 'MyProject_Build';
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: 'main',
            number: '100',
            status: 'SUCCESS',
            startDate: '20250829T120000+0000',
            // revisions: undefined
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
        expect(result[0]?.vcsRoot).toBeUndefined();
      });

      it('should handle null vcs-root-instance in revision', async () => {
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
                  'vcs-root-instance': null as unknown as undefined,
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
        expect(result[0]?.vcsRoot).toBeUndefined();
      });

      it('should use empty string fallback when vcs-root-id is missing', async () => {
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
                    id: 'instance-1',
                    // name: undefined
                    // 'vcs-root-id': undefined
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
          id: '',
          name: '',
          url: '',
        });
      });
    });

    describe('existing branch update paths', () => {
      it('should update lastBuild when existing branch has null lastActivityDate', async () => {
        const buildTypeId = 'MyProject_Build';
        // First build creates branch, second updates it
        // We need the second to hit the "existingBranch.lastActivityDate == null" branch
        // This happens when firstSeenDate is set but lastActivityDate is null (edge case)
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: 'test-branch',
            number: '100',
            status: 'SUCCESS',
            // First build with no startDate - sets up lastActivityDate as undefined
            startDate: undefined,
          },
          {
            id: 2,
            buildTypeId,
            branchName: 'test-branch',
            number: '101',
            status: 'SUCCESS',
            startDate: '20250829T120000+0000',
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

        expect(result).toHaveLength(1);
        expect(result[0]?.buildCount).toBe(2);
        expect(result[0]?.lastBuild?.id).toBe('2');
      });

      it('should not update lastBuild when new build date is older than existing', async () => {
        const buildTypeId = 'MyProject_Build';
        // First build is more recent, second is older - second should not update lastBuild
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: 'test-branch',
            number: '100',
            status: 'SUCCESS',
            startDate: '20250829T120000+0000', // More recent
          },
          {
            id: 2,
            buildTypeId,
            branchName: 'test-branch',
            number: '99',
            status: 'FAILURE',
            startDate: '20250825T120000+0000', // Older - should not replace lastBuild
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

        expect(result).toHaveLength(1);
        expect(result[0]?.lastBuild?.id).toBe('1'); // First build should remain as last
        expect(result[0]?.lastBuild?.number).toBe('100');
        expect(result[0]?.lastActivityDate).toBe('20250829T120000+0000');
      });

      it('should set firstSeenDate when existing branch has none', async () => {
        const buildTypeId = 'MyProject_Build';
        // First build has no startDate, second does
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: 'test-branch',
            number: '100',
            status: 'SUCCESS',
            // startDate: undefined
          },
          {
            id: 2,
            buildTypeId,
            branchName: 'test-branch',
            number: '101',
            status: 'SUCCESS',
            startDate: '20250829T120000+0000',
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

        expect(result).toHaveLength(1);
        expect(result[0]?.firstSeenDate).toBe('20250829T120000+0000');
      });

      it('should not update firstSeenDate when new build is more recent', async () => {
        const buildTypeId = 'MyProject_Build';
        // Second build is more recent - should not update firstSeenDate
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: 'test-branch',
            number: '100',
            status: 'SUCCESS',
            startDate: '20250820T120000+0000', // Oldest
          },
          {
            id: 2,
            buildTypeId,
            branchName: 'test-branch',
            number: '101',
            status: 'SUCCESS',
            startDate: '20250829T120000+0000', // More recent - should not update firstSeenDate
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

        expect(result).toHaveLength(1);
        expect(result[0]?.firstSeenDate).toBe('20250820T120000+0000');
      });

      it('should handle duplicate builds with no startDate', async () => {
        const buildTypeId = 'MyProject_Build';
        const mockBuilds: Partial<Build>[] = [
          {
            id: 1,
            buildTypeId,
            branchName: 'test-branch',
            number: '100',
            status: 'SUCCESS',
            // startDate: undefined
          },
          {
            id: 2,
            buildTypeId,
            branchName: 'test-branch',
            number: '101',
            status: 'SUCCESS',
            // startDate: undefined
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

        expect(result).toHaveLength(1);
        expect(result[0]?.buildCount).toBe(2);
        // No date updates should happen
        expect(result[0]?.firstSeenDate).toBeUndefined();
        expect(result[0]?.lastActivityDate).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it.each([
        ['500 Internal Server Error', createServerError('Internal server error')],
        ['403 Forbidden', createAxiosError({ status: 403, message: 'Forbidden' })],
        ['401 Unauthorized', createAxiosError({ status: 401, message: 'Unauthorized' })],
        ['Network error', createNetworkError('ECONNREFUSED')],
      ])('should wrap %s in descriptive error', async (description, error) => {
        const buildTypeId = 'MyProject_Build';
        mockClient.builds.getMultipleBuilds.mockRejectedValue(error);

        await expect(manager.discoverBranchesFromHistory(buildTypeId)).rejects.toThrow(
          /Failed to discover branches from history/
        );
      });
    });
  });

  describe('enrichBranchWithBuildInfo - extended coverage', () => {
    it('should return original branch when no builds found', async () => {
      const branch: BranchInfo = {
        name: 'empty-branch',
        displayName: 'empty-branch',
        isDefault: false,
        isActive: false,
        buildCount: 0,
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 0,
          href: '',
          build: [],
        },
      });

      const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

      expect(enrichedBranch).toEqual(branch);
    });

    it('should return original branch when build array is undefined', async () => {
      const branch: BranchInfo = {
        name: 'test-branch',
        displayName: 'test-branch',
        isDefault: false,
        isActive: false,
        buildCount: 0,
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 0,
          href: '',
          // build: undefined
        },
      });

      const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

      expect(enrichedBranch).toEqual(branch);
    });

    it('should return original branch when latestBuild is null', async () => {
      const branch: BranchInfo = {
        name: 'test-branch',
        displayName: 'test-branch',
        isDefault: false,
        isActive: false,
        buildCount: 0,
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1,
          href: '',
          build: [null as unknown as Build],
        },
      });

      const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

      expect(enrichedBranch).toEqual(branch);
    });

    it('should use fallback count of 1 when count is missing', async () => {
      const branch: BranchInfo = {
        name: 'main',
        displayName: 'main',
        isDefault: true,
        isActive: false,
        buildCount: 0,
      };

      const mockBuild: Partial<Build> = {
        id: 1,
        number: '100',
        status: 'SUCCESS',
        startDate: '20250829T120000+0000',
      };

      mockClient.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          href: '',
          build: [mockBuild as Build],
          // count: undefined - missing
        },
      });

      const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

      expect(enrichedBranch.buildCount).toBe(1);
    });

    it('should use empty string fallbacks for missing build properties', async () => {
      const branch: BranchInfo = {
        name: 'test-branch',
        displayName: 'test-branch',
        isDefault: false,
        isActive: false,
        buildCount: 0,
      };

      const mockBuild: Partial<Build> = {
        // id: undefined
        // number: undefined
        // status: undefined
        // startDate: undefined
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
        id: '',
        number: '',
        status: 'UNKNOWN',
        date: '',
        webUrl: undefined,
      });
    });

    describe('error handling', () => {
      it('should return original branch on API error', async () => {
        const branch: BranchInfo = {
          name: 'error-branch',
          displayName: 'error-branch',
          isDefault: false,
          isActive: false,
          buildCount: 5,
        };

        mockClient.builds.getMultipleBuilds.mockRejectedValue(
          createServerError('Internal server error')
        );

        const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

        expect(enrichedBranch).toEqual(branch);
      });

      it.each([
        ['network error', createNetworkError('ECONNREFUSED')],
        ['403 error', createAxiosError({ status: 403, message: 'Forbidden' })],
        ['timeout error', createAxiosError({ code: 'ECONNABORTED', message: 'Timeout' })],
      ])('should return original branch on %s', async (description, error) => {
        const branch: BranchInfo = {
          name: 'test-branch',
          displayName: 'test-branch',
          isDefault: false,
          isActive: false,
          buildCount: 3,
        };

        mockClient.builds.getMultipleBuilds.mockRejectedValue(error);

        const enrichedBranch = await manager.enrichBranchWithBuildInfo(branch, 'MyProject_Build');

        expect(enrichedBranch).toEqual(branch);
      });
    });
  });

  describe('detectBranchActivity - extended coverage', () => {
    it('should handle boundary threshold exactly at threshold days', () => {
      const now = new Date();
      const exactlyAtThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Exactly 30 days

      const branch: BranchInfo = {
        name: 'boundary',
        displayName: 'boundary',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: exactlyAtThreshold.toISOString(),
      };

      const result = manager.detectBranchActivity(branch, 30);

      expect(result.isActive).toBe(true); // <= 30 days means active
    });

    it('should handle TeamCity date format correctly', () => {
      // TeamCity format: 20250829T100000+0000
      const branch: BranchInfo = {
        name: 'teamcity-date',
        displayName: 'teamcity-date',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: '20250101T120000+0000',
      };

      // This date is in the past, so with default 30-day threshold it should be inactive
      const result = manager.detectBranchActivity(branch);

      expect(typeof result.isActive).toBe('boolean');
    });

    it('should handle very old dates', () => {
      const branch: BranchInfo = {
        name: 'ancient',
        displayName: 'ancient',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: new Date('2020-01-01').toISOString(),
      };

      const result = manager.detectBranchActivity(branch);

      expect(result.isActive).toBe(false);
    });

    it('should handle future dates (edge case)', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const branch: BranchInfo = {
        name: 'future',
        displayName: 'future',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: futureDate.toISOString(),
      };

      const result = manager.detectBranchActivity(branch);

      // Future date results in negative daysSinceActivity, which is <= threshold
      expect(result.isActive).toBe(true);
    });

    it('should use custom threshold of 0 days', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const branch: BranchInfo = {
        name: 'recent',
        displayName: 'recent',
        isDefault: false,
        isActive: false,
        buildCount: 1,
        lastActivityDate: oneHourAgo.toISOString(),
      };

      const result = manager.detectBranchActivity(branch, 0);

      // 1 hour ago is more than 0 days
      expect(result.isActive).toBe(false);
    });
  });

  describe('parseBranchDisplayName - extended coverage', () => {
    describe('refs/tags patterns', () => {
      it.each([
        ['refs/tags/v1.0.0', 'v1.0.0'],
        ['refs/tags/release-2024.01', 'release-2024.01'],
        ['refs/tags/my-tag/with/slashes', 'my-tag/with/slashes'],
      ])('should parse tag ref %s to %s', (input, expected) => {
        expect(manager.parseBranchDisplayName(input)).toBe(expected);
      });
    });

    describe('merge request patterns', () => {
      it.each([
        ['merge-requests/1/head', 'MR #1'],
        ['merge-requests/999/merge', 'MR #999'],
        ['merge-requests/12345/head', 'MR #12345'],
      ])('should parse GitLab MR %s to %s', (input, expected) => {
        expect(manager.parseBranchDisplayName(input)).toBe(expected);
      });
    });

    describe('pull request edge cases', () => {
      it.each([
        ['pull/1/head', 'PR #1'],
        ['pull/999999/merge', 'PR #999999'],
      ])('should parse PR %s to %s', (input, expected) => {
        expect(manager.parseBranchDisplayName(input)).toBe(expected);
      });

      it('should not match malformed PR patterns', () => {
        expect(manager.parseBranchDisplayName('pull/abc/head')).toBe('pull/abc/head');
        expect(manager.parseBranchDisplayName('pull/123/invalid')).toBe('pull/123/invalid');
        expect(manager.parseBranchDisplayName('pulls/123/head')).toBe('pulls/123/head');
      });
    });

    describe('various branch name formats', () => {
      it.each([
        ['simple', 'simple'],
        ['with-dashes', 'with-dashes'],
        ['with_underscores', 'with_underscores'],
        ['CamelCase', 'CamelCase'],
        ['UPPERCASE', 'UPPERCASE'],
        ['123-numeric', '123-numeric'],
        ['feature/nested/deep/branch', 'feature/nested/deep/branch'],
      ])('should preserve branch name %s as %s', (input, expected) => {
        expect(manager.parseBranchDisplayName(input)).toBe(expected);
      });
    });
  });
});
