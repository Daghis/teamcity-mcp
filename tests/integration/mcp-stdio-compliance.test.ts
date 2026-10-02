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

/** Type for MCP initialize response */
interface InitializeResponse {
  result?: { serverInfo?: { name: string; version: string }; protocolVersion?: string };
}

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
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  return (
    typeof value === 'object' && value !== null && 'jsonrpc' in value && value.jsonrpc === '2.0'
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

/**
 * Writes `request` to the server's stdin and resolves once the response with the same id
 * appears on stdout. Rejects if the server exits first or no response arrives within
 * `timeoutMs`, so a slow boot fails with a message naming the missing response.
 */
function sendRequest(
  server: ChildProcessWithoutNullStreams,
  request: JsonRpcRequest,
  timeoutMs: number
): Promise<void> {
  const label = `${request.method} (id ${request.id})`;
  const exitError = (code: number | null, signal: NodeJS.Signals | null): Error =>
    new Error(
      `Server exited (code ${String(code)}, signal ${String(signal)}) before answering ${label}`
    );

  if (server.exitCode !== null || server.signalCode !== null) {
    return Promise.reject(exitError(server.exitCode, server.signalCode));
  }

  return new Promise<void>((resolve, reject) => {
    let partialLine = '';

    const onData = (chunk: Buffer): void => {
      const lines = `${partialLine}${chunk.toString()}`.split('\n');
      partialLine = lines.pop() ?? '';
      if (lines.some((line) => parseJsonRpcLine(line)?.id === request.id)) {
        settle();
      }
    };
    // 'close' fires only after stdout is drained, so a response sent just before exit still counts
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      settle(exitError(code, signal));
    };
    const timer = setTimeout(() => {
      settle(new Error(`No response to ${label} within ${timeoutMs}ms`));
    }, timeoutMs);

    function settle(error?: Error): void {
      clearTimeout(timer);
      server.stdout.off('data', onData);
      server.off('close', onClose);
      if (error) {
        reject(error);
      } else {
        resolve();
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
  const timeout = 10000;
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

      let stdoutData = '';
      let stderrData = '';
      let initResponse: InitializeResponse | null = null;

      const stdoutPromise = new Promise<void>((resolve, reject) => {
        server.stdout.on('data', (data) => {
          stdoutData += data.toString();

          // Try to parse each line as JSON-RPC
          const lines = stdoutData.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const parsed = JSON.parse(line);

              // Verify it's a valid JSON-RPC message
              expect(parsed).toHaveProperty('jsonrpc');
              expect(parsed.jsonrpc).toBe('2.0');

              // Should have either id (response) or method (notification/request)
              expect(parsed.id !== undefined || parsed.method !== undefined).toBe(true);

              if (parsed.result?.serverInfo !== undefined) {
                initResponse = parsed;
                resolve();
              }
            } catch (e) {
              reject(new Error(`Invalid JSON on stdout: ${line}\nError: ${String(e)}`));
            }
          }
        });
      });

      server.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      // Send initialize request
      const initRequest = {
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
      };

      server.stdin.write(`${JSON.stringify(initRequest)}\n`);

      await Promise.race([
        stdoutPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout waiting for initialize response')), timeout)
        ),
      ]);

      // Verify we got a valid initialize response
      expect(initResponse).not.toBeNull();
      if (initResponse === null) {
        throw new Error('initResponse should not be null');
      }
      // TypeScript doesn't track mutations inside async callbacks, so we need to help it
      const response = initResponse as InitializeResponse;
      expect(response.result).toHaveProperty('serverInfo');
      expect(response.result?.serverInfo?.name).toBe('teamcity-mcp');
      expect(response.result?.serverInfo?.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(response.result?.protocolVersion).toBe('2024-11-05');

      // Verify stderr contains logging (not stdout)
      expect(stderrData).toContain('TeamCity MCP Server');

      // Verify NO dotenv messages on stdout
      expect(stdoutData).not.toContain('dotenv');
      expect(stdoutData).not.toContain('[dotenv');

      // Clean up
      server.kill();
      await new Promise((resolve) => server.on('close', resolve));
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
      expect(stdoutBuffer).not.toContain('[32minfo[39m'); // colored info
      expect(stdoutBuffer).not.toContain('[33mwarn[39m'); // colored warn
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

      let version: string | null = null;

      const versionPromise = new Promise<void>((resolve) => {
        server.stdout.on('data', (data) => {
          const lines = data.toString().split('\n');
          for (const line of lines) {
            if (line.trim() === '') continue;

            try {
              const parsed = JSON.parse(line);
              if (parsed.result?.serverInfo?.version !== undefined) {
                version = parsed.result.serverInfo.version;
                resolve();
              }
            } catch {
              // Ignore parse errors
            }
          }
        });
      });

      server.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        })}\n`
      );

      await Promise.race([
        versionPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
      ]);

      // Read the actual version from package.json
      expect(version).toBe(packageJson.version);
      expect(version).not.toBe('0.1.0'); // Ensure not hardcoded

      server.kill();
      await new Promise((resolve) => server.on('close', resolve));
    },
    timeout
  );
});
