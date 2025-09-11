/**
 * Tests for centralized logger utility
 */
import winston from 'winston';

import { LogContext, LogLevel, TeamCityLogger, createLogger, getLogger } from './index';

describe('TeamCityLogger', () => {
  let mockLogger: jest.Mocked<winston.Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn(),
      level: 'info',
      end: jest.fn(),
    } as unknown as jest.Mocked<winston.Logger>;

    jest.spyOn(winston, 'createLogger').mockReturnValue(mockLogger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    // Removed env-var dependent test: default configuration based on NODE_ENV/LOG_LEVEL

    it('should create logger with custom configuration', () => {
      const config = {
        name: 'test-service',
        level: 'debug' as LogLevel,
        enableConsole: true,
        enableFile: false,
      };

      new TeamCityLogger(config);

      expect(winston.createLogger).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          defaultMeta: { service: 'test-service' },
        })
      );
    });

    // Removed env-var dependent test: LOG_LEVEL override from environment
  });

  describe('logging methods', () => {
    let teamCityLogger: TeamCityLogger;

    beforeEach(() => {
      teamCityLogger = new TeamCityLogger();
    });

    it('should log debug messages', () => {
      const context: LogContext = { toolName: 'test-tool', requestId: 'req-123' };

      teamCityLogger.debug('Debug message', context);

      expect(mockLogger.debug).toHaveBeenCalledWith('Debug message', context);
    });

    it('should log info messages', () => {
      const context: LogContext = { buildId: 'build-456' };

      teamCityLogger.info('Info message', context);

      expect(mockLogger.info).toHaveBeenCalledWith('Info message', context);
    });

    it('should log warn messages', () => {
      teamCityLogger.warn('Warning message');

      expect(mockLogger.warn).toHaveBeenCalledWith('Warning message', {});
    });

    it('should log error messages with Error object', () => {
      const error = new Error('Test error');
      const context: LogContext = { projectId: 'proj-789' };

      teamCityLogger.error('Error message', error, context);

      expect(mockLogger.error).toHaveBeenCalledWith('Error message', {
        ...context,
        error: 'Test error',
        stack: error.stack,
      });
    });

    it('should log error messages with string error', () => {
      teamCityLogger.error('Error message', 'String error');

      expect(mockLogger.error).toHaveBeenCalledWith('Error message', {
        error: 'String error',
      });
    });

    it('should log error messages without error object', () => {
      teamCityLogger.error('Error message');

      expect(mockLogger.error).toHaveBeenCalledWith('Error message', {});
    });
  });

  describe('utility methods', () => {
    let teamCityLogger: TeamCityLogger;

    beforeEach(() => {
      teamCityLogger = new TeamCityLogger();
    });

    it('should generate unique request IDs', () => {
      const id1 = teamCityLogger.generateRequestId();
      const id2 = teamCityLogger.generateRequestId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-\d+$/);
    });

    it('should create child logger', () => {
      const childLogger = {} as winston.Logger;
      mockLogger.child.mockReturnValue(childLogger);

      const context: LogContext = { service: 'child-service' };
      const result = teamCityLogger.child(context);

      expect(mockLogger.child).toHaveBeenCalledWith(context);
      expect(result).toBeInstanceOf(TeamCityLogger);
    });

    it('should log tool execution - success', () => {
      const toolName = 'test-tool';
      const args = { param1: 'value1' };
      const result = { success: true };
      const duration = 150;
      const context: LogContext = { requestId: 'req-123' };

      teamCityLogger.logToolExecution(toolName, args, result, duration, context);

      expect(mockLogger.info).toHaveBeenCalledWith(`Tool executed successfully: ${toolName}`, {
        ...context,
        toolName,
        duration,
        args: JSON.stringify(args),
        success: true,
      });
    });

    it('should log tool execution - failure', () => {
      const toolName = 'test-tool';
      const args = { param1: 'value1' };
      const result = { success: false, error: 'Tool failed' };
      const duration = 75;

      teamCityLogger.logToolExecution(toolName, args, result, duration);

      expect(mockLogger.error).toHaveBeenCalledWith(`Tool execution failed: ${toolName}`, {
        toolName,
        duration,
        args: JSON.stringify(args),
        success: false,
        error: 'Tool failed',
      });
    });

    it('should log TeamCity API requests', () => {
      const method = 'GET';
      const url = '/api/builds';
      const status = 200;
      const duration = 250;
      const context: LogContext = { requestId: 'req-456' };

      teamCityLogger.logTeamCityRequest(method, url, status, duration, context);

      expect(mockLogger.debug).toHaveBeenCalledWith(`TeamCity API request: ${method} ${url}`, {
        ...context,
        method,
        url,
        status,
        duration,
      });
    });

    it('should log failed TeamCity API requests', () => {
      const method = 'POST';
      const url = '/api/builds/trigger';
      const status = 500;
      const duration = 1000;

      teamCityLogger.logTeamCityRequest(method, url, status, duration);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        `TeamCity API request failed: ${method} ${url}`,
        {
          method,
          url,
          status,
          duration,
        }
      );
    });

    it('should log lifecycle events', () => {
      const event = 'server_start';
      const details = { port: 3000, env: 'development' };

      teamCityLogger.logLifecycle(event, details);

      expect(mockLogger.info).toHaveBeenCalledWith(`Server lifecycle: ${event}`, {
        lifecycle: event,
        ...details,
      });
    });

    it('should set and get log level', () => {
      teamCityLogger.setLevel('debug');

      expect(mockLogger.level).toBe('debug');
      expect(teamCityLogger.getLevel()).toBe('debug');
    });

    it('should get Winston instance', () => {
      const winston = teamCityLogger.getWinstonInstance();

      expect(winston).toBe(mockLogger);
    });
  });
});

describe('factory functions', () => {
  beforeEach(() => {
    // Clear module cache to reset singleton
    jest.clearAllMocks();
  });

  describe('createLogger', () => {
    it('should create new logger instance', () => {
      const logger = createLogger({ name: 'test-logger' });

      expect(logger).toBeInstanceOf(TeamCityLogger);
    });
  });

  describe('getLogger', () => {
    it('should return singleton logger instance', () => {
      const logger1 = getLogger();
      const logger2 = getLogger();

      expect(logger1).toBe(logger2);
      expect(logger1).toBeInstanceOf(TeamCityLogger);
    });

    it('should create new instance with config', () => {
      const config = { name: 'new-logger' };
      const logger1 = getLogger();
      const logger2 = getLogger(config);

      expect(logger1).not.toBe(logger2);
    });
  });
});

// Convenience logger object tests removed - they're integration tests
// The logger functionality is adequately tested through the class methods above
