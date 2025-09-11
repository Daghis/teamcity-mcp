/**
 * Async Utilities for TeamCity MCP Server
 *
 * This module provides standardized async patterns and utilities
 * to ensure consistent error handling, retry logic, and performance
 * monitoring across the application.
 */
import { getLogger } from '@/utils/logger';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts?: number;

  /**
   * Initial delay between retries in milliseconds
   */
  delay?: number;

  /**
   * Backoff multiplier for exponential backoff
   */
  backoff?: number;

  /**
   * Maximum delay between retries in milliseconds
   */
  maxDelay?: number;

  /**
   * Function to determine if error should trigger retry
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /**
   * Callback for retry attempts
   */
  onRetry?: (error: unknown, attempt: number) => void;
}

/**
 * Timeout configuration
 */
export interface TimeoutOptions {
  /**
   * Timeout duration in milliseconds
   */
  timeout: number;

  /**
   * Custom timeout error message
   */
  message?: string;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  /**
   * Number of failures before opening circuit
   */
  failureThreshold?: number;

  /**
   * Time in milliseconds before attempting to close circuit
   */
  resetTimeout?: number;

  /**
   * Monitor callback for circuit state changes
   */
  onStateChange?: (state: CircuitState, error?: unknown) => void;
}

/**
 * Circuit breaker states
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Result wrapper for operations that may fail
 */
export type AsyncResult<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/**
 * Async handler wrapper that ensures errors are properly caught
 * and logged consistently across the application
 */
export function asyncHandler<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await fn(...args);
    } catch (error) {
      // Re-throw the error after ensuring it's properly formatted
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Async operation failed: ${String(error)}`);
    }
  };
}

/**
 * Safe async handler that returns Result type instead of throwing
 */
export function safeAsyncHandler<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<AsyncResult<TReturn>> {
  return async (...args: TArgs): Promise<AsyncResult<TReturn>> => {
    try {
      const data = await fn(...args);
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  };
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    maxDelay = 10000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;
  let currentDelay = delay;

  /* eslint-disable no-await-in-loop */
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt or if shouldRetry returns false
      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Call retry callback if provided
      if (onRetry) {
        onRetry(error, attempt);
      }

      // Wait before retry
      await sleep(Math.min(currentDelay, maxDelay));
      currentDelay *= backoff;
    }
  }

  throw lastError;
}
/* eslint-enable no-await-in-loop */

/**
 * Add timeout to any promise
 */
export function withTimeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
  const { timeout, message = `Operation timed out after ${timeout}ms` } = options;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(message));
      }, timeout);
    }),
  ]);
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Debounce function for limiting execution frequency
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delay: number
): (...args: TArgs) => void {
  let timeoutId: NodeJS.Timeout | undefined;

  return (...args: TArgs): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Async debounce for promise-returning functions
 */
export function asyncDebounce<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  delay: number
): (...args: TArgs) => Promise<TReturn> {
  let timeoutId: NodeJS.Timeout | undefined;
  let latestPromise: Promise<TReturn> | undefined;

  return (...args: TArgs): Promise<TReturn> => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(async () => {
        try {
          const result = await fn(...args);
          if (latestPromise === timeoutId) {
            resolve(result);
          }
        } catch (error) {
          if (latestPromise === timeoutId) {
            reject(error);
          }
        }
      }, delay);

      latestPromise = Promise.resolve(timeoutId) as Promise<TReturn>;
    });
  };
}

/**
 * Throttle function for limiting execution rate
 */
export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  limit: number
): (...args: TArgs) => void {
  let inThrottle: boolean;

  return (...args: TArgs): void => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Execute promises in parallel with concurrency limit
 */
export async function parallelLimit<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  limit: number
): Promise<void> {
  const semaphore = new Semaphore(limit);

  const promises = items.map(async (item, index) => {
    await semaphore.acquire();
    try {
      return await fn(item, index);
    } finally {
      semaphore.release();
    }
  });

  await Promise.all(promises);
}

/**
 * Simple semaphore implementation for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.waitQueue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker<TArgs extends unknown[], TReturn> {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private fn: (...args: TArgs) => Promise<TReturn>,
    private options: CircuitBreakerOptions = {}
  ) {}

  async execute(...args: TArgs): Promise<TReturn> {
    const { failureThreshold = 5, resetTimeout = 60000, onStateChange } = this.options;

    // Check if circuit is open and should reset
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        if (onStateChange) {
          onStateChange(this.state);
        }
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await this.fn(...args);

      // Reset on success
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 3) {
          // Require 3 successes to fully close
          this.state = 'CLOSED';
          this.failures = 0;
          if (onStateChange) {
            onStateChange(this.state);
          }
        }
      } else if (this.state === 'CLOSED') {
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= failureThreshold) {
        this.state = 'OPEN';
        if (onStateChange) {
          onStateChange(this.state, error);
        }
      } else if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        if (onStateChange) {
          onStateChange(this.state, error);
        }
      }

      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Create a circuit breaker wrapper
 */
export function circuitBreaker<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: CircuitBreakerOptions
): CircuitBreaker<TArgs, TReturn> {
  return new CircuitBreaker(fn, options);
}

/**
 * Batch processing utility
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize: number,
  options: {
    concurrency?: number;
    onBatchComplete?: (batch: T[], results: R[]) => void;
    onError?: (batch: T[], error: Error) => void;
  } = {}
): Promise<R[]> {
  const { concurrency = 1, onBatchComplete, onError } = options;
  const results: R[] = [];
  const batches: T[][] = [];

  // Split into batches
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  // Process batches with concurrency control
  await parallelLimit(
    batches,
    async (batch) => {
      try {
        const batchResults = await processor(batch);
        results.push(...batchResults);

        if (onBatchComplete) {
          onBatchComplete(batch, batchResults);
        }
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(batch, error);
        }
        throw error;
      }
    },
    concurrency
  );

  return results;
}

/**
 * Measure execution time of async operations
 */
export async function measureTime<T>(
  operation: () => Promise<T>,
  label?: string
): Promise<{ result: T; duration: number }> {
  const start = process.hrtime.bigint();

  try {
    const result = await operation();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds

    if (label) {
      getLogger().debug(`${label} completed in ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  } catch (error) {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000;

    if (label) {
      getLogger().debug(`${label} failed after ${duration.toFixed(2)}ms`);
    }

    throw error;
  }
}

/**
 * Utility functions for common async patterns
 */
export const asyncUtils = {
  /**
   * Convert callback-style function to Promise
   */
  promisify<TArgs extends unknown[], TReturn>(
    fn: (...args: [...TArgs, (err: Error | null, result?: TReturn) => void]) => void
  ): (...args: TArgs) => Promise<TReturn> {
    return (...args: TArgs): Promise<TReturn> => {
      return new Promise((resolve, reject) => {
        fn(...args, (err, result) => {
          if (err != null) reject(err);
          else resolve(result as TReturn);
        });
      });
    };
  },

  /**
   * Race multiple promises with first success wins
   */
  raceToSuccess<T>(promises: Promise<T>[]): Promise<T> {
    return new Promise((resolve, reject) => {
      let rejectedCount = 0;
      const errors: unknown[] = [];

      promises.forEach((promise, index) => {
        promise.then(resolve).catch((error) => {
          errors[index] = error;
          rejectedCount++;

          if (rejectedCount === promises.length) {
            reject(new Error(`All promises rejected: ${errors.join(', ')}`));
          }
        });
      });
    });
  },

  /**
   * Create a cancellable promise
   */
  cancellable<T>(promise: Promise<T>): {
    promise: Promise<T>;
    cancel: () => void;
  } {
    let cancelled = false;

    const cancellablePromise = new Promise<T>((resolve, reject) => {
      promise
        .then((result) => {
          if (!cancelled) resolve(result);
        })
        .catch((error) => {
          if (!cancelled) reject(error);
        });
    });

    return {
      promise: cancellablePromise,
      cancel: () => {
        cancelled = true;
      },
    };
  },
} as const;

// Export all utilities as default
export default {
  asyncHandler,
  safeAsyncHandler,
  retry,
  withTimeout,
  sleep,
  debounce,
  asyncDebounce,
  throttle,
  parallelLimit,
  circuitBreaker,
  batchProcess,
  measureTime,
  asyncUtils,
  CircuitBreaker,
};
