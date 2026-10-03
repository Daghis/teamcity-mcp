/**
 * Integration test for MCP stdio transport compliance
 *
 * Verifies that the server strictly adheres to the MCP stdio specification:
 * - ONLY valid JSON-RPC messages go to stdout
 * - All logging goes to stderr
 * - No dotenv or other library output pollutes stdout
 *
 * This test prevents regressions of issues like:
 * - Winston Console transport writing to stdout
 * - Dotenv debug messages appearing on stdout
 * - Any other stdout pollution that breaks MCP clients
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { join } from 'path';

import packageJson from '../../package.json';

/** JSON-RPC request written to the server's stdin */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/** Envelope of a JSON-RPC message read from the server's stdout */
interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: unknown;
  method?: unknown;
  result?: unknown;
  error?: unknown;
}

/**
 * The part of an MCP initialize result these tests check. Values stay `unknown` so that the
 * assertions, not the type guard, report unexpected ones.
 */
interface InitializeResult {
  protocolVersion?: unknown;
  serverInfo: { name?: unknown; version?: unknown };
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  return (
    typeof value === 'object' && value !== null && 'jsonrpc' in value && value.jsonrpc === '2.0'
  );
}

function isInitializeResult(value: unknown): value is InitializeResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'serverInfo' in value &&
    typeof value.serverInfo === 'object' &&
    value.serverInfo !== null
  );
}

/** Parses one stdout line, returning null unless it is a JSON-RPC 2.0 message */
function parseJsonRpcLine(line: string): JsonRpcMessage | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isJsonRpcMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns an initialize response's result, failing with the whole response if it lacks serverInfo */
function readInitializeResult(response: JsonRpcMessage): InitializeResult {
  if (!isInitializeResult(response.result)) {
    throw new Error(`Malformed initialize response: ${JSON.stringify(response)}`);
  }
  return response.result;
}

/**
 * Writes `request` to the server's stdin and resolves with the successful response (one with a
 * `result`) to it once that appears on stdout. Rejects if that response is an error, the server
 * exits first, or nothing arrives within `timeoutMs`, so a slow boot fails with a message
 * naming the missing response.
 */
function sendRequest(
  server: ChildProcessWithoutNullStreams,
  request: JsonRpcRequest,
  timeoutMs: number
): Promise<JsonRpcMessage> {
  const label = `${request.method} (id ${request.id})`;
  const exitError = (code: number | null, signal: NodeJS.Signals | null): Error =>
    new Error(
      `Server exited (code ${String(code)}, signal ${String(signal)}) before answering ${label}`
    );

  if (server.exitCode !== null || server.signalCode !== null) {
    return Promise.reject(exitError(server.exitCode, server.signalCode));
  }

  return new Promise<JsonRpcMessage>((resolve, reject) => {
    let partialLine = '';

    const onData = (chunk: Buffer): void => {
      const lines = `${partialLine}${chunk.toString()}`.split('\n');
      partialLine = lines.pop() ?? '';
      const response = lines
        .map((line) => parseJsonRpcLine(line))
        .find((message) => message?.id === request.id);
      if (!response) {
        return;
      }
      // A result is the only proof the request was handled; an error or malformed reply would
      // let the test pass without exercising the code path it checks
      if (response.result === undefined || response.error !== undefined) {
        settle(new Error(`Unsuccessful response to ${label}: ${JSON.stringify(response)}`));
      } else {
        settle(response);
      }
    };
    // 'close' fires only after stdout is drained, so a response sent just before exit still counts
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      settle(exitError(code, signal));
    };
    const timer = setTimeout(() => {
      settle(new Error(`No response to ${label} within ${timeoutMs}ms`));
    }, timeoutMs);

    function settle(outcome: JsonRpcMessage | Error): void {
      clearTimeout(timer);
      server.stdout.off('data', onData);
      server.off('close', onClose);
      if (outcome instanceof Error) {
        reject(outcome);
      } else {
        resolve(outcome);
      }
    }

    server.stdout.on('data', onData);
    server.once('close', onClose);
    server.stdin.write(`${JSON.stringify(request)}\n`);
  });
}

describe('MCP stdio transport compliance', () => {
  const tsxPath = join(__dirname, '../../node_modules/tsx/dist/cli.mjs');
  const serverPath = join(__dirname, '../../src/index.ts');
  // Booting the server through tsx takes about a second when warm, but can take several seconds
  // on a cold first run (e.g. the first `npm test` after `npm ci`)
  const timeout = 20000;
  // Stop waiting on the server a second before the test times out, leaving time to kill it
  // and fail with an error naming the missing response
  const responseTimeout = timeout - 1000;

  it(
    'should only output valid JSON-RPC to stdout during handshake',
    async () => {
      const server = spawn('node', [tsxPath, serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEAMCITY_URL: process.env['TEAMCITY_URL'] ?? 'http://localhost:8111',
          TEAMCITY_TOKEN: process.env['TEAMCITY_TOKEN'] ?? 'test-token',
          DOTENV_CONFIG_QUIET: 'true',
        },
      });

      // Created up front so cleanup can't miss a 'close' that fires before it runs
      const closed = new Promise<void>((resolve) => {
        server.once('close', () => resolve());
      });

      let stdoutData = '';
      let stderrData = '';

      server.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString();
      });

      server.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      let initResponse: JsonRpcMessage;
      try {
        // Send initialize request
        initResponse = await sendRequest(
          server,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: {
                name: 'test-client',
                version: '1.0.0',
              },
            },
          },
          responseTimeout
        );
      } finally {
        // tsx relays SIGTERM to the server process, escalating to SIGKILL if it goes unanswered
        server.kill();
        await closed;
      }

      // Verify every stdout line, including any written after the response, is a JSON-RPC 2.0
      // message with an id (response) or a method (notification/request), listing offenders
      const invalidLines = stdoutData
        .split('\n')
        .filter((line) => line.trim() !== '')
        .filter((line) => {
          const message = parseJsonRpcLine(line);
          return message === null || (message.id === undefined && message.method === undefined);
        });
      expect(invalidLines).toEqual([]);

      // Verify we got a valid initialize response
      const { serverInfo, protocolVersion } = readInitializeResult(initResponse);
      expect(serverInfo.name).toBe('teamcity-mcp');
      expect(serverInfo.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(protocolVersion).toBe('2024-11-05');

      // Verify stderr contains logging (not stdout)
      expect(stderrData).toContain('TeamCity MCP Server');

      // Verify NO dotenv messages on stdout
      expect(stdoutData).not.toContain('dotenv');
      expect(stdoutData).not.toContain('[dotenv');
    },
    timeout
  );

  it(
    'should route all winston logging to stderr, not stdout',
    async () => {
      const server = spawn('node', [tsxPath, serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEAMCITY_URL: process.env['TEAMCITY_URL'] ?? 'http://localhost:8111',
          TEAMCITY_TOKEN: process.env['TEAMCITY_TOKEN'] ?? 'test-token',
          DOTENV_CONFIG_QUIET: 'true',
        },
      });

      // Created up front so cleanup can't miss a 'close' that fires before it runs
      const closed = new Promise<void>((resolve) => {
        server.once('close', () => resolve());
      });

      let stdoutBuffer = '';
      let stderrData = '';

      server.stdout.on('data', (data: Buffer) => {
        stdoutBuffer += data.toString();
      });

      server.stderr.on('data', (data: Buffer) => {
        stderrData += data.toString();
      });

      try {
        // Wait for the responses rather than sleeping: under a parallel Jest run the server
        // can take several seconds to boot. Both waits share one deadline.
        const deadline = Date.now() + responseTimeout;
        const timeLeft = (): number => deadline - Date.now();

        await sendRequest(
          server,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          },
          timeLeft()
        );

        server.stdin.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          })}\n`
        );

        // Request tools list (triggers info logging)
        await sendRequest(server, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, timeLeft());
      } finally {
        // tsx relays SIGTERM to the server process, escalating to SIGKILL if it goes unanswered
        server.kill();
        await closed;
      }

      // Verify all stdout lines are valid JSON-RPC (listing offenders so a failure names them)
      const stdoutLines = stdoutBuffer.split('\n').filter((line) => line.trim() !== '');
      expect(stdoutLines.filter((line) => parseJsonRpcLine(line) === null)).toEqual([]);

      // Should have received at least 2 responses (initialize + tools/list)
      expect(stdoutLines.length).toBeGreaterThanOrEqual(2);

      // Verify logging went to stderr
      expect(stderrData).toContain('TeamCity MCP Server');

      // Verify NO winston log format indicators on stdout
      expect(stdoutBuffer).not.toMatch(/\[teamcity-mcp\]/);
      expect(stdoutBuffer).not.toMatch(/\d{2}:\d{2}:\d{2}/); // timestamp format
      expect(stdoutBuffer).not.toContain('\u001b[32minfo\u001b[39m'); // colored info
      expect(stdoutBuffer).not.toContain('\u001b[33mwarn\u001b[39m'); // colored warn
    },
    timeout
  );

  it(
    'should report correct server version from package.json',
    async () => {
      const server = spawn('node', [tsxPath, serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEAMCITY_URL: 'http://localhost:8111',
          TEAMCITY_TOKEN: 'test-token',
          DOTENV_CONFIG_QUIET: 'true',
        },
      });

      // Created up front so cleanup can't miss a 'close' that fires before it runs
      const closed = new Promise<void>((resolve) => {
        server.once('close', () => resolve());
      });

      let initResponse: JsonRpcMessage;
      try {
        initResponse = await sendRequest(
          server,
          {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'test', version: '1.0.0' },
            },
          },
          responseTimeout
        );
      } finally {
        server.kill();
        await closed;
      }

      // Read the actual version from package.json
      const { serverInfo } = readInitializeResult(initResponse);
      expect(serverInfo.version).toBe(packageJson.version);
      expect(serverInfo.version).not.toBe('0.1.0'); // Ensure not hardcoded
    },
    timeout
  );
});
