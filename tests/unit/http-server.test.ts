import { request } from 'node:http';

import type { Server as SdkServer } from '@modelcontextprotocol/sdk/server/index.js';

import { TeamCityAPI } from '@/api-client';
import {
  type SessionState,
  getMCPMode,
  getTeamCityToken,
  getTeamCityUrl,
  resetConfigCache,
  resetMCPMode,
  runInSession,
  setMCPMode,
} from '@/config';
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
    if (req.params.name === 'token') {
      return { content: [{ type: 'text', text: getTeamCityToken() }] };
    }
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

const auth = (token?: string): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};

const openSession = async (port: number, token?: string): Promise<string> => {
  const reply = await send(port, { headers: auth(token), body: initializeBody });
  expect(reply.status).toBe(200);
  const sessionId = reply.headers['mcp-session-id'] as string;
  await send(port, {
    headers: { 'mcp-session-id': sessionId, ...auth(token) },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return sessionId;
};

const callTool = async (
  port: number,
  sessionId: string,
  name: 'mode' | 'token',
  args: Record<string, unknown> = {},
  token?: string
): Promise<string> => {
  const reply = await send(port, {
    headers: { 'mcp-session-id': sessionId, ...auth(token) },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const { result } = rpcResult(reply) as { result: { content: Array<{ text: string }> } };
  return result.content[0]?.text as string;
};

const callMode = (port: number, sessionId: string, set?: 'dev' | 'full'): Promise<string> =>
  callTool(port, sessionId, 'mode', set ? { set } : {});

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

  it('falls back to the server token when a client sends none', async () => {
    const sessionId = await openSession(running.port);

    expect(await callTool(running.port, sessionId, 'token')).toBe('test-token');
  });
});

describe('startHttpServer with client tokens', () => {
  let running: RunningHttpServer;

  beforeEach(async () => {
    running = await startHttpServer({
      host: '127.0.0.1',
      port: 0,
      createServer: createModeServer,
      requireClientToken: true,
      log: () => undefined,
    });
  });

  afterEach(async () => {
    await running.close();
  });

  it('refuses an initialize without a bearer token', async () => {
    const reply = await send(running.port, { body: initializeBody });

    expect(reply.status).toBe(401);
    expect(reply.headers['www-authenticate']).toBe('Bearer');
    expect(running.sessionCount()).toBe(0);
  });

  it('uses each session its own TeamCity token', async () => {
    const alice = await openSession(running.port, 'tc-alice');
    const bob = await openSession(running.port, 'tc-bob');

    expect(await callTool(running.port, alice, 'token', {}, 'tc-alice')).toBe('tc-alice');
    expect(await callTool(running.port, bob, 'token', {}, 'tc-bob')).toBe('tc-bob');
  });

  it('refuses a request whose token does not match its session', async () => {
    const alice = await openSession(running.port, 'tc-alice');
    const body = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' });

    const wrong = await send(running.port, {
      headers: { 'mcp-session-id': alice, ...auth('tc-mallory') },
      body,
    });
    const missing = await send(running.port, { headers: { 'mcp-session-id': alice }, body });

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
  });
});

describe('configuration without a server token', () => {
  const saved = { url: process.env['TEAMCITY_URL'], token: process.env['TEAMCITY_TOKEN'] };

  afterEach(() => {
    process.env['TEAMCITY_URL'] = saved.url;
    process.env['TEAMCITY_TOKEN'] = saved.token;
    if (saved.url === undefined) delete process.env['TEAMCITY_URL'];
    if (saved.token === undefined) delete process.env['TEAMCITY_TOKEN'];
    resetConfigCache();
  });

  it('keeps the URL, so HTTP clients can bring their own token', () => {
    process.env['TEAMCITY_URL'] = 'https://tc.example.com';
    delete process.env['TEAMCITY_TOKEN'];
    resetConfigCache();

    expect(getTeamCityUrl()).toBe('https://tc.example.com');
    expect(
      runInSession(
        { mode: null, server: {} as SessionState['server'], teamcityToken: 'tc-alice' },
        getTeamCityToken
      )
    ).toBe('tc-alice');
  });
});

describe('TeamCityAPI.getInstance within a session', () => {
  afterEach(() => {
    TeamCityAPI.reset();
  });

  const inSession = <T>(teamcityToken: string | undefined, fn: () => T): T =>
    runInSession({ mode: null, server: {} as SessionState['server'], teamcityToken }, fn);

  it('gives each client token its own client and keeps the shared one outside sessions', () => {
    const shared = TeamCityAPI.getInstance();
    const alice = inSession('tc-alice', () => TeamCityAPI.getInstance());
    const aliceAgain = inSession('tc-alice', () => TeamCityAPI.getInstance());
    const bob = inSession('tc-bob', () => TeamCityAPI.getInstance());

    expect(alice).toBe(aliceAgain);
    expect(alice).not.toBe(bob);
    expect(alice).not.toBe(shared);
    expect(inSession(undefined, () => TeamCityAPI.getInstance())).toBe(shared);
  });
});
