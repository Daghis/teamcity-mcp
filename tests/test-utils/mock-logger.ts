/**
 * Type-safe mock utilities for logger testing
 *
 * Provides properly typed mock implementations that match the ILogger/TeamCityLogger
 * interfaces without requiring dangerous `as unknown as` casts.
 *
 * Also provides Winston Logger compatible mocks for services that use Winston directly.
 */
import type { Logger as WinstonLogger } from 'winston';

import type { ILogger, LogContext, LogLevel, TeamCityLogger } from '@/utils/logger/index';

/**
 * Mock interface that extends ILogger with Jest mock functions
 * and TeamCityLogger-specific methods
 */
export interface MockLogger extends ILogger {
  debug: jest.Mock<void, [string, LogContext?]>;
  info: jest.Mock<void, [string, LogContext?]>;
  warn: jest.Mock<void, [string, LogContext?]>;
  error: jest.Mock<void, [string, (Error | unknown)?, LogContext?]>;
  child: jest.Mock<MockLogger, [LogContext]>;
  generateRequestId: jest.Mock<string, []>;
  logToolExecution: jest.Mock<
    void,
    [string, Record<string, unknown>, { success: boolean; error?: string }, number, LogContext?]
  >;
  logTeamCityRequest: jest.Mock<void, [string, string, number?, number?, LogContext?]>;
  logLifecycle: jest.Mock<void, [string, Record<string, unknown>?]>;
  setLevel: jest.Mock<void, [LogLevel]>;
  getLevel: jest.Mock<LogLevel, []>;
}

/**
 * Create a type-safe mock logger that implements the TeamCityLogger interface
 *
 * @example
 * ```typescript
 * const mockLogger = createMockLogger();
 *
 * // Use in tests
 * const manager = new SomeManager(mockLogger);
 * await manager.doSomething();
 *
 * // Assert on calls
 * expect(mockLogger.info).toHaveBeenCalledWith('Operation started', expect.any(Object));
 * expect(mockLogger.error).not.toHaveBeenCalled();
 * ```
 */
export function createMockLogger(): MockLogger {
  const mockLogger: MockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
    generateRequestId: jest.fn(() => `mock-request-${Date.now()}`),
    logToolExecution: jest.fn(),
    logTeamCityRequest: jest.fn(),
    logLifecycle: jest.fn(),
    setLevel: jest.fn(),
    getLevel: jest.fn(() => 'info' as LogLevel),
  };

  // Make child() return the same mock for chained calls
  mockLogger.child.mockReturnValue(mockLogger);

  return mockLogger;
}

/**
 * Create a mock logger that captures all log messages for inspection
 *
 * @example
 * ```typescript
 * const { logger, messages } = createCapturingMockLogger();
 *
 * await someFunction(logger);
 *
 * expect(messages.errors).toHaveLength(0);
 * expect(messages.infos).toContainEqual(
 *   expect.objectContaining({ message: 'Process completed' })
 * );
 * ```
 */
export function createCapturingMockLogger(): {
  logger: MockLogger;
  messages: {
    debugs: Array<{ message: string; context?: LogContext }>;
    infos: Array<{ message: string; context?: LogContext }>;
    warns: Array<{ message: string; context?: LogContext }>;
    errors: Array<{ message: string; error?: Error | unknown; context?: LogContext }>;
  };
} {
  const messages = {
    debugs: [] as Array<{ message: string; context?: LogContext }>,
    infos: [] as Array<{ message: string; context?: LogContext }>,
    warns: [] as Array<{ message: string; context?: LogContext }>,
    errors: [] as Array<{ message: string; error?: Error | unknown; context?: LogContext }>,
  };

  const logger = createMockLogger();

  logger.debug.mockImplementation((message: string, context?: LogContext) => {
    messages.debugs.push({ message, context });
  });

  logger.info.mockImplementation((message: string, context?: LogContext) => {
    messages.infos.push({ message, context });
  });

  logger.warn.mockImplementation((message: string, context?: LogContext) => {
    messages.warns.push({ message, context });
  });

  logger.error.mockImplementation(
    (message: string, error?: Error | unknown, context?: LogContext) => {
      messages.errors.push({ message, error, context });
    }
  );

  return { logger, messages };
}

/**
 * Reset all mock functions on a mock logger instance
 */
export function resetMockLogger(logger: MockLogger): void {
  logger.debug.mockReset();
  logger.info.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
  logger.child.mockReset();
  logger.generateRequestId.mockReset();
  logger.logToolExecution.mockReset();
  logger.logTeamCityRequest.mockReset();
  logger.logLifecycle.mockReset();
  logger.setLevel.mockReset();
  logger.getLevel.mockReset();

  // Restore default implementations
  logger.child.mockReturnValue(logger);
  logger.generateRequestId.mockReturnValue(`mock-request-${Date.now()}`);
  logger.getLevel.mockReturnValue('info');
}

/**
 * Create a mock logger module export for jest.doMock('@/utils/logger/index', ...)
 *
 * @example
 * ```typescript
 * const { mockModule, mockLogger } = createMockLoggerModule();
 *
 * jest.doMock('@/utils/logger/index', () => mockModule);
 *
 * // After importing modules that use the logger
 * expect(mockLogger.info).toHaveBeenCalled();
 * ```
 */
export function createMockLoggerModule(): {
  mockModule: {
    getLogger: jest.Mock<MockLogger, []>;
    createLogger: jest.Mock<MockLogger, []>;
    logger: MockLogger;
    debug: jest.Mock;
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    child: jest.Mock;
  };
  mockLogger: MockLogger;
} {
  const mockLogger = createMockLogger();

  const mockModule = {
    getLogger: jest.fn(() => mockLogger),
    createLogger: jest.fn(() => mockLogger),
    logger: mockLogger,
    debug: mockLogger.debug,
    info: mockLogger.info,
    warn: mockLogger.warn,
    error: mockLogger.error,
    child: mockLogger.child,
  };

  return { mockModule, mockLogger };
}

/**
 * Type assertion helper for tests that need TeamCityLogger compatibility
 *
 * Note: This is provided for edge cases where the mock needs to be passed
 * to code expecting the concrete TeamCityLogger class. Prefer using MockLogger
 * directly when possible.
 */
export function asMockTeamCityLogger(logger: MockLogger): MockLogger & TeamCityLogger {
  // The mock implements all required methods, so this cast is safe
  // This is one of the acceptable uses of type assertion - bridging test mocks
  return logger as MockLogger & TeamCityLogger;
}

// ============================================================================
// Winston Logger Mocks (for backward compatibility with services using Winston)
// ============================================================================

/**
 * Mock interface for Winston Logger methods
 */
export interface WinstonMockLogger {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  http: jest.Mock;
  verbose: jest.Mock;
  debug: jest.Mock;
  silly: jest.Mock;
  log: jest.Mock;
  child: jest.Mock<WinstonMockLogger, [Record<string, unknown>]>;
}

/**
 * Create a Winston Logger compatible mock
 *
 * Use this for services that use Winston's Logger directly (not TeamCityLogger).
 *
 * @example
 * ```typescript
 * import type { Logger } from 'winston';
 *
 * const mockLogger = createWinstonMockLogger();
 * const service = new SomeService(mockLogger);
 * ```
 */
export function createWinstonMockLogger(): WinstonMockLogger & WinstonLogger {
  const mockLogger: WinstonMockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    verbose: jest.fn(),
    debug: jest.fn(),
    silly: jest.fn(),
    log: jest.fn(),
    child: jest.fn(),
  };

  // Make child() return a new mock logger instance
  mockLogger.child.mockImplementation(() => createWinstonMockLogger());

  // Cast is acceptable here - this is the standard pattern for mocking Winston Logger
  // The mock provides all the methods that tests typically use
  return mockLogger as WinstonMockLogger & WinstonLogger;
}

/**
 * Reset all mock functions on a Winston mock logger instance
 */
export function resetWinstonMockLogger(logger: WinstonMockLogger): void {
  logger.error.mockReset();
  logger.warn.mockReset();
  logger.info.mockReset();
  logger.http.mockReset();
  logger.verbose.mockReset();
  logger.debug.mockReset();
  logger.silly.mockReset();
  logger.log.mockReset();
  logger.child.mockReset();

  // Restore default implementation
  logger.child.mockImplementation(() => createWinstonMockLogger());
}
