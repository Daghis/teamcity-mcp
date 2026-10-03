/**
 * Authentication utilities for TeamCity API
 */
import { StringDecoder } from 'node:string_decoder';

import type {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { randomUUID } from 'crypto';

import { TeamCityAPIError } from '@/teamcity/errors';
import { destroyStream, isReadableStream, toBuffer } from '@/teamcity/utils/stream';
import { info, error as logError } from '@/utils/logger';

interface TimingMetaContainer {
  _tcMeta?: {
    start: number;
  };
}

const asTimingMetaContainer = (value: unknown): TimingMetaContainer | null => {
  if (typeof value === 'object' && value !== null) {
    return value as TimingMetaContainer;
  }
  return null;
};

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return randomUUID();
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
  const metaContainer = asTimingMetaContainer(config);
  if (metaContainer) {
    metaContainer._tcMeta = { start: Date.now() };
  }

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
  const meta = asTimingMetaContainer(response.config)?._tcMeta;
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
 * Most time spent reading a streamed error body. The snapshot only adds detail
 * to the error, so it must not hold up error handling or a fallback for long.
 */
const STREAM_BODY_TIMEOUT_MS = 5000;

/**
 * Drain a readable stream to a bounded UTF-8 string. Used to turn a streamed
 * error-response body (a socket) into a small, usable error message without
 * buffering an arbitrarily large payload. Reading stops once `maxBytes` have
 * arrived, which destroys the stream instead of waiting for the rest of it.
 */
const streamToString = async (
  stream: NodeJS.ReadableStream,
  maxBytes = 64 * 1024
): Promise<string> => {
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of stream) {
    const buf = toBuffer(chunk);
    const retained = buf.subarray(0, maxBytes - total);
    chunks.push(retained);
    total += retained.length;
    if (total >= maxBytes) {
      truncated = true;
      break;
    }
  }
  const decoder = new StringDecoder('utf8');
  // Leave a partial character at the byte boundary buffered instead of replacing it.
  const text = decoder.write(Buffer.concat(chunks, total)) + (truncated ? '' : decoder.end());
  if (Buffer.byteLength(text) <= maxBytes) {
    return text;
  }
  // Invalid UTF-8 can expand to larger replacement characters during decoding.
  return new StringDecoder('utf8').write(Buffer.from(text).subarray(0, maxBytes));
};

/**
 * Snapshot a streamed error body within `timeoutMs`. A body that keeps trickling
 * in would otherwise hold up error handling (and with it any fallback request)
 * indefinitely. If reading fails or times out, the stream is destroyed and no
 * snapshot is kept.
 */
const snapshotStreamBody = async (
  stream: NodeJS.ReadableStream,
  timeoutMs: number
): Promise<string | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out reading streamed error body')), timeoutMs);
  });
  try {
    return await Promise.race([streamToString(stream), deadline]);
  } catch {
    destroyStream(stream);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Log error with request ID and transform
 */
export async function logAndTransformError(error: AxiosError | TeamCityAPIError): Promise<never> {
  // A request retried by axios-retry runs through this interceptor on its own, so
  // the outer request receives an error that was already transformed and logged
  if (error instanceof TeamCityAPIError) {
    return Promise.reject(error);
  }

  // When the request used responseType 'stream', error.response.data is an
  // unconsumed Node stream (a socket with circular references). Drain it to a
  // small text snapshot, bounded in size and time, so the error message is
  // usable and the raw socket is never stored or serialized downstream.
  const response = error.response;
  if (response && isReadableStream(response.data)) {
    const requestTimeout = error.config?.timeout ?? 0;
    response.data = await snapshotStreamBody(
      response.data,
      requestTimeout > 0 ? Math.min(requestTimeout, STREAM_BODY_TIMEOUT_MS) : STREAM_BODY_TIMEOUT_MS
    );
  }

  // Build a rich TeamCityAPIError instance so downstream handlers
  // see an Error subclass (not a plain object)
  const requestId = (error.config as AxiosRequestConfig & { requestId?: string })?.requestId;
  const tcError = TeamCityAPIError.fromAxiosError(error, requestId);
  const meta = asTimingMetaContainer(error.config)?._tcMeta;
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
    requestId: tcError.requestId,
    code: tcError.code,
    message: sanitize(tcError.message) as string,
    statusCode: tcError.statusCode,
    details: sanitize(tcError.details),
    duration,
  });

  return Promise.reject(tcError);
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
