/**
 * Global error handler for the MCP server
 * Provides centralized error handling, logging, and response formatting
 */
import { AxiosError } from 'axios';

import { ErrorContext, errorLogger } from '@/utils/error-logger';

import {
  ErrorResponse,
  MCPRateLimitError,
  MCPTeamCityError,
  MCPTimeoutError,
  MCPToolError,
  formatError,
} from './error';

export interface GlobalErrorHandlerOptions {
  includeStackTrace?: boolean;
  sanitizeErrors?: boolean;
  logErrors?: boolean;
  defaultErrorMessage?: string;
}

/**
 * Global error handler class
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;

  constructor(private readonly options: GlobalErrorHandlerOptions = {}) {
    this.options = {
      includeStackTrace: process.env['NODE_ENV'] !== 'production',
      sanitizeErrors: process.env['NODE_ENV'] === 'production',
      logErrors: true,
      defaultErrorMessage: 'An unexpected error occurred',
      ...options,
    };
  }

  public static getInstance(options?: GlobalErrorHandlerOptions): GlobalErrorHandler {
    if (GlobalErrorHandler.instance == null) {
      GlobalErrorHandler.instance = new GlobalErrorHandler(options);
    }
    return GlobalErrorHandler.instance;
  }

  /**
   * Handle error from MCP tool execution
   */
  handleToolError(error: unknown, toolName: string, context?: ErrorContext): ErrorResponse {
    const enhancedContext: ErrorContext = {
      ...context,
      operation: toolName,
      component: 'MCP_TOOL',
    };

    // Transform specific error types
    const transformedError = this.transformError(error, enhancedContext);

    // Log the error if enabled
    if (this.options.logErrors) {
      errorLogger.logError(
        `Error in tool '${toolName}'`,
        transformedError instanceof Error ? transformedError : new Error(String(transformedError)),
        enhancedContext
      );
    }

    // Format error response
    return formatError(transformedError, enhancedContext);
  }

  /**
   * Handle async operation errors
   */
  handleAsyncError(error: unknown, operationName: string, context?: ErrorContext): never {
    const enhancedContext: ErrorContext = {
      ...context,
      operation: operationName,
      component: 'ASYNC_HANDLER',
    };

    const transformedError = this.transformError(error, enhancedContext);

    if (this.options.logErrors) {
      errorLogger.logError(
        `Async error in '${operationName}'`,
        transformedError instanceof Error ? transformedError : new Error(String(transformedError)),
        enhancedContext
      );
    }

    throw transformedError;
  }

  /**
   * Transform raw errors into structured MCP errors
   */
  private transformError(error: unknown, context: ErrorContext): Error {
    // Already an MCP error
    if (error instanceof MCPToolError) {
      // Still sanitize the message if needed
      if (this.options.sanitizeErrors) {
        const sanitizedMessage = this.sanitizeErrorMessage(error.message);
        return new MCPToolError(sanitizedMessage, error.code, error.statusCode, error.data);
      }
      return error;
    }

    // Axios/HTTP errors
    if (error instanceof AxiosError) {
      return this.transformAxiosError(error, context);
    }

    // Native errors
    if (error instanceof Error) {
      const sanitizedMessage = this.sanitizeErrorMessage(error.message);

      // Check for specific error patterns
      if (sanitizedMessage.includes('timeout') || error.name === 'TimeoutError') {
        return new MCPTimeoutError(context.operation ?? 'unknown', 30000);
      }

      if (sanitizedMessage.includes('rate limit') || sanitizedMessage.includes('429')) {
        return new MCPRateLimitError();
      }

      return new Error(sanitizedMessage);
    }

    // Unknown error types
    return new Error(this.sanitizeErrorMessage(String(error)));
  }

  /**
   * Transform Axios errors into MCPTeamCityError
   */
  private transformAxiosError(axiosError: AxiosError, context: ErrorContext): MCPTeamCityError {
    const status = axiosError.response?.status ?? 500;
    const data = axiosError.response?.data;

    let message = axiosError.message;
    let teamCityCode: string | undefined;

    // Extract TeamCity-specific error information
    if (data != null && typeof data === 'object') {
      if ('message' in data && typeof data.message === 'string') {
        message = data.message;
      }
      if ('errorCode' in data && typeof data.errorCode === 'string') {
        teamCityCode = data.errorCode;
      }
    }

    return new MCPTeamCityError(
      this.sanitizeErrorMessage(message),
      status,
      teamCityCode,
      context.requestId
    );
  }

  /**
   * Sanitize error messages for production
   */
  private sanitizeErrorMessage(message: string): string {
    if (!this.options.sanitizeErrors) {
      return message;
    }

    // Remove sensitive information patterns
    return message
      .replace(/token[=:]\s*[^\s&]+/gi, 'token=***')
      .replace(/password[=:]\s*[^\s&]+/gi, 'password=***')
      .replace(/apikey[=:]\s*[^\s&]+/gi, 'apikey=***')
      .replace(/authorization:\s*[^\s&]+/gi, 'authorization: ***');
  }

  /**
   * Check if error should be retried
   */
  isRetryableError(error: unknown): boolean {
    if (error instanceof MCPTeamCityError) {
      // Retry on temporary server errors
      return error.statusCode >= 500 && error.statusCode < 600;
    }

    if (error instanceof MCPTimeoutError) {
      return true;
    }

    if (error instanceof AxiosError) {
      // Network errors or temporary server issues
      return !error.response || (error.response.status >= 500 && error.response.status < 600);
    }

    return false;
  }
}

// Export singleton instance
export const globalErrorHandler = GlobalErrorHandler.getInstance();
