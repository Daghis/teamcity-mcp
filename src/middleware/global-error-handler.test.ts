/**
 * Global error handler tests
 */
import { AxiosError } from 'axios';

import { errorLogger } from '@/utils/error-logger';

import { MCPTeamCityError, MCPTimeoutError, MCPToolError } from './error';
import { GlobalErrorHandler, globalErrorHandler } from './global-error-handler';

// Mock the error logger
jest.mock('@/utils/error-logger', () => ({
  errorLogger: {
    logError: jest.fn(),
  },
}));

const mockErrorLogger = errorLogger.logError as jest.MockedFunction<typeof errorLogger.logError>;

describe('GlobalErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton
    (GlobalErrorHandler as unknown as { instance?: GlobalErrorHandler }).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = GlobalErrorHandler.getInstance();
      const instance2 = GlobalErrorHandler.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should use provided options', () => {
      const options = { includeStackTrace: false };
      const instance = GlobalErrorHandler.getInstance(options);
      expect(instance).toBeInstanceOf(GlobalErrorHandler);
    });
  });

  describe('handleToolError', () => {
    let handler: GlobalErrorHandler;

    beforeEach(() => {
      handler = new GlobalErrorHandler();
    });

    it('should handle MCPToolError', () => {
      const mcpError = new MCPToolError('Tool error', 'TEST_CODE', 400);
      const result = handler.handleToolError(mcpError, 'test-tool');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TEST_CODE');
      expect(result.error.message).toBe('Tool error');
      expect(mockErrorLogger).toHaveBeenCalled();
    });

    it('should handle AxiosError', () => {
      const axiosError = new AxiosError('Request failed');
      axiosError.response = {
        status: 404,
        data: { message: 'Not found' },
        statusText: 'Not Found',
        headers: {},
        config: {} as never,
      };

      const result = handler.handleToolError(axiosError, 'test-tool');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TEAMCITY_ERROR');
      expect(mockErrorLogger).toHaveBeenCalled();
    });

    it('should handle timeout errors', () => {
      const timeoutError = new Error('Operation timeout');
      const result = handler.handleToolError(timeoutError, 'test-tool');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('TIMEOUT_ERROR');
    });

    it('should handle rate limit errors', () => {
      const rateLimitError = new Error('rate limit exceeded');
      const result = handler.handleToolError(rateLimitError, 'test-tool');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('RATE_LIMIT_ERROR');
    });

    it('should handle unknown errors', () => {
      const unknownError = 'string error';
      const result = handler.handleToolError(unknownError, 'test-tool');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INTERNAL_ERROR');
    });

    it('should not log when logging disabled', () => {
      const handlerNoLog = new GlobalErrorHandler({ logErrors: false });
      const error = new Error('Test error');

      handlerNoLog.handleToolError(error, 'test-tool');

      expect(mockErrorLogger).not.toHaveBeenCalled();
    });
  });

  describe('handleAsyncError', () => {
    let handler: GlobalErrorHandler;

    beforeEach(() => {
      handler = new GlobalErrorHandler();
    });

    it('should transform and re-throw error', () => {
      const error = new Error('Async error');

      expect(() => {
        handler.handleAsyncError(error, 'async-operation');
      }).toThrow('Async error');

      expect(mockErrorLogger).toHaveBeenCalled();
    });

    it('should handle AxiosError in async context', () => {
      const axiosError = new AxiosError('Async request failed');
      axiosError.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as never,
      };

      expect(() => {
        handler.handleAsyncError(axiosError, 'async-operation');
      }).toThrow(MCPTeamCityError);
    });
  });

  describe('transformAxiosError', () => {
    let handler: GlobalErrorHandler;

    beforeEach(() => {
      handler = new GlobalErrorHandler();
    });

    it('should extract TeamCity error details', () => {
      const axiosError = new AxiosError('Request failed');
      axiosError.response = {
        status: 400,
        data: {
          message: 'Build configuration not found',
          errorCode: 'BC_NOT_FOUND',
        },
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
      };

      const result = handler.handleToolError(axiosError, 'test-tool');

      expect(result.success).toBe(false);
      expect(result.error.message).toBe('Build configuration not found');
      expect(result.error.data).toMatchObject({
        teamCityCode: 'BC_NOT_FOUND',
      });
    });
  });

  describe('sanitizeErrorMessage', () => {
    let handler: GlobalErrorHandler;

    beforeEach(() => {
      handler = new GlobalErrorHandler({ sanitizeErrors: true });
    });

    it('should sanitize sensitive information', () => {
      const sensitiveError = new Error('Failed with token=abc123 and password=secret');
      const result = handler.handleToolError(sensitiveError, 'test-tool');

      expect(result.error.message).toBe('Failed with token=*** and password=***');
    });

    it('should not sanitize in non-production mode', () => {
      const handlerNoSanitize = new GlobalErrorHandler({ sanitizeErrors: false });
      const sensitiveError = new Error('Failed with token=abc123');
      const result = handlerNoSanitize.handleToolError(sensitiveError, 'test-tool');

      expect(result.error.message).toBe('Failed with token=abc123');
    });
  });

  describe('isRetryableError', () => {
    let handler: GlobalErrorHandler;

    beforeEach(() => {
      handler = new GlobalErrorHandler();
    });

    it('should identify retryable TeamCity errors', () => {
      const retryableError = new MCPTeamCityError('Server error', 500);
      expect(handler.isRetryableError(retryableError)).toBe(true);

      const nonRetryableError = new MCPTeamCityError('Bad request', 400);
      expect(handler.isRetryableError(nonRetryableError)).toBe(false);
    });

    it('should identify retryable timeout errors', () => {
      const timeoutError = new MCPTimeoutError('operation', 5000);
      expect(handler.isRetryableError(timeoutError)).toBe(true);
    });

    it('should identify retryable network errors', () => {
      const networkError = new AxiosError('Network error');
      expect(handler.isRetryableError(networkError)).toBe(true);
    });

    it('should not retry client errors', () => {
      const axiosError = new AxiosError('Client error');
      axiosError.response = {
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as never,
      };

      expect(handler.isRetryableError(axiosError)).toBe(false);
    });
  });
});

describe('globalErrorHandler singleton', () => {
  it('should be available as singleton', () => {
    expect(globalErrorHandler).toBeInstanceOf(GlobalErrorHandler);
  });
});
