/**
 * Type-safe error factory functions for testing
 *
 * Provides properly typed factory functions to create error objects
 * that match Axios and TeamCity error structures without requiring
 * `as unknown as` casts or property mutation.
 */
import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

/**
 * Options for creating an Axios error
 */
export interface AxiosErrorOptions {
  message?: string;
  status?: number;
  statusText?: string;
  data?: unknown;
  code?: string;
  headers?: Record<string, string>;
  config?: Partial<InternalAxiosRequestConfig>;
}

/**
 * HTTP error type commonly used in tests
 */
export interface HttpError extends Error {
  response?: {
    status: number;
    statusText?: string;
    data?: unknown;
    headers?: Record<string, string>;
  };
  code?: string;
  config?: InternalAxiosRequestConfig;
  request?: unknown;
  isAxiosError?: boolean;
}

/**
 * Create a mock Axios error with proper typing
 *
 * @example
 * ```typescript
 * const error = createAxiosError({ status: 404, message: 'Not found' });
 * mockFn.mockRejectedValue(error);
 *
 * const authError = createAxiosError({
 *   status: 401,
 *   data: { message: 'Invalid token' }
 * });
 * ```
 */
export function createAxiosError(options: AxiosErrorOptions = {}): AxiosError {
  const {
    message = 'Request failed',
    status = 500,
    statusText = 'Internal Server Error',
    data = {},
    code,
    headers = {},
    config = {},
  } = options;

  const axiosConfig: InternalAxiosRequestConfig = {
    url: 'https://teamcity.example.com/api',
    method: 'get',
    headers: {} as InternalAxiosRequestConfig['headers'],
    ...config,
  };

  const response: AxiosResponse = {
    data,
    status,
    statusText,
    headers,
    config: axiosConfig,
  };

  // Create error object that matches AxiosError structure
  const error: HttpError = new Error(message);
  error.response = {
    status,
    statusText,
    data,
    headers,
  };
  error.config = axiosConfig;
  error.isAxiosError = true;
  if (code) {
    error.code = code;
  }

  // Add the full response for Axios compatibility
  (error as AxiosError).response = response;

  return error as AxiosError;
}

/**
 * Create a 401 Unauthorized Axios error
 */
export function createAuthenticationError(
  message = 'Authentication failed',
  data: unknown = { message: 'Invalid or expired token' }
): AxiosError {
  return createAxiosError({
    message,
    status: 401,
    statusText: 'Unauthorized',
    data,
  });
}

/**
 * Create a 403 Forbidden Axios error
 */
export function createAuthorizationError(
  message = 'Permission denied',
  data: unknown = { message: 'Insufficient permissions' }
): AxiosError {
  return createAxiosError({
    message,
    status: 403,
    statusText: 'Forbidden',
    data,
  });
}

/**
 * Create a 404 Not Found Axios error
 */
export function createNotFoundError(
  resourceType = 'Resource',
  identifier = 'unknown',
  data?: unknown
): AxiosError {
  return createAxiosError({
    message: `${resourceType} not found`,
    status: 404,
    statusText: 'Not Found',
    data: data ?? { message: `${resourceType} with identifier '${identifier}' not found` },
  });
}

/**
 * Create a 400 Bad Request Axios error
 */
export function createValidationError(
  message = 'Validation failed',
  validationErrors: Array<{ field?: string; message: string }> = []
): AxiosError {
  return createAxiosError({
    message,
    status: 400,
    statusText: 'Bad Request',
    data: {
      message,
      errors: validationErrors,
    },
  });
}

/**
 * Create a 409 Conflict Axios error
 */
export function createConflictError(
  message = 'Resource conflict',
  data: unknown = { message: 'Resource already exists' }
): AxiosError {
  return createAxiosError({
    message,
    status: 409,
    statusText: 'Conflict',
    data,
  });
}

/**
 * Create a 429 Rate Limit Axios error
 */
export function createRateLimitError(retryAfter = 60): AxiosError {
  return createAxiosError({
    message: 'Rate limit exceeded',
    status: 429,
    statusText: 'Too Many Requests',
    data: { message: `Rate limit exceeded. Retry after ${retryAfter} seconds` },
    headers: { 'retry-after': String(retryAfter) },
  });
}

/**
 * Create a 500 Internal Server Error Axios error
 */
export function createServerError(
  message = 'Internal server error',
  data: unknown = { message: 'An unexpected error occurred' }
): AxiosError {
  return createAxiosError({
    message,
    status: 500,
    statusText: 'Internal Server Error',
    data,
  });
}

/**
 * Create a 502 Bad Gateway Axios error
 */
export function createBadGatewayError(message = 'Bad gateway'): AxiosError {
  return createAxiosError({
    message,
    status: 502,
    statusText: 'Bad Gateway',
    data: { message: 'Unable to connect to upstream server' },
  });
}

/**
 * Create a 503 Service Unavailable Axios error
 */
export function createServiceUnavailableError(message = 'Service unavailable'): AxiosError {
  return createAxiosError({
    message,
    status: 503,
    statusText: 'Service Unavailable',
    data: { message: 'The server is temporarily unavailable' },
  });
}

/**
 * Create a timeout error (ECONNABORTED)
 */
export function createTimeoutError(timeoutMs = 30000): AxiosError {
  return createAxiosError({
    message: `timeout of ${timeoutMs}ms exceeded`,
    code: 'ECONNABORTED',
    status: 0,
    statusText: '',
  });
}

/**
 * Create a network error (no response received)
 *
 * @example
 * ```typescript
 * const networkError = createNetworkError('ECONNREFUSED');
 * mockFn.mockRejectedValue(networkError);
 * ```
 */
export function createNetworkError(code = 'ERR_NETWORK', message = 'Network Error'): AxiosError {
  const error: HttpError = new Error(message);
  error.code = code;
  error.isAxiosError = true;
  error.request = {}; // Has request but no response (network issue)
  error.config = {
    url: 'https://teamcity.example.com/api',
    method: 'get',
    headers: {} as InternalAxiosRequestConfig['headers'],
  };

  return error as AxiosError;
}

/**
 * Create a simple HTTP error object (for mocking without full Axios structure)
 *
 * This is useful for tests that just need a basic error with status code.
 *
 * @example
 * ```typescript
 * mockFn.mockRejectedValue(createHttpError(404, 'Not found'));
 * ```
 */
export function createHttpError(status: number, message?: string): HttpError {
  const statusMessages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };

  const statusText = statusMessages[status] ?? 'Unknown Error';
  const errorMessage = message ?? statusText;

  const error: HttpError = new Error(errorMessage);
  error.response = {
    status,
    statusText,
    data: { message: errorMessage },
  };

  return error;
}

/**
 * Create a TeamCity-specific API error response
 *
 * @example
 * ```typescript
 * mockFn.mockRejectedValue(createTeamCityApiError({
 *   status: 404,
 *   code: 'BUILD_NOT_FOUND',
 *   message: 'Build with id 12345 not found',
 * }));
 * ```
 */
export function createTeamCityApiError(options: {
  status: number;
  code?: string;
  message: string;
  details?: string;
}): AxiosError {
  const { status, code, message, details } = options;

  return createAxiosError({
    message,
    status,
    data: {
      code: code ?? `TC_ERROR_${status}`,
      message,
      details,
    },
  });
}
