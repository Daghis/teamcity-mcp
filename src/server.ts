/**
 * Simple MCP Server for TeamCity
 * Direct implementation without complex abstractions
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { info, debug as logDebug, error as logError } from '@/utils/logger';

import { getConfig } from './config';
import { getAvailableTools, getMCPMode, getTool } from './tools';

/**
 * Create a simple MCP server
 */
export function createMCPServer(): Server {
  return createSimpleServer();
}

export function createSimpleServer(): Server {
  // Server initialization
  const _config = getConfig();

  // Load available tools to validate configuration
  getAvailableTools();

  const server = new Server(
    {
      name: 'teamcity-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        prompts: undefined,
        resources: undefined,
      },
    }
  );

  // Register tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const currentTools = getAvailableTools(); // Get fresh list in case env changed
    // Listing tools in current mode
    info('MCP request: tools/list', { mode: getMCPMode(), count: currentTools.length });

    const response = {
      tools: currentTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
    logDebug('MCP response: tools/list', { count: response.tools.length, success: true });
    return response;
  });

  // Register tool execution handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // Executing tool with arguments
    const started = Date.now();
    info('MCP request: tools/call', { tool: name, args });

    const tool = getTool(name);
    if (!tool) {
      // Unknown tool requested
      const availableTools = getAvailableTools();
      logError('MCP error: unknown tool', undefined, {
        tool: name,
        available: availableTools.map((t) => t.name),
        mode: getMCPMode(),
      });
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}. Available tools in ${getMCPMode().toUpperCase()} mode: ${availableTools.map((t) => t.name).join(', ')}`
      );
    }

    try {
      const result = await tool.handler(args ?? {});
      // Tool executed successfully
      // MCP SDK expects a specific format for tool responses
      const response = {
        content: result.content ?? [
          { type: 'text', text: result.error ?? 'Tool executed successfully' },
        ],
      };
      const duration = Date.now() - started;
      const success = result?.success !== false;
      logDebug('MCP response: tools/call', {
        tool: name,
        success,
        duration,
        contentTypes: response.content?.map((c) => c.type),
      });
      return response;
    } catch (error) {
      // Tool execution failed

      if (error instanceof McpError) {
        const duration = Date.now() - started;
        logError('MCP error: tool call', error, { tool: name, success: false, duration });
        throw error;
      }

      const duration = Date.now() - started;
      logError('MCP error: tool call (unexpected)', error, {
        tool: name,
        success: false,
        duration,
      });
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  return server;
}
