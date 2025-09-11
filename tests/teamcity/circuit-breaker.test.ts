/**
 * Tests for Circuit Breaker implementation
 */
import { CircuitBreaker, CircuitBreakerManager, CircuitState } from '@/teamcity/circuit-breaker';

// Mock the logger
jest.mock('@/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
}));

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    jest.clearAllMocks();
    breaker = new CircuitBreaker('test-endpoint', {
      failureThreshold: 3,
      resetTimeout: 100, // 100ms for testing
      successThreshold: 2,
    });
  });

  describe('CLOSED state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should execute function successfully in CLOSED state', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should count failures and stay CLOSED below threshold', async () => {
      const failingFn = async () => {
        throw new Error('failure');
      };

      // First failure
      await expect(breaker.execute(failingFn)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);

      // Second failure
      await expect(breaker.execute(failingFn)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition to OPEN after reaching failure threshold', async () => {
      const failingFn = async () => {
        throw new Error('failure');
      };

      // Fail 3 times (threshold)
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('failure');
      }
      /* eslint-enable no-await-in-loop */

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset failure count on success', async () => {
      const failingFn = async () => {
        throw new Error('failure');
      };
      const successFn = async () => 'success';

      // Two failures
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      await expect(breaker.execute(failingFn)).rejects.toThrow();

      // Success should reset count
      await breaker.execute(successFn);

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      const failingFn = async () => {
        throw new Error('failure');
      };
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }
      /* eslint-enable no-await-in-loop */
    });

    it('should reject immediately in OPEN state', async () => {
      const fn = jest.fn(async () => 'success');

      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Next execution should transition to HALF_OPEN
      const fn = async () => 'success';
      await breaker.execute(fn);

      // After one success, still HALF_OPEN
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      const failingFn = async () => {
        throw new Error('failure');
      };
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < 3; i++) {
        // eslint-disable-next-line no-await-in-loop
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }
      /* eslint-enable no-await-in-loop */

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    it('should transition to CLOSED after success threshold', async () => {
      const successFn = async () => 'success';

      // First success - transitions to HALF_OPEN
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Second success - should transition to CLOSED
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      const successFn = async () => 'success';
      const failingFn = async () => {
        throw new Error('failure');
      };

      // First execution transitions to HALF_OPEN
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

      // Failure should transition back to OPEN
      await expect(breaker.execute(failingFn)).rejects.toThrow('failure');
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('getStats', () => {
    it('should return circuit statistics', async () => {
      const stats = breaker.getStats();

      expect(stats).toHaveProperty('state', CircuitState.CLOSED);
      expect(stats).toHaveProperty('failureCount', 0);
      expect(stats).toHaveProperty('successCount', 0);
      expect(stats).toHaveProperty('lastFailureTime', undefined);
    });

    it('should track failure statistics', async () => {
      const failingFn = async () => {
        throw new Error('failure');
      };

      await expect(breaker.execute(failingFn)).rejects.toThrow();

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.lastFailureTime).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      // Open the circuit
      const failingFn = async () => {
        throw new Error('failure');
      };
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }
      /* eslint-enable no-await-in-loop */

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Reset
      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastFailureTime).toBeUndefined();
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    manager = new CircuitBreakerManager({
      failureThreshold: 2,
      resetTimeout: 100,
    });
  });

  it('should create breakers for different endpoints', () => {
    const breaker1 = manager.getBreaker('/api/builds');
    const breaker2 = manager.getBreaker('/api/projects');

    expect(breaker1).toBeDefined();
    expect(breaker2).toBeDefined();
    expect(breaker1).not.toBe(breaker2);
  });

  it('should reuse breaker for same endpoint', () => {
    const breaker1 = manager.getBreaker('/api/builds');
    const breaker2 = manager.getBreaker('/api/builds');

    expect(breaker1).toBe(breaker2);
  });

  it('should execute with circuit breaker', async () => {
    const result = await manager.execute('/api/builds', async () => 'success');
    expect(result).toBe('success');
  });

  it('should track stats for all breakers', async () => {
    // Create some breakers with activity
    await manager.execute('/api/builds', async () => 'success');
    await manager
      .execute('/api/projects', async () => {
        throw new Error('failure');
      })
      .catch(() => {});

    const stats = manager.getAllStats();

    expect(stats).toHaveProperty('/api/builds');
    expect(stats).toHaveProperty('/api/projects');
    expect(stats['/api/builds']?.state).toBe(CircuitState.CLOSED);
    expect(stats['/api/projects']?.failureCount).toBe(1);
  });

  it('should reset all breakers', async () => {
    // Open some circuits
    const failingFn = async () => {
      throw new Error('failure');
    };

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < 2; i++) {
      await manager.execute('/api/builds', failingFn).catch(() => {});
      await manager.execute('/api/projects', failingFn).catch(() => {});
    }
    /* eslint-enable no-await-in-loop */

    const statsBefore = manager.getAllStats();
    expect(statsBefore['/api/builds']?.state).toBe(CircuitState.OPEN);
    expect(statsBefore['/api/projects']?.state).toBe(CircuitState.OPEN);

    // Reset all
    manager.resetAll();

    const statsAfter = manager.getAllStats();
    expect(statsAfter['/api/builds']?.state).toBe(CircuitState.CLOSED);
    expect(statsAfter['/api/projects']?.state).toBe(CircuitState.CLOSED);
  });

  it('should reset specific breaker', async () => {
    // Open a circuit
    const failingFn = async () => {
      throw new Error('failure');
    };

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < 2; i++) {
      await manager.execute('/api/builds', failingFn).catch(() => {});
    }
    /* eslint-enable no-await-in-loop */

    expect(manager.getBreaker('/api/builds').getState()).toBe(CircuitState.OPEN);

    // Reset specific
    manager.reset('/api/builds');

    expect(manager.getBreaker('/api/builds').getState()).toBe(CircuitState.CLOSED);
  });
});
