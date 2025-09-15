/**
 * Tests for errors module exports
 */
import { describe, it, expect } from '@jest/globals';

import * as errors from '@/errors';

describe('Errors Module', () => {
  describe('exports', () => {
    it('should export TeamCityAPIError', () => {
      expect(errors.TeamCityAPIError).toBeDefined();
      expect(typeof errors.TeamCityAPIError).toBe('function');
    });

    it('should export TeamCityAuthenticationError', () => {
      expect(errors.TeamCityAuthenticationError).toBeDefined();
      expect(typeof errors.TeamCityAuthenticationError).toBe('function');
    });

    it('should export TeamCityAuthorizationError', () => {
      expect(errors.TeamCityAuthorizationError).toBeDefined();
      expect(typeof errors.TeamCityAuthorizationError).toBe('function');
    });

    it('should export TeamCityNotFoundError', () => {
      expect(errors.TeamCityNotFoundError).toBeDefined();
      expect(typeof errors.TeamCityNotFoundError).toBe('function');
    });

    it('should export TeamCityValidationError', () => {
      expect(errors.TeamCityValidationError).toBeDefined();
      expect(typeof errors.TeamCityValidationError).toBe('function');
    });

    it('should export TeamCityRateLimitError', () => {
      expect(errors.TeamCityRateLimitError).toBeDefined();
      expect(typeof errors.TeamCityRateLimitError).toBe('function');
    });

    it('should export TeamCityServerError', () => {
      expect(errors.TeamCityServerError).toBeDefined();
      expect(typeof errors.TeamCityServerError).toBe('function');
    });

    it('should export TeamCityNetworkError', () => {
      expect(errors.TeamCityNetworkError).toBeDefined();
      expect(typeof errors.TeamCityNetworkError).toBe('function');
    });

    it('should export TeamCityRequestError', () => {
      expect(errors.TeamCityRequestError).toBeDefined();
      expect(typeof errors.TeamCityRequestError).toBe('function');
    });

    it('should export TeamCityTimeoutError', () => {
      expect(errors.TeamCityTimeoutError).toBeDefined();
      expect(typeof errors.TeamCityTimeoutError).toBe('function');
    });

    it('should export BuildNotFoundError', () => {
      expect(errors.BuildNotFoundError).toBeDefined();
      expect(typeof errors.BuildNotFoundError).toBe('function');
    });

    it('should export BuildAccessDeniedError', () => {
      expect(errors.BuildAccessDeniedError).toBeDefined();
      expect(typeof errors.BuildAccessDeniedError).toBe('function');
    });

    it('should export BuildConfigurationNotFoundError', () => {
      expect(errors.BuildConfigurationNotFoundError).toBeDefined();
      expect(typeof errors.BuildConfigurationNotFoundError).toBe('function');
    });

    it('should export BuildConfigurationPermissionError', () => {
      expect(errors.BuildConfigurationPermissionError).toBeDefined();
      expect(typeof errors.BuildConfigurationPermissionError).toBe('function');
    });

    it('should export BuildStepNotFoundError', () => {
      expect(errors.BuildStepNotFoundError).toBeDefined();
      expect(typeof errors.BuildStepNotFoundError).toBe('function');
    });

    it('should export PermissionDeniedError', () => {
      expect(errors.PermissionDeniedError).toBeDefined();
      expect(typeof errors.PermissionDeniedError).toBe('function');
    });

    it('should export ValidationError', () => {
      expect(errors.ValidationError).toBeDefined();
      expect(typeof errors.ValidationError).toBe('function');
    });

    it('should export isRetryableError function', () => {
      expect(errors.isRetryableError).toBeDefined();
      expect(typeof errors.isRetryableError).toBe('function');
    });

    it('should export getRetryDelay function', () => {
      expect(errors.getRetryDelay).toBeDefined();
      expect(typeof errors.getRetryDelay).toBe('function');
    });
  });

  describe('error instantiation', () => {
    it('should create TeamCityAPIError instance', () => {
      const error = new errors.TeamCityAPIError('Test error', 500);
      expect(error).toBeInstanceOf(errors.TeamCityAPIError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
    });

    it('should create TeamCityNotFoundError instance', () => {
      const error = new errors.TeamCityNotFoundError('Resource not found');
      expect(error).toBeInstanceOf(errors.TeamCityNotFoundError);
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create BuildNotFoundError instance', () => {
      const error = new errors.BuildNotFoundError('build123');
      expect(error).toBeInstanceOf(errors.BuildNotFoundError);
      expect(error.message).toContain('build123');
    });

    it('should create ValidationError instance', () => {
      const error = new errors.ValidationError('Invalid input');
      expect(error).toBeInstanceOf(errors.ValidationError);
      expect(error.message).toBe('Invalid input');
    });
  });

  describe('error utilities', () => {
    it('should identify retryable errors', () => {
      const retryableError = new errors.TeamCityServerError('Server error', 503);
      const nonRetryableError = new errors.TeamCityValidationError('Bad request');

      expect(errors.isRetryableError(retryableError)).toBe(true);
      expect(errors.isRetryableError(nonRetryableError)).toBe(false);
    });

    it('should calculate retry delay', () => {
      const error = new errors.TeamCityRateLimitError('Rate limited', 60);
      const delay = errors.getRetryDelay(error, 1);

      // Should respect retry-after header
      expect(delay).toBeGreaterThan(0);
    });

    it('should handle network errors', () => {
      const error = new errors.TeamCityNetworkError('Connection failed');
      expect(error).toBeInstanceOf(errors.TeamCityNetworkError);
      expect(errors.isRetryableError(error)).toBe(true);
    });

    it('should handle timeout errors', () => {
      const error = new errors.TeamCityTimeoutError('Request timeout');
      expect(error).toBeInstanceOf(errors.TeamCityTimeoutError);
      expect(errors.isRetryableError(error)).toBe(true);
    });
  });

  describe('error hierarchy', () => {
    it('should maintain proper error inheritance', () => {
      const authError = new errors.TeamCityAuthenticationError('Auth failed');
      const authzError = new errors.TeamCityAuthorizationError('Not authorized');
      
      expect(authError).toBeInstanceOf(errors.TeamCityAPIError);
      expect(authzError).toBeInstanceOf(errors.TeamCityAPIError);
      expect(authError).toBeInstanceOf(Error);
      expect(authzError).toBeInstanceOf(Error);
    });

    it('should have correct status codes', () => {
      const authError = new errors.TeamCityAuthenticationError('Auth failed');
      const authzError = new errors.TeamCityAuthorizationError('Not authorized');
      const notFoundError = new errors.TeamCityNotFoundError('Not found');
      
      expect(authError.statusCode).toBe(401);
      expect(authzError.statusCode).toBe(403);
      expect(notFoundError.statusCode).toBe(404);
    });
  });
});