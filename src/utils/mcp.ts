import { z } from 'zod';

import { formatError } from '@/middleware/error';
import { globalErrorHandler } from '@/middleware/global-error-handler';
import { getLogger as getTeamCityLogger } from '@/utils/logger/index';

// Minimal ToolResponse shape to avoid cyclic imports with tools
export interface ToolResponse {
  content?: Array<{ type: string; text: string }>;
  error?: string;
  success?: boolean;
  data?: unknown;
}

// Helpers to build consistent MCP tool responses
export function text(content: string): ToolResponse {
  return { content: [{ type: 'text', text: content }], success: true };
}

export function json(data: unknown): ToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], success: true };
}

export function errorText(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], success: false, error: message };
}

// Validate args with Zod (if provided) and route errors via the global handler
export async function runTool<T>(
  toolName: string,
  schema: z.ZodSchema<T> | null,
  handler: (args: T) => Promise<ToolResponse>,
  rawArgs: unknown,
  context?: { requestId?: string; userId?: string }
): Promise<ToolResponse> {
  const logger = getTeamCityLogger();
  const reqId = context?.requestId ?? logger.generateRequestId();
  const started = Date.now();
  try {
    const args = schema ? schema.parse(rawArgs) : (rawArgs as T);
    const result = await handler(args);
    const duration = Date.now() - started;
    const success = result?.success !== false;
    logger.logToolExecution(
      toolName,
      // Avoid logging secrets by shallow masking of obvious keys
      typeof args === 'object' && args != null
        ? Object.fromEntries(
            Object.entries(args as Record<string, unknown>).map(([k, v]) => [
              k,
              /token|authorization|password/i.test(k) ? '***' : v,
            ])
          )
        : ({} as Record<string, unknown>),
      { success, error: result?.error as string | undefined },
      duration,
      { requestId: reqId }
    );
    return result;
  } catch (err) {
    const duration = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    logger.logToolExecution(
      toolName,
      typeof rawArgs === 'object' && rawArgs != null
        ? (rawArgs as Record<string, unknown>)
        : ({} as Record<string, unknown>),
      { success: false, error: msg },
      duration,
      { requestId: reqId }
    );
    // Preserve validation error details for proper shaping
    if (err instanceof z.ZodError) {
      const formatted = formatError(err, { ...context, requestId: reqId });
      return json(formatted);
    }
    // Pass through original error so handler can extract rich details
    const formatted = globalErrorHandler.handleToolError(err, toolName, {
      ...context,
      requestId: reqId,
    });
    return json(formatted);
  }
}
