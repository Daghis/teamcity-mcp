/**
 * Utility Module Barrel Exports
 *
 * This file provides clean, organized exports for all utility modules,
 * making it easy to import commonly used functions and types.
 */
// Logger exports - use new centralized logger
// Import the required modules for the utilities object
import * as asyncUtils from './async';
import * as loggerUtils from './logger';
import * as serviceMessageUtils from './teamcity-service-messages';
import * as validationUtils from './validation';

export * from './logger';
export { getLogger, createLogger, info, error, warn, debug, child } from './logger';

// Validation exports - use new validation utilities
export * from './validation';
export {
  CommonSchemas,
  validateWithSchema,
  validateAndTransform,
  createValidationMiddleware,
  validateTeamCityUrl,
  validateBuildConfigId,
  validateBranchName,
  validateBuildParameters,
  sanitizeString,
  createSanitizedStringSchema,
  optional,
  nullable,
  createEnumSchema,
} from './validation';
export type { ValidationResult } from './validation';

// Async utilities exports
export * from './async';
export {
  asyncHandler,
  safeAsyncHandler,
  retry,
  withTimeout,
  sleep,
  debounce,
  asyncDebounce,
  throttle,
  parallelLimit,
  circuitBreaker,
  batchProcess,
  measureTime,
  asyncUtils,
  CircuitBreaker,
} from './async';
export type {
  RetryOptions,
  TimeoutOptions,
  CircuitBreakerOptions,
  CircuitState,
  AsyncResult,
} from './async';

// Re-export with deprecation warnings
export * from './error-logger';
export * from './lru-cache';
export * from './teamcity-service-messages';

// Add deprecation notice for legacy import pattern
const warnLegacyImport = () => {
  // Legacy import deprecation warning - removed as part of simplification
};

// Export warning function for consumers to call
export { warnLegacyImport };

// Common interface exports for better TypeScript experience
export interface IUtilities {
  logger: typeof loggerUtils;
  validation: typeof validationUtils;
  asyncUtils: typeof asyncUtils;
  serviceMessages: typeof serviceMessageUtils;
}

// Create a utilities object for convenient access
export const utilities: IUtilities = {
  logger: loggerUtils,
  validation: validationUtils,
  asyncUtils,
  serviceMessages: serviceMessageUtils,
};

// Default export for convenience
export default utilities;
