/**
 * Tests for TeamCity error handling
 */
import type { AxiosError } from 'axios';

import {
  TeamCityAPIError,
  TeamCityAuthenticationError,
  TeamCityAuthorizationError,
  TeamCityNetworkError,
  TeamCityNotFoundError,
  TeamCityRateLimitError,
  TeamCityRequestError,
  TeamCityServerError,
  TeamCityTimeoutError,
  TeamCityValidationError,
  getRetryDelay,
  isRetryableError,
} from '@/teamcity/errors';

describe('TeamCity Error Classes', () => {
  describe('TeamCityAPIError', () => {
    it('should create error with all properties', () => {
      const error = new TeamCityAPIError(
        'Test error',
        'TEST_ERROR',
        500,
        { detail: 'test' },
        'req-123',
        new Error('Original')
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.requestId).toBe('req-123');
      expect(error.originalError).toBeDefined();
      expect(error.name).toBe('TeamCityAPIError');
    });

    it('should create from Axios error with response', () => {
      const axiosError = {
        response: {
          status: 404,
          data: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
          },
        },
        message: 'Not found',
      } as AxiosError;

      const error = TeamCityAPIError.fromAxiosError(axiosError, 'req-456');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.requestId).toBe('req-456');
    });

    it('should create from Axios error without response', () => {
      const axiosError = {
        request: {},
        message: 'Network error',
      } as AxiosError;

      const error = TeamCityAPIError.fromAxiosError(axiosError, 'req-789');

      expect(error).toBeInstanceOf(TeamCityNetworkError);
      expect(error.message).toBe('Network error');
      expect(error.requestId).toBe('req-789');
    });

    it('should create from Axios error without request', () => {
      const axiosError = {
        message: 'Config error',
      } as AxiosError;

      const error = TeamCityAPIError.fromAxiosError(axiosError, 'req-000');

      expect(error).toBeInstanceOf(TeamCityRequestError);
      expect(error.message).toBe('Config error');
      expect(error.requestId).toBe('req-000');
    });

    it('should serialize to JSON', () => {
      const error = new TeamCityAPIError('Test', 'TEST', 500, { foo: 'bar' }, 'req-123');
      const json = error.toJSON();

      expect(json).toHaveProperty('name', 'TeamCityAPIError');
      expect(json).toHaveProperty('code', 'TEST');
      expect(json).toHaveProperty('message', 'Test');
      expect(json).toHaveProperty('statusCode', 500);
      expect(json).toHaveProperty('details', { foo: 'bar' });
      expect(json).toHaveProperty('requestId', 'req-123');
      expect(json).toHaveProperty('stack');
    });
  });

  describe('Specific Error Classes', () => {
    it('should create TeamCityAuthenticationError', () => {
      const error = new TeamCityAuthenticationError('Invalid token', 'req-123');

      expect(error.name).toBe('TeamCityAuthenticationError');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid token');
    });

    it('should create TeamCityAuthorizationError', () => {
      const error = new TeamCityAuthorizationError('Forbidden', 'req-123');

      expect(error.name).toBe('TeamCityAuthorizationError');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.statusCode).toBe(403);
    });

    it('should create TeamCityNotFoundError', () => {
      const error = new TeamCityNotFoundError('Build', '123', 'req-123');

      expect(error.name).toBe('TeamCityNotFoundError');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe("Build with identifier '123' not found");
    });

    it('should create TeamCityValidationError', () => {
      const validationErrors = [
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email' },
      ];
      const error = new TeamCityValidationError(validationErrors, 'req-123');

      expect(error.name).toBe('TeamCityValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Validation failed: Name is required, Invalid email');
      expect(error.validationErrors).toEqual(validationErrors);
    });

    it('should create TeamCityRateLimitError', () => {
      const error = new TeamCityRateLimitError(60, 'req-123');

      expect(error.name).toBe('TeamCityRateLimitError');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Rate limit exceeded. Retry after 60 seconds');
      expect(error.retryAfter).toBe(60);
    });

    it('should create TeamCityServerError', () => {
      const error = new TeamCityServerError('Internal error', 503, 'req-123');

      expect(error.name).toBe('TeamCityServerError');
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.statusCode).toBe(503);
    });

    it('should create TeamCityTimeoutError', () => {
      const error = new TeamCityTimeoutError(30000, 'req-123');

      expect(error.name).toBe('TeamCityTimeoutError');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.message).toBe('Request timed out after 30000ms');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(new TeamCityNetworkError())).toBe(true);
      expect(isRetryableError(new TeamCityTimeoutError(30000))).toBe(true);
      expect(isRetryableError(new TeamCityServerError())).toBe(true);
      expect(isRetryableError(new TeamCityRateLimitError())).toBe(true);
      expect(isRetryableError(new TeamCityAPIError('', '', 503))).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(isRetryableError(new TeamCityAuthenticationError())).toBe(false);
      expect(isRetryableError(new TeamCityAuthorizationError())).toBe(false);
      expect(isRetryableError(new TeamCityNotFoundError('Build'))).toBe(false);
      expect(isRetryableError(new TeamCityValidationError([]))).toBe(false);
      expect(isRetryableError(new TeamCityRequestError())).toBe(false);
      expect(isRetryableError(new Error('Generic error'))).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should use retry-after for rate limit errors', () => {
      const error = new TeamCityRateLimitError(120);
      const delay = getRetryDelay(error, 1);

      expect(delay).toBe(120000); // 120 seconds in ms
    });

    it('should use exponential backoff for other errors', () => {
      const error = new TeamCityServerError();

      const delay1 = getRetryDelay(error, 1, 1000);
      const delay2 = getRetryDelay(error, 2, 1000);
      const delay3 = getRetryDelay(error, 3, 1000);

      // Base delays should be 1000, 2000, 4000 (plus jitter)
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(2000);

      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(3000);

      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(5000);
    });

    it('should cap delay at 30 seconds', () => {
      const error = new TeamCityServerError();
      const delay = getRetryDelay(error, 10, 1000); // Very high attempt number

      expect(delay).toBeLessThanOrEqual(30000);
    });
  });
});
