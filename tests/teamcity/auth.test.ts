/**
 * Tests for TeamCity authentication utilities
 */
import {
  type AxiosError,
  type AxiosResponse,
  AxiosHeaders as Headers,
  type InternalAxiosRequestConfig,
} from 'axios';

import {
  addRequestId,
  extractErrorDetails,
  generateRequestId,
  logAndTransformError,
  logResponse,
  validateConfiguration,
  validateServerUrl,
  validateToken,
} from '@/teamcity/auth';
import * as logger from '@/utils/logger';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('TeamCity Authentication Utilities', () => {
  describe('generateRequestId', () => {
    it('should generate a unique UUID', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(id1).not.toBe(id2);
    });
  });

  describe('addRequestId', () => {
    it('should add request ID to headers and config', () => {
      const config: InternalAxiosRequestConfig = {
        url: '/test',
        method: 'get',
        headers: new Headers(),
      };

      const result = addRequestId(config);

      expect(result.headers['X-Request-ID']).toBeDefined();
      expect(result.headers['X-Request-ID']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect((result as unknown as { requestId?: string }).requestId).toBe(
        result.headers['X-Request-ID']
      );
    });

    it('should log request with redacted authorization', () => {
      const { info } = logger;
      const headers = new Headers();
      headers.set('Authorization', 'Bearer secret-token');
      const config: InternalAxiosRequestConfig = {
        url: '/test',
        method: 'get',
        headers,
      };

      addRequestId(config);

      expect(info).toHaveBeenCalledWith(
        'Starting TeamCity API request',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: '[REDACTED]',
          }),
        })
      );
    });
  });

  describe('extractErrorDetails', () => {
    it('should extract details from response error', () => {
      const error = {
        config: { requestId: 'test-123' },
        response: {
          status: 404,
          data: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
            details: 'Build with ID 123 not found',
          },
        },
        message: 'Not Found',
      } as unknown as AxiosError;

      const result = extractErrorDetails(error);

      expect(result).toEqual({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        details: 'Build with ID 123 not found',
        requestId: 'test-123',
        statusCode: 404,
        originalError: error,
      });
    });

    it('should handle network errors', () => {
      const error = {
        config: { requestId: 'test-456' },
        request: {},
        message: 'Network Error',
      } as unknown as AxiosError;

      const result = extractErrorDetails(error);

      expect(result).toEqual({
        code: 'NO_RESPONSE',
        message: 'No response received from TeamCity server',
        details: 'Network Error',
        requestId: 'test-456',
        originalError: error,
      });
    });

    it('should handle request setup errors', () => {
      const error = {
        config: { requestId: 'test-789' },
        message: 'Invalid URL',
      } as unknown as AxiosError;

      const result = extractErrorDetails(error);

      expect(result).toEqual({
        code: 'REQUEST_SETUP_ERROR',
        message: 'Error setting up the request',
        details: 'Invalid URL',
        requestId: 'test-789',
        originalError: error,
      });
    });
  });

  describe('validateToken', () => {
    it('should accept valid tokens', () => {
      expect(validateToken('abc123')).toBe(true);
      expect(validateToken('ABC-123_456')).toBe(true);
      expect(validateToken('dXNlcjpwYXNzd29yZA==')).toBe(true); // Base64
    });

    it('should reject invalid tokens', () => {
      expect(validateToken('')).toBe(false);
      expect(validateToken('token with spaces')).toBe(false);
      expect(validateToken('token@with#invalid$chars')).toBe(false);
    });
  });

  describe('validateServerUrl', () => {
    it('should accept valid URLs', () => {
      expect(validateServerUrl('https://teamcity.example.com')).toBe(true);
      expect(validateServerUrl('http://localhost:8111')).toBe(true);
      expect(validateServerUrl('https://tc.company.net:8443')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(validateServerUrl('')).toBe(false);
      expect(validateServerUrl('not-a-url')).toBe(false);
      expect(validateServerUrl('ftp://teamcity.com')).toBe(false);
      expect(validateServerUrl('teamcity.com')).toBe(false); // Missing protocol
    });
  });

  describe('validateConfiguration', () => {
    it('should validate correct configuration', () => {
      const result = validateConfiguration('https://teamcity.example.com', 'valid-token-123');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report invalid URL', () => {
      const result = validateConfiguration('invalid-url', 'valid-token-123');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid TeamCity server URL');
    });

    it('should report invalid token', () => {
      const result = validateConfiguration('https://teamcity.example.com', '');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid TeamCity authentication token');
    });

    it('should report multiple errors', () => {
      const result = validateConfiguration('invalid-url', 'invalid token with spaces');

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Invalid TeamCity server URL');
      expect(result.errors).toContain('Invalid TeamCity authentication token');
    });
  });

  describe('logResponse', () => {
    it('should log response details and return unchanged', () => {
      const { info } = logger;
      const response: AxiosResponse = {
        config: {
          requestId: 'test-123',
          method: 'get',
          url: '/test',
        } as unknown as InternalAxiosRequestConfig,
        status: 200,
        statusText: 'OK',
        headers: {
          'x-response-time': '123ms',
        },
        data: { result: 'success' },
      };

      const result = logResponse(response);

      expect(result).toBe(response);
      expect(info).toHaveBeenCalledWith(
        'TeamCity API request completed',
        expect.objectContaining({
          requestId: 'test-123',
          method: 'GET',
          url: '/test',
          status: 200,
          duration: '123ms',
        })
      );
    });
  });

  describe('logAndTransformError', () => {
    it('should log error and reject with TeamCityAPIError', async () => {
      const { error } = logger;
      const axiosError = {
        config: { requestId: 'test-456' },
        response: {
          status: 500,
          data: {
            code: 'SERVER_ERROR',
            message: 'Internal server error',
          },
        },
        message: 'Request failed',
      } as unknown as AxiosError;

      await expect(logAndTransformError(axiosError)).rejects.toEqual(
        expect.objectContaining({
          code: 'SERVER_ERROR',
          message: 'Internal server error',
          requestId: 'test-456',
          statusCode: 500,
        })
      );

      expect(error).toHaveBeenCalledWith(
        'TeamCity API request failed',
        undefined,
        expect.objectContaining({
          requestId: 'test-456',
          code: 'SERVER_ERROR',
          statusCode: 500,
        })
      );
    });
  });
});
