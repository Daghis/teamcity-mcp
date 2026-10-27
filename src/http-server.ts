import { randomUUID } from 'node:crypto';
import {
  type IncomingMessage,
  type Server as NodeHttpServer,
  type ServerResponse,
  createServer,
} from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { type SessionState, runInSession } from '@/config';

export const DEFAULT_HTTP_HOST = '127.0.0.1';
export const DEFAULT_HTTP_PORT = 3000;
const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface HttpServerOptions {
  host: string;
  port: number;
  createServer: () => Server;
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

const originHostname = (origin: string): string | undefined => {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

const allowedHostnames = (bindHost: string): Set<string> => {
  const allowed = new Set(LOOPBACK_HOSTS);
  const bind = hostnameOf(bindHost.includes(':') ? `[${bindHost}]` : bindHost);
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
  const origin = req.headers.origin;
  if (origin !== undefined) {
    const originHost = originHostname(origin);
    if (!originHost || !allowed.has(originHost)) {
      throw new HttpError(403, -32000, `Forbidden: Origin '${origin}' is not allowed`);
    }
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

const isInitializeRequest = (body: unknown): boolean =>
  typeof body === 'object' &&
  body !== null &&
  (body as { method?: unknown }).method === 'initialize';

const sendError = (res: ServerResponse, status: number, code: number, message: string): void => {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
};

export async function startHttpServer(options: HttpServerOptions): Promise<RunningHttpServer> {
  const log = options.log ?? ((message: string) => process.stderr.write(`${message}\n`));
  const allowed = allowedHostnames(options.host);
  const sessions = new Map<string, Session>();

  const openSession = async (): Promise<Session> => {
    const server = options.createServer();
    const state: SessionState = { mode: null, server };
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, state });
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };
    await server.connect(transport);
    return { transport, state };
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
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

    let session: Session;
    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing) {
        throw new HttpError(404, -32001, 'Session not found');
      }
      session = existing;
    } else if (req.method === 'POST' && isInitializeRequest(body)) {
      session = await openSession();
    } else {
      throw new HttpError(
        400,
        -32600,
        'Bad Request: missing Mcp-Session-Id, and this is not an initialize request'
      );
    }

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
      const open = [...sessions.values()];
      sessions.clear();
      await Promise.allSettled(open.map((session) => session.state.server.close()));
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections();
      });
    },
  };
}
