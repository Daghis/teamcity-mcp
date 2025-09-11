import type { Logger } from 'winston';

import { BranchFilteringService, type BranchInfo } from '@/teamcity/branch-filtering-service';

import { createMockLogger } from '../../test-utils/mock-logger';

describe('BranchFilteringService', () => {
  let service: BranchFilteringService;
  let mockLogger: Logger;
  let testBranches: BranchInfo[];

  beforeEach(() => {
    mockLogger = createMockLogger();
    service = new BranchFilteringService(mockLogger);

    // Create test branches with various properties
    testBranches = [
      {
        name: 'refs/heads/main',
        displayName: 'main',
        isDefault: true,
        isActive: true,
        buildCount: 150,
        lastBuild: {
          id: '1001',
          number: '150',
          status: 'SUCCESS',
          date: new Date('2025-08-30T10:00:00Z'),
          webUrl: 'http://teamcity/build/1001',
        },
        firstSeenDate: new Date('2025-01-01T00:00:00Z'),
        lastActivityDate: new Date('2025-08-30T10:00:00Z'),
      },
      {
        name: 'refs/heads/feature/new-login',
        displayName: 'feature/new-login',
        isDefault: false,
        isActive: true,
        buildCount: 25,
        lastBuild: {
          id: '1002',
          number: '25',
          status: 'FAILURE',
          date: new Date('2025-08-29T15:00:00Z'),
          webUrl: 'http://teamcity/build/1002',
        },
        firstSeenDate: new Date('2025-08-15T00:00:00Z'),
        lastActivityDate: new Date('2025-08-29T15:00:00Z'),
      },
      {
        name: 'refs/heads/feature/dashboard',
        displayName: 'feature/dashboard',
        isDefault: false,
        isActive: false,
        buildCount: 10,
        lastBuild: {
          id: '1003',
          number: '10',
          status: 'SUCCESS',
          date: new Date('2025-07-15T12:00:00Z'),
          webUrl: 'http://teamcity/build/1003',
        },
        firstSeenDate: new Date('2025-07-01T00:00:00Z'),
        lastActivityDate: new Date('2025-07-15T12:00:00Z'),
      },
      {
        name: 'refs/heads/bugfix/memory-leak',
        displayName: 'bugfix/memory-leak',
        isDefault: false,
        isActive: true,
        buildCount: 5,
        lastBuild: {
          id: '1004',
          number: '5',
          status: 'SUCCESS',
          date: new Date('2025-08-28T09:00:00Z'),
          webUrl: 'http://teamcity/build/1004',
        },
        firstSeenDate: new Date('2025-08-25T00:00:00Z'),
        lastActivityDate: new Date('2025-08-28T09:00:00Z'),
      },
      {
        name: 'refs/heads/release/v2.0',
        displayName: 'release/v2.0',
        isDefault: false,
        isActive: true,
        buildCount: 50,
        lastBuild: {
          id: '1005',
          number: '50',
          status: 'SUCCESS',
          date: new Date('2025-08-27T14:00:00Z'),
          webUrl: 'http://teamcity/build/1005',
        },
        firstSeenDate: new Date('2025-06-01T00:00:00Z'),
        lastActivityDate: new Date('2025-08-27T14:00:00Z'),
      },
    ];
  });

  describe('filterBranches', () => {
    describe('pattern-based filtering', () => {
      it('should filter branches by exact name pattern', () => {
        const options = {
          namePattern: 'main',
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(1);
        expect(result[0]?.displayName).toBe('main');
      });

      it('should filter branches by wildcard pattern', () => {
        const options = {
          namePattern: 'feature/*',
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(2);
        expect(result.map((b) => b.displayName)).toEqual([
          'feature/new-login',
          'feature/dashboard',
        ]);
      });

      it('should filter branches by regex pattern', () => {
        const options = {
          namePattern: '/(feature|bugfix)/.+/',
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(3);
        expect(result.map((b) => b.displayName)).toContain('feature/new-login');
        expect(result.map((b) => b.displayName)).toContain('feature/dashboard');
        expect(result.map((b) => b.displayName)).toContain('bugfix/memory-leak');
      });

      it('should handle case-insensitive pattern matching', () => {
        const options = {
          namePattern: 'FEATURE/*',
          caseInsensitive: true,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(2);
      });
    });

    describe('activity-based filtering', () => {
      it('should filter only active branches', () => {
        const options = {
          onlyActive: true,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(4);
        expect(result.every((b) => b.isActive)).toBe(true);
      });

      it('should filter branches active since specific date', () => {
        const options = {
          activeSince: new Date('2025-08-28T00:00:00Z'),
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(3); // main, feature/new-login, bugfix/memory-leak
        expect(result.map((b) => b.displayName)).toContain('main');
        expect(result.map((b) => b.displayName)).toContain('feature/new-login');
        expect(result.map((b) => b.displayName)).toContain('bugfix/memory-leak');
      });

      it('should filter branches active within date range', () => {
        const options = {
          activeSince: new Date('2025-08-25T00:00:00Z'),
          activeBefore: new Date('2025-08-29T00:00:00Z'),
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(2); // release/v2.0, bugfix/memory-leak
      });

      it('should filter branches by minimum build count', () => {
        const options = {
          minBuildCount: 20,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(3); // main, feature/new-login, release/v2.0
        expect(result.every((b) => b.buildCount >= 20)).toBe(true);
      });
    });

    describe('status-based filtering', () => {
      it('should filter branches by last build status', () => {
        const options = {
          lastBuildStatus: 'SUCCESS' as const,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(4);
        expect(result.every((b) => b.lastBuild?.status === 'SUCCESS')).toBe(true);
      });

      it('should filter branches with failed builds', () => {
        const options = {
          lastBuildStatus: 'FAILURE' as const,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(1);
        expect(result[0]?.displayName).toBe('feature/new-login');
      });

      it('should filter default branches only', () => {
        const options = {
          onlyDefault: true,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(1);
        expect(result[0]?.isDefault).toBe(true);
      });
    });

    describe('combined filters', () => {
      it('should apply multiple filters together', () => {
        const options = {
          namePattern: 'feature/*',
          onlyActive: true,
          lastBuildStatus: 'SUCCESS' as const,
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(0); // feature/new-login is active but failed, feature/dashboard succeeded but inactive
      });

      it('should handle all filters simultaneously', () => {
        const options = {
          namePattern: '*',
          onlyActive: true,
          minBuildCount: 5,
          lastBuildStatus: 'SUCCESS' as const,
          activeSince: new Date('2025-08-01T00:00:00Z'),
        };

        const result = service.filterBranches(testBranches, options);

        expect(result).toHaveLength(3); // main, bugfix/memory-leak, release/v2.0
      });
    });
  });

  describe('sortBranches', () => {
    it('should sort branches by name ascending', () => {
      const sorted = service.sortBranches(testBranches, 'name', 'asc');

      expect(sorted[0]?.displayName).toBe('bugfix/memory-leak');
      expect(sorted[sorted.length - 1]?.displayName).toBe('release/v2.0');
    });

    it('should sort branches by name descending', () => {
      const sorted = service.sortBranches(testBranches, 'name', 'desc');

      expect(sorted[0]?.displayName).toBe('release/v2.0');
      expect(sorted[sorted.length - 1]?.displayName).toBe('bugfix/memory-leak');
    });

    it('should sort branches by activity date', () => {
      const sorted = service.sortBranches(testBranches, 'activity', 'desc');

      expect(sorted[0]?.displayName).toBe('main'); // Most recent: 2025-08-30
      expect(sorted[sorted.length - 1]?.displayName).toBe('feature/dashboard'); // Oldest: 2025-07-15
    });

    it('should sort branches by build count', () => {
      const sorted = service.sortBranches(testBranches, 'buildCount', 'desc');

      expect(sorted[0]?.displayName).toBe('main'); // 150 builds
      expect(sorted[1]?.displayName).toBe('release/v2.0'); // 50 builds
      expect(sorted[sorted.length - 1]?.displayName).toBe('bugfix/memory-leak'); // 5 builds
    });

    it('should put default branch first when sorting', () => {
      const sorted = service.sortBranches(testBranches, 'name', 'asc', true);

      expect(sorted[0]?.displayName).toBe('main'); // Default branch first
      expect(sorted[1]?.displayName).toBe('bugfix/memory-leak'); // Then alphabetical
    });
  });

  describe('paginateBranches', () => {
    it('should paginate branches with default page size', () => {
      const page1 = service.paginateBranches(testBranches, { page: 1 });

      expect(page1.branches).toHaveLength(5); // All branches fit in default page
      expect(page1.totalCount).toBe(5);
      expect(page1.totalPages).toBe(1);
      expect(page1.currentPage).toBe(1);
      expect(page1.hasMore).toBe(false);
    });

    it('should paginate branches with custom page size', () => {
      const page1 = service.paginateBranches(testBranches, { page: 1, pageSize: 2 });

      expect(page1.branches).toHaveLength(2);
      expect(page1.totalCount).toBe(5);
      expect(page1.totalPages).toBe(3);
      expect(page1.currentPage).toBe(1);
      expect(page1.hasMore).toBe(true);
    });

    it('should return correct page of branches', () => {
      const page2 = service.paginateBranches(testBranches, { page: 2, pageSize: 2 });

      expect(page2.branches).toHaveLength(2);
      expect(page2.currentPage).toBe(2);
      expect(page2.branches[0]).toBe(testBranches[2]);
      expect(page2.branches[1]).toBe(testBranches[3]);
    });

    it('should handle last page correctly', () => {
      const page3 = service.paginateBranches(testBranches, { page: 3, pageSize: 2 });

      expect(page3.branches).toHaveLength(1); // Only 1 branch on last page
      expect(page3.currentPage).toBe(3);
      expect(page3.hasMore).toBe(false);
    });

    it('should return empty result for out-of-range page', () => {
      const page10 = service.paginateBranches(testBranches, { page: 10, pageSize: 2 });

      expect(page10.branches).toHaveLength(0);
      expect(page10.currentPage).toBe(10);
      expect(page10.hasMore).toBe(false);
    });

    it('should prioritize active branches in intelligent pagination', () => {
      const result = service.paginateBranches(testBranches, {
        page: 1,
        pageSize: 3,
        prioritizeActive: true,
      });

      expect(result.branches).toHaveLength(3);
      // All returned branches should be active (4 active branches total)
      expect(result.branches.every((b) => b.isActive)).toBe(true);
      // Most recently active should come first
      expect(result.branches[0]?.displayName).toBe('main');
    });

    it('should handle pagination with filtering', () => {
      const filteredBranches = testBranches.filter((b) => b.displayName.includes('feature'));
      const result = service.paginateBranches(filteredBranches, {
        page: 1,
        pageSize: 1,
      });

      expect(result.branches).toHaveLength(1);
      expect(result.totalCount).toBe(2);
      expect(result.totalPages).toBe(2);
    });
  });

  describe('applyFiltersAndPagination', () => {
    it('should apply filters, sorting, and pagination in correct order', () => {
      const result = service.applyFiltersAndPagination(
        testBranches,
        {
          namePattern: '*',
          onlyActive: true,
        },
        {
          sortBy: 'buildCount',
          sortOrder: 'desc',
        },
        {
          page: 1,
          pageSize: 2,
        }
      );

      expect(result.branches).toHaveLength(2);
      expect(result.totalCount).toBe(4); // 4 active branches
      expect(result.branches[0]?.displayName).toBe('main'); // Highest build count
      expect(result.branches[1]?.displayName).toBe('release/v2.0'); // Second highest
    });

    it('should handle empty filter results gracefully', () => {
      const result = service.applyFiltersAndPagination(
        testBranches,
        {
          namePattern: 'nonexistent/*',
        },
        {},
        {
          page: 1,
        }
      );

      expect(result.branches).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should preserve original array when no operations needed', () => {
      const result = service.applyFiltersAndPagination(
        testBranches,
        {}, // No filters
        {}, // No sorting
        { page: 1, pageSize: 100 } // Large page
      );

      expect(result.branches).toHaveLength(5);
      expect(result.branches).toEqual(testBranches);
    });
  });

  describe('edge cases', () => {
    it('should handle empty branch array', () => {
      const result = service.filterBranches([], { namePattern: '*' });
      expect(result).toEqual([]);
    });

    it('should handle branches without lastBuild', () => {
      const branchesWithoutBuild: BranchInfo[] = [
        {
          name: 'refs/heads/new',
          displayName: 'new',
          isDefault: false,
          isActive: false,
          buildCount: 0,
          firstSeenDate: new Date(),
          lastActivityDate: new Date(),
        },
      ];

      const result = service.filterBranches(branchesWithoutBuild, {
        lastBuildStatus: 'SUCCESS',
      });

      expect(result).toHaveLength(0);
    });

    it('should handle invalid regex patterns gracefully', () => {
      const options = {
        namePattern: '/[invalid/', // Invalid regex
      };

      expect(() => service.filterBranches(testBranches, options)).not.toThrow();
      const result = service.filterBranches(testBranches, options);
      expect(result).toEqual(testBranches); // Falls back to no filtering
    });

    it('should handle negative page numbers', () => {
      const result = service.paginateBranches(testBranches, { page: -1 });

      expect(result.currentPage).toBe(1); // Defaults to page 1
      expect(result.branches).toHaveLength(5);
    });

    it('should handle zero page size', () => {
      const result = service.paginateBranches(testBranches, { page: 1, pageSize: 0 });

      expect(result.branches).toHaveLength(5); // Falls back to default page size
      expect(result.currentPage).toBe(1);
    });
  });
});
