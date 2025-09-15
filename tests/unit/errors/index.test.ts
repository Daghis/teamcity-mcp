import {
  TeamCityAPIError,
  TeamCityAuthenticationError,
  TeamCityAuthorizationError,
  TeamCityNotFoundError,
  TeamCityValidationError,
  TeamCityRateLimitError,
  TeamCityServerError,
  TeamCityNetworkError,
  TeamCityRequestError,
  TeamCityTimeoutError,
  BuildNotFoundError,
  BuildAccessDeniedError,
  BuildConfigurationNotFoundError,
  BuildConfigurationPermissionError,
  BuildStepNotFoundError,
  PermissionDeniedError,
  ValidationError,
  isRetryableError,
  getRetryDelay,
} from '@/errors';

describe('errors module', () => {
  describe('exports', () => {
    it('exports all error classes', () => {
      expect(TeamCityAPIError).toBeDefined();
      expect(TeamCityAuthenticationError).toBeDefined();
      expect(TeamCityAuthorizationError).toBeDefined();
      expect(TeamCityNotFoundError).toBeDefined();
      expect(TeamCityValidationError).toBeDefined();
      expect(TeamCityRateLimitError).toBeDefined();
      expect(TeamCityServerError).toBeDefined();
      expect(TeamCityNetworkError).toBeDefined();
      expect(TeamCityRequestError).toBeDefined();
      expect(TeamCityTimeoutError).toBeDefined();
      expect(BuildNotFoundError).toBeDefined();
      expect(BuildAccessDeniedError).toBeDefined();
      expect(BuildConfigurationNotFoundError).toBeDefined();
      expect(BuildConfigurationPermissionError).toBeDefined();
      expect(BuildStepNotFoundError).toBeDefined();
      expect(PermissionDeniedError).toBeDefined();
      expect(ValidationError).toBeDefined();
    });

    it('exports utility functions', () => {
      expect(isRetryableError).toBeDefined();
      expect(getRetryDelay).toBeDefined();
    });
  });

  describe('error instantiation', () => {
    it('creates TeamCityAPIError instances', () => {
      const error = new TeamCityAPIError('Test error', 'TEST_ERROR', 500);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('TEST_ERROR');
    });

    it('creates TeamCityAuthenticationError instances', () => {
      const error = new TeamCityAuthenticationError('Auth failed');
      expect(error).toBeInstanceOf(TeamCityAuthenticationError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toBe('Auth failed');
      expect(error.statusCode).toBe(401);
    });

    it('creates TeamCityAuthorizationError instances', () => {
      const error = new TeamCityAuthorizationError('Access denied');
      expect(error).toBeInstanceOf(TeamCityAuthorizationError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('creates TeamCityNotFoundError instances', () => {
      const error = new TeamCityNotFoundError('Resource', '123');
      expect(error).toBeInstanceOf(TeamCityNotFoundError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toBe("Resource with identifier '123' not found");
      expect(error.statusCode).toBe(404);
    });

    it('creates TeamCityValidationError instances', () => {
      const error = new TeamCityValidationError([{ field: 'name', message: 'Invalid name' }]);
      expect(error).toBeInstanceOf(TeamCityValidationError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toContain('Validation failed');
      expect(error.statusCode).toBe(400);
    });

    it('creates TeamCityRateLimitError instances', () => {
      const error = new TeamCityRateLimitError(60);
      expect(error).toBeInstanceOf(TeamCityRateLimitError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toContain('Rate limit exceeded');
      expect(error.statusCode).toBe(429);
    });

    it('creates TeamCityServerError instances', () => {
      const error = new TeamCityServerError('Internal server error');
      expect(error).toBeInstanceOf(TeamCityServerError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toBe('Internal server error');
      expect(error.statusCode).toBe(500);
    });

    it('creates TeamCityNetworkError instances', () => {
      const error = new TeamCityNetworkError('Network error');
      expect(error).toBeInstanceOf(TeamCityNetworkError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toBe('Network error');
    });

    it('creates TeamCityRequestError instances', () => {
      const error = new TeamCityRequestError('Request failed');
      expect(error).toBeInstanceOf(TeamCityRequestError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toBe('Request failed');
    });

    it('creates TeamCityTimeoutError instances', () => {
      const error = new TeamCityTimeoutError(30000);
      expect(error).toBeInstanceOf(TeamCityTimeoutError);
      expect(error).toBeInstanceOf(TeamCityAPIError);
      expect(error.message).toContain('timed out after 30000ms');
    });

    it('creates BuildNotFoundError instances', () => {
      const error = new BuildNotFoundError('123');
      expect(error).toBeInstanceOf(BuildNotFoundError);
      expect(error).toBeInstanceOf(TeamCityNotFoundError);
      expect(error.message).toBe("Build with identifier '123' not found");
    });

    it('creates BuildAccessDeniedError instances', () => {
      const error = new BuildAccessDeniedError('Build access denied');
      expect(error).toBeInstanceOf(BuildAccessDeniedError);
      expect(error).toBeInstanceOf(TeamCityAuthorizationError);
      expect(error.message).toBe('Build access denied');
    });

    it('creates BuildConfigurationNotFoundError instances', () => {
      const error = new BuildConfigurationNotFoundError('ConfigId');
      expect(error).toBeInstanceOf(BuildConfigurationNotFoundError);
      expect(error).toBeInstanceOf(TeamCityNotFoundError);
      expect(error.message).toBe("Build Configuration with identifier 'ConfigId' not found");
    });

    it('creates BuildConfigurationPermissionError instances', () => {
      const error = new BuildConfigurationPermissionError('Config permission denied');
      expect(error).toBeInstanceOf(BuildConfigurationPermissionError);
      expect(error).toBeInstanceOf(TeamCityAuthorizationError);
      expect(error.message).toBe('Config permission denied');
    });

    it('creates BuildStepNotFoundError instances', () => {
      const error = new BuildStepNotFoundError('Step not found', 'step-123');
      expect(error).toBeInstanceOf(BuildStepNotFoundError);
      expect(error).toBeInstanceOf(TeamCityNotFoundError);
      expect(error.message).toContain('Build Step');
    });

    it('creates PermissionDeniedError instances', () => {
      const error = new PermissionDeniedError('Permission denied', 'delete');
      expect(error).toBeInstanceOf(PermissionDeniedError);
      expect(error).toBeInstanceOf(TeamCityAuthorizationError);
      expect(error.message).toContain('Permission denied');
      expect(error.message).toContain('operation: delete');
    });

    it('creates ValidationError instances', () => {
      const error = new ValidationError('Validation failed');
      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toBeInstanceOf(TeamCityValidationError);
      expect(error.message).toContain('Validation failed');
    });
  });

  describe('isRetryableError', () => {
    it('identifies retryable errors', () => {
      expect(isRetryableError(new TeamCityRateLimitError(60))).toBe(true);
      expect(isRetryableError(new TeamCityServerError('Server error'))).toBe(true);
      expect(isRetryableError(new TeamCityTimeoutError(30000))).toBe(true);
      expect(isRetryableError(new TeamCityNetworkError('Network error'))).toBe(true);
    });

    it('identifies non-retryable errors', () => {
      expect(isRetryableError(new TeamCityAuthenticationError('Auth failed'))).toBe(false);
      expect(isRetryableError(new TeamCityAuthorizationError('Access denied'))).toBe(false);
      expect(isRetryableError(new TeamCityNotFoundError('Not found'))).toBe(false);
      expect(isRetryableError(new TeamCityValidationError([{ field: 'test', message: 'invalid' }]))).toBe(false);
      expect(isRetryableError(new ValidationError('Validation failed'))).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('returns appropriate delay for retryable errors', () => {
      const delay = getRetryDelay(new TeamCityRateLimitError(60), 1);
      expect(delay).toBeGreaterThan(0);
    });

    it('returns exponential backoff delay', () => {
      const error = new TeamCityServerError('Server error');
      const delay1 = getRetryDelay(error, 1);
      const delay2 = getRetryDelay(error, 2);
      const delay3 = getRetryDelay(error, 3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });
  });
});