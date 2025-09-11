/**
 * Jest test setup file
 * This file runs before each test suite
 */

// Set test environment
process.env['NODE_ENV'] = 'test';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Keep these for debugging
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  // Silence error and warn in tests
  error: jest.fn(),
  warn: jest.fn(),
};

// Add custom matchers if needed
expect.extend({
  toBeValidUrl(received: string) {
    try {
      new URL(received);
      return {
        pass: true,
        message: () => `Expected ${received} not to be a valid URL`,
      };
    } catch {
      return {
        pass: false,
        message: () => `Expected ${received} to be a valid URL`,
      };
    }
  },
});

// Global test utilities
export const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Mock timers for tests that need them
export const useFakeTimers = (): void => {
  jest.useFakeTimers();
};

export const useRealTimers = (): void => {
  jest.useRealTimers();
};

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  try {
    jest.clearAllTimers();
  } catch {
    // ignore when real timers are active
  }
});

// Final cleanup to avoid open handle messages
afterAll(() => {
  try {
    jest.runOnlyPendingTimers();
  } catch {
    // ignore when real timers are active
  }
  try {
    jest.clearAllTimers();
  } catch {
    // ignore when real timers are active
  }
});

// Extend Jest matchers for TypeScript
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeValidUrl(): R;
    }
  }
}

export {};
