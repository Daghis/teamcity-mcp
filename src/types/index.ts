/**
 * Type definitions for TeamCity MCP Server
 */

// MCP Tool Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema structure
  handler: ToolHandler;
}

// ToolResponse type
export interface ToolResponse {
  content?: Array<{ type: string; text: string }>;
  error?: string;
  success?: boolean;
  data?: unknown;
}

export type ToolHandler = (params: unknown) => Promise<ToolResponse>;

// Configuration Types
export interface ServerConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  mode: 'dev' | 'full';
}

export interface TeamCityConfig {
  url: string;
  token: string;
}

export interface AppConfig {
  server: ServerConfig;
  teamcity: TeamCityConfig;
}

// TeamCity API Types
export interface BuildConfiguration {
  id: string;
  name: string;
  projectId: string;
  description?: string;
  parameters?: Record<string, string>;
}

export interface Build {
  id: number;
  buildTypeId: string;
  number: string;
  status: BuildStatus;
  state: BuildState;
  branchName?: string;
  startDate?: string;
  finishDate?: string;
  queuedDate: string;
  statusText?: string;
}

export type BuildStatus = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'UNKNOWN';
export type BuildState = 'queued' | 'running' | 'finished';

export interface TestOccurrence {
  id: string;
  name: string;
  status: 'SUCCESS' | 'FAILURE' | 'IGNORED';
  duration: number;
  details?: string;
  stackTrace?: string;
}

export interface Project {
  id: string;
  name: string;
  parentProjectId?: string;
  description?: string;
  archived: boolean;
}

// Request/Response Types
export interface TriggerBuildRequest {
  buildTypeId: string;
  branchName?: string;
  parameters?: Record<string, string>;
  comment?: string;
}

export interface TriggerBuildResponse {
  id: number;
  buildTypeId: string;
  state: BuildState;
  href: string;
}

export interface BuildStatusRequest {
  buildId: number;
}

export interface BuildStatusResponse {
  id: number;
  state: BuildState;
  status?: BuildStatus;
  percentComplete?: number;
  statusText?: string;
}

// Error Types
export class MCPError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

export class TeamCityAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'TeamCityAPIError';
  }
}

// Type guard for Error objects
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

// Type guard for ZodError-like objects
export interface ZodErrorLike {
  name: 'ZodError';
  errors: Array<{
    path: (string | number)[];
    message: string;
    code: string;
  }>;
}

export function isZodError(value: unknown): value is ZodErrorLike {
  return (
    isError(value) &&
    value.name === 'ZodError' &&
    'errors' in value &&
    Array.isArray((value as { errors: unknown }).errors)
  );
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type AsyncReturnType<T extends (...args: unknown[]) => Promise<unknown>> = T extends (
  ...args: unknown[]
) => Promise<infer R>
  ? R
  : unknown;

// Re-export specific module types
export * from './mcp';
export * from './teamcity';
export * from './config';
