/**
 * Tests for BuildListManager
 */
import { BuildListManager } from '@/teamcity/build-list-manager';
import { TeamCityAPIError } from '@/teamcity/errors';
import type { TeamCityUnifiedClient } from '@/teamcity/types/client';

import { createNetworkError, createServerError } from '../../test-utils/errors';

const BASE_URL = 'https://teamcity.example.com';

type StubClient = {
  client: TeamCityUnifiedClient;
  builds: {
    getMultipleBuilds: jest.Mock;
    getAllBuilds: jest.Mock;
  };
  http: { get: jest.Mock };
  request: jest.Mock;
};

const createStubClient = (): StubClient => {
  const builds = {
    getMultipleBuilds: jest.fn(),
    getAllBuilds: jest.fn(),
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

      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: 42 } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(stub.builds.getAllBuilds).toHaveBeenCalledWith(undefined, 'count');
      expect(result.metadata.totalCount).toBe(42);
    });

    it('returns zero when total count fails', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          count: 1,
          build: [createBuild(1)],
        },
      });

      stub.builds.getAllBuilds.mockRejectedValueOnce(new Error('count failed'));

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

    it('throws when TeamCity omits the build array', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({ data: { count: 1 } });

      await expect(manager.listBuilds({})).rejects.toThrow('build array');
    });

    it('re-throws TeamCityAPIError directly without wrapping', async () => {
      const apiError = new TeamCityAPIError('Original API error', 'ORIGINAL_CODE', 500);
      stub.builds.getMultipleBuilds.mockRejectedValueOnce(apiError);

      await expect(manager.listBuilds({})).rejects.toBe(apiError);
    });

    it('re-throws errors containing "Invalid status value" directly', async () => {
      const validationError = new Error('Invalid status value: INVALID');
      stub.builds.getMultipleBuilds.mockRejectedValueOnce(validationError);

      await expect(manager.listBuilds({})).rejects.toThrow('Invalid status value');
    });

    it('wraps generic errors with BUILD_LIST_ERROR', async () => {
      const genericError = new Error('Something went wrong');
      stub.builds.getMultipleBuilds.mockRejectedValueOnce(genericError);

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('Failed to fetch builds'),
        code: 'BUILD_LIST_ERROR',
      });
    });

    it('handles non-Error objects thrown as exceptions', async () => {
      stub.builds.getMultipleBuilds.mockRejectedValueOnce('string error');

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: 'Failed to fetch builds: Unknown error',
        code: 'BUILD_LIST_ERROR',
      });
    });

    it('handles axios errors by wrapping them', async () => {
      const axiosError = createServerError('TeamCity server crashed');
      stub.builds.getMultipleBuilds.mockRejectedValueOnce(axiosError);

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('Failed to fetch builds'),
        code: 'BUILD_LIST_ERROR',
      });
    });

    it('handles network errors by wrapping them', async () => {
      const networkError = createNetworkError('ECONNREFUSED', 'Connection refused');
      stub.builds.getMultipleBuilds.mockRejectedValueOnce(networkError);

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('Failed to fetch builds'),
        code: 'BUILD_LIST_ERROR',
      });
    });
  });

  describe('Response Validation', () => {
    it('throws when response data is not an object', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({ data: 'not an object' });

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('non-object build list response'),
        code: 'INVALID_RESPONSE',
      });
    });

    it('throws when response data is null', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({ data: null });

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('non-object build list response'),
        code: 'INVALID_RESPONSE',
      });
    });

    it('throws when build entry is not an object', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: ['not-an-object'],
        },
      });

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('non-object build entry'),
        code: 'INVALID_RESPONSE',
      });
    });

    it('throws when build entry is null', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [null],
        },
      });

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('non-object build entry'),
        code: 'INVALID_RESPONSE',
      });
    });

    describe.each([
      {
        field: 'id',
        build: { buildTypeId: 'bt', number: '1', status: 'S', state: 's', webUrl: 'u' },
      },
      { field: 'buildTypeId', build: { id: 1, number: '1', status: 'S', state: 's', webUrl: 'u' } },
      {
        field: 'number',
        build: { id: 1, buildTypeId: 'bt', status: 'S', state: 's', webUrl: 'u' },
      },
      {
        field: 'status',
        build: { id: 1, buildTypeId: 'bt', number: '1', state: 's', webUrl: 'u' },
      },
      {
        field: 'state',
        build: { id: 1, buildTypeId: 'bt', number: '1', status: 'S', webUrl: 'u' },
      },
      {
        field: 'webUrl',
        build: { id: 1, buildTypeId: 'bt', number: '1', status: 'S', state: 's' },
      },
    ])('required field $field', ({ build }) => {
      it('throws when missing required field', async () => {
        stub.builds.getMultipleBuilds.mockResolvedValue({
          data: { build: [build] },
        });

        await expect(manager.listBuilds({})).rejects.toMatchObject({
          message: expect.stringContaining('missing required fields'),
          code: 'INVALID_RESPONSE',
        });
      });
    });

    it('throws when required fields have wrong types', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [
            {
              id: 1,
              buildTypeId: 123, // should be string
              number: '1',
              status: 'SUCCESS',
              state: 'finished',
              webUrl: 'http://example.com',
            },
          ],
        },
      });

      await expect(manager.listBuilds({})).rejects.toMatchObject({
        message: expect.stringContaining('missing required fields'),
        code: 'INVALID_RESPONSE',
      });
    });
  });

  describe('Build Parsing', () => {
    it('parses id as number when provided as number', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [createBuild(12345)],
        },
      });

      const result = await manager.listBuilds({});

      expect(result.builds[0]?.id).toBe(12345);
      expect(typeof result.builds[0]?.id).toBe('number');
    });

    it('parses id as number when provided as string', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [
            {
              id: '12345',
              buildTypeId: 'MyBuildConfig',
              number: '1',
              status: 'SUCCESS',
              state: 'finished',
              webUrl: `${BASE_URL}/viewLog.html?buildId=12345`,
            },
          ],
        },
      });

      const result = await manager.listBuilds({});

      expect(result.builds[0]?.id).toBe(12345);
      expect(typeof result.builds[0]?.id).toBe('number');
    });

    it('handles optional fields being undefined', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [
            {
              id: 1,
              buildTypeId: 'MyBuildConfig',
              number: '1',
              status: 'SUCCESS',
              state: 'finished',
              webUrl: `${BASE_URL}/viewLog.html?buildId=1`,
              // branchName, startDate, finishDate, queuedDate, statusText all missing
            },
          ],
        },
      });

      const result = await manager.listBuilds({});
      const build = result.builds[0];

      expect(build?.branchName).toBeUndefined();
      expect(build?.startDate).toBeUndefined();
      expect(build?.finishDate).toBeUndefined();
      expect(build?.queuedDate).toBeUndefined();
      expect(build?.statusText).toBe('');
    });

    it('handles optional fields with non-string values', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [
            {
              id: 1,
              buildTypeId: 'MyBuildConfig',
              number: '1',
              status: 'SUCCESS',
              state: 'finished',
              webUrl: `${BASE_URL}/viewLog.html?buildId=1`,
              branchName: 123, // wrong type
              startDate: true, // wrong type
              finishDate: null, // null
              queuedDate: { date: 'now' }, // object
              statusText: 42, // wrong type
            },
          ],
        },
      });

      const result = await manager.listBuilds({});
      const build = result.builds[0];

      expect(build?.branchName).toBeUndefined();
      expect(build?.startDate).toBeUndefined();
      expect(build?.finishDate).toBeUndefined();
      expect(build?.queuedDate).toBeUndefined();
      expect(build?.statusText).toBe('');
    });

    it('parses all optional fields when present and valid', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [
            {
              id: 1,
              buildTypeId: 'MyBuildConfig',
              number: '1',
              status: 'SUCCESS',
              state: 'finished',
              webUrl: `${BASE_URL}/viewLog.html?buildId=1`,
              branchName: 'main',
              startDate: '20240101T120000+0000',
              finishDate: '20240101T121500+0000',
              queuedDate: '20240101T115500+0000',
              statusText: 'Tests passed',
            },
          ],
        },
      });

      const result = await manager.listBuilds({});
      const build = result.builds[0];

      expect(build?.branchName).toBe('main');
      expect(build?.startDate).toBe('20240101T120000+0000');
      expect(build?.finishDate).toBe('20240101T121500+0000');
      expect(build?.queuedDate).toBe('20240101T115500+0000');
      expect(build?.statusText).toBe('Tests passed');
    });
  });

  describe('hasMore Detection', () => {
    it('sets hasMore to true when nextHref is a non-empty string', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [createBuild(1)],
          nextHref: '/app/rest/builds?locator=start:100',
        },
      });

      const result = await manager.listBuilds({});

      expect(result.metadata.hasMore).toBe(true);
    });

    it('sets hasMore to false when nextHref is an empty string', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [createBuild(1)],
          nextHref: '',
        },
      });

      const result = await manager.listBuilds({});

      expect(result.metadata.hasMore).toBe(false);
    });

    it('sets hasMore to false when nextHref is undefined', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [createBuild(1)],
        },
      });

      const result = await manager.listBuilds({});

      expect(result.metadata.hasMore).toBe(false);
    });

    it.each([
      { nextHref: null, description: 'null' },
      { nextHref: 123, description: 'number' },
      { nextHref: {}, description: 'object' },
      { nextHref: true, description: 'boolean' },
    ])('sets hasMore to false when nextHref is $description', async ({ nextHref }) => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: {
          build: [createBuild(1)],
          nextHref,
        },
      });

      const result = await manager.listBuilds({});

      expect(result.metadata.hasMore).toBe(false);
    });
  });

  describe('Metadata Defaults', () => {
    it('uses default offset of 0 when not provided', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      const result = await manager.listBuilds({});

      expect(result.metadata.offset).toBe(0);
    });

    it('uses provided offset in metadata', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      const result = await manager.listBuilds({ offset: 50 });

      expect(result.metadata.offset).toBe(50);
    });

    it('uses default limit of 100 when not provided', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      const result = await manager.listBuilds({});

      expect(result.metadata.limit).toBe(100);
    });

    it('uses provided limit in metadata', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      const result = await manager.listBuilds({ limit: 25 });

      expect(result.metadata.limit).toBe(25);
    });
  });

  describe('Locator Building', () => {
    it('does not include start when offset is 0', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      await manager.listBuilds({ offset: 0 });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).not.toContain('start:');
    });

    it('does not include start when offset is undefined', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      await manager.listBuilds({});

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).not.toContain('start:');
    });

    it('includes start when offset is positive', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      await manager.listBuilds({ offset: 10 });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain('start:10');
    });
  });

  describe('Total Count Extraction', () => {
    it('extracts count when it is a number', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: 42 } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(42);
    });

    it('extracts count when it is a numeric string', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: '42' } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(42);
    });

    it('returns 0 when count response is not an object', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: 'not an object' });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(0);
    });

    it('returns 0 when count field is missing', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { other: 'field' } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(0);
    });

    it('returns 0 when count is an invalid string', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: 'not-a-number' } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(0);
    });

    it('returns 0 when count is an empty string', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: '' } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(0);
    });

    it('returns 0 when count is whitespace only', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: '   ' } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(0);
    });

    it.each([
      { count: null, description: 'null' },
      { count: undefined, description: 'undefined' },
      { count: {}, description: 'object' },
      { count: [], description: 'array' },
      { count: true, description: 'boolean' },
    ])('returns 0 when count is $description', async ({ count }) => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.metadata.totalCount).toBe(0);
    });

    it('strips count and start from locator for total count query', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: 100 } });

      await manager.listBuilds({
        project: 'MyProject',
        limit: 10,
        offset: 20,
        includeTotalCount: true,
      });

      const countLocator = stub.builds.getAllBuilds.mock.calls[0]?.[0];
      expect(countLocator).not.toContain('count:');
      expect(countLocator).not.toContain('start:');
      expect(countLocator).toContain('project:');
    });

    it('uses undefined locator when all parts are stripped', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: 100 } });

      await manager.listBuilds({ includeTotalCount: true });

      expect(stub.builds.getAllBuilds).toHaveBeenCalledWith(undefined, 'count');
    });
  });

  describe('Caching', () => {
    it('returns cached result on second call with same params', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      await manager.listBuilds({ project: 'MyProject' });
      await manager.listBuilds({ project: 'MyProject' });

      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache when forceRefresh is true', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      await manager.listBuilds({ project: 'MyProject' });
      await manager.listBuilds({ project: 'MyProject', forceRefresh: true });

      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledTimes(2);
    });

    it('excludes forceRefresh from cache key', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      await manager.listBuilds({ project: 'MyProject', forceRefresh: false });
      await manager.listBuilds({ project: 'MyProject' });

      // Should use cache since forceRefresh is excluded from key
      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledTimes(1);
    });

    it('excludes includeTotalCount from cache key', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });
      stub.builds.getAllBuilds.mockResolvedValue({ data: { count: 10 } });

      await manager.listBuilds({ project: 'MyProject', includeTotalCount: true });
      await manager.listBuilds({ project: 'MyProject', includeTotalCount: false });

      // Should use cache since includeTotalCount is excluded from key
      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledTimes(1);
    });

    it('returns null for non-existent cache entry', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      // First call populates cache for 'MyProject'
      await manager.listBuilds({ project: 'MyProject' });
      // Second call with different params should not use cache
      await manager.listBuilds({ project: 'OtherProject' });

      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledTimes(2);
    });

    it('invalidates cache after TTL expires', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      await manager.listBuilds({ project: 'MyProject' });

      // Manually expire the cache entry
      type PrivateAccess = { cache: Map<string, { result: unknown; timestamp: number }> };
      const cache = (manager as unknown as PrivateAccess).cache;
      for (const entry of cache.values()) {
        entry.timestamp = Date.now() - 31000; // 31 seconds ago (TTL is 30s)
      }

      await manager.listBuilds({ project: 'MyProject' });

      expect(stub.builds.getMultipleBuilds).toHaveBeenCalledTimes(2);
    });

    it('cleans expired cache entries when adding new ones', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [createBuild(1)] },
      });

      // Populate cache with an entry
      await manager.listBuilds({ project: 'Project1' });

      // Manually expire it
      type PrivateAccess = { cache: Map<string, { result: unknown; timestamp: number }> };
      const cache = (manager as unknown as PrivateAccess).cache;
      for (const entry of cache.values()) {
        entry.timestamp = Date.now() - 31000;
      }

      // Add a new entry, which triggers cleanup
      await manager.listBuilds({ project: 'Project2' });

      // Old expired entry should be removed
      expect(cache.size).toBe(1);
    });
  });

  describe('Filter Parameters', () => {
    it.each([
      { param: 'buildType', value: 'MyBuildConfig', expected: 'buildType:MyBuildConfig' },
      { param: 'status', value: 'FAILURE', expected: 'status:FAILURE' },
      { param: 'branch', value: 'main', expected: 'branch:' },
      { param: 'tag', value: 'release', expected: 'tag:' },
      { param: 'running', value: true, expected: 'running:true' },
      { param: 'canceled', value: true, expected: 'canceled:true' },
      { param: 'personal', value: true, expected: 'personal:true' },
      { param: 'failedToStart', value: true, expected: 'failedToStart:true' },
    ] as const)('includes $param in locator when provided', async ({ param, value, expected }) => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      await manager.listBuilds({ [param]: value });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain(expected);
    });

    it('includes sinceDate filter in locator', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      // Use ISO 8601 format that BuildQueryBuilder expects
      await manager.listBuilds({ sinceDate: '2024-01-01T00:00:00Z' });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain('sinceDate:');
    });

    it('includes untilDate filter in locator', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      // Use ISO 8601 format that BuildQueryBuilder expects
      await manager.listBuilds({ untilDate: '2024-01-31T23:59:59Z' });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain('untilDate:');
    });

    it('includes sinceBuild filter in locator', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      await manager.listBuilds({ sinceBuild: 12345 });

      const locator = stub.builds.getMultipleBuilds.mock.calls[0]?.[0] ?? '';
      expect(locator).toContain('sinceBuild:');
    });
  });

  describe('Empty Results', () => {
    it('handles empty build array from API', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });

      const result = await manager.listBuilds({});

      expect(result.builds).toEqual([]);
      expect(result.metadata.count).toBe(0);
    });

    it('handles empty build array with total count request', async () => {
      stub.builds.getMultipleBuilds.mockResolvedValue({
        data: { build: [] },
      });
      stub.builds.getAllBuilds.mockResolvedValueOnce({ data: { count: 0 } });

      const result = await manager.listBuilds({ includeTotalCount: true });

      expect(result.builds).toEqual([]);
      expect(result.metadata.totalCount).toBe(0);
    });
  });
});
