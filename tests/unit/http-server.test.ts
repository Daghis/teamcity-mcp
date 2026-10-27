import { request } from 'node:http';

import type { Server as SdkServer } from '@modelcontextprotocol/sdk/server/index.js';

import { getMCPMode, resetMCPMode, setMCPMode } from '@/config';
import { type RunningHttpServer, startHttpServer } from '@/http-server';

// jest.config maps the SDK's Server and types.js to stubs; this end-to-end test needs the real ones.
import { Server } from '../../node_modules/@modelcontextprotocol/sdk/dist/cjs/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '../../node_modules/@modelcontextprotocol/sdk/dist/cjs/types.js';

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

const createModeServer = (): SdkServer => {
  const server = new Server(
    { name: 'test', version: '1.0.0' },
    { capabilities: { tools: { listChanged: true } } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'mode', inputSchema: { type: 'object' } }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const target = (req.params.arguments as { set?: 'dev' | 'full' } | undefined)?.set;
    if (target) {
      setMCPMode(target);
    }
    return { content: [{ type: 'text', text: getMCPMode() }] };
  });
  return server as unknown as SdkServer;
};

const send = (
  port: number,
  options: { method?: string; path?: string; headers?: Record<string, string>; body?: string }
): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'POST',
        path: options.path ?? '/mcp',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    req.end(options.body);
  });

const rpcResult = (reply: Reply): { result?: unknown; error?: { code: number } } => {
  const data = reply.body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length));
  return JSON.parse(data.length > 0 ? (data[data.length - 1] as string) : reply.body) as {
    result?: unknown;
    error?: { code: number };
  };
};

const initializeBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 't', version: '1' },
  },
});

const openSession = async (port: number): Promise<string> => {
  const reply = await send(port, { body: initializeBody });
  expect(reply.status).toBe(200);
  const sessionId = reply.headers['mcp-session-id'] as string;
  await send(port, {
    headers: { 'mcp-session-id': sessionId },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return sessionId;
};

const callMode = async (port: number, sessionId: string, set?: 'dev' | 'full'): Promise<string> => {
  const reply = await send(port, {
    headers: { 'mcp-session-id': sessionId },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'mode', arguments: set ? { set } : {} },
    }),
  });
  const { result } = rpcResult(reply) as { result: { content: Array<{ text: string }> } };
  return result.content[0]?.text as string;
};

describe('startHttpServer', () => {
  let running: RunningHttpServer;

  beforeEach(async () => {
    process.env['MCP_MODE'] = 'dev';
    resetMCPMode();
    running = await startHttpServer({
      host: '127.0.0.1',
      port: 0,
      createServer: createModeServer,
      log: () => undefined,
    });
  });

  afterEach(async () => {
    await running.close();
    resetMCPMode();
  });

  it('opens a session on initialize and serves requests within it', async () => {
    const sessionId = await openSession(running.port);

    const reply = await send(running.port, {
      headers: { 'mcp-session-id': sessionId },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });

    expect(reply.status).toBe(200);
    expect(rpcResult(reply).result).toEqual({
      tools: [{ name: 'mode', inputSchema: { type: 'object' } }],
    });
    expect(running.sessionCount()).toBe(1);
  });

  it('keeps a runtime mode switch inside the session that made it', async () => {
    const first = await openSession(running.port);
    const second = await openSession(running.port);

    expect(await callMode(running.port, first, 'full')).toBe('full');

    expect(await callMode(running.port, first)).toBe('full');
    expect(await callMode(running.port, second)).toBe('dev');
    expect(getMCPMode()).toBe('dev');
  });

  it('answers an unknown session id with 404 so the client re-initializes', async () => {
    const reply = await send(running.port, {
      headers: { 'mcp-session-id': 'gone' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });

    expect(reply.status).toBe(404);
    expect(rpcResult(reply).error?.code).toBe(-32001);
  });

  it('rejects a request without a session id that is not an initialize', async () => {
    const reply = await send(running.port, {
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });

    expect(reply.status).toBe(400);
    expect(rpcResult(reply).error?.code).toBe(-32600);
  });

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    const reply = await send(running.port, {
      headers: { host: 'attacker.example' },
      body: initializeBody,
    });

    expect(reply.status).toBe(403);
    expect(running.sessionCount()).toBe(0);
  });

  it('rejects a browser request from a foreign Origin', async () => {
    const reply = await send(running.port, {
      headers: { origin: 'https://attacker.example' },
      body: initializeBody,
    });

    expect(reply.status).toBe(403);
  });

  it('accepts a browser request from a loopback Origin', async () => {
    const reply = await send(running.port, {
      headers: { origin: 'http://localhost:6274' },
      body: initializeBody,
    });

    expect(reply.status).toBe(200);
  });

  it('answers malformed JSON with a parse error', async () => {
    const reply = await send(running.port, { body: '{not json' });

    expect(reply.status).toBe(400);
    expect(rpcResult(reply).error?.code).toBe(-32700);
  });

  it('refuses an oversized body', async () => {
    const reply = await send(running.port, { body: 'x'.repeat(5 * 1024 * 1024) });

    expect(reply.status).toBe(413);
  });

  it('answers paths other than /mcp with 404', async () => {
    const reply = await send(running.port, { method: 'GET', path: '/' });

    expect(reply.status).toBe(404);
  });

  it('closes open sessions on close', async () => {
    await openSession(running.port);
    await openSession(running.port);
    expect(running.sessionCount()).toBe(2);

    await running.close();

    expect(running.sessionCount()).toBe(0);
    running = await startHttpServer({
      host: '127.0.0.1',
      port: 0,
      createServer: createModeServer,
      log: () => undefined,
    });
  });
});
