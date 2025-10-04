/**
 * Centralized error logging utility
 * Provides structured, contextual error logging with proper formatting
 */
import { MCPToolError } from '@/middleware/error';
import { error as logError, info as logInfo, warn as logWarn } from '@/utils/logger';

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  component?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LoggedError {
  message: string;
  stack?: string;
  code?: string;
  timestamp: string;
  context?: ErrorContext;
}

/**
 * Enhanced error logger with structured context
 */
export class ErrorLogger {
  private static instance: ErrorLogger;

  public static getInstance(): ErrorLogger {
    ErrorLogger.instance ??= new ErrorLogger();
    return ErrorLogger.instance;
  }

  /**
   * Log error with structured context
   */
  logError(message: string, error?: Error | unknown, context?: ErrorContext): LoggedError {
    const loggedError: LoggedError = {
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    if (error instanceof Error) {
      loggedError.stack = error.stack;

      if (error instanceof MCPToolError) {
        loggedError.code = error.code;
        loggedError.context = {
          ...context,
          statusCode: error.statusCode,
          errorData: error.data,
        };
      }
    }

    logError(message, error instanceof Error ? error : undefined, context);
    return loggedError;
  }

  /**
   * Log warning with context
   */
  logWarning(message: string, context?: ErrorContext): void {
    logWarn(message, context);
  }

  /**
   * Log info with context
   */
  logInfo(message: string, context?: ErrorContext): void {
    logInfo(message, context);
  }

  /**
   * Create error logger for a specific component
   */
  forComponent(componentName: string): ComponentErrorLogger {
    return new ComponentErrorLogger(componentName, this);
  }
}

/**
 * Component-specific error logger
 */
export class ComponentErrorLogger {
  constructor(
    private readonly componentName: string,
    private readonly errorLogger: ErrorLogger
  ) {}

  logError(
    message: string,
    error?: Error | unknown,
    context?: Omit<ErrorContext, 'component'>
  ): LoggedError {
    return this.errorLogger.logError(message, error, {
      ...context,
      component: this.componentName,
    });
  }

  logWarning(message: string, context?: Omit<ErrorContext, 'component'>): void {
    this.errorLogger.logWarning(message, {
      ...context,
      component: this.componentName,
    });
  }

  logInfo(message: string, context?: Omit<ErrorContext, 'component'>): void {
    this.errorLogger.logInfo(message, {
      ...context,
      component: this.componentName,
    });
  }
}

// Export singleton instance
export const errorLogger = ErrorLogger.getInstance();

/**
 * Helper function to replace console.log/console.error calls
 */
export function logStructured(
  level: 'error' | 'warn' | 'info',
  message: string,
  error?: Error | unknown,
  context?: ErrorContext
): void {
  switch (level) {
    case 'error':
      errorLogger.logError(message, error, context);
      break;
    case 'warn':
      errorLogger.logWarning(message, context);
      break;
    case 'info':
      errorLogger.logInfo(message, context);
      break;
  }
}
