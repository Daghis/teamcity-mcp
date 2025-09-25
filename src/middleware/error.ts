/**
 * Error handling middleware for MCP server
 */
import { z } from 'zod';

import { error as logError } from '@/utils/logger';

/**
 * Custom error class for MCP tool errors
 */
export class MCPToolError extends Error {
  constructor(
    message: string,
    public code: string = 'TOOL_ERROR',
    public statusCode: number = 500,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MCPToolError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Custom error class for validation errors
 */
export class MCPValidationError extends MCPToolError {
  constructor(
    message: string,
    public errors?: z.ZodError
  ) {
    super(message, 'VALIDATION_ERROR', 400, errors?.issues);
    this.name = 'MCPValidationError';
  }
}

/**
 * Custom error class for authentication errors
 */
export class MCPAuthError extends MCPToolError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', 401);
    this.name = 'MCPAuthError';
  }
}

/**
 * Custom error class for not found errors
 */
export class MCPNotFoundError extends MCPToolError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'MCPNotFoundError';
  }
}

/**
 * Custom error class for TeamCity API errors
 */
export class MCPTeamCityError extends MCPToolError {
  public readonly teamCityCode?: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    teamCityCode?: string,
    requestId?: string
  ) {
    super(message, 'TEAMCITY_ERROR', statusCode, { teamCityCode, requestId });
    this.name = 'MCPTeamCityError';
    this.teamCityCode = teamCityCode;
    this.requestId = requestId;
  }
}

/**
 * Custom error class for configuration errors
 */
export class MCPConfigError extends MCPToolError {
  constructor(
    message: string,
    public readonly configPath?: string
  ) {
    super(message, 'CONFIG_ERROR', 500, { configPath });
    this.name = 'MCPConfigError';
  }
}

/**
 * Custom error class for timeout errors
 */
export class MCPTimeoutError extends MCPToolError {
  constructor(operation: string, timeout: number) {
    super(`Operation '${operation}' timed out after ${timeout}ms`, 'TIMEOUT_ERROR', 408, {
      operation,
      timeout,
    });
    this.name = 'MCPTimeoutError';
  }
}

/**
 * Custom error class for rate limiting errors
 */
export class MCPRateLimitError extends MCPToolError {
  constructor(public readonly retryAfter?: number) {
    super('Rate limit exceeded', 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'MCPRateLimitError';
  }
}

/**
 * Error response formatter
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    data?: unknown;
  };
  success: false;
}

/**
 * Format error for MCP response with enhanced logging
 */
export function formatError(
  err: unknown,
  context?: { requestId?: string; operation?: string }
): ErrorResponse {
  // Log error details for debugging
  if (err instanceof MCPToolError) {
    logError('MCP Tool Error', err, {
      code: err.code,
      statusCode: err.statusCode,
      data: err.data,
      ...context,
    });

    return {
      success: false,
      error: {
        message: err.message,
        code: err.code,
        data: err.data,
      },
    };
  }

  if (err instanceof z.ZodError) {
    logError('Validation Error', err, {
      errors: err.issues,
      ...context,
    });

    return {
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        data: err.issues,
      },
    };
  }

  if (err instanceof Error) {
    logError('Internal Error', err, context);

    return {
      success: false,
      error: {
        message: process.env['NODE_ENV'] === 'production' ? 'Internal server error' : err.message,
        code: 'INTERNAL_ERROR',
      },
    };
  }

  logError('Unknown Error', new Error(String(err)), context);

  return {
    success: false,
    error: {
      message: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
    },
  };
}

/**
 * Global error handler for uncaught errors
 */
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err: Error) => {
    logError('Uncaught Exception', err);
    // Give time for logs to flush
    setTimeout(() => process.exit(1), 100);
  });

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logError('Unhandled Rejection', undefined, { reason, promise });
    // Don't exit on unhandled rejection in development
    if (process.env['NODE_ENV'] === 'production') {
      setTimeout(() => process.exit(1), 100);
    }
  });
}

/**
 * Wrap async handler to catch errors with enhanced context
 */
export function asyncHandler<T>(
  handler: (...args: unknown[]) => Promise<T>,
  operationName?: string
): (...args: unknown[]) => Promise<T> {
  return async (...args: unknown[]): Promise<T> => {
    const context = {
      operation: operationName ?? handler.name ?? 'anonymous',
      args: process.env['NODE_ENV'] !== 'production' ? args : undefined,
    };

    try {
      return await handler(...args);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logError('Async handler error', error, context);
      throw err;
    }
  };
}

/**
 * Safe JSON parse with error handling and validation
 */
export function safeJsonParse<T = unknown>(
  json: string,
  validator?: (data: unknown) => data is T
): T | null {
  try {
    const parsed = JSON.parse(json) as unknown;

    if (validator && !validator(parsed)) {
      logError('JSON validation failed', new Error('Parsed JSON does not match expected schema'), {
        json: json.substring(0, 200) + (json.length > 200 ? '...' : ''),
      });
      return null;
    }

    return parsed as T;
  } catch (err) {
    logError('JSON parse error', err instanceof Error ? err : new Error(String(err)), {
      json: json.substring(0, 200) + (json.length > 200 ? '...' : ''),
    });
    return null;
  }
}

/**
 * Enhanced retry helper for flaky operations with better error handling
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    exponentialBackoff?: boolean;
    shouldRetry?: (error: unknown) => boolean;
    operationName?: string;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    delay = 1000,
    exponentialBackoff = true,
    shouldRetry = () => true,
    operationName = 'unknown',
  } = options;

  let lastError: unknown;

  // Intentional sequential retries; each iteration awaits the previous attempt
  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = i === retries - 1;
      const shouldRetryThis = shouldRetry(err);

      if (isLastAttempt || !shouldRetryThis) {
        logError(
          `Retry operation '${operationName}' failed`,
          err instanceof Error ? err : new Error(String(err)),
          { attempt: i + 1, totalAttempts: retries, willRetry: false }
        );
        break;
      }

      logError(
        `Retry operation '${operationName}' failed, retrying`,
        err instanceof Error ? err : new Error(String(err)),
        { attempt: i + 1, totalAttempts: retries, willRetry: true }
      );

      const waitTime = exponentialBackoff ? delay * Math.pow(2, i) : delay;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
}
/* eslint-enable no-await-in-loop */
