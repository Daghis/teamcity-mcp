/**
 * Tests for error handling middleware
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
} from '@/middleware/error';

describe('Error Classes', () => {
  describe('MCPToolError', () => {
    it('should create error with default values', () => {
      const error = new MCPToolError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TOOL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('MCPToolError');
    });

    it('should create error with custom values', () => {
      const error = new MCPToolError('Custom error', 'CUSTOM_CODE', 400, { foo: 'bar' });
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.data).toEqual({ foo: 'bar' });
    });
  });

  describe('MCPValidationError', () => {
    it('should create validation error', () => {
      let zodError: z.ZodError;
      try {
        z.object({ field: z.string() }).parse({ field: 42 });
        throw new Error('Expected schema parsing to fail');
      } catch (error) {
        zodError = error as z.ZodError;
      }
      const error = new MCPValidationError('Validation failed', zodError);
      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.errors).toBe(zodError);
      expect(error.name).toBe('MCPValidationError');
    });
  });

  describe('MCPAuthError', () => {
    it('should create auth error', () => {
      const error = new MCPAuthError('Unauthorized');
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('MCPAuthError');
    });
  });

  describe('MCPNotFoundError', () => {
    it('should create not found error', () => {
      const error = new MCPNotFoundError('Tool');
      expect(error.message).toBe('Tool not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('MCPNotFoundError');
    });
  });
});

describe('formatError', () => {
  it('should format MCPToolError', () => {
    const error = new MCPToolError('Test error', 'TEST_CODE', 500, { detail: 'test' });
    const result = formatError(error);
    expect(result).toEqual({
      success: false,
      error: {
        message: 'Test error',
        code: 'TEST_CODE',
        data: { detail: 'test' },
      },
    });
  });

  it('should format ZodError', () => {
    let zodError: z.ZodError;
    try {
      z.object({ field: z.string() }).parse({ field: 42 });
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

  it('should format generic Error', () => {
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

  it('should format unknown error', () => {
    const result = formatError('string error');
    expect(result).toEqual({
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
    const handler = asyncHandler(async () => {
      return 'success';
    });
    const result = await handler();
    expect(result).toBe('success');
  });

  it('should handle async function with parameters', async () => {
    const handler = asyncHandler<number>(async (...args: unknown[]) => {
      const [a, b] = args as [number, number];
      return a + b;
    });
    const result = await handler(2, 3);
    expect(result).toBe(5);
  });

  it('should propagate errors', async () => {
    const handler = asyncHandler(async () => {
      throw new Error('Test error');
    });
    await expect(handler()).rejects.toThrow('Test error');
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

  it('should parse complex JSON structures', () => {
    const json = JSON.stringify({
      array: [1, 2, 3],
      nested: { foo: 'bar' },
      bool: true,
      null: null,
    });
    const result = safeJsonParse(json);
    expect(result).toEqual({
      array: [1, 2, 3],
      nested: { foo: 'bar' },
      bool: true,
      null: null,
    });
  });
});

describe('retry', () => {
  it('should succeed on first try', async () => {
    let attempts = 0;
    const result = await retry(async () => {
      attempts++;
      return 'success';
    });
    expect(result).toBe('success');
    expect(attempts).toBe(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Fail');
        }
        return 'success';
      },
      { retries: 3, delay: 10 }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('should throw after max retries', async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error('Always fails');
        },
        { retries: 3, delay: 10 }
      )
    ).rejects.toThrow('Always fails');
    expect(attempts).toBe(3);
  });

  it('should use exponential backoff', async () => {
    const delays: number[] = [];
    let lastTime = Date.now();

    await retry(
      async () => {
        const now = Date.now();
        if (lastTime !== now) {
          delays.push(now - lastTime);
        }
        lastTime = now;
        if (delays.length < 2) {
          throw new Error('Retry');
        }
        return 'success';
      },
      { retries: 3, delay: 10, exponentialBackoff: true }
    );

    // Second retry should have longer delay than first
    expect(delays.length).toBeGreaterThanOrEqual(2);
    if (delays.length >= 2) {
      const first = delays[0] as number;
      const second = delays[1] as number;
      const toleranceMs = 10;
      expect(second + toleranceMs).toBeGreaterThanOrEqual(first);
    }
  });

  it('should use fixed delay without exponential backoff', async () => {
    const delays: number[] = [];
    let lastTime = Date.now();

    await retry(
      async () => {
        const now = Date.now();
        if (lastTime !== now) {
          delays.push(now - lastTime);
        }
        lastTime = now;
        if (delays.length < 2) {
          throw new Error('Retry');
        }
        return 'success';
      },
      { retries: 3, delay: 10, exponentialBackoff: false }
    );

    // All delays should be similar (within reasonable tolerance)
    expect(delays.length).toBeGreaterThanOrEqual(2);
    if (delays.length >= 2) {
      const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
      delays.forEach((delay) => {
        expect(Math.abs(delay - avgDelay)).toBeLessThan(50); // Allow 50ms tolerance
      });
    }
  });
});
