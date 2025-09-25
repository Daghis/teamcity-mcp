/**
 * Validation utility functions
 * Standardized validation using Zod schemas for consistent error handling
 */
import { z } from 'zod';

import { MCPValidationError } from '@/middleware/error';
import { errorLogger } from '@/utils/error-logger';

/**
 * Common Zod schemas used throughout the application
 */
export const CommonSchemas = {
  /**
   * TeamCity URL schema
   */
  teamCityUrl: z
    .string()
    .url()
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      {
        message: 'Must be a valid HTTP or HTTPS URL',
      }
    ),

  /**
   * Build configuration ID schema
   */
  buildConfigId: z
    .string()
    .min(1, 'Build config ID cannot be empty')
    .max(225, 'Build config ID cannot exceed 225 characters')
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      'Build config ID can only contain letters, numbers, underscores, dots, and hyphens'
    ),

  /**
   * Branch name schema
   */
  branchName: z
    .string()
    .min(1, 'Branch name cannot be empty')
    .max(255, 'Branch name cannot exceed 255 characters')
    .refine((branch) => !/[\s~^:?*[\]\\]/.test(branch), {
      message: 'Branch name cannot contain spaces or special characters (~^:?*[]\\)',
    }),

  /**
   * Build parameters schema
   */
  buildParameters: z.record(
    z.string().max(100, 'Parameter key cannot exceed 100 characters'),
    z.union([z.string(), z.number(), z.boolean(), z.null()])
  ),

  /**
   * Pagination schema
   */
  pagination: z.object({
    limit: z.number().int().min(1).max(1000).default(100),
    offset: z.number().int().min(0).default(0),
  }),

  /**
   * Date range schema
   */
  dateRange: z
    .object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .refine(
      (data) => {
        if (
          data.from !== null &&
          data.from !== undefined &&
          data.from.length > 0 &&
          data.to !== null &&
          data.to !== undefined &&
          data.to.length > 0
        ) {
          return new Date(data.from) <= new Date(data.to);
        }
        return true;
      },
      {
        message: 'Start date must be before end date',
      }
    ),
};

/**
 * Validation result interface
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: MCPValidationError;
}

/**
 * Validate data against a Zod schema
 */
export function validateWithSchema<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context?: { operation?: string; field?: string }
): ValidationResult<T> {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationError = new MCPValidationError(
        `Validation failed${context?.field && context.field.length > 0 ? ` for field '${context.field}'` : ''}`,
        error
      );

      errorLogger.logError('Validation error', validationError, {
        operation: context?.operation,
        field: context?.field,
        errors: error.issues,
      });

      return { success: false, error: validationError };
    }

    // Unexpected error during validation
    const unexpectedError = new MCPValidationError('Unexpected validation error', undefined);

    errorLogger.logError(
      'Unexpected validation error',
      error instanceof Error ? error : new Error(String(error)),
      context
    );

    return { success: false, error: unexpectedError };
  }
}

/**
 * Validate and transform data with a Zod schema, throwing on error
 */
export function validateAndTransform<T>(
  data: unknown,
  schema: z.ZodSchema<T>,
  context?: { operation?: string; field?: string }
): T {
  const result = validateWithSchema(data, schema, context);

  if (!result.success) {
    throw result.error ?? new MCPValidationError('Validation failed');
  }

  return result.data as T;
}

/**
 * Create a validation middleware for MCP tools
 */
export function createValidationMiddleware<T>(
  schema: z.ZodSchema<T>
): (data: unknown, toolName: string) => T {
  return (data: unknown, toolName: string): T => {
    return validateAndTransform(data, schema, {
      operation: toolName,
      field: 'input',
    });
  };
}

/**
 * Legacy validation functions (deprecated - use Zod schemas instead)
 */

/**
 * @deprecated Use CommonSchemas.teamCityUrl.safeParse() instead
 * Validates a TeamCity server URL
 */
export const validateTeamCityUrl = (url: string): boolean => {
  // Deprecated: Use CommonSchemas.teamCityUrl.safeParse() instead

  const result = CommonSchemas.teamCityUrl.safeParse(url);
  return result.success;
};

/**
 * @deprecated Use CommonSchemas.buildConfigId.safeParse() instead
 * Validates a build configuration ID
 */
export const validateBuildConfigId = (id: string): boolean => {
  // Deprecated: Use CommonSchemas.buildConfigId.safeParse() instead

  const result = CommonSchemas.buildConfigId.safeParse(id);
  return result.success;
};

/**
 * @deprecated Use CommonSchemas.branchName.safeParse() instead
 * Validates a branch name
 */
export const validateBranchName = (branch: string): boolean => {
  // Deprecated: Use CommonSchemas.branchName.safeParse() instead

  const result = CommonSchemas.branchName.safeParse(branch);
  return result.success;
};

/**
 * @deprecated Use CommonSchemas.buildParameters.safeParse() instead
 * Validates build parameters
 */
export const validateBuildParameters = (
  params: Record<string, unknown>
): { valid: boolean; errors: string[] } => {
  // Deprecated: Use CommonSchemas.buildParameters.safeParse() instead

  const result = CommonSchemas.buildParameters.safeParse(params);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

  return { valid: false, errors };
};

/**
 * Sanitizes a string for use in TeamCity API calls
 */
export const sanitizeString = (input: string, maxLength = 255): string => {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove control characters and trim
  // eslint-disable-next-line no-control-regex
  let sanitized = input.replace(/[\u0000-\u001F\u007F]/g, '').trim();

  // Truncate if needed
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
};

/**
 * Create a sanitized string schema
 */
export const createSanitizedStringSchema = (maxLength = 255) => {
  return z.string().transform((val) => sanitizeString(val, maxLength));
};

/**
 * Validation helper for optional fields
 */
export const optional = <T>(schema: z.ZodSchema<T>) => {
  return schema.optional();
};

/**
 * Validation helper for nullable fields
 */
export const nullable = <T>(schema: z.ZodSchema<T>) => {
  return schema.nullable();
};

/**
 * Create an enum schema from an array of strings
 */
export const createEnumSchema = <T extends string>(values: readonly T[]) => {
  return z.enum(values as [T, ...T[]]);
};
