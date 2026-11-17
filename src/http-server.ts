import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
  createServer,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, isJSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';

import { type SessionState, runInSession } from '@/config';
import { error as logError } from '@/utils/logger';

export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 3000;
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_SESSIONS = 100;
const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface HttpServerOptions {
  host: string;
  port: number;
  createServer: () => Server;
  allowServerToken?: boolean;
  sessionIdleTimeoutMs?: number;
  maxSessions?: number;
  log?: (message: string) => void;
}

export interface RunningHttpServer {
  port: number;
  sessionCount: () => number;
  close: () => Promise<void>;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  state: SessionState;
  lastActive: number;
  openRequests: number;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: number,
    message: string
  ) {
    super(message);
  }
}

const hostnameOf = (value: string): string | undefined => {
  try {
    return new URL(`http://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

const bindHostname = (bindHost: string): string | undefined =>
  hostnameOf(bindHost.includes(':') ? `[${bindHost}]` : bindHost);

export const isLoopbackHost = (bindHost: string): boolean => {
  const host = bindHostname(bindHost);
  return host !== undefined && (LOOPBACK_HOSTS.has(host) || /^127(\.\d{1,3}){3}$/.test(host));
};

const allowedHostnames = (bindHost: string): Set<string> => {
  const allowed = new Set(LOOPBACK_HOSTS);
  const bind = bindHostname(bindHost);
  if (bind && bind !== '0.0.0.0' && bind !== '[::]') {
    allowed.add(bind);
  }
  return allowed;
};

const assertTrustedRequest = (req: IncomingMessage, allowed: Set<string>): void => {
  const host = hostnameOf(req.headers.host ?? '');
  if (!host || !allowed.has(host)) {
    throw new HttpError(403, -32000, `Forbidden: Host '${req.headers.host ?? ''}' is not allowed`);
  }
  if (req.headers.origin !== undefined) {
    throw new HttpError(403, -32000, 'Forbidden: browser requests (Origin) are not supported');
  }
};

const readBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, -32600, 'Request body too large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

const parseJson = (raw: Buffer): unknown => {
  if (raw.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw.toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, -32700, 'Parse error: request body is not valid JSON');
  }
};

const bearerToken = (req: IncomingMessage): string | undefined => {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization ?? '');
  return match?.[1];
};

const sameToken = (a: string | undefined, b: string | undefined): boolean => {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const sendError = (res: ServerResponse, status: number, code: number, message: string): void => {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
};

export async function startHttpServer(options: HttpServerOptions): Promise<RunningHttpServer> {
  if (options.allowServerToken === true && !isLoopbackHost(options.host)) {
    throw new Error(
      `Refusing to share the server's TeamCity token on the non-loopback address '${options.host}'`
    );
  }
  const log = options.log ?? ((message: string) => logError(message));
  const idleTimeoutMs = options.sessionIdleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const allowed = allowedHostnames(options.host);
  const sessions = new Map<string, Session>();
  let closing = false;

  const openSession = async (teamcityToken: string | undefined): Promise<Session> => {
    const server = options.createServer();
    const state: SessionState = { mode: null, server, teamcityToken };
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, session);
      },
    });
    const session: Session = { transport, state, lastActive: Date.now(), openRequests: 0 };
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };
    await server.connect(transport);
    return session;
  };

  const expireIdleSessions = (): void => {
    const now = Date.now();
    for (const session of sessions.values()) {
      if (session.openRequests === 0 && now - session.lastActive >= idleTimeoutMs) {
        session.state.server.close().catch((error: unknown) => {
          log(`Closing an idle session failed: ${String(error)}`);
        });
      }
    }
  };
  const sweep = setInterval(expireIdleSessions, Math.min(idleTimeoutMs, 60_000));
  sweep.unref();

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (closing) {
      throw new HttpError(503, -32000, 'Server is shutting down');
    }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path !== MCP_PATH) {
      throw new HttpError(404, -32601, `Not found: ${path}`);
    }
    assertTrustedRequest(req, allowed);

    let body: unknown;
    if (req.method === 'POST') {
      const raw = await readBody(req);
      body = parseJson(raw);
      (req as IncomingMessage & { rawBody?: Buffer }).rawBody = raw;
    }

    const header = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(header) ? header[0] : header;
    const token = bearerToken(req);

    let session: Session;
    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing || !sameToken(token, existing.state.teamcityToken)) {
        throw new HttpError(404, -32001, 'Session not found');
      }
      session = existing;
    } else if (req.method === 'POST' && isJSONRPCRequest(body) && isInitializeRequest(body)) {
      if (token === undefined && options.allowServerToken !== true) {
        throw new HttpError(
          401,
          -32000,
          'Unauthorized: send the TeamCity token as "Authorization: Bearer <token>"'
        );
      }
      if (sessions.size >= maxSessions) {
        throw new HttpError(503, -32000, 'Too many open sessions');
      }
      session = await openSession(token);
    } else {
      throw new HttpError(
        400,
        -32600,
        'Bad Request: missing Mcp-Session-Id, and this is not an initialize request'
      );
    }

    session.openRequests++;
    session.lastActive = Date.now();
    res.once('close', () => {
      session.openRequests--;
      session.lastActive = Date.now();
    });
    await runInSession(session.state, () => session.transport.handleRequest(req, res, body));
  };

  const httpServer: NodeHttpServer = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message);
        return;
      }
      log(`HTTP request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendError(res, 500, -32603, 'Internal error');
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
  const { port } = httpServer.address() as AddressInfo;

  return {
    port,
    sessionCount: () => sessions.size,
    close: async () => {
      closing = true;
      clearInterval(sweep);
      const stopped = new Promise<void>((resolve) => httpServer.close(() => resolve()));
      const open = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(open.map((session) => session.state.server.close()));
      httpServer.closeAllConnections();
      await stopped;
    },
  };
}
