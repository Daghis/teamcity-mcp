/**
 * Simple TeamCity MCP Server Entry Point
 * Minimal implementation without complex DI or abstractions
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as dotenv from 'dotenv';

import { getTeamCityToken, getTeamCityUrl } from '@/config';

import { createSimpleServer } from './server';

// Load environment variables
dotenv.config();

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

    await server.connect(transport);
    process.stderr.write('TeamCity MCP Server is running and ready to accept connections\n');
  } catch (error) {
    process.stderr.write(`Failed to start server: ${error}\n`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.stderr.write('\nShutting down TeamCity MCP Server...\n');
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stderr.write('\nShutting down TeamCity MCP Server...\n');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  process.stderr.write(`Unhandled error: ${error}\n`);
  process.exit(1);
});
