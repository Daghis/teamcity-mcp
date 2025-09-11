/**
 * MCP-specific type definitions
 */

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPErrorResponse;
}

export interface MCPErrorResponse {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  capabilities: MCPCapabilities;
}

export interface MCPCapabilities {
  tools?: boolean;
  prompts?: boolean;
  resources?: boolean;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  toolCallId: string;
  content: Array<{
    type: 'text' | 'image' | 'error';
    text?: string;
    image?: string;
    error?: string;
  }>;
}

export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000,
}

export interface MCPSession {
  id: string;
  clientInfo?: {
    name: string;
    version: string;
  };
  startTime: Date;
  lastActivity: Date;
}
