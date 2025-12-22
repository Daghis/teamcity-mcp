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
import { spawn } from 'child_process';
import { join } from 'path';

import packageJson from '../../package.json';

describe('MCP stdio transport compliance', () => {
  const serverPath = join(__dirname, '../../dist/index.js');
  const timeout = 10000;

  it(
    'should only output valid JSON-RPC to stdout during handshake',
    async () => {
      const server = spawn('node', [serverPath], {
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
      let initResponse: {
        result?: { serverInfo?: { name: string; version: string }; protocolVersion?: string };
      } | null = null;

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
      expect(initResponse.result).toHaveProperty('serverInfo');
      expect(initResponse.result?.serverInfo?.name).toBe('teamcity-mcp');
      expect(initResponse.result?.serverInfo?.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(initResponse.result?.protocolVersion).toBe('2024-11-05');

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
      const server = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TEAMCITY_URL: process.env['TEAMCITY_URL'] ?? 'http://localhost:8111',
          TEAMCITY_TOKEN: process.env['TEAMCITY_TOKEN'] ?? 'test-token',
          DOTENV_CONFIG_QUIET: 'true',
        },
      });

      let stdoutBuffer = '';
      let stderrData = '';
      let validJsonRpcCount = 0;

      server.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();
      });

      server.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      // Send initialize + initialized
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

      await new Promise((resolve) => setTimeout(resolve, 1000));

      server.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        })}\n`
      );

      // Request tools list (triggers info logging)
      server.stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
        })}\n`
      );

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify all stdout lines are valid JSON-RPC
      const lines = stdoutBuffer.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('jsonrpc');
        expect(parsed.jsonrpc).toBe('2.0');
        validJsonRpcCount++;
      }

      // Should have received at least 2 responses (initialize + tools/list)
      expect(validJsonRpcCount).toBeGreaterThanOrEqual(2);

      // Verify logging went to stderr
      expect(stderrData).toContain('TeamCity MCP Server');

      // Verify NO winston log format indicators on stdout
      expect(stdoutBuffer).not.toMatch(/\[teamcity-mcp\]/);
      expect(stdoutBuffer).not.toMatch(/\d{2}:\d{2}:\d{2}/); // timestamp format
      expect(stdoutBuffer).not.toContain('[32minfo[39m'); // colored info
      expect(stdoutBuffer).not.toContain('[33mwarn[39m'); // colored warn

      server.kill();
      await new Promise((resolve) => server.on('close', resolve));
    },
    timeout
  );

  it(
    'should report correct server version from package.json',
    async () => {
      const server = spawn('node', [serverPath], {
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
