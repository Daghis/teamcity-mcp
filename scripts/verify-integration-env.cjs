#!/usr/bin/env node
// Simple precheck to prevent false-positive integration runs
// Loads .env and ensures required TeamCity variables are present.

const dotenv = require('dotenv');
dotenv.config();

function hasEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].length > 0;
}

const url = process.env.TEAMCITY_URL || process.env.TEAMCITY_SERVER_URL;
const token = process.env.TEAMCITY_TOKEN || process.env.TEAMCITY_API_TOKEN;

if (!url || !token) {
  // Print a clear message and fail.
  const msg = [
    'Missing TeamCity credentials for integration tests.',
    'Please set TEAMCITY_URL and TEAMCITY_TOKEN (or TEAMCITY_SERVER_URL and TEAMCITY_API_TOKEN) in your environment or .env file.',
  ].join('\n');
  console.error(msg);
  process.exit(1);
}

// Ensure MCP_MODE is set for clarity; integration tests control per-call, but default to dev
if (!hasEnv('MCP_MODE')) process.env.MCP_MODE = 'dev';

process.exit(0);

