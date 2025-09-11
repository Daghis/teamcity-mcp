/**
 * Custom error classes for TeamCity API operations
 */
import type { AxiosError } from 'axios';

/**
 * Base error class for all TeamCity API errors
 */
export class TeamCityAPIError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;
  public readonly requestId?: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: unknown,
    requestId?: string,
    originalError?: Error
  ) {
    super(message);
    this.name = 'TeamCityAPIError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, TeamCityAPIError);
    }
  }

  /**
   * Create from Axios error
   */
  static fromAxiosError(error: AxiosError, requestId?: string): TeamCityAPIError {
    if (error.response) {
      // Server responded with error status
      const data = error.response.data as Record<string, unknown>;
      return new TeamCityAPIError(
        (typeof data?.['message'] === 'string' ? data['message'] : null) ?? error.message,
        (typeof data?.['code'] === 'string' ? data['code'] : null) ??
          `HTTP_${error.response.status}`,
        error.response.status,
        data,
        requestId,
        error
      );
    } else if (error.request !== null && error.request !== undefined) {
      // Request made but no response
      return new TeamCityNetworkError(error.message, requestId, error);
    } else {
      // Error setting up request
      return new TeamCityRequestError(error.message, requestId, error);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      requestId: this.requestId,
      stack: this.stack,
    };
  }
}

/**
 * Authentication error (401)
 */
export class TeamCityAuthenticationError extends TeamCityAPIError {
  constructor(message = 'Authentication failed', requestId?: string, originalError?: Error) {
    super(message, 'AUTHENTICATION_ERROR', 401, undefined, requestId, originalError);
    this.name = 'TeamCityAuthenticationError';
  }
}

/**
 * Authorization error (403)
 */
export class TeamCityAuthorizationError extends TeamCityAPIError {
  constructor(message = 'Authorization failed', requestId?: string, originalError?: Error) {
    super(message, 'AUTHORIZATION_ERROR', 403, undefined, requestId, originalError);
    this.name = 'TeamCityAuthorizationError';
  }
}

/**
 * Resource not found error (404)
 */
export class TeamCityNotFoundError extends TeamCityAPIError {
  constructor(resource: string, identifier?: string, requestId?: string, originalError?: Error) {
    const message =
      identifier !== null && identifier !== undefined
        ? `${resource} with identifier '${identifier}' not found`
        : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { resource, identifier }, requestId, originalError);
    this.name = 'TeamCityNotFoundError';
  }
}

/**
 * Validation error (400)
 */
export class TeamCityValidationError extends TeamCityAPIError {
  public readonly validationErrors: Array<{ field: string; message: string }>;

  constructor(
    validationErrors: Array<{ field: string; message: string }>,
    requestId?: string,
    originalError?: Error
  ) {
    const message = `Validation failed: ${validationErrors.map((e) => e.message).join(', ')}`;
    super(message, 'VALIDATION_ERROR', 400, validationErrors, requestId, originalError);
    this.name = 'TeamCityValidationError';
    this.validationErrors = validationErrors;
  }
}

/**
 * Rate limit error (429)
 */
export class TeamCityRateLimitError extends TeamCityAPIError {
  public readonly retryAfter?: number;

  constructor(retryAfter?: number, requestId?: string, originalError?: Error) {
    const message =
      retryAfter !== null && retryAfter !== undefined
        ? `Rate limit exceeded. Retry after ${retryAfter} seconds`
        : 'Rate limit exceeded';
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter }, requestId, originalError);
    this.name = 'TeamCityRateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Server error (5xx)
 */
export class TeamCityServerError extends TeamCityAPIError {
  constructor(
    message = 'TeamCity server error',
    statusCode = 500,
    requestId?: string,
    originalError?: Error
  ) {
    super(message, 'SERVER_ERROR', statusCode, undefined, requestId, originalError);
    this.name = 'TeamCityServerError';
  }
}

/**
 * Network error
 */
export class TeamCityNetworkError extends TeamCityAPIError {
  constructor(message = 'Network error', requestId?: string, originalError?: Error) {
    super(message, 'NETWORK_ERROR', undefined, undefined, requestId, originalError);
    this.name = 'TeamCityNetworkError';
  }
}

/**
 * Request configuration error
 */
export class TeamCityRequestError extends TeamCityAPIError {
  constructor(message = 'Request configuration error', requestId?: string, originalError?: Error) {
    super(message, 'REQUEST_ERROR', undefined, undefined, requestId, originalError);
    this.name = 'TeamCityRequestError';
  }
}

/**
 * Timeout error
 */
export class TeamCityTimeoutError extends TeamCityAPIError {
  constructor(timeout: number, requestId?: string, originalError?: Error) {
    super(
      `Request timed out after ${timeout}ms`,
      'TIMEOUT_ERROR',
      undefined,
      { timeout },
      requestId,
      originalError
    );
    this.name = 'TeamCityTimeoutError';
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof TeamCityAPIError) {
    // Network errors are retryable
    if (error instanceof TeamCityNetworkError) {
      return true;
    }

    // Timeout errors are retryable
    if (error instanceof TeamCityTimeoutError) {
      return true;
    }

    // Server errors (5xx) are retryable
    if (error instanceof TeamCityServerError) {
      return true;
    }

    // Rate limit errors are retryable after delay
    if (error instanceof TeamCityRateLimitError) {
      return true;
    }

    // 503 Service Unavailable is retryable
    if (error.statusCode === 503) {
      return true;
    }
  }

  return false;
}

/**
 * Build not found error
 */
export class BuildNotFoundError extends TeamCityNotFoundError {
  constructor(message: string, requestId?: string, originalError?: Error) {
    super('Build', message, requestId, originalError);
    this.name = 'BuildNotFoundError';
  }
}

/**
 * Build access denied error
 */
export class BuildAccessDeniedError extends TeamCityAuthorizationError {
  constructor(message: string, requestId?: string, originalError?: Error) {
    super(message, requestId, originalError);
    this.name = 'BuildAccessDeniedError';
  }
}

/**
 * Build configuration not found error
 */
export class BuildConfigurationNotFoundError extends TeamCityNotFoundError {
  constructor(message: string, requestId?: string, originalError?: Error) {
    super('Build Configuration', message, requestId, originalError);
    this.name = 'BuildConfigurationNotFoundError';
  }
}

/**
 * Build configuration permission error
 */
export class BuildConfigurationPermissionError extends TeamCityAuthorizationError {
  public readonly buildConfigurationId?: string;

  constructor(message: string, configId?: string, requestId?: string, originalError?: Error) {
    super(message, requestId, originalError);
    this.name = 'BuildConfigurationPermissionError';
    this.buildConfigurationId = configId;
  }
}

/**
 * Build step not found error
 */
export class BuildStepNotFoundError extends TeamCityNotFoundError {
  constructor(message: string, stepId: string, requestId?: string, originalError?: Error) {
    super('Build Step', stepId, requestId, originalError);
    this.name = 'BuildStepNotFoundError';
  }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends TeamCityAuthorizationError {
  constructor(message: string, operation: string, requestId?: string, originalError?: Error) {
    super(`${message} (operation: ${operation})`, requestId, originalError);
    this.name = 'PermissionDeniedError';
  }
}

/**
 * Validation error with field details
 */
export class ValidationError extends TeamCityValidationError {
  public readonly fieldDetails?: unknown;

  constructor(message: string, details?: unknown, requestId?: string, originalError?: Error) {
    const detailsObj = details as { field?: string } | undefined;
    const validationErrors =
      detailsObj?.field !== null && detailsObj?.field !== undefined
        ? [{ field: detailsObj.field, message }]
        : [{ field: 'unknown', message }];
    super(validationErrors, requestId, originalError);
    this.fieldDetails = details;
  }
}

/**
 * Trigger not found error
 */
export class TriggerNotFoundError extends TeamCityNotFoundError {
  constructor(message: string, triggerId: string, requestId?: string, originalError?: Error) {
    super('Trigger', triggerId, requestId, originalError);
    this.name = 'TriggerNotFoundError';
  }
}

/**
 * Circular dependency error
 */
export class CircularDependencyError extends TeamCityValidationError {
  public readonly dependencyDetails?: unknown;

  constructor(message: string, details?: unknown, requestId?: string, originalError?: Error) {
    super([{ field: 'dependency', message }], requestId, originalError);
    this.name = 'CircularDependencyError';
    this.dependencyDetails = details;
  }
}

/**
 * Get retry delay for error
 */
export function getRetryDelay(error: Error, attempt: number, baseDelay = 1000): number {
  // Rate limit error with specific retry-after
  if (
    error instanceof TeamCityRateLimitError &&
    error.retryAfter !== null &&
    error.retryAfter !== undefined
  ) {
    return error.retryAfter * 1000;
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
}
