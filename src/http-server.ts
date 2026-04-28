/**
 * Streamable HTTP transport for the TeamCity MCP Server.
 *
 * Provides a central HTTP endpoint (`/mcp`) that multiple users can talk to,
 * each passing their own TeamCity credentials via HTTP headers.
 *
 * Based on the official MCP SDK "simpleStreamableHttp" reference pattern
 * (stateful variant with session management).
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import {
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'http';

import { setServerInstance } from '@/config';
import { info as logInfo, error as logError } from '@/utils/logger';
import {
  type RequestCredentials,
  getRequestCredentials,
  runWithCredentials,
} from '@/utils/request-context';

import { createSimpleServer } from './server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  credentials: RequestCredentials;
  lastActivity: number;
}

export interface HttpServerOptions {
  port: number;
  host?: string;
  /** Session inactivity timeout in ms (default: 30 min) */
  sessionTtlMs?: number;
  /** Allowed CORS origins. Set to `['*']` to allow all (development only). */
  allowedOrigins?: string[];
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

const sessions = new Map<string, SessionEntry>();

function cleanupSessions(ttlMs: number): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastActivity > ttlMs) {
      entry.transport.close().catch(() => {});
      sessions.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers — lightweight body parsing (JSON only, max 1 MB)
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw.length > 0 ? JSON.parse(raw) : undefined);
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// CORS helper
// ---------------------------------------------------------------------------

function setCorsHeaders(req: IncomingMessage, res: ServerResponse, allowedOrigins: string[]): void {
  const requestOrigin = req.headers['origin'] ?? '';
  let origin: string;
  if (allowedOrigins.includes('*')) {
    origin = '*';
  } else if (typeof requestOrigin === 'string' && allowedOrigins.includes(requestOrigin)) {
    origin = requestOrigin;
  } else {
    // Origin not allowed — omit the header so the browser blocks the request
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') {
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID, X-TeamCity-Url, X-TeamCity-Token'
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the HTTP server for Streamable HTTP transport.
 * Returns a promise that resolves when the server is listening.
 */
export function startHttpServer(options: HttpServerOptions): Promise<HttpServer> {
  const { port, host = '0.0.0.0', sessionTtlMs = 30 * 60 * 1000, allowedOrigins = ['*'] } = options;

  // Periodic session cleanup
  const cleanupInterval = setInterval(() => cleanupSessions(sessionTtlMs), 60_000);

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const method = (req.method ?? 'GET').toUpperCase();

    logInfo(`[HTTP] ${method} ${url}`);

    // ---- CORS preflight ---------------------------------------------------
    if (method === 'OPTIONS') {
      setCorsHeaders(req, res, allowedOrigins);
      res.writeHead(204);
      res.end();
      return;
    }

    setCorsHeaders(req, res, allowedOrigins);

    // ---- Health check -----------------------------------------------------
    if (url === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', sessions: sessions.size }));
      return;
    }

    // ---- MCP endpoint -----------------------------------------------------
    if (url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Extract and validate TC credentials (inline instead of middleware
    // so the entire route handler runs inside the AsyncLocalStorage context)
    const tcUrl = req.headers['x-teamcity-url'];
    const tcToken = req.headers['x-teamcity-token'];

    if (typeof tcUrl !== 'string' || tcUrl.length === 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Missing X-TeamCity-Url header' },
          id: null,
        })
      );
      return;
    }
    if (typeof tcToken !== 'string' || tcToken.length === 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Missing X-TeamCity-Token header' },
          id: null,
        })
      );
      return;
    }

    const token = tcToken.startsWith('Bearer ') ? tcToken.slice(7) : tcToken;

    // Validate URL format
    try {
      new URL(tcUrl);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32002, message: 'Invalid X-TeamCity-Url' },
          id: null,
        })
      );
      return;
    }

    // Run the entire route handler inside the credential context
    await runWithCredentials({ teamcityUrl: tcUrl, teamcityToken: token }, async () => {
      try {
        if (method === 'POST') {
          await handlePost(req, res);
        } else if (method === 'GET') {
          await handleGet(req, res);
        } else if (method === 'DELETE') {
          await handleDelete(req, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Method not allowed' },
              id: null,
            })
          );
        }
      } catch (error) {
        logError(`[HTTP] Error handling ${method} ${url}:`, error);
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal server error' },
              id: null,
            })
          );
        }
      }
    });
  });

  httpServer.on('close', () => {
    clearInterval(cleanupInterval);
    for (const [, entry] of sessions) {
      entry.transport.close().catch(() => {});
    }
    sessions.clear();
  });

  return new Promise((resolve, reject) => {
    httpServer.listen(port, host, () => {
      resolve(httpServer);
    });
    httpServer.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseJsonBody(req);
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  logInfo(`[HTTP] POST /mcp session=${sessionId ?? 'none'} isInit=${body !== undefined && body !== null && isInitializeRequest(body)}`);

  if (sessionId !== undefined && sessions.has(sessionId)) {
    // Existing session — forward to its transport inside correct credential context
    const entry = sessions.get(sessionId);
    if (!entry) return;
    entry.lastActivity = Date.now();

    await runWithCredentials(entry.credentials, async () => {
      await entry.transport.handleRequest(req, res, body);
    });
    return;
  }

  // No session (or unknown session ID) — must be an initialize request
  if (body === undefined || body === null || !isInitializeRequest(body)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      })
    );
    return;
  }

  // Capture credentials from AsyncLocalStorage (set by the auth check above)
  const credentials = getRequestCredentials();
  if (credentials === undefined) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Missing credentials context' },
        id: null,
      })
    );
    return;
  }

  // Create a new transport + MCP server for this session
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid: string) => {
      sessions.set(sid, { transport, credentials, lastActivity: Date.now() });
    },
    onsessionclosed: (sid: string) => {
      sessions.delete(sid);
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid && sessions.has(sid)) {
      sessions.delete(sid);
    }
  };

  const server = createSimpleServer();
  setServerInstance(server);

  await runWithCredentials(credentials, async () => {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
}

async function handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  logInfo(`[HTTP] GET /mcp (SSE) session=${sessionId ?? 'none'}`);
  if (sessionId === undefined || !sessions.has(sessionId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      })
    );
    return;
  }

  const entryGet = sessions.get(sessionId);
  if (!entryGet) return;
  entryGet.lastActivity = Date.now();

  await runWithCredentials(entryGet.credentials, async () => {
    await entryGet.transport.handleRequest(req, res);
  });
}

async function handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  logInfo(`[HTTP] DELETE /mcp session=${sessionId ?? 'none'}`);
  if (sessionId === undefined || !sessions.has(sessionId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Invalid or missing session ID' },
        id: null,
      })
    );
    return;
  }

  const entryDel = sessions.get(sessionId);
  if (!entryDel) return;
  await entryDel.transport.close();
  sessions.delete(sessionId);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
