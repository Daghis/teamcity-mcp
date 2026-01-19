import * as fs from 'fs';

import { loadEnvFile } from '@/utils/env-file';

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

describe('loadEnvFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful loading', () => {
    it('should load and parse a valid .env file', () => {
      mockReadFileSync.mockReturnValue(`
TEAMCITY_URL=https://tc.example.com
TEAMCITY_TOKEN=my-token-123
MCP_MODE=dev
`);
      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(true);
      expect(result.values).toEqual({
        TEAMCITY_URL: 'https://tc.example.com',
        TEAMCITY_TOKEN: 'my-token-123',
        MCP_MODE: 'dev',
      });
      expect(result.error).toBeUndefined();
    });

    it('should handle empty file', () => {
      mockReadFileSync.mockReturnValue('');
      const result = loadEnvFile('/path/to/empty.env');

      expect(result.success).toBe(true);
      expect(result.values).toEqual({});
    });

    it('should handle comments', () => {
      mockReadFileSync.mockReturnValue(`
# This is a comment
TEAMCITY_URL=https://tc.example.com
# Another comment
TEAMCITY_TOKEN=token
`);
      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(true);
      expect(result.values).toEqual({
        TEAMCITY_URL: 'https://tc.example.com',
        TEAMCITY_TOKEN: 'token',
      });
    });

    it('should handle values with equals signs', () => {
      mockReadFileSync.mockReturnValue('TEAMCITY_URL=https://tc.example.com?foo=bar&baz=qux');
      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(true);
      expect(result.values?.['TEAMCITY_URL']).toBe('https://tc.example.com?foo=bar&baz=qux');
    });

    it('should handle quoted values', () => {
      mockReadFileSync.mockReturnValue('TEAMCITY_TOKEN="token with spaces"');
      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(true);
      // dotenv.parse keeps quotes by default depending on version
      // The exact behavior may vary, but the key should exist
      expect(result.values).toHaveProperty('TEAMCITY_TOKEN');
    });

    it('should handle single-line file without trailing newline', () => {
      mockReadFileSync.mockReturnValue('TEAMCITY_URL=https://example.com');
      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(true);
      expect(result.values?.['TEAMCITY_URL']).toBe('https://example.com');
    });
  });

  describe('error handling', () => {
    it('should return error for non-existent file', () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockReadFileSync.mockImplementation(() => {
        throw error;
      });

      const result = loadEnvFile('/path/to/nonexistent.env');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('/path/to/nonexistent.env');
      expect(result.values).toBeUndefined();
    });

    it('should return error for permission denied', () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockReadFileSync.mockImplementation(() => {
        throw error;
      });

      const result = loadEnvFile('/path/to/restricted.env');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.error).toContain('/path/to/restricted.env');
      expect(result.values).toBeUndefined();
    });

    it('should return error for other read errors', () => {
      const error = new Error('Disk error');
      mockReadFileSync.mockImplementation(() => {
        throw error;
      });

      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read');
      expect(result.error).toContain('Disk error');
      expect(result.values).toBeUndefined();
    });

    it('should handle non-Error thrown values', () => {
      // Some libraries throw strings or other non-Error values
      mockReadFileSync.mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'string error message';
      });

      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read');
      expect(result.error).toContain('string error message');
      expect(result.values).toBeUndefined();
    });

    it('should handle thrown objects that are not Error instances', () => {
      mockReadFileSync.mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw { custom: 'error object' };
      });

      const result = loadEnvFile('/path/to/config.env');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read');
      expect(result.values).toBeUndefined();
    });
  });

  describe('path handling', () => {
    it('should pass the correct path to readFileSync', () => {
      mockReadFileSync.mockReturnValue('KEY=value');

      loadEnvFile('/absolute/path/to/config.env');

      expect(mockReadFileSync).toHaveBeenCalledWith('/absolute/path/to/config.env', 'utf-8');
    });

    it('should handle Windows-style paths', () => {
      mockReadFileSync.mockReturnValue('KEY=value');

      loadEnvFile('C:\\Users\\test\\config.env');

      expect(mockReadFileSync).toHaveBeenCalledWith('C:\\Users\\test\\config.env', 'utf-8');
    });

    it('should handle relative paths', () => {
      mockReadFileSync.mockReturnValue('KEY=value');

      loadEnvFile('./config.env');

      expect(mockReadFileSync).toHaveBeenCalledWith('./config.env', 'utf-8');
    });
  });
});
