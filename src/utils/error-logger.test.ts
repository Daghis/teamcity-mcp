/**
 * Error logger tests
 */
import { MCPToolError } from '@/middleware/error';
import { error as logError, info as logInfo, warn as logWarn } from '@/utils/logger';

import { ComponentErrorLogger, ErrorLogger, errorLogger, logStructured } from './error-logger';

// Mock the logger utilities
jest.mock('@/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const mockLogError = logError as jest.MockedFunction<typeof logError>;
const mockLogWarn = logWarn as jest.MockedFunction<typeof logWarn>;
const mockLogInfo = logInfo as jest.MockedFunction<typeof logInfo>;

describe('ErrorLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ErrorLogger.getInstance();
      const instance2 = ErrorLogger.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const logger = ErrorLogger.getInstance();
      const testError = new Error('Test error');
      const context = { requestId: 'req-123', operation: 'test' };

      const result = logger.logError('Test message', testError, context);

      expect(result.message).toBe('Test message');
      expect(result.stack).toBe(testError.stack);
      expect(result.context).toEqual(context);
      expect(result.timestamp).toBeDefined();
      expect(mockLogError).toHaveBeenCalledWith('Test message', testError, context);
    });

    it('should handle MCP tool errors', () => {
      const logger = ErrorLogger.getInstance();
      const mcpError = new MCPToolError('MCP error', 'TEST_CODE', 400, { test: 'data' });
      const context = { requestId: 'req-123' };

      const result = logger.logError('MCP test', mcpError, context);

      expect(result.code).toBe('TEST_CODE');
      expect(result.context).toEqual({
        requestId: 'req-123',
        statusCode: 400,
        errorData: { test: 'data' },
      });
    });

    it('should handle non-Error objects', () => {
      const logger = ErrorLogger.getInstance();
      const context = { operation: 'test' };

      const result = logger.logError('String error', 'some error', context);

      expect(result.message).toBe('String error');
      expect(result.stack).toBeUndefined();
      expect(result.context).toEqual(context);
    });
  });

  describe('logWarning', () => {
    it('should log warning with context', () => {
      const logger = ErrorLogger.getInstance();
      const context = { component: 'test-component' };

      logger.logWarning('Warning message', context);

      expect(mockLogWarn).toHaveBeenCalledWith('Warning message', context);
    });
  });

  describe('logInfo', () => {
    it('should log info with context', () => {
      const logger = ErrorLogger.getInstance();
      const context = { operation: 'info-op' };

      logger.logInfo('Info message', context);

      expect(mockLogInfo).toHaveBeenCalledWith('Info message', context);
    });
  });

  describe('forComponent', () => {
    it('should create component logger', () => {
      const logger = ErrorLogger.getInstance();
      const componentLogger = logger.forComponent('TestComponent');

      expect(componentLogger).toBeInstanceOf(ComponentErrorLogger);
    });
  });
});

describe('ComponentErrorLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log error with component context', () => {
    const componentLogger = errorLogger.forComponent('TestComponent');
    const testError = new Error('Component error');
    const context = { operation: 'test-op' };

    componentLogger.logError('Component message', testError, context);

    expect(mockLogError).toHaveBeenCalledWith('Component message', testError, {
      operation: 'test-op',
      component: 'TestComponent',
    });
  });

  it('should log warning with component context', () => {
    const componentLogger = errorLogger.forComponent('TestComponent');
    const context = { metadata: { key: 'value' } };

    componentLogger.logWarning('Component warning', context);

    expect(mockLogWarn).toHaveBeenCalledWith('Component warning', {
      metadata: { key: 'value' },
      component: 'TestComponent',
    });
  });

  it('should log info with component context', () => {
    const componentLogger = errorLogger.forComponent('TestComponent');

    componentLogger.logInfo('Component info');

    expect(mockLogInfo).toHaveBeenCalledWith('Component info', { component: 'TestComponent' });
  });
});

describe('logStructured', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log error level', () => {
    const testError = new Error('Structured error');
    const context = { requestId: 'req-123' };

    logStructured('error', 'Structured message', testError, context);

    expect(mockLogError).toHaveBeenCalledWith('Structured message', testError, context);
  });

  it('should log warning level', () => {
    const context = { component: 'test' };

    logStructured('warn', 'Warning message', undefined, context);

    expect(mockLogWarn).toHaveBeenCalledWith('Warning message', context);
  });

  it('should log info level', () => {
    logStructured('info', 'Info message');

    expect(mockLogInfo).toHaveBeenCalledWith('Info message', undefined);
  });
});
