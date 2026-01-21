/**
 * Tests for ArtifactManager
 */
import { Readable } from 'node:stream';

import type { RawAxiosRequestConfig } from 'axios';

import { ArtifactManager } from '@/teamcity/artifact-manager';

import {
  type MockBuildApi,
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('ArtifactManager', () => {
  let manager: ArtifactManager;
  let mockClient: MockTeamCityClient;
  let http: jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
  let buildsApi: MockBuildApi;
  const BASE_URL = 'https://teamcity.example.com';

  const configureClient = () => {
    mockClient = createMockTeamCityClient();
    http = mockClient.http as jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
    http.get.mockReset();
    buildsApi = mockClient.mockModules.builds;
    buildsApi.getFilesListOfBuild.mockImplementation((buildLocator: string) =>
      http.get(`/app/rest/builds/${buildLocator}/artifacts`)
    );
    buildsApi.downloadFileOfBuild.mockImplementation(
      (
        path: string,
        buildLocator: string,
        _locatorFields?: unknown,
        _options?: unknown,
        config?: RawAxiosRequestConfig
      ) => http.get(`/app/rest/builds/${buildLocator}/artifacts/${path}`, config)
    );
    mockClient.downloadArtifactContent.mockImplementation(
      async (buildId: string, artifactPath: string, requestConfig?: RawAxiosRequestConfig) =>
        http.get(`/app/rest/builds/id:${buildId}/artifacts/content/${artifactPath}`, requestConfig)
    );
    mockClient.request.mockImplementation(async (fn) => fn({ axios: http, baseUrl: BASE_URL }));
    mockClient.getApiConfig.mockReturnValue({
      baseUrl: BASE_URL,
      token: 'test-token',
      timeout: undefined,
    });
    mockClient.getConfig.mockReturnValue({
      connection: {
        baseUrl: BASE_URL,
        token: 'test-token',
        timeout: undefined,
      },
    });

    manager = new ArtifactManager(mockClient);
    jest
      .spyOn(manager as unknown as { delay: (ms: number) => Promise<void> }, 'delay')
      .mockResolvedValue();
  };

  beforeEach(() => {
    configureClient();
  });

  describe('Artifact Listing', () => {
    it('should list all artifacts for a build', async () => {
      const mockArtifacts = {
        file: [
          {
            name: 'app.jar',
            fullName: 'target/app.jar',
            size: 10485760,
            modificationTime: '20250829T121400+0000',
            href: '/app/rest/builds/id:12345/artifacts/metadata/target/app.jar',
            content: { href: '/app/rest/builds/id:12345/artifacts/content/target/app.jar' },
          },
          {
            name: 'test-report.html',
            fullName: 'reports/test-report.html',
            size: 524288,
            modificationTime: '20250829T121430+0000',
            href: '/app/rest/builds/id:12345/artifacts/metadata/reports/test-report.html',
            content: {
              href: '/app/rest/builds/id:12345/artifacts/content/reports/test-report.html',
            },
          },
        ],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      const result = await manager.listArtifacts('12345');

      // Behavior-first: avoid asserting internal HTTP call shape

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('app.jar');
      expect(result[0]?.path).toBe('target/app.jar');
      expect(result[0]?.size).toBe(10485760);
      expect(result[0]?.downloadUrl).toContain('/artifacts/content/target/app.jar');
    });

    it('should handle nested artifact directories', async () => {
      const mockArtifacts = {
        file: [
          {
            name: 'libs',
            fullName: 'build/libs',
            size: 0,
            href: '/app/rest/builds/id:12345/artifacts/metadata/build/libs',
            children: {
              file: [
                {
                  name: 'core.jar',
                  fullName: 'build/libs/core.jar',
                  size: 2097152,
                },
                {
                  name: 'utils.jar',
                  fullName: 'build/libs/utils.jar',
                  size: 1048576,
                },
              ],
            },
          },
        ],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      const result = await manager.listArtifacts('12345', { includeNested: true });

      expect(result).toHaveLength(2);
      expect(result[0]?.path).toBe('build/libs/core.jar');
      expect(result[1]?.path).toBe('build/libs/utils.jar');
    });

    it('should paginate large artifact lists', async () => {
      const mockArtifacts = {
        file: new Array(150).fill(null).map((_, i) => ({
          name: `file${i}.txt`,
          fullName: `files/file${i}.txt`,
          size: 1024,
          modificationTime: '20250829T120000+0000',
        })),
        nextHref: '/app/rest/builds/id:12345/artifacts?start=100',
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      const result = await manager.listArtifacts('12345', {
        limit: 100,
        offset: 0,
      });

      expect(result).toHaveLength(100);
      expect(result[0]?.name).toBe('file0.txt');
      expect(result[99]?.name).toBe('file99.txt');
    });

    it('throws when artifact listing payload is malformed', async () => {
      http.get.mockResolvedValue({ data: { file: 'oops' } });

      await expect(manager.listArtifacts('12345')).rejects.toThrow('non-array file field');
    });
  });

  describe('Artifact Filtering', () => {
    const mockArtifacts = {
      file: [
        { name: 'app.jar', fullName: 'target/app.jar', size: 10485760 },
        { name: 'lib.jar', fullName: 'target/lib.jar', size: 2097152 },
        { name: 'test-report.html', fullName: 'reports/test-report.html', size: 524288 },
        { name: 'coverage.xml', fullName: 'reports/coverage.xml', size: 102400 },
        { name: 'README.md', fullName: 'README.md', size: 5120 },
      ],
    };

    beforeEach(() => {
      http.get.mockResolvedValue({ data: mockArtifacts });
    });

    it('should filter artifacts by name pattern', async () => {
      const result = await manager.listArtifacts('12345', {
        nameFilter: '*.jar',
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('app.jar');
      expect(result[1]?.name).toBe('lib.jar');
    });

    it('should filter artifacts by path prefix', async () => {
      const result = await manager.listArtifacts('12345', {
        pathFilter: 'reports/*',
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('test-report.html');
      expect(result[1]?.name).toBe('coverage.xml');
    });

    it('should filter artifacts by extension', async () => {
      const result = await manager.listArtifacts('12345', {
        extension: 'jar',
      });

      expect(result).toHaveLength(2);
      expect(result.every((a) => a.name.endsWith('.jar'))).toBe(true);
    });

    it('should filter artifacts by size range', async () => {
      const result = await manager.listArtifacts('12345', {
        minSize: 100000,
        maxSize: 1000000,
      });

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('test-report.html');
      expect(result[1]?.name).toBe('coverage.xml');
    });

    it('should combine multiple filters', async () => {
      const result = await manager.listArtifacts('12345', {
        pathFilter: 'reports/*',
        extension: 'xml',
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('coverage.xml');
    });
  });

  describe('Artifact Download', () => {
    it('should generate download URLs', async () => {
      const mockArtifacts = {
        file: [{ name: 'app.jar', fullName: 'target/app.jar', size: 10485760 }],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      const result = await manager.listArtifacts('12345');

      expect(result[0]?.downloadUrl).toBe(
        'https://teamcity.example.com/app/rest/builds/id:12345/artifacts/content/target/app.jar'
      );
    });

    it('should download artifact content as base64', async () => {
      const mockContent = 'Hello, World!';
      const base64Content = Buffer.from(mockContent).toString('base64');

      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'hello.txt', fullName: 'hello.txt', size: 13 }],
          },
        })
        .mockResolvedValueOnce({
          data: Buffer.from(mockContent),
          headers: { 'content-type': 'text/plain' },
        });

      const result = await manager.downloadArtifact('12345', 'hello.txt', {
        encoding: 'base64',
      });

      expect(result.content).toBe(base64Content);
      expect(result.mimeType).toBe('text/plain');
      expect(result.size).toBe(13);
    });

    it('downloads nested directory artifacts even when TeamCity omits parent prefixes', async () => {
      const listingResponse = {
        file: [
          {
            name: 'production',
            fullName: 'production',
            size: 0,
            children: {
              file: [
                {
                  name: 'web',
                  fullName: 'web',
                  size: 0,
                  children: {
                    file: [
                      {
                        name: 'health.json',
                        fullName: 'health.json',
                        size: 20,
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      };

      const artifactContent = JSON.stringify({ status: 'ok' });
      const expectedPath = 'production/web/health.json';

      const artifactBuffer = Buffer.from(artifactContent);

      http.get.mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('/artifacts/content/')) {
          return Promise.resolve({
            data: artifactBuffer,
            headers: { 'content-type': 'application/json' },
          });
        }

        return Promise.resolve({ data: listingResponse });
      });

      const result = await manager.downloadArtifact('3711', expectedPath, {
        encoding: 'base64',
      });

      expect(result.path).toBe(expectedPath);
      expect(result.content).toBe(artifactBuffer.toString('base64'));
      expect(http.get).toHaveBeenLastCalledWith(
        `/app/rest/builds/id:3711/artifacts/content/${expectedPath}`,
        expect.objectContaining({ responseType: 'arraybuffer' })
      );
    });

    it('should download artifact content as text', async () => {
      const mockContent = 'Hello, World!';

      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'hello.txt', fullName: 'hello.txt', size: 13 }],
          },
        })
        .mockResolvedValueOnce({
          data: mockContent,
          headers: { 'content-type': 'text/plain' },
        });

      const result = await manager.downloadArtifact('12345', 'hello.txt', {
        encoding: 'text',
      });

      expect(result.content).toBe(mockContent);
    });

    it('throws when text downloads return a non-string payload', async () => {
      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'broken.txt', fullName: 'broken.txt', size: 1 }],
          },
        })
        .mockResolvedValueOnce({
          data: 1234,
        });

      await expect(
        manager.downloadArtifact('12345', 'broken.txt', {
          encoding: 'text',
        })
      ).rejects.toThrow('non-text payload');
    });

    it('should handle binary artifacts', async () => {
      const binaryData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'image.png', fullName: 'image.png', size: 4 }],
          },
        })
        .mockResolvedValueOnce({
          data: binaryData,
          headers: { 'content-type': 'image/png' },
        });

      const result = await manager.downloadArtifact('12345', 'image.png', {
        encoding: 'base64',
      });

      expect(result.content).toBe(binaryData.toString('base64'));
      expect(result.mimeType).toBe('image/png');
    });

    it('should download artifact content as a stream when requested', async () => {
      const stream = Readable.from(['chunk-1', 'chunk-2']);

      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'log.txt', fullName: 'logs/log.txt', size: 8 }],
          },
        })
        .mockResolvedValueOnce({
          data: stream,
          headers: { 'content-type': 'text/plain' },
        });

      const result = await manager.downloadArtifact('12345', 'logs/log.txt', {
        encoding: 'stream',
      });

      expect(result.content).toBe(stream);
      expect(result.mimeType).toBe('text/plain');
      expect(result.size).toBe(8);

      expect(http.get).toHaveBeenLastCalledWith(
        '/app/rest/builds/id:12345/artifacts/content/logs/log.txt',
        expect.objectContaining({ responseType: 'stream' })
      );
    });

    it('throws when stream downloads return non-stream payloads', async () => {
      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'log.txt', fullName: 'logs/log.txt', size: 8 }],
          },
        })
        .mockResolvedValueOnce({
          data: { not: 'a stream' },
        });

      await expect(
        manager.downloadArtifact('12345', 'logs/log.txt', {
          encoding: 'stream',
        })
      ).rejects.toThrow('non-stream payload');
    });

    it('throws when binary downloads return unsupported payloads', async () => {
      http.get
        .mockResolvedValueOnce({
          data: {
            file: [{ name: 'image.png', fullName: 'image.png', size: 4 }],
          },
        })
        .mockResolvedValueOnce({
          data: { unexpected: true },
        });

      await expect(
        manager.downloadArtifact('12345', 'image.png', {
          encoding: 'base64',
        })
      ).rejects.toThrow('unexpected binary payload');
    });

    it('should respect size limits', async () => {
      http.get.mockResolvedValueOnce({
        data: {
          file: [{ name: 'large.bin', fullName: 'large.bin', size: 10485760 }],
        },
      });

      await expect(
        manager.downloadArtifact('12345', 'large.bin', {
          maxSize: 1048576, // 1MB limit
        })
      ).rejects.toThrow('Artifact size exceeds maximum allowed size');
    });
  });

  describe('Batch Operations', () => {
    beforeEach(() => {
      configureClient();
    });

    it('should download multiple artifacts', async () => {
      const mockArtifacts = {
        file: [
          { name: 'file1.txt', fullName: 'file1.txt', size: 10 },
          { name: 'file2.txt', fullName: 'file2.txt', size: 20 },
          { name: 'file3.txt', fullName: 'file3.txt', size: 30 },
        ],
      };

      // The manager now downloads sequentially, caching the initial artifact list
      http.get
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts (cached for subsequent downloads)
        .mockResolvedValueOnce({ data: Buffer.from('content1'), headers: {} }) // download file1
        .mockResolvedValueOnce({ data: Buffer.from('content2'), headers: {} }) // download file2
        .mockResolvedValueOnce({ data: Buffer.from('content3'), headers: {} }); // download file3

      const result = await manager.downloadMultipleArtifacts('12345', [
        'file1.txt',
        'file2.txt',
        'file3.txt',
      ]);

      expect(result).toHaveLength(3);
      expect(result[0]?.name).toBe('file1.txt');
      expect(result[0]?.content).toBe(Buffer.from('content1').toString('base64'));
      expect(result[1]?.name).toBe('file2.txt');
      expect(result[1]?.content).toBe(Buffer.from('content2').toString('base64'));
      expect(result[2]?.name).toBe('file3.txt');
      expect(result[2]?.content).toBe(Buffer.from('content3').toString('base64'));
    });

    it('should stream multiple artifacts when requested', async () => {
      const mockArtifacts = {
        file: [
          { name: 'logs/app.log', fullName: 'logs/app.log', size: 10 },
          { name: 'metrics.json', fullName: 'metrics.json', size: 20 },
        ],
      };

      const streamOne = Readable.from(['chunk-1']);
      const streamTwo = Readable.from(['chunk-2']);

      http.get
        .mockResolvedValueOnce({ data: mockArtifacts })
        .mockResolvedValueOnce({ data: streamOne, headers: { 'content-type': 'text/plain' } })
        .mockResolvedValueOnce({
          data: streamTwo,
          headers: { 'content-type': 'application/json' },
        });

      const result = await manager.downloadMultipleArtifacts(
        '12345',
        ['logs/app.log', 'metrics.json'],
        { encoding: 'stream' }
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.content).toBe(streamOne);
      expect(result[0]?.mimeType).toBe('text/plain');
      expect(result[1]?.content).toBe(streamTwo);
      expect(result[1]?.mimeType).toBe('application/json');
    });

    it('should handle partial batch download failures', async () => {
      const mockArtifacts = {
        file: [
          { name: 'file1.txt', fullName: 'file1.txt', size: 10 },
          { name: 'file2.txt', fullName: 'file2.txt', size: 20 },
        ],
      };

      http.get
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts cached for both downloads
        .mockResolvedValueOnce({ data: Buffer.from('content1'), headers: {} }) // download file1
        .mockRejectedValueOnce(new Error('Download failed')); // download file2 fails

      const result = await manager.downloadMultipleArtifacts('12345', ['file1.txt', 'file2.txt']);

      expect(result).toHaveLength(2);
      expect(result[0]?.content).toBe(Buffer.from('content1').toString('base64'));
      expect(result[1]?.error).toBe('Failed to download artifact: Download failed');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      configureClient();
    });

    it('should handle network errors', async () => {
      http.get.mockRejectedValue(new Error('Network error'));

      await expect(manager.listArtifacts('12345')).rejects.toThrow('Failed to fetch artifacts');
    });

    it('should handle authentication errors', async () => {
      const error = new Error('Unauthorized') as Error & {
        response?: { status: number; data: string };
      };
      error.response = { status: 401, data: 'Unauthorized' };
      http.get.mockRejectedValue(error);

      await expect(manager.listArtifacts('12345')).rejects.toThrow('Authentication failed');
    });

    it('should handle missing artifacts', async () => {
      http.get.mockResolvedValue({ data: { file: [] } });

      const result = await manager.listArtifacts('12345');
      expect(result).toEqual([]);
    });

    it('should handle artifact not found during download', async () => {
      http.get.mockImplementation(async () => ({
        data: { file: [] },
      }));

      await expect(manager.downloadArtifact('12345', 'nonexistent.txt')).rejects.toThrow(
        'Artifact not found'
      );
    });
  });

  describe('Caching', () => {
    it('should cache artifact listings', async () => {
      const mockArtifacts = {
        file: [{ name: 'app.jar', fullName: 'target/app.jar', size: 10485760 }],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      // First call
      const first = await manager.listArtifacts('12345');
      expect(http.get).toHaveBeenCalledTimes(1);
      // Second call should produce same results
      const second = await manager.listArtifacts('12345');
      expect(second).toEqual(first);
      // Ensure cache prevented additional HTTP call
      expect(http.get).toHaveBeenCalledTimes(1);
    });

    it('should respect cache TTL', async () => {
      jest.useFakeTimers();

      const mockArtifacts = {
        file: [{ name: 'app.jar', fullName: 'target/app.jar', size: 10485760 }],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      // First call
      await manager.listArtifacts('12345');

      // Advance time by 59 seconds (within TTL)
      jest.advanceTimersByTime(59000);
      await manager.listArtifacts('12345');

      // Behavior-first: still returns same results within TTL

      // Advance time by 2 more seconds (exceeds TTL)
      jest.advanceTimersByTime(2000);
      await manager.listArtifacts('12345');

      // Behavior-first: returns results after TTL
      expect(http.get).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should bypass cache with force refresh', async () => {
      const mockArtifacts = {
        file: [{ name: 'app.jar', fullName: 'target/app.jar', size: 10485760 }],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      // First call
      await manager.listArtifacts('12345');
      // Second call with force refresh
      const r2 = await manager.listArtifacts('12345', { forceRefresh: true });
      expect(Array.isArray(r2)).toBe(true);
      // Should have made two HTTP calls due to bypassing cache
      expect(http.get).toHaveBeenCalledTimes(2);
    });

    it('should clean expired cache entries when caching new results', async () => {
      jest.useFakeTimers();

      const mockArtifacts = {
        file: [{ name: 'app.jar', fullName: 'target/app.jar', size: 10485760 }],
      };

      http.get.mockResolvedValue({ data: mockArtifacts });

      // Cache two different build artifact listings
      await manager.listArtifacts('12345');
      await manager.listArtifacts('67890');
      expect(http.get).toHaveBeenCalledTimes(2);

      // Advance time past TTL
      jest.advanceTimersByTime(61000);

      // Fetch a third build which triggers cache cleanup
      await manager.listArtifacts('11111');
      expect(http.get).toHaveBeenCalledTimes(3);

      // Verify expired entries were cleaned by fetching them again
      // (they should require fresh HTTP calls)
      await manager.listArtifacts('12345');
      await manager.listArtifacts('67890');
      expect(http.get).toHaveBeenCalledTimes(5);

      jest.useRealTimers();
    });
  });

  describe('Edge Cases - Uncovered Branches', () => {
    beforeEach(() => {
      configureClient();
    });

    describe('listArtifacts error handling', () => {
      it('should throw "Build not found" for 404 errors', async () => {
        const error = new Error('Not Found') as Error & {
          response?: { status: number; data: string };
        };
        error.response = { status: 404, data: 'Not Found' };
        http.get.mockRejectedValue(error);

        await expect(manager.listArtifacts('nonexistent-build')).rejects.toThrow(
          'Build not found: nonexistent-build'
        );
      });

      it('should wrap unknown errors with "Failed to fetch artifacts"', async () => {
        http.get.mockRejectedValue('raw string error');

        await expect(manager.listArtifacts('12345')).rejects.toThrow(
          'Failed to fetch artifacts: raw string error'
        );
      });

      it('should handle error objects without message property', async () => {
        const error = { response: { status: 500 } };
        http.get.mockRejectedValue(error);

        await expect(manager.listArtifacts('12345')).rejects.toThrow('Failed to fetch artifacts');
      });
    });

    describe('ensureArtifactListingResponse validation', () => {
      it('throws when artifact listing response is not an object (null)', async () => {
        http.get.mockResolvedValue({ data: null });

        await expect(manager.listArtifacts('12345')).rejects.toThrow(
          'non-object artifact listing response'
        );
      });

      it('handles array response as valid object but with undefined file property', async () => {
        // Arrays are technically objects in JavaScript, so isRecord returns true.
        // The code then treats data.file as undefined, resulting in an empty artifacts list.
        http.get.mockResolvedValue({ data: ['unexpected', 'array'] });

        const result = await manager.listArtifacts('12345');
        expect(result).toEqual([]);
      });

      it('throws when artifact listing response is not an object (primitive)', async () => {
        http.get.mockResolvedValue({ data: 42 });

        await expect(manager.listArtifacts('12345')).rejects.toThrow(
          'non-object artifact listing response'
        );
      });

      it('throws when file array contains non-object entries', async () => {
        http.get.mockResolvedValue({
          data: {
            file: [{ name: 'valid.txt', fullName: 'valid.txt', size: 10 }, 'invalid-entry'],
          },
        });

        await expect(manager.listArtifacts('12345')).rejects.toThrow('non-object file entry');
      });
    });

    describe('parseArtifacts edge cases', () => {
      it('should skip artifacts with empty resolved path', async () => {
        // File with neither fullName nor name results in empty path
        const mockArtifacts = {
          file: [
            { size: 100 }, // No name or fullName
            { name: 'valid.txt', fullName: 'valid.txt', size: 200 },
          ],
        };

        http.get.mockResolvedValue({ data: mockArtifacts });

        const result = await manager.listArtifacts('12345');

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('valid.txt');
      });

      it('should use name when fullName is missing or empty', async () => {
        const mockArtifacts = {
          file: [
            { name: 'file-with-name-only.txt', size: 100 },
            { name: 'another-file.txt', fullName: '', size: 200 },
          ],
        };

        http.get.mockResolvedValue({ data: mockArtifacts });

        const result = await manager.listArtifacts('12345');

        expect(result).toHaveLength(2);
        expect(result[0]?.path).toBe('file-with-name-only.txt');
        expect(result[1]?.path).toBe('another-file.txt');
      });

      it('should handle nested directories with missing fullName on children', async () => {
        const mockArtifacts = {
          file: [
            {
              name: 'parent',
              fullName: 'parent',
              size: 0,
              children: {
                file: [
                  { name: 'child.txt', size: 50 }, // No fullName, should inherit parent path
                ],
              },
            },
          ],
        };

        http.get.mockResolvedValue({ data: mockArtifacts });

        const result = await manager.listArtifacts('12345', { includeNested: true });

        expect(result).toHaveLength(1);
        expect(result[0]?.path).toBe('parent/child.txt');
      });
    });

    describe('downloadArtifact encoding modes', () => {
      it('should return raw buffer when encoding is "buffer"', async () => {
        const mockContent = Buffer.from([0x01, 0x02, 0x03, 0x04]);

        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'binary.dat', fullName: 'binary.dat', size: 4 }],
            },
          })
          .mockResolvedValueOnce({
            data: mockContent,
            headers: { 'content-type': 'application/octet-stream' },
          });

        const result = await manager.downloadArtifact('12345', 'binary.dat', {
          encoding: 'buffer',
        });

        expect(Buffer.isBuffer(result.content)).toBe(true);
        expect(result.content).toEqual(mockContent);
      });

      it('should handle ArrayBuffer response and convert to Buffer', async () => {
        const arrayBuffer = new ArrayBuffer(4);
        const view = new Uint8Array(arrayBuffer);
        view[0] = 0x89;
        view[1] = 0x50;
        view[2] = 0x4e;
        view[3] = 0x47;

        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'image.png', fullName: 'image.png', size: 4 }],
            },
          })
          .mockResolvedValueOnce({
            data: arrayBuffer,
            headers: { 'content-type': 'image/png' },
          });

        const result = await manager.downloadArtifact('12345', 'image.png', {
          encoding: 'base64',
        });

        expect(typeof result.content).toBe('string');
        expect(result.content).toBe(Buffer.from(arrayBuffer).toString('base64'));
      });
    });

    describe('downloadArtifact Axios error handling', () => {
      const mockArtifactListing = {
        data: {
          file: [{ name: 'file.txt', fullName: 'file.txt', size: 100 }],
        },
      };

      it('should format Axios errors with status and string data', async () => {
        const axiosError = new Error('Request failed') as Error & {
          isAxiosError: boolean;
          response?: { status: number; data: unknown };
        };
        axiosError.isAxiosError = true;
        axiosError.response = { status: 500, data: 'Internal Server Error' };

        // Make it recognized by isAxiosError
        Object.defineProperty(axiosError, 'isAxiosError', { value: true });

        http.get.mockResolvedValueOnce(mockArtifactListing).mockRejectedValueOnce(axiosError);

        await expect(manager.downloadArtifact('12345', 'file.txt')).rejects.toThrow(
          'HTTP 500: Internal Server Error'
        );
      });

      it('should format Axios errors with status and object data', async () => {
        const axiosError = new Error('Request failed') as Error & {
          isAxiosError: boolean;
          response?: { status: number; data: unknown };
        };
        axiosError.isAxiosError = true;
        axiosError.response = { status: 403, data: { error: 'Forbidden', code: 'ACCESS_DENIED' } };

        Object.defineProperty(axiosError, 'isAxiosError', { value: true });

        http.get.mockResolvedValueOnce(mockArtifactListing).mockRejectedValueOnce(axiosError);

        await expect(manager.downloadArtifact('12345', 'file.txt')).rejects.toThrow(
          'HTTP 403: {"error":"Forbidden","code":"ACCESS_DENIED"}'
        );
      });

      it('should handle Axios errors with undefined status', async () => {
        const axiosError = new Error('Network Error') as Error & {
          isAxiosError: boolean;
          response?: { status?: number; data?: unknown };
        };
        axiosError.isAxiosError = true;
        axiosError.response = {};

        Object.defineProperty(axiosError, 'isAxiosError', { value: true });

        http.get.mockResolvedValueOnce(mockArtifactListing).mockRejectedValueOnce(axiosError);

        await expect(manager.downloadArtifact('12345', 'file.txt')).rejects.toThrow('HTTP unknown');
      });

      it('should handle Axios errors with unserializable response data', async () => {
        const circularObj: Record<string, unknown> = {};
        circularObj['self'] = circularObj;

        const axiosError = new Error('Request failed') as Error & {
          isAxiosError: boolean;
          response?: { status: number; data: unknown };
        };
        axiosError.isAxiosError = true;
        axiosError.response = { status: 500, data: circularObj };

        Object.defineProperty(axiosError, 'isAxiosError', { value: true });

        http.get.mockResolvedValueOnce(mockArtifactListing).mockRejectedValueOnce(axiosError);

        await expect(manager.downloadArtifact('12345', 'file.txt')).rejects.toThrow(
          'HTTP 500: [unserializable response body]'
        );
      });

      it('should handle Axios errors with null data', async () => {
        const axiosError = new Error('Request failed') as Error & {
          isAxiosError: boolean;
          response?: { status: number; data: unknown };
        };
        axiosError.isAxiosError = true;
        axiosError.response = { status: 502, data: null };

        Object.defineProperty(axiosError, 'isAxiosError', { value: true });

        http.get.mockResolvedValueOnce(mockArtifactListing).mockRejectedValueOnce(axiosError);

        await expect(manager.downloadArtifact('12345', 'file.txt')).rejects.toThrow('HTTP 502');
      });

      it('should handle non-Axios errors that are not Error instances', async () => {
        http.get.mockResolvedValueOnce(mockArtifactListing).mockRejectedValueOnce('plain string');

        await expect(manager.downloadArtifact('12345', 'file.txt')).rejects.toThrow(
          'Failed to download artifact: Unknown error'
        );
      });
    });

    describe('isReadableStream edge cases', () => {
      it('should reject null values as non-stream', async () => {
        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'file.txt', fullName: 'file.txt', size: 10 }],
            },
          })
          .mockResolvedValueOnce({
            data: null,
          });

        await expect(
          manager.downloadArtifact('12345', 'file.txt', { encoding: 'stream' })
        ).rejects.toThrow('non-stream payload');
      });

      it('should reject objects without pipe method as non-stream', async () => {
        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'file.txt', fullName: 'file.txt', size: 10 }],
            },
          })
          .mockResolvedValueOnce({
            data: { read: jest.fn() }, // Has read but no pipe
          });

        await expect(
          manager.downloadArtifact('12345', 'file.txt', { encoding: 'stream' })
        ).rejects.toThrow('non-stream payload');
      });
    });

    describe('downloadMultipleArtifacts error message extraction', () => {
      it('should wrap errors from downloadArtifact in batch results', async () => {
        // downloadArtifact always wraps errors in Error with "Failed to download artifact:"
        // so the message extraction in downloadMultipleArtifacts will see an Error instance
        const mockArtifacts = {
          file: [{ name: 'file.txt', fullName: 'file.txt', size: 10 }],
        };

        http.get
          .mockResolvedValueOnce({ data: mockArtifacts })
          .mockRejectedValueOnce(new Error('Download failed'));

        const result = await manager.downloadMultipleArtifacts('12345', ['file.txt']);

        expect(result).toHaveLength(1);
        expect(result[0]?.error).toBe('Failed to download artifact: Download failed');
      });

      it('should handle null/undefined error values from downloadArtifact', async () => {
        const mockArtifacts = {
          file: [{ name: 'file.txt', fullName: 'file.txt', size: 10 }],
        };

        // When the error thrown is null/undefined, downloadArtifact will throw
        // "Failed to download artifact: Unknown error"
        http.get.mockResolvedValueOnce({ data: mockArtifacts }).mockRejectedValueOnce(null);

        const result = await manager.downloadMultipleArtifacts('12345', ['file.txt']);

        expect(result).toHaveLength(1);
        expect(result[0]?.error).toBe('Failed to download artifact: Unknown error');
      });
    });

    describe('pagination with offset only', () => {
      it('should apply default limit when only offset is provided', async () => {
        const mockArtifacts = {
          file: new Array(150).fill(null).map((_, i) => ({
            name: `file${i}.txt`,
            fullName: `files/file${i}.txt`,
            size: 1024,
          })),
        };

        http.get.mockResolvedValue({ data: mockArtifacts });

        const result = await manager.listArtifacts('12345', { offset: 50 });

        expect(result).toHaveLength(100); // Default limit is 100
        expect(result[0]?.name).toBe('file50.txt');
      });
    });

    describe('extension filter with leading dot', () => {
      it('should handle extension filter that already has a leading dot', async () => {
        const mockArtifacts = {
          file: [
            { name: 'app.jar', fullName: 'app.jar', size: 1000 },
            { name: 'app.war', fullName: 'app.war', size: 2000 },
          ],
        };

        http.get.mockResolvedValue({ data: mockArtifacts });

        const result = await manager.listArtifacts('12345', { extension: '.jar' });

        expect(result).toHaveLength(1);
        expect(result[0]?.name).toBe('app.jar');
      });
    });

    describe('baseUrl trailing slash handling', () => {
      it('should handle baseUrl with trailing slash', async () => {
        mockClient.getApiConfig.mockReturnValue({
          baseUrl: 'https://teamcity.example.com/',
          token: 'test-token',
          timeout: undefined,
        });

        const mockArtifacts = {
          file: [{ name: 'app.jar', fullName: 'target/app.jar', size: 1000 }],
        };

        http.get.mockResolvedValue({ data: mockArtifacts });

        const result = await manager.listArtifacts('12345');

        expect(result[0]?.downloadUrl).toBe(
          'https://teamcity.example.com/app/rest/builds/id:12345/artifacts/content/target/app.jar'
        );
      });
    });

    describe('content-type header handling', () => {
      it('should handle missing content-type header in text mode', async () => {
        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'file.txt', fullName: 'file.txt', size: 5 }],
            },
          })
          .mockResolvedValueOnce({
            data: 'hello',
            headers: {}, // No content-type
          });

        const result = await manager.downloadArtifact('12345', 'file.txt', { encoding: 'text' });

        expect(result.mimeType).toBeUndefined();
        expect(result.content).toBe('hello');
      });

      it('should handle non-string content-type header', async () => {
        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'file.txt', fullName: 'file.txt', size: 5 }],
            },
          })
          .mockResolvedValueOnce({
            data: 'hello',
            headers: { 'content-type': ['text/plain', 'charset=utf-8'] }, // Array instead of string
          });

        const result = await manager.downloadArtifact('12345', 'file.txt', { encoding: 'text' });

        expect(result.mimeType).toBeUndefined();
      });

      it('should handle missing content-type header in stream mode', async () => {
        const stream = Readable.from(['data']);

        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'file.txt', fullName: 'file.txt', size: 5 }],
            },
          })
          .mockResolvedValueOnce({
            data: stream,
            headers: {},
          });

        const result = await manager.downloadArtifact('12345', 'file.txt', { encoding: 'stream' });

        expect(result.mimeType).toBeUndefined();
        expect(result.content).toBe(stream);
      });

      it('should handle missing content-type header in buffer mode', async () => {
        http.get
          .mockResolvedValueOnce({
            data: {
              file: [{ name: 'file.bin', fullName: 'file.bin', size: 4 }],
            },
          })
          .mockResolvedValueOnce({
            data: Buffer.from([1, 2, 3, 4]),
            headers: {},
          });

        const result = await manager.downloadArtifact('12345', 'file.bin', { encoding: 'buffer' });

        expect(result.mimeType).toBeUndefined();
      });
    });
  });
});
