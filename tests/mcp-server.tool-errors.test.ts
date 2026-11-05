/**
 * Covers how `tools/call` reports a failed tool execution: per the MCP spec a
 * tool error is returned in-band with `isError: true`, while successful results
 * carry no `isError` flag.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { getConfig } from '@/config';
import { createMCPServer } from '@/server';
import { runTool } from '@/utils/mcp';

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

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const callTool = async (handler: ToolDefinition['handler']): Promise<Record<string, unknown>> => {
  const tool: ToolDefinition = {
    name: 'probe',
    description: 'probe tool',
    inputSchema: { type: 'object' },
    annotations,
    handler,
  };
  (getAvailableTools as jest.Mock).mockReturnValue([tool]);
  (getTool as jest.Mock).mockImplementation((n: string) => (n === 'probe' ? tool : undefined));

  const setRequestHandler = jest.fn();
  (Server as jest.Mock).mockImplementation(() => ({ setRequestHandler }));
  createMCPServer();
  const callHandler = setRequestHandler.mock.calls[1][1];
  return (await callHandler({ params: { name: 'probe', arguments: {} } })) as Record<
    string,
    unknown
  >;
};

describe('MCP server: tool errors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getConfig as jest.Mock).mockReturnValue({
      mcp: { name: 'teamcity-mcp', version: '0.1.0' },
      server: { mode: 'full' },
      teamcity: { url: 'https://tc.example', token: 't' },
    });
  });

  it('marks a failed TeamCity request as isError and keeps the error envelope as content', async () => {
    const result = await callTool((args) =>
      runTool(
        'probe',
        null,
        async () => {
          throw new Error('Request failed with status code 400');
        },
        args
      )
    );

    expect(result['isError']).toBe(true);
    const content = result['content'] as Array<{ type: string; text: string }>;
    const envelope = JSON.parse(content[0]?.text ?? '{}') as {
      success: boolean;
      error: { message: string };
    };
    expect(envelope.success).toBe(false);
    expect(envelope.error.message).toContain('400');
  });

  it('marks a handler result with success=false as isError', async () => {
    const result = await callTool(
      jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Build 42 not found' }],
        success: false,
        error: 'Build 42 not found',
      })
    );

    expect(result['isError']).toBe(true);
    expect(result['content']).toEqual([{ type: 'text', text: 'Build 42 not found' }]);
  });

  it('does not set isError on a successful result', async () => {
    const result = await callTool(
      jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
        success: true,
      })
    );

    expect('isError' in result).toBe(false);
  });
});
