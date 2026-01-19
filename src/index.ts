/**
 * Simple TeamCity MCP Server Entry Point
 * Minimal implementation without complex DI or abstractions
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';

import { getTeamCityToken, getTeamCityUrl, setServerInstance } from '@/config';
import { startServerLifecycle } from '@/server-runner';
import { getHelpText, getVersion, parseCliArgs } from '@/utils/cli-args';
import { loadEnvFile } from '@/utils/env-file';

import { createSimpleServer } from './server';

// Parse CLI arguments BEFORE loading dotenv
const cliArgs = parseCliArgs(process.argv.slice(2));

// Handle --help and --version early exits (write to stderr for MCP compliance)
if (cliArgs.help) {
  process.stderr.write(getHelpText());
  process.exit(0);
}

if (cliArgs.version) {
  process.stderr.write(`teamcity-mcp v${getVersion()}\n`);
  process.exit(0);
}

// Load --config file if specified (lower priority than CLI args, higher than env vars)
if (cliArgs.config) {
  const configResult = loadEnvFile(cliArgs.config);
  if (!configResult.success) {
    process.stderr.write(`Error: ${configResult.error}\n`);
    process.exit(1);
  }
  // Merge config file values into process.env (if not already set by env vars)
  // Empty strings are treated as "not set" to allow overriding with config file
  if (configResult.values) {
    for (const [key, value] of Object.entries(configResult.values)) {
      // Use ||= (not ??=) to also override empty strings, not just null/undefined
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      process.env[key] ||= value;
    }
  }
}

// Load .env file (lowest priority - only fills gaps)
// Silent mode to avoid polluting stdout (required for MCP stdio transport)
dotenv.config({ quiet: true });

// Apply CLI arguments LAST (highest priority - overwrite everything)
if (cliArgs.url) {
  process.env['TEAMCITY_URL'] = cliArgs.url;
}
if (cliArgs.token) {
  process.env['TEAMCITY_TOKEN'] = cliArgs.token;
}
if (cliArgs.mode) {
  process.env['MCP_MODE'] = cliArgs.mode;
}

let activeServer: Server | null = null;
let lifecyclePromise: Promise<void> | null = null;
let shuttingDown = false;

const clearServerState = () => {
  activeServer = null;
  lifecyclePromise = null;
};

async function shutdown(exitCode: number): Promise<never> {
  if (shuttingDown) {
    process.exit(exitCode);
  }
  shuttingDown = true;

  process.stderr.write('\nShutting down TeamCity MCP Server...\n');

  try {
    const serverToClose = activeServer;
    const lifecycleToAwait = lifecyclePromise;

    await serverToClose?.close();
    await lifecycleToAwait;
  } catch (error) {
    process.stderr.write(
      `Error while closing server: ${error instanceof Error ? error.message : String(error)}\n`
    );
  } finally {
    clearServerState();
    process.exit(exitCode);
  }
}

async function main() {
  try {
    // Validate required environment variables via centralized config
    let hasUrl: string;
    try {
      hasUrl = getTeamCityUrl();
      getTeamCityToken();
    } catch (e) {
      process.stderr.write(`${(e as Error).message}\n`);
      process.stderr.write(
        'Please configure TEAMCITY_URL and TEAMCITY_TOKEN via:\n' +
          '  - CLI arguments: --url <url> --token <token>\n' +
          '  - Config file: --config <path>\n' +
          '  - Environment variables\n' +
          '  - .env file\n' +
          'Run with --help for more information.\n'
      );
      process.exit(1);
    }

    process.stderr.write('Starting TeamCity MCP Server\n');
    process.stderr.write(`TeamCity URL: ${hasUrl}\n`);

    // Create and start server
    const server = createSimpleServer();
    const transport = new StdioServerTransport();
    const lifecycle = startServerLifecycle(server, transport);

    activeServer = server;
    setServerInstance(server);
    lifecyclePromise = lifecycle;
    process.stderr.write('TeamCity MCP Server is running and ready to accept connections\n');

    await lifecycle;
    clearServerState();
    process.stderr.write('TeamCity MCP Server connection closed\n');
  } catch (error) {
    clearServerState();
    process.stderr.write(`Failed to start server: ${error}\n`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

// Start the server
main().catch((error) => {
  process.stderr.write(`Unhandled error: ${error}\n`);
  process.exit(1);
});
