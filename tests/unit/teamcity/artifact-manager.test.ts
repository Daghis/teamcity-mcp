/**
 * Tests for ArtifactManager
 */
import { ArtifactManager } from '@/teamcity/artifact-manager';

import {
  type MockTeamCityClient,
  createMockTeamCityClient,
} from '../../test-utils/mock-teamcity-client';

describe('ArtifactManager', () => {
  let manager: ArtifactManager;
  let mockClient: MockTeamCityClient;
  let http: jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
  const BASE_URL = 'https://teamcity.example.com';

  const configureClient = () => {
    mockClient = createMockTeamCityClient();
    http = mockClient.http as jest.Mocked<ReturnType<MockTeamCityClient['getAxios']>>;
    http.get.mockReset();
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
          data: mockContent,
          headers: { 'content-type': 'text/plain' },
        });

      const result = await manager.downloadArtifact('12345', 'hello.txt', {
        encoding: 'base64',
      });

      expect(result.content).toBe(base64Content);
      expect(result.mimeType).toBe('text/plain');
      expect(result.size).toBe(13);
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

      // Since Promise.allSettled runs in parallel, all listArtifacts calls happen first,
      // then all download calls happen
      http.get
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts for file1
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts for file2
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts for file3
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

    it('should handle partial batch download failures', async () => {
      const mockArtifacts = {
        file: [
          { name: 'file1.txt', fullName: 'file1.txt', size: 10 },
          { name: 'file2.txt', fullName: 'file2.txt', size: 20 },
        ],
      };

      // Since Promise.allSettled runs in parallel, all listArtifacts calls happen first
      http.get
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts for file1
        .mockResolvedValueOnce({ data: mockArtifacts }) // listArtifacts for file2
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
      http.get.mockResolvedValueOnce({
        data: { file: [] },
      });

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
  });
});
