/**
 * Circuit breaker implementation for TeamCity API
 */
import { info, warn } from '@/utils/logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
  successThreshold?: number;
}

/**
 * Circuit breaker for API endpoints
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringPeriod: number;
  private readonly successThreshold: number;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod ?? 600000; // 10 minutes
    this.successThreshold = options.successThreshold ?? 2;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Record successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (this.failureCount >= this.failureThreshold) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  /**
   * Check if should attempt to reset from OPEN state
   */
  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== undefined && Date.now() - this.lastFailureTime >= this.resetTimeout
    );
  }

  /**
   * Transition to new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }

    if (oldState !== newState) {
      const logFn = newState === CircuitState.OPEN ? warn : info;
      logFn(`Circuit breaker ${this.name} transitioned from ${oldState} to ${newState}`, {
        failureCount: this.failureCount,
        successCount: this.successCount,
      });
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }
}

/**
 * Circuit breaker manager for multiple endpoints
 */
export class CircuitBreakerManager {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly defaultOptions: CircuitBreakerOptions;

  constructor(defaultOptions: CircuitBreakerOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create circuit breaker for endpoint
   */
  getBreaker(endpoint: string): CircuitBreaker {
    let breaker = this.breakers.get(endpoint);
    if (!breaker) {
      breaker = new CircuitBreaker(endpoint, this.defaultOptions);
      this.breakers.set(endpoint, breaker);
    }
    return breaker;
  }

  /**
   * Execute with circuit breaker for endpoint
   */
  async execute<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(endpoint);
    return breaker.execute(fn);
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
    for (const [endpoint, breaker] of this.breakers) {
      stats[endpoint] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset specific circuit breaker
   */
  reset(endpoint: string): void {
    const breaker = this.breakers.get(endpoint);
    if (breaker) {
      breaker.reset();
    }
  }
}
