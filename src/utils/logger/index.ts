/**
 * Centralized Logger Utility for TeamCity MCP Server
 *
 * This module provides a unified logging interface that consolidates
 * the existing logger implementations and enforces consistent logging
 * patterns throughout the application.
 */
import winston, { type Logger } from 'winston';

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly';

/**
 * Context information for logging
 */
export interface LogContext {
  /**
   * Tool name (for MCP tool execution)
   */
  toolName?: string;

  /**
   * Unique request identifier
   */
  requestId?: string;

  /**
   * Session identifier
   */
  sessionId?: string;

  /**
   * User identifier
   */
  userId?: string;

  /**
   * Operation duration in milliseconds
   */
  duration?: number;

  /**
   * Service or module name
   */
  service?: string;

  /**
   * TeamCity build ID
   */
  buildId?: string;

  /**
   * TeamCity project ID
   */
  projectId?: string;

  /**
   * Additional context properties
   */
  [key: string]: unknown;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  name?: string;
  level?: LogLevel;
  enableConsole?: boolean;
  enableFile?: boolean;
  logDirectory?: string;
  maxFileSize?: string;
  maxFiles?: number;
}

/**
 * Logger interface for type safety and consistency
 */
export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
  child(context: LogContext): ILogger;
}

/**
 * Enhanced logger implementation
 */
export class TeamCityLogger implements ILogger {
  private winston: Logger;
  private config: Required<LoggerConfig>;
  private requestCounter = 0;

  constructor(config: LoggerConfig = {}) {
    this.config = this.normalizeConfig(config);
    this.winston = this.createWinstonLogger();
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: LoggerConfig): Required<LoggerConfig> {
    const isProduction = process.env['NODE_ENV'] === 'production';
    const isDevelopment = process.env['NODE_ENV'] === 'development';
    const forceFile =
      process.env['TEAMCITY_LOG_TO_FILE'] === '1' || process.env['TEAMCITY_LOG_TO_FILE'] === 'true';

    return {
      name: config.name ?? 'teamcity-mcp',
      level:
        config.level ??
        (process.env['LOG_LEVEL'] as LogLevel) ??
        (isDevelopment ? 'debug' : 'info'),
      enableConsole: config.enableConsole ?? true,
      // Allow forcing file logging via env during tests or local runs
      enableFile: config.enableFile ?? (isProduction || forceFile),
      logDirectory: config.logDirectory ?? 'logs',
      maxFileSize: config.maxFileSize ?? '10m',
      maxFiles: config.maxFiles ?? 5,
    };
  }

  /**
   * Create Winston logger instance
   */
  private createWinstonLogger(): Logger {
    const { level, enableConsole, enableFile, logDirectory, maxFileSize, maxFiles, name } =
      this.config;
    const isProduction = process.env['NODE_ENV'] === 'production';

    // Custom format for development
    const devFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        const baseLog = `${timestamp} [${service}] ${level}: ${message}`;
        return this.formatContextualLog(baseLog, meta);
      })
    );

    // JSON format for production
    const prodFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const transports: winston.transport[] = [];

    // Console transport
    if (enableConsole) {
      transports.push(
        new winston.transports.Console({
          format: isProduction ? prodFormat : devFormat,
        })
      );
    }

    // File transports
    if (enableFile) {
      this.ensureLogDirectory(logDirectory);

      // Error-only log file
      transports.push(
        new winston.transports.File({
          filename: `${logDirectory}/error.log`,
          level: 'error',
          format: prodFormat,
          maxsize: this.parseFileSize(maxFileSize),
          maxFiles,
        })
      );

      // Combined log file
      transports.push(
        new winston.transports.File({
          filename: `${logDirectory}/combined.log`,
          format: prodFormat,
          maxsize: this.parseFileSize(maxFileSize),
          maxFiles,
        })
      );
    }

    return winston.createLogger({
      level,
      defaultMeta: { service: name },
      transports,
      exitOnError: false,
    });
  }

  /**
   * Format contextual log with MCP-specific information
   */
  private formatContextualLog(baseLog: string, context: LogContext): string {
    const { toolName, requestId, sessionId, duration, buildId, projectId, ...otherMeta } = context;

    const contextParts: string[] = [];

    if (requestId) contextParts.push(`req=${requestId}`);
    if (sessionId) contextParts.push(`session=${sessionId}`);
    if (toolName) contextParts.push(`tool=${toolName}`);
    if (buildId) contextParts.push(`build=${buildId}`);
    if (projectId) contextParts.push(`project=${projectId}`);
    if (duration !== undefined) contextParts.push(`${duration}ms`);

    const contextString = contextParts.length > 0 ? ` [${contextParts.join(' ')}]` : '';
    const metaString = Object.keys(otherMeta).length > 0 ? ` ${JSON.stringify(otherMeta)}` : '';

    return `${baseLog}${contextString}${metaString}`;
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(directory: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      if (fs.existsSync(directory) === false) {
        fs.mkdirSync(directory, { recursive: true });
      }
    } catch (error) {
      // Fallback to current directory if log directory creation fails
      this.winston?.warn?.('Failed to create log directory, using current directory', { error });
    }
  }

  /**
   * Parse file size string to bytes
   */
  private parseFileSize(size: string): number {
    const match = size.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const [, num, unit] = match;
    if (!num) return 10 * 1024 * 1024; // Default 10MB

    const multiplier =
      {
        '': 1,
        k: 1024,
        m: 1024 * 1024,
        g: 1024 * 1024 * 1024,
      }[unit?.toLowerCase() ?? ''] ?? 1;

    return parseInt(num, 10) * multiplier;
  }

  /**
   * Generate unique request ID
   */
  public generateRequestId(): string {
    this.requestCounter++;
    return `${Date.now()}-${this.requestCounter}`;
  }

  /**
   * Debug level logging
   */
  public debug(message: string, context: LogContext = {}): void {
    this.winston.debug(message, context);
  }

  /**
   * Info level logging
   */
  public info(message: string, context: LogContext = {}): void {
    this.winston.info(message, context);
  }

  /**
   * Warning level logging
   */
  public warn(message: string, context: LogContext = {}): void {
    this.winston.warn(message, context);
  }

  /**
   * Error level logging with optional error object
   */
  public error(message: string, error?: Error | unknown, context: LogContext = {}): void {
    const errorContext = { ...context };

    if (error instanceof Error) {
      errorContext['error'] = error.message;
      errorContext['stack'] = error.stack;
    } else if (error != null) {
      errorContext['error'] = String(error);
    }

    this.winston.error(message, errorContext);
  }

  /**
   * Create child logger with additional context
   */
  public child(context: LogContext): ILogger {
    const childLogger = new TeamCityLogger(this.config);
    childLogger.winston = this.winston.child(context);
    return childLogger;
  }

  /**
   * Log tool execution with performance metrics
   */
  public logToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    result: { success: boolean; error?: string },
    duration: number,
    context: LogContext = {}
  ): void {
    const toolContext: LogContext = {
      ...context,
      toolName,
      duration,
      args: JSON.stringify(args),
      success: result.success,
    };

    if (result.success) {
      this.info(`Tool executed successfully: ${toolName}`, toolContext);
    } else {
      this.error(`Tool execution failed: ${toolName}`, result.error, toolContext);
    }
  }

  /**
   * Log TeamCity API interactions
   */
  public logTeamCityRequest(
    method: string,
    url: string,
    status?: number,
    duration?: number,
    context: LogContext = {}
  ): void {
    const requestContext: LogContext = {
      ...context,
      method,
      url,
      status,
      duration,
    };

    if (status && status >= 400) {
      this.warn(`TeamCity API request failed: ${method} ${url}`, requestContext);
    } else {
      this.debug(`TeamCity API request: ${method} ${url}`, requestContext);
    }
  }

  /**
   * Log server lifecycle events
   */
  public logLifecycle(event: string, details?: Record<string, unknown>): void {
    this.info(`Server lifecycle: ${event}`, { lifecycle: event, ...details });
  }

  /**
   * Set log level dynamically
   */
  public setLevel(level: LogLevel): void {
    this.winston.level = level;
    this.config.level = level;
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.winston.level as LogLevel;
  }

  /**
   * Get underlying Winston instance (for advanced usage)
   */
  public getWinstonInstance(): Logger {
    return this.winston;
  }
}

// Default logger instance
let defaultLogger: TeamCityLogger | null = null;

/**
 * Get or create the default logger instance
 */
export function getLogger(config?: LoggerConfig): TeamCityLogger {
  if (!defaultLogger || config) {
    defaultLogger = new TeamCityLogger(config);
  }
  return defaultLogger;
}

/**
 * Create a new logger instance
 */
export function createLogger(config?: LoggerConfig): TeamCityLogger {
  return new TeamCityLogger(config);
}

/**
 * Convenience functions using the default logger
 */
export const logger = {
  debug: (message: string, context?: LogContext) => getLogger().debug(message, context),
  info: (message: string, context?: LogContext) => getLogger().info(message, context),
  warn: (message: string, context?: LogContext) => getLogger().warn(message, context),
  error: (message: string, error?: Error | unknown, context?: LogContext) =>
    getLogger().error(message, error, context),
  child: (context: LogContext) => getLogger().child(context),
  logToolExecution: (
    toolName: string,
    args: Record<string, unknown>,
    result: { success: boolean; error?: string },
    duration: number,
    context?: LogContext
  ) => getLogger().logToolExecution(toolName, args, result, duration, context),
  logTeamCityRequest: (
    method: string,
    url: string,
    status?: number,
    duration?: number,
    context?: LogContext
  ) => getLogger().logTeamCityRequest(method, url, status, duration, context),
  logLifecycle: (event: string, details?: Record<string, unknown>) =>
    getLogger().logLifecycle(event, details),
};

// Export types for external usage

// Backward compatibility exports
export const createTeamCityLogger = createLogger;
export const getTeamCityLogger = getLogger;
