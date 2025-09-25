/**
 * Error handling middleware tests
 */
import { z } from 'zod';

import {
  MCPAuthError,
  MCPNotFoundError,
  MCPToolError,
  MCPValidationError,
  asyncHandler,
  formatError,
  retry,
  safeJsonParse,
} from './error';

describe('Error Classes', () => {
  describe('MCPToolError', () => {
    it('should create error with default values', () => {
      const error = new MCPToolError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TOOL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('MCPToolError');
      expect(error.data).toBeUndefined();
    });

    it('should create error with custom values', () => {
      const testData = { detail: 'Custom data' };
      const error = new MCPToolError('Custom error', 'CUSTOM_CODE', 400, testData);
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.data).toEqual(testData);
    });

    it('should capture stack trace', () => {
      const error = new MCPToolError('Test error');
      expect(error.stack).toBeDefined();
    });
  });

  describe('MCPValidationError', () => {
    it('should create validation error', () => {
      let zodError: z.ZodError;
      try {
        z.string().parse(123);
        throw new Error('Expected schema parsing to fail');
      } catch (error) {
        zodError = error as z.ZodError;
      }

      const error = new MCPValidationError('Validation failed', zodError);
      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('MCPValidationError');
      expect(error.data).toEqual(zodError.issues);
    });
  });

  describe('MCPAuthError', () => {
    it('should create auth error', () => {
      const error = new MCPAuthError('Authentication failed');
      expect(error.message).toBe('Authentication failed');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('MCPAuthError');
    });
  });

  describe('MCPNotFoundError', () => {
    it('should create not found error', () => {
      const error = new MCPNotFoundError('User');
      expect(error.message).toBe('User not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('MCPNotFoundError');
    });
  });
});

describe('formatError', () => {
  it('should format MCPToolError correctly', () => {
    const error = new MCPToolError('Tool error', 'CUSTOM_CODE', 400, { key: 'value' });
    const result = formatError(error);

    expect(result).toEqual({
      success: false,
      error: {
        message: 'Tool error',
        code: 'CUSTOM_CODE',
        data: { key: 'value' },
      },
    });
  });

  it('should format ZodError correctly', () => {
    let zodError: z.ZodError;
    try {
      z.object({ field: z.string() }).parse({ field: 123 });
      throw new Error('Expected schema parsing to fail');
    } catch (error) {
      zodError = error as z.ZodError;
    }

    const result = formatError(zodError);

    expect(result).toEqual({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        data: zodError.issues,
      },
    });
  });

  it('should format generic Error correctly', () => {
    const error = new Error('Generic error');
    const result = formatError(error);

    expect(result).toEqual({
      success: false,
      error: {
        message: 'Generic error',
        code: 'INTERNAL_ERROR',
      },
    });
  });

  it('should format unknown error correctly', () => {
    const result = formatError('string error');

    expect(result).toEqual({
      success: false,
      error: {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      },
    });
  });

  it('should format null/undefined error correctly', () => {
    expect(formatError(null)).toEqual({
      success: false,
      error: {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      },
    });

    expect(formatError(undefined)).toEqual({
      success: false,
      error: {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      },
    });
  });
});

describe('asyncHandler', () => {
  it('should handle successful async function', async () => {
    const handler = asyncHandler(async (...args: unknown[]) => {
      const value = args[0] as number;
      return value * 2;
    });
    const result = await handler(5);
    expect(result).toBe(10);
  });

  it('should catch and re-throw errors', async () => {
    const testError = new Error('Test error');
    const handler = asyncHandler(async () => {
      throw testError;
    });

    await expect(handler()).rejects.toThrow('Test error');
  });

  it('should handle non-Error throws', async () => {
    const handler = asyncHandler(async () => {
      throw new Error('String error');
    });

    await expect(handler()).rejects.toThrow('String error');
  });
});

describe('safeJsonParse', () => {
  it('should parse valid JSON', () => {
    const result = safeJsonParse('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should return null for invalid JSON', () => {
    const result = safeJsonParse('invalid json');
    expect(result).toBeNull();
  });

  it('should return typed result', () => {
    interface TestType {
      name: string;
      age: number;
    }

    const result = safeJsonParse<TestType>('{"name": "John", "age": 30}');
    expect(result).toEqual({ name: 'John', age: 30 });
  });
});

describe('retry', () => {
  it('should succeed on first try', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('First fail'))
      .mockRejectedValueOnce(new Error('Second fail'))
      .mockResolvedValue('success');

    const result = await retry(fn, { retries: 3, delay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw last error after all retries', async () => {
    const finalError = new Error('Final error');
    const fn = jest.fn().mockRejectedValue(finalError);

    await expect(retry(fn, { retries: 2, delay: 10 })).rejects.toThrow('Final error');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use exponential backoff', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Always fail'));
    const startTime = Date.now();

    try {
      await retry(fn, { retries: 3, delay: 10, exponentialBackoff: true });
    } catch (error) {
      // Expected to fail
    }

    const elapsed = Date.now() - startTime;
    // Should wait at least 10 + 20 = 30ms (exponential backoff)
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use constant delay when exponentialBackoff is false', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Always fail'));

    try {
      await retry(fn, { retries: 3, delay: 10, exponentialBackoff: false });
    } catch (error) {
      // Expected to fail
    }

    expect(fn).toHaveBeenCalledTimes(3);
  });
});
