/**
 * Simple TeamCity MCP Server Entry Point
 * Minimal implementation without complex DI or abstractions
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';

import { getTeamCityToken, getTeamCityUrl } from '@/config';
import { startServerLifecycle } from '@/server-runner';

import { createSimpleServer } from './server';

// Load environment variables
dotenv.config();

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
        'Please set TEAMCITY_URL and TEAMCITY_TOKEN in your environment or .env file.\n'
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
