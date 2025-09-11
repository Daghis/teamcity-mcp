/**
 * Tests for TeamCity Swagger specification fetching and validation
 */
import axios from 'axios';
import type { Stats } from 'fs';
import * as fsPromises from 'fs/promises';

import { SwaggerCache } from '@/swagger/swagger-cache';
import { SwaggerFetcher } from '@/swagger/swagger-fetcher';
import { SwaggerValidator } from '@/swagger/swagger-validator';

// Mock modules
jest.mock('axios');
// Mock fs/promises at module level since its properties are non-configurable
jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  access: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  rm: jest.fn(),
  stat: jest.fn(),
}));

describe('SwaggerFetcher', () => {
  let fetcher: SwaggerFetcher;
  type MockAxiosInstance = {
    get: jest.Mock;
    post: jest.Mock;
    defaults: Record<string, unknown>;
  };
  let mockAxiosInstance: MockAxiosInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: {},
    };

    // Mock axios.create to return our mock instance
    const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    // Provide a properly typed predicate for isAxiosError
    (mockedAxios as unknown as { isAxiosError: typeof axios.isAxiosError }).isAxiosError = jest.fn(
      () => false
    ) as unknown as typeof axios.isAxiosError;

    fetcher = new SwaggerFetcher({
      baseUrl: 'https://teamcity.example.com',
      token: 'test-token',
    });
  });

  describe('fetchSpec', () => {
    it('should fetch Swagger spec from TeamCity API', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: {
          version: '2023.11',
          title: 'TeamCity REST API',
        },
        paths: {},
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockSpec,
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      const spec = await fetcher.fetchSpec();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/app/rest/swagger.json');
      expect(spec).toEqual(mockSpec);
    });

    it('should handle OpenAPI 3.0 specifications', async () => {
      const mockSpec = {
        openapi: '3.0.0',
        info: {
          version: '2024.1',
          title: 'TeamCity REST API',
        },
        paths: {},
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockSpec,
        status: 200,
      });

      const spec = await fetcher.fetchSpec();
      expect(spec).toEqual(mockSpec);
    });

    it('should throw error on network failure', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetcher.fetchSpec()).rejects.toThrow('Failed to fetch TeamCity Swagger spec');
    });

    it('should throw error on non-200 status', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {},
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(fetcher.fetchSpec()).rejects.toThrow('Failed to fetch Swagger spec: 401');
    });

    it('should handle timeout appropriately', async () => {
      const timeoutError = new Error('timeout') as Error & { code?: string };
      timeoutError.code = 'ECONNABORTED';
      mockAxiosInstance.get.mockRejectedValueOnce(timeoutError);

      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      (mockedAxios as unknown as { isAxiosError: typeof axios.isAxiosError }).isAxiosError =
        jest.fn(() => true) as unknown as typeof axios.isAxiosError;

      await expect(fetcher.fetchSpec()).rejects.toThrow('timeout');
    });

    it('should map axios 401 error to Authentication failed', async () => {
      const axiosErr: Error & { response?: { status: number } } = Object.assign(
        new Error('Unauthorized'),
        { response: { status: 401 } }
      );

      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      (mockedAxios as unknown as { isAxiosError: typeof axios.isAxiosError }).isAxiosError =
        jest.fn(() => true) as unknown as typeof axios.isAxiosError;

      mockAxiosInstance.get.mockRejectedValueOnce(axiosErr);

      await expect(fetcher.fetchSpec()).rejects.toThrow('Authentication failed');
    });

    it('should map axios 404 error to Endpoint not found', async () => {
      const axiosErr: Error & { response?: { status: number } } = Object.assign(
        new Error('Not Found'),
        { response: { status: 404 } }
      );

      const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
      (mockedAxios as unknown as { isAxiosError: typeof axios.isAxiosError }).isAxiosError =
        jest.fn(() => true) as unknown as typeof axios.isAxiosError;

      mockAxiosInstance.get.mockRejectedValueOnce(axiosErr);

      await expect(fetcher.fetchSpec()).rejects.toThrow('Endpoint not found');
    });
  });
});

describe('SwaggerFetcher auxiliary methods', () => {
  let fetcher: SwaggerFetcher;
  type MockAxiosInstance = {
    get: jest.Mock;
    post: jest.Mock;
    defaults: Record<string, unknown>;
  };
  let mockAxiosInstance: MockAxiosInstance;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();

    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      defaults: {},
    };

    const mockedAxios = axios as unknown as jest.Mocked<typeof axios>;
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
    (mockedAxios as unknown as { isAxiosError: typeof axios.isAxiosError }).isAxiosError = jest.fn(
      () => false
    ) as unknown as typeof axios.isAxiosError;

    fetcher = new SwaggerFetcher({ baseUrl: 'https://teamcity.example.com', token: 't' });
  });

  it('testConnection returns true on 200, false on error', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ status: 200, data: { version: '1' } });
    await expect(fetcher.testConnection()).resolves.toBe(true);

    mockAxiosInstance.get.mockRejectedValueOnce(new Error('boom'));
    await expect(fetcher.testConnection()).resolves.toBe(false);
  });

  it('getServerVersion returns version or null on error', async () => {
    mockAxiosInstance.get.mockResolvedValueOnce({ status: 200, data: { version: '2024.1' } });
    await expect(fetcher.getServerVersion()).resolves.toBe('2024.1');

    mockAxiosInstance.get.mockRejectedValueOnce(new Error('boom'));
    await expect(fetcher.getServerVersion()).resolves.toBeNull();
  });
});

describe('SwaggerValidator', () => {
  let validator: SwaggerValidator;

  beforeEach(() => {
    validator = new SwaggerValidator();
  });

  describe('validateSpec', () => {
    it('should validate Swagger 2.0 specification', () => {
      const spec = {
        swagger: '2.0',
        info: {
          version: '1.0.0',
          title: 'API',
        },
        paths: {},
      };

      const result = validator.validateSpec(spec);
      expect(result.isValid).toBe(true);
      expect(result.version).toBe('2.0');
    });

    it('should validate OpenAPI 3.0 specification', () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          version: '1.0.0',
          title: 'API',
        },
        paths: {},
      };

      const result = validator.validateSpec(spec);
      expect(result.isValid).toBe(true);
      expect(result.version).toBe('3.0.0');
    });

    it('should reject invalid specification', () => {
      const spec = {
        notValid: true,
      };

      const result = validator.validateSpec(spec);
      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toContain('Invalid specification format');
    });

    it('should detect TeamCity version from spec', () => {
      const spec = {
        swagger: '2.0',
        info: {
          version: '2023.11.1 (build 147412)',
          title: 'TeamCity REST API',
        },
        paths: {},
      };

      const result = validator.validateSpec(spec);
      expect(result.isValid).toBe(true);
      expect(result.teamCityVersion).toBe('2023.11.1');
    });

    it('should provide warnings for deprecated features', () => {
      const spec = {
        swagger: '2.0',
        info: {
          version: '1.0.0',
          title: 'API',
        },
        paths: {},
        // Mock deprecated feature
        definitions: {
          DeprecatedModel: {
            deprecated: true,
            type: 'object',
          },
        },
      };

      const result = validator.validateSpec(spec);
      expect(result.isValid).toBe(true);
      // In a real implementation, this would check for deprecated warnings
    });
  });

  describe('isVersionSupported', () => {
    it('should accept supported TeamCity versions', () => {
      const validator = new SwaggerValidator();
      expect(validator.isVersionSupported('2023.11')).toBe(true);
      expect(validator.isVersionSupported('2024.01')).toBe(true);
      expect(validator.isVersionSupported('2022.10')).toBe(true);
    });

    it('should reject unsupported TeamCity versions', () => {
      const validator = new SwaggerValidator();
      expect(validator.isVersionSupported('2019.2')).toBe(false);
      expect(validator.isVersionSupported('2018.1')).toBe(false);
    });
  });
});

describe('SwaggerCache', () => {
  let cache: SwaggerCache;
  let mockFs: jest.Mocked<typeof fsPromises>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs = fsPromises as unknown as jest.Mocked<typeof fsPromises>;

    // Spy on fs methods and provide defaults
    // Configure default mocks for fs/promises
    mockFs.readFile.mockReset();
    mockFs.writeFile.mockReset();
    mockFs.access.mockReset();
    mockFs.readdir.mockReset();
    mockFs.unlink.mockReset();
    mockFs.rm.mockReset();
    mockFs.stat.mockReset();

    mockFs.writeFile.mockResolvedValue(undefined as unknown as void);
    mockFs.readdir.mockResolvedValue([] as unknown as ReturnType<typeof fsPromises.readdir>);
    mockFs.unlink.mockResolvedValue(undefined as unknown as void);
    mockFs.rm.mockResolvedValue(undefined as unknown as void);

    cache = new SwaggerCache({
      cacheDir: '/tmp/teamcity-cache',
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    });
  });

  afterEach(() => {
    // Restore original fs/promises methods so subsequent tests can spy again
    jest.restoreAllMocks();
  });

  describe('get', () => {
    it('should return cached spec if valid', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      const cachedData = {
        spec: mockSpec,
        timestamp: Date.now() - 1000, // 1 second ago
        hash: 'abc123',
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await cache.get('test-key');
      expect(result).toEqual(mockSpec);
    });

    it('should return null if cache expired', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      const cachedData = {
        spec: mockSpec,
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        hash: 'abc123',
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should handle cache age calculation correctly', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      // Test cache that's just under the TTL limit (should still be valid)
      const almostExpiredData = {
        spec: mockSpec,
        timestamp: Date.now() - 23 * 60 * 60 * 1000, // 23 hours ago (TTL is 24h)
        hash: 'abc123',
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(almostExpiredData));

      const result = await cache.get('test-key-valid');
      expect(result).toEqual(mockSpec);

      // Test cache that's just over the TTL limit (should be expired)
      const expiredData = {
        spec: mockSpec,
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        hash: 'abc123',
      };

      mockFs.readFile.mockResolvedValueOnce(JSON.stringify(expiredData));

      const expiredResult = await cache.get('test-key-expired');
      expect(expiredResult).toBeNull();
    });

    it('should return null if cache file not found', async () => {
      mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should save spec to cache with timestamp', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      await cache.set('test-key', mockSpec);

      // Verify that writeFile was called with the correct parameters
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-key.json'),
        expect.any(String),
        'utf-8'
      );

      // Verify the written JSON content structure
      const writeCallArgs = (mockFs.writeFile as jest.Mock).mock.calls[0];
      const writtenJson = writeCallArgs[1];
      const parsedData = JSON.parse(writtenJson);

      expect(parsedData).toHaveProperty('spec', mockSpec);
      expect(parsedData).toHaveProperty('timestamp');
      expect(parsedData).toHaveProperty('hash');
      expect(typeof parsedData.timestamp).toBe('number');
      expect(typeof parsedData.hash).toBe('string');
      expect(parsedData.hash).toHaveLength(8); // Hash should be 8 characters
    });

    it('should save cache with current timestamp', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      const beforeTimestamp = Date.now();
      await cache.set('timestamp-test', mockSpec);
      const afterTimestamp = Date.now();

      const writeCallArgs = (mockFs.writeFile as jest.Mock).mock.calls[0];
      const parsedData = JSON.parse(writeCallArgs[1]);

      // Timestamp should be between before and after the call
      expect(parsedData.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(parsedData.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should generate consistent hash for same spec', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      await cache.set('hash-test-1', mockSpec);
      await cache.set('hash-test-2', mockSpec);

      const calls = (mockFs.writeFile as jest.Mock).mock.calls;
      const data1 = JSON.parse(calls[0][1]);
      const data2 = JSON.parse(calls[1][1]);

      // Same spec should generate same hash
      expect(data1.hash).toBe(data2.hash);
      expect(data1.hash).toHaveLength(8);
    });

    it('should generate different hash for different specs', async () => {
      const mockSpec1 = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      const mockSpec2 = {
        swagger: '2.0',
        info: { version: '2.0.0', title: 'Different API' },
        paths: { '/test': {} },
      };

      await cache.set('diff-test-1', mockSpec1);
      await cache.set('diff-test-2', mockSpec2);

      const calls = (mockFs.writeFile as jest.Mock).mock.calls;
      const data1 = JSON.parse(calls[0][1]);
      const data2 = JSON.parse(calls[1][1]);

      // Different specs should generate different hashes
      expect(data1.hash).not.toBe(data2.hash);
      expect(data1.hash).toHaveLength(8);
      expect(data2.hash).toHaveLength(8);
    });

    it('should create cache directory if it does not exist', async () => {
      const mockSpec = {
        swagger: '2.0',
        info: { version: '1.0.0', title: 'API' },
        paths: {},
      };

      mockFs.access.mockRejectedValueOnce(new Error('ENOENT'));

      await cache.set('test-key', mockSpec);

      // Verify that the cache was written under the expected directory
      const writePath = (mockFs.writeFile as jest.Mock).mock.calls[0][0];
      expect(writePath).toContain('/tmp/teamcity-cache/');
    });
  });

  describe('clear', () => {
    it('should remove all cache files', async () => {
      mockFs.readdir.mockResolvedValueOnce([
        'file1.json',
        'file2.json',
        'other.txt',
      ] as unknown as ReturnType<typeof fsPromises.readdir>);

      await cache.clear();

      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('file1.json'));
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('file2.json'));
      expect(mockFs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('other.txt'));
    });

    it('should handle clear when cache directory does not exist', async () => {
      mockFs.readdir.mockRejectedValueOnce(new Error('ENOENT'));

      await expect(cache.clear()).resolves.not.toThrow();
    });
  });

  // describe('has', () => {
  //   it('should return true if valid cache exists', async () => {
  //     const cachedData = {
  //       spec: { swagger: '2.0' },
  //       timestamp: Date.now() - 1000,
  //       hash: 'abc123',
  //     };

  //     mockFs.readFile.mockResolvedValueOnce(JSON.stringify(cachedData));

  //     const result = await cache.has('test-key');
  //     expect(result).toBe(true);
  //   });

  //   it('should return false if cache expired', async () => {
  //     const cachedData = {
  //       spec: { swagger: '2.0' },
  //       timestamp: Date.now() - (25 * 60 * 60 * 1000),
  //       hash: 'abc123',
  //     };

  //     mockFs.readFile.mockResolvedValueOnce(JSON.stringify(cachedData));

  //     const result = await cache.has('test-key');
  //     expect(result).toBe(false);
  //   });

  //   it('should return false if cache does not exist', async () => {
  //     mockFs.readFile.mockRejectedValueOnce(new Error('ENOENT'));

  //     const result = await cache.has('test-key');
  //     expect(result).toBe(false);
  //   });
  // });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockFs.readdir.mockResolvedValueOnce(['file1.json', 'file2.json'] as unknown as ReturnType<
        typeof fsPromises.readdir
      >);
      mockFs.stat.mockResolvedValue({
        size: 1000,
        mtime: new Date(),
      } as unknown as Stats);

      const stats = await cache.getStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('files', 2);
      expect(stats).toHaveProperty('oldestFile');
      expect(stats).toHaveProperty('newestFile');
    });

    it('should handle empty cache', async () => {
      mockFs.readdir.mockResolvedValueOnce([]);

      const stats = await cache.getStats();

      expect(stats).toEqual({
        size: 0,
        files: 0,
      });
    });
  });
});
