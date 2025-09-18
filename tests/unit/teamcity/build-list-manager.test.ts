/**
 * Tests for BuildListManager
 */
import { BuildListManager } from '@/teamcity/build-list-manager';
import type { TeamCityUnifiedClient } from '@/teamcity/types/client';

const BASE_URL = 'https://teamcity.example.com';

type StubClient = {
  client: TeamCityUnifiedClient;
  builds: {
    getMultipleBuilds: jest.Mock;
  };
  http: { get: jest.Mock };
  request: jest.Mock;
};

const createStubClient = (): StubClient => {
  const builds = {
    getMultipleBuilds: jest.fn(),
  };

  const http = {
    get: jest.fn(),
  } as { get: jest.Mock };

  const request = jest.fn(
    async (fn: (ctx: { axios: typeof http; baseUrl: string }) => Promise<unknown>) =>
      fn({ axios: http, baseUrl: BASE_URL })
  ) as jest.Mock;

  const client = {
    modules: { builds } as unknown as TeamCityUnifiedClient['modules'],
    http: http as unknown as TeamCityUnifiedClient['http'],
    request: request as unknown as TeamCityUnifiedClient['request'],
    getConfig: jest.fn(() => ({ connection: { baseUrl: BASE_URL, token: 'token' } })),
    getApiConfig: jest.fn(() => ({ baseUrl: BASE_URL, token: 'token' })),
    getAxios: jest.fn(() => http as unknown as TeamCityUnifiedClient['http']),
  } as TeamCityUnifiedClient;

  return { client, builds, http, request };
};

describe('BuildListManager', () => {
  let manager: BuildListManager;
  let stub: StubClient;

  const createBuild = (id: number, overrides: Partial<Record<string, unknown>> = {}) => ({
    id,
    buildTypeId: 'MyBuildConfig',
    number: String(id),
    status: 'SUCCESS',
    state: 'finished',
    webUrl: `${BASE_URL}/viewLog.html?buildId=${id}`,
    ...overrides,
  });

  beforeEach(() => {
    stub = createStubClient();
    stub.builds.getMultipleBuilds.mockResolvedValue({
      data: {
        count: 0,
        build: [],
      },
    });

    manager = new BuildListManager(stub.client);
    type PrivateAccess = { cache: Map<string, unknown> };
    (manager as unknown as PrivateAccess).cache.clear();
  });

  describe('Basic Query', () => {
    it('should fetch builds with no filters', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 2,
          build: [createBuild(12345), createBuild(12346)],
        },
      });

      const result = await manager.listBuilds({});

      expect(result.builds).toHaveLength(2);
      expect(result.metadata.count).toBe(2);
      expect(result.metadata.hasMore).toBe(false);
    });

    it('should fetch builds with project filter', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1,
          build: [createBuild(12345)],
        },
      });

      await manager.listBuilds({ project: 'MyProject' });

      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledWith(
        expect.stringContaining('project:'),
        expect.any(String)
      );
    });
  });

  describe('Pagination', () => {
    it('should apply default limit', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 100,
          build: new Array(100).fill(null).map((_, i) => createBuild(10000 + i)),
        },
      });

      const result = await manager.listBuilds({});

      expect(result.builds).toHaveLength(100);
      expect(result.metadata.limit).toBe(100);
    });

    it('should enforce maximum limit', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1000,
          build: [],
        },
      });

      await manager.listBuilds({ limit: 5000 });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain('count:1000');
    });

    it('should apply offset when provided', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 10,
          build: new Array(10).fill(null).map((_, i) => createBuild(10000 + i)),
        },
      });

      await manager.listBuilds({ offset: 20 });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain('start:20');
    });
  });

  describe('Total Count', () => {
    it('requests total count when includeTotalCount is true', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 2,
          build: [createBuild(1), createBuild(2)],
        },
      });

      stub.http.get.mockResolvedValueOnce({ data: '42' });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(stub.request).toHaveBeenCalledWith(expect.any(Function));
      expect(stub.http.get).toHaveBeenCalledWith(
        `${BASE_URL}/app/rest/builds/count`,
        expect.objectContaining({ headers: expect.any(Object) })
      );
      expect(result.metadata.totalCount).toBe(42);
    });

    it('returns zero when total count fails', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1,
          build: [createBuild(1)],
        },
      });

      stub.http.get.mockRejectedValueOnce(new Error('count failed'));

      const result = await manager.listBuilds({ includeTotalCount: true });
      expect(result.metadata.totalCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('throws when API returns validation errors', async () => {
      stub.builds.getMultipleBuilds.mockImplementationOnce(() => {
        throw new Error('Invalid date format');
      });

      await expect(manager.listBuilds({ sinceDate: 'bad-date' })).rejects.toThrow(
        'Invalid date format'
      );
    });
  });
});
