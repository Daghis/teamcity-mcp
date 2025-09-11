// Thin compatibility wrapper around the enhanced TeamCityLogger
// to keep existing imports (`@/utils/logger`) stable across the codebase.
import type { Logger } from 'winston';

import {
  TeamCityLogger,
  createLogger as createTeamCityLogger,
  logger as enhancedLogger,
  getLogger as getTeamCityLogger,
} from './logger/index';

export type { TeamCityLogger };

export function createLogger(name = 'teamcity-mcp'): Logger {
  // Map legacy createLogger(name) to enhanced logger factory
  const instance = createTeamCityLogger({ name });
  return instance.getWinstonInstance();
}

export function getLogger(): Logger {
  return getTeamCityLogger().getWinstonInstance();
}

export function info(message: string, meta?: Record<string, unknown>): void {
  enhancedLogger.info(message, meta);
}

export function error(
  message: string,
  err?: Error | unknown,
  meta?: Record<string, unknown>
): void {
  enhancedLogger.error(message, err, meta);
}

export function warn(message: string, meta?: Record<string, unknown>): void {
  enhancedLogger.warn(message, meta);
}

export function debug(message: string, meta?: Record<string, unknown>): void {
  enhancedLogger.debug(message, meta);
}

export function child(meta: Record<string, unknown>): Logger {
  // Create a child on the underlying Winston instance to preserve expected type
  return getTeamCityLogger()
    .getWinstonInstance()
    .child(meta as never);
}
