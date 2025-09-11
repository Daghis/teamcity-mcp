/**
 * Jest setup file - runs before all tests
 */

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Silence console logs during tests unless explicitly needed
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    // Keep error for debugging test failures
    error: console.error,
  };
}

// Increase default test timeout for async tests
jest.setTimeout(15000);

// Open handles cleanup is handled in tests/setup.ts (setupFilesAfterEnv)
