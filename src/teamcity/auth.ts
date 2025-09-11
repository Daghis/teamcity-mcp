/**
 * Authentication utilities for TeamCity API
 */
import type {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { v4 as uuidv4 } from 'uuid';

import { info, error as logError } from '@/utils/logger';

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return uuidv4();
}

/**
 * Add request ID to axios config
 */
export function addRequestId(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const requestId = generateRequestId();

  // Add request ID to headers
  config.headers['X-Request-ID'] = requestId;

  // Store request ID in config for later use
  const configWithId = config as AxiosRequestConfig & { requestId: string };
  configWithId.requestId = requestId;

  // Attach timing metadata
  (config as unknown as { _tcMeta?: { start: number } })._tcMeta = { start: Date.now() };

  // Log the request with ID
  info('Starting TeamCity API request', {
    requestId,
    method: config.method?.toUpperCase(),
    url: config.url,
    headers: {
      Authorization: config.headers['Authorization'] != null ? '[REDACTED]' : undefined,
      'X-Request-ID': requestId,
    },
  });

  return config;
}

/**
 * Transform TeamCity API errors into consistent format
 */
export interface TeamCityAPIErrorData {
  code: string;
  message: string;
  details?: string;
  requestId?: string;
  statusCode?: number;
  originalError?: Error;
}

/**
 * Extract error details from TeamCity API response
 */
export function extractErrorDetails(error: AxiosError): TeamCityAPIErrorData {
  const requestId = (error.config as AxiosRequestConfig & { requestId?: string })?.requestId;

  if (error.response != null) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const data = error.response.data as { code?: string; message?: string; details?: string };

    return {
      code: data?.code ?? `HTTP_${error.response.status}`,
      message: data?.message ?? error.message,
      details: data?.details ?? JSON.stringify(data),
      requestId,
      statusCode: error.response.status,
      originalError: error,
    };
  } else if (error.request != null) {
    // The request was made but no response was received
    return {
      code: 'NO_RESPONSE',
      message: 'No response received from TeamCity server',
      details: error.message,
      requestId,
      originalError: error,
    };
  } else {
    // Something happened in setting up the request that triggered an Error
    return {
      code: 'REQUEST_SETUP_ERROR',
      message: 'Error setting up the request',
      details: error.message,
      requestId,
      originalError: error,
    };
  }
}

/**
 * Log response with request ID
 */
export function logResponse(response: AxiosResponse): AxiosResponse {
  const requestId = (response.config as AxiosRequestConfig & { requestId?: string })?.requestId;
  const meta = (response.config as unknown as { _tcMeta?: { start: number } })._tcMeta;
  // Prefer server-provided response time header when available
  const headers = response.headers as Record<string, string | undefined> | undefined;
  const headerDuration = headers?.['x-response-time'] ?? headers?.['x-response-duration'];
  const duration = headerDuration ?? (meta?.start ? Date.now() - meta.start : undefined);

  info('TeamCity API request completed', {
    requestId,
    method: response.config.method?.toUpperCase(),
    url: response.config.url,
    status: response.status,
    duration,
  });

  return response;
}

/**
 * Log error with request ID and transform
 */
export function logAndTransformError(error: AxiosError): Promise<never> {
  const teamcityError = extractErrorDetails(error);
  const meta = (error.config as unknown as { _tcMeta?: { start: number } })?._tcMeta;
  const duration = meta?.start ? Date.now() - meta.start : undefined;

  // Basic redaction/sanitization for logs
  const sanitize = (val: unknown): unknown => {
    const redact = (s: string) =>
      s
        .replace(/(token[=:\s]*)[^\s&]+/gi, '$1***')
        .replace(/(password[=:\s]*)[^\s&]+/gi, '$1***')
        .replace(/(apikey[=:\s]*)[^\s&]+/gi, '$1***')
        .replace(/(authorization[=:\s:]*)[^\s&]+/gi, '$1***');
    if (typeof val === 'string') return redact(val);
    try {
      const s = JSON.stringify(val);
      return redact(s);
    } catch {
      return val;
    }
  };

  logError('TeamCity API request failed', undefined, {
    requestId: teamcityError.requestId,
    code: teamcityError.code,
    message: sanitize(teamcityError.message) as string,
    statusCode: teamcityError.statusCode,
    details: sanitize(teamcityError.details),
    duration,
  });

  return Promise.reject(teamcityError);
}

/**
 * Validate TeamCity token format
 */
export function validateToken(token: string): boolean {
  // TeamCity tokens are typically:
  // - Personal access tokens: alphanumeric strings
  // - Basic auth: base64 encoded username:password

  if (!token || token.length === 0) {
    return false;
  }

  // Check if it's a valid token format (alphanumeric with possible special chars)
  // TeamCity tokens can be JWT-style (with dots) or basic alphanumeric
  const tokenPattern = /^[A-Za-z0-9+/=_\-.:]+$/;
  return tokenPattern.test(token);
}

/**
 * Validate TeamCity server URL
 */
export function validateServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Pre-flight validation for TeamCity configuration
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateConfiguration(baseUrl: string, token: string): ValidationResult {
  const errors: string[] = [];

  if (!validateServerUrl(baseUrl)) {
    errors.push('Invalid TeamCity server URL');
  }

  if (!validateToken(token)) {
    errors.push('Invalid TeamCity authentication token');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
