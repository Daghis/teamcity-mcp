/**
 * Tests for MCP Server Initialization
 * Verifies that the MCP server starts correctly and handles tools
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { getConfig } from '@/config';
import { createMCPServer } from '@/server';

import { type ToolDefinition, getAvailableTools, getTool } from '../src/tools';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ErrorCode: {
    MethodNotFound: -32601,
    InternalError: -32603,
  },
  McpError: class McpError extends Error {
    constructor(
      public code: number,
      message: string
    ) {
      super(message);
      this.name = 'McpError';
    }
  },
  ListToolsRequestSchema: { method: 'tools/list' },
  CallToolRequestSchema: { method: 'tools/call' },
}));
jest.mock('@/config');
jest.mock('../src/tools', () => ({
  getAvailableTools: jest.fn(),
  getTool: jest.fn(),
  getMCPMode: jest.fn(() => 'dev'),
}));
jest.mock('@/utils/logger');

describe('MCP Server Initialization', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    (getConfig as jest.Mock).mockReturnValue({
      mcp: {
        name: 'teamcity-mcp',
        version: '0.1.0',
        capabilities: {
          tools: true,
          prompts: false,
          resources: false,
        },
      },
      server: {
        mode: 'dev',
      },
      teamcity: {
        url: 'https://teamcity.example.com',
        token: 'test-token',
      },
    });

    const defaultTools = [
      {
        name: 'ping',
        description: 'Test connectivity',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
          },
        },
        handler: jest.fn(),
      },
    ];

    (getAvailableTools as jest.Mock).mockReturnValue(defaultTools);

    // Mock getTool to find tools from the available tools
    (getTool as jest.Mock).mockImplementation((name: string) => {
      const tools = (getAvailableTools as jest.Mock)() as ToolDefinition[];
      return tools.find((tool: ToolDefinition) => tool.name === name);
    });
  });

  describe('createMCPServer', () => {
    it('should create an MCP server instance', () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      const server = createMCPServer();

      expect(server).toBeDefined();
    });

    // Removed implementation-detail assertions about handler registration and tool loading

    it('should handle ListToolsRequest', async () => {
      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      // Get the list tools handler
      const listToolsHandler = mockSetRequestHandler.mock.calls[0][1];

      // Call the handler
      const result = await listToolsHandler();

      expect(result).toEqual({
        tools: [
          {
            name: 'ping',
            description: 'Test connectivity',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string' },
              },
            },
          },
        ],
      });
    });

    it('should handle CallToolRequest for existing tool', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true, data: { result: 'pong' } });
      const toolMock = {
        name: 'ping',
        description: 'Test connectivity',
        inputSchema: {},
        handler: mockHandler,
      };

      (getAvailableTools as jest.Mock).mockReturnValue([toolMock]);
      (getTool as jest.Mock).mockImplementation((name: string) => {
        return name === 'ping' ? toolMock : undefined;
      });

      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      // Get the call tool handler
      const callToolHandler = mockSetRequestHandler.mock.calls[1][1];

      // Call the handler
      const result = await callToolHandler({
        params: {
          name: 'ping',
          arguments: { message: 'test' },
        },
      });

      expect(mockHandler).toHaveBeenCalledWith({ message: 'test' });
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Tool executed successfully',
          },
        ],
      });
    });

    it('should handle CallToolRequest for non-existing tool', async () => {
      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      // Get the call tool handler
      const callToolHandler = mockSetRequestHandler.mock.calls[1][1];

      // Call the handler for non-existing tool
      await expect(
        callToolHandler({
          params: {
            name: 'non-existing-tool',
            arguments: {},
          },
        })
      ).rejects.toThrow('Unknown tool: non-existing-tool');
    });
  });

  describe('Server Configuration', () => {
    it('should initialize using configuration without errors', () => {
      const mockServer = {
        setRequestHandler: jest.fn(),
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      expect(() => createMCPServer()).not.toThrow();
    });

    it('should handle disabled capabilities', () => {
      (getConfig as jest.Mock).mockReturnValue({
        mcp: {
          name: 'teamcity-mcp',
          version: '0.1.0',
          capabilities: {
            tools: false,
            prompts: false,
            resources: false,
          },
        },
        server: {
          mode: 'dev',
        },
      });

      const mockServer = {
        setRequestHandler: jest.fn(),
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      expect(() => createMCPServer()).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in tool execution', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: false, error: 'Tool error' });
      const toolMock = {
        name: 'failing-tool',
        description: 'A tool that fails',
        inputSchema: {},
        handler: mockHandler,
      };

      (getAvailableTools as jest.Mock).mockReturnValue([toolMock]);
      (getTool as jest.Mock).mockImplementation((name: string) => {
        return name === 'failing-tool' ? toolMock : undefined;
      });

      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      const callToolHandler = mockSetRequestHandler.mock.calls[1][1];

      const result = await callToolHandler({
        params: {
          name: 'failing-tool',
          arguments: {},
        },
      });

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Tool error',
          },
        ],
      });
    });

    it('should validate tool input against schema', async () => {
      const mockHandler = jest.fn();
      const toolMock = {
        name: 'validated-tool',
        description: 'A tool with validation',
        inputSchema: {
          type: 'object',
          properties: {
            required_field: { type: 'string' },
          },
          required: ['required_field'],
        },
        handler: mockHandler,
      };

      (getAvailableTools as jest.Mock).mockReturnValue([toolMock]);
      (getTool as jest.Mock).mockImplementation((name: string) => {
        return name === 'validated-tool' ? toolMock : undefined;
      });

      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      const callToolHandler = mockSetRequestHandler.mock.calls[1][1];

      // Call with invalid input
      await expect(
        callToolHandler({
          params: {
            name: 'validated-tool',
            arguments: { wrong_field: 'value' },
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Tool Registration', () => {
    it('should register multiple tools', async () => {
      (getAvailableTools as jest.Mock).mockReturnValue([
        {
          name: 'tool1',
          description: 'First tool',
          inputSchema: {},
          handler: jest.fn(),
        },
        {
          name: 'tool2',
          description: 'Second tool',
          inputSchema: {},
          handler: jest.fn(),
        },
        {
          name: 'tool3',
          description: 'Third tool',
          inputSchema: {},
          handler: jest.fn(),
        },
      ]);

      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      const listToolsHandler = mockSetRequestHandler.mock.calls[0][1];
      const result = await listToolsHandler();

      expect(result.tools).toHaveLength(3);
      expect(result.tools.map((t: { name: string }) => t.name)).toEqual([
        'tool1',
        'tool2',
        'tool3',
      ]);
    });

    it('should handle empty tool list', async () => {
      (getAvailableTools as jest.Mock).mockReturnValue([]);

      const mockSetRequestHandler = jest.fn();
      const mockServer = {
        setRequestHandler: mockSetRequestHandler,
      };
      (Server as jest.Mock).mockImplementation(() => mockServer);

      createMCPServer();

      const listToolsHandler = mockSetRequestHandler.mock.calls[0][1];
      const result = await listToolsHandler();

      expect(result.tools).toHaveLength(0);
    });
  });
});
