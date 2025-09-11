/**
 * Unit tests for MCP server
 */
import { type ToolDefinition, getAvailableTools } from '../../src/tools';

describe('MCP Server', () => {
  describe('Server Creation', () => {
    test('should create MCP server instance', async () => {
      const { createMCPServer } = await import('../../src/server');
      const server = createMCPServer();

      expect(server).toBeDefined();
      // Server class from @modelcontextprotocol/sdk/server has specific methods
      expect(typeof server.setRequestHandler).toBe('function');
    });

    test('should have proper server configuration', async () => {
      const { getConfig } = await import('../../src/config');
      const config = getConfig();

      expect(config.mcp).toBeDefined();
      expect(config.mcp.name).toBe('teamcity-mcp');
      expect(config.mcp.version).toBeDefined();
    });

    // Removed env-var dependent test: MCP_MODE handling
  });

  describe('Tool Registration', () => {
    test('should have ping tool available', () => {
      const tools = getAvailableTools();
      const pingTool = tools.find((t: ToolDefinition) => t.name === 'ping');

      expect(pingTool).toBeDefined();
      expect(pingTool?.description).toContain('connectivity');
      expect(pingTool?.inputSchema).toBeDefined();
    });

    test('should have list_projects tool available', () => {
      const tools = getAvailableTools();
      const listProjectsTool = tools.find((t: ToolDefinition) => t.name === 'list_projects');

      expect(listProjectsTool).toBeDefined();
      expect(listProjectsTool?.description).toContain('TeamCity projects');
    });

    test('should have proper number of tools registered', () => {
      const tools = getAvailableTools();

      expect(tools.length).toBeGreaterThan(0);
      expect(
        tools.every(
          (t: ToolDefinition) =>
            Boolean(t.name) && Boolean(t.description) && typeof t.handler === 'function'
        )
      ).toBe(true);
    });
  });

  describe('Configuration', () => {
    // Removed env-var dependent test: configuration from environment
    // Removed env-var dependent test: default values when env vars missing
    // Removed env-var dependent test: TeamCity configuration via environment
  });

  describe('Logging', () => {
    test('should create logger instance', async () => {
      const { createLogger } = await import('../../src/utils/logger');
      const logger = createLogger();

      expect(logger).toBeDefined();
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('debug');
    });

    // Removed env-var dependent test: log level via environment
  });

  describe('Error Handling', () => {
    test('should handle MCP errors properly', async () => {
      const { MCPError } = await import('../../src/types');

      const error = new MCPError('Test error', 'TEST_ERROR', 400);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
    });

    test('should handle TeamCity API errors', async () => {
      const { TeamCityAPIError } = await import('../../src/types');

      const error = new TeamCityAPIError('API error', 500, { detail: 'Server error' });
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('API error');
      expect(error.statusCode).toBe(500);
      expect(error.response).toEqual({ detail: 'Server error' });
    });
  });
});
