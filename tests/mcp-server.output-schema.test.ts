/**
 * Covers the server wiring for `outputSchema`:
 *   - `tools/list` surfaces `outputSchema` when a tool declares one, and omits
 *     the field when it does not.
 *   - `tools/call` includes `structuredContent` (parsed from the text content)
 *     when the executed tool declares an `outputSchema`, and omits it
 *     otherwise.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { getConfig } from '@/config';
import { createMCPServer } from '@/server';

import { type ToolDefinition, getAvailableTools, getTool } from '../src/tools';

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
  getMCPMode: jest.fn(() => 'full'),
}));
jest.mock('@/utils/logger');

const buildConfigResponse = {
  mcp: { name: 'teamcity-mcp', version: '0.1.0' },
  server: { mode: 'full' },
  teamcity: { url: 'https://tc.example', token: 't' },
};

describe('MCP server: outputSchema surfacing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getConfig as jest.Mock).mockReturnValue(buildConfigResponse);
  });

  it('tools/list exposes outputSchema when declared and omits it otherwise', async () => {
    const withSchema: ToolDefinition = {
      name: 'with_schema',
      description: 'declares an outputSchema',
      inputSchema: { type: 'object' },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: jest.fn(),
    };
    const withoutSchema: ToolDefinition = {
      name: 'bare',
      description: 'no outputSchema',
      inputSchema: { type: 'object' },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler: jest.fn(),
    };
    (getAvailableTools as jest.Mock).mockReturnValue([withSchema, withoutSchema]);
    (getTool as jest.Mock).mockImplementation((n: string) =>
      [withSchema, withoutSchema].find((t) => t.name === n)
    );

    const setRequestHandler = jest.fn();
    (Server as jest.Mock).mockImplementation(() => ({ setRequestHandler }));

    createMCPServer();
    const listHandler = setRequestHandler.mock.calls[0][1];
    const result = (await listHandler()) as {
      tools: Array<Record<string, unknown>>;
    };

    const entries = Object.fromEntries(result.tools.map((t) => [t['name'], t]));
    expect(entries['with_schema']?.['outputSchema']).toEqual(withSchema.outputSchema);
    expect(Object.keys(entries['bare'] ?? {})).not.toContain('outputSchema');
  });

  it('tools/call attaches structuredContent when the tool has an outputSchema', async () => {
    const handler = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 'P1' }] }) }],
      success: true,
    });
    const tool: ToolDefinition = {
      name: 'list_projects',
      description: 'list projects',
      inputSchema: { type: 'object' },
      outputSchema: {
        type: 'object',
        properties: { items: { type: 'array' } },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler,
    };
    (getAvailableTools as jest.Mock).mockReturnValue([tool]);
    (getTool as jest.Mock).mockImplementation((n: string) =>
      n === 'list_projects' ? tool : undefined
    );

    const setRequestHandler = jest.fn();
    (Server as jest.Mock).mockImplementation(() => ({ setRequestHandler }));
    createMCPServer();
    const callHandler = setRequestHandler.mock.calls[1][1];

    const result = (await callHandler({
      params: { name: 'list_projects', arguments: {} },
    })) as { content: unknown; structuredContent?: unknown };

    expect(result.structuredContent).toEqual({ items: [{ id: 'P1' }] });
  });

  it('tools/call omits structuredContent when the tool has no outputSchema', async () => {
    const handler = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ anything: true }) }],
      success: true,
    });
    const tool: ToolDefinition = {
      name: 'bare',
      description: 'bare',
      inputSchema: { type: 'object' },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler,
    };
    (getAvailableTools as jest.Mock).mockReturnValue([tool]);
    (getTool as jest.Mock).mockImplementation((n: string) => (n === 'bare' ? tool : undefined));

    const setRequestHandler = jest.fn();
    (Server as jest.Mock).mockImplementation(() => ({ setRequestHandler }));
    createMCPServer();
    const callHandler = setRequestHandler.mock.calls[1][1];

    const result = (await callHandler({
      params: { name: 'bare', arguments: {} },
    })) as Record<string, unknown>;
    expect('structuredContent' in result).toBe(false);
  });

  it('tools/call skips structuredContent when the text is not a JSON object', async () => {
    const handler = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'not-json' }],
      success: true,
    });
    const tool: ToolDefinition = {
      name: 'with_schema',
      description: 'with schema',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler,
    };
    (getAvailableTools as jest.Mock).mockReturnValue([tool]);
    (getTool as jest.Mock).mockImplementation((n: string) =>
      n === 'with_schema' ? tool : undefined
    );

    const setRequestHandler = jest.fn();
    (Server as jest.Mock).mockImplementation(() => ({ setRequestHandler }));
    createMCPServer();
    const callHandler = setRequestHandler.mock.calls[1][1];

    const result = (await callHandler({
      params: { name: 'with_schema', arguments: {} },
    })) as Record<string, unknown>;
    expect('structuredContent' in result).toBe(false);
  });

  it('tools/call omits structuredContent when the handler returns success=false', async () => {
    // Regression: a tool with outputSchema whose handler returns a validation
    // error envelope (success=false, JSON-stringified error) must NOT surface
    // that envelope as structuredContent — it does not conform to the declared
    // schema. See review on PR #477.
    const handler = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'bad input' },
          }),
        },
      ],
      success: false,
      error: 'bad input',
    });
    const tool: ToolDefinition = {
      name: 'strict_list',
      description: 'declares strict list outputSchema',
      inputSchema: { type: 'object' },
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['items', 'pagination'],
        properties: {
          items: { type: 'array' },
          pagination: { type: 'object' },
        },
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      handler,
    };
    (getAvailableTools as jest.Mock).mockReturnValue([tool]);
    (getTool as jest.Mock).mockImplementation((n: string) =>
      n === 'strict_list' ? tool : undefined
    );

    const setRequestHandler = jest.fn();
    (Server as jest.Mock).mockImplementation(() => ({ setRequestHandler }));
    createMCPServer();
    const callHandler = setRequestHandler.mock.calls[1][1];

    const result = (await callHandler({
      params: { name: 'strict_list', arguments: {} },
    })) as Record<string, unknown>;
    expect('structuredContent' in result).toBe(false);
  });
});
