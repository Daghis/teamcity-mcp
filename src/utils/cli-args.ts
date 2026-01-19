/**
 * CLI Argument Parser for TeamCity MCP Server
 *
 * Provides command-line argument support as a fallback to environment variables,
 * primarily to work around Windows/Claude Code env block merging issues.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Parsed CLI arguments
 */
export interface CliArgs {
  /** TeamCity server URL */
  url?: string;
  /** TeamCity API token */
  token?: string;
  /** MCP mode: dev (limited tools) or full (all tools) */
  mode?: 'dev' | 'full';
  /** Path to .env format config file */
  config?: string;
  /** Show help and exit */
  help: boolean;
  /** Show version and exit */
  version: boolean;
}

/**
 * Parse CLI arguments from argv array
 *
 * Supports both `--key=value` and `--key value` formats.
 *
 * @param argv - Command line arguments (typically process.argv.slice(2))
 * @returns Parsed CLI arguments
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const result: CliArgs = {
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    // Handle boolean flags
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      result.version = true;
      continue;
    }

    // Handle --key=value format
    if (arg.startsWith('--url=')) {
      result.url = arg.slice('--url='.length);
      continue;
    }
    if (arg.startsWith('--token=')) {
      result.token = arg.slice('--token='.length);
      continue;
    }
    if (arg.startsWith('--mode=')) {
      const mode = arg.slice('--mode='.length);
      if (mode === 'dev' || mode === 'full') {
        result.mode = mode;
      } else if (mode.length > 0) {
        process.stderr.write(
          `Warning: Invalid mode '${mode}'. Valid values are 'dev' or 'full'.\n`
        );
      }
      continue;
    }
    if (arg.startsWith('--config=')) {
      result.config = arg.slice('--config='.length);
      continue;
    }

    // Handle --key value format (value is next argument)
    const nextArg = argv[i + 1];
    if (nextArg !== undefined && !nextArg.startsWith('-')) {
      if (arg === '--url') {
        result.url = nextArg;
        i++;
        continue;
      }
      if (arg === '--token') {
        result.token = nextArg;
        i++;
        continue;
      }
      if (arg === '--mode') {
        if (nextArg === 'dev' || nextArg === 'full') {
          result.mode = nextArg;
        } else {
          process.stderr.write(
            `Warning: Invalid mode '${nextArg}'. Valid values are 'dev' or 'full'.\n`
          );
        }
        i++;
        continue;
      }
      if (arg === '--config') {
        result.config = nextArg;
        i++;
        continue;
      }
    }
  }

  return result;
}

/**
 * Get package version from package.json
 */
export function getVersion(): string {
  try {
    // Try multiple possible locations for package.json
    // In bundled output: __dirname is dist/, package.json is ../package.json
    // In source: __dirname is src/utils/, package.json is ../../package.json
    const possiblePaths = [
      join(__dirname, '../package.json'), // bundled: dist/ -> package.json
      join(__dirname, '../../package.json'), // source: src/utils/ -> package.json
    ];

    for (const packagePath of possiblePaths) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8')) as { version?: string };
        if (packageJson.version) {
          return packageJson.version;
        }
      } catch {
        // Try next path
      }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Get help text for CLI usage
 */
export function getHelpText(): string {
  const version = getVersion();
  return `teamcity-mcp v${version}
Model Context Protocol server for TeamCity CI/CD integration

USAGE:
  teamcity-mcp [OPTIONS]

OPTIONS:
  --url <url>         TeamCity server URL (e.g., https://tc.example.com)
  --token <token>     TeamCity API token for authentication
  --mode <dev|full>   Tool exposure mode: dev (limited) or full (all tools)
  --config <path>     Path to .env format configuration file

  -h, --help          Show this help message
  -v, --version       Show version number

CONFIGURATION PRECEDENCE (highest to lowest):
  1. CLI arguments (--url, --token, --mode)
  2. Config file (--config)
  3. Environment variables (TEAMCITY_URL, TEAMCITY_TOKEN, MCP_MODE)
  4. .env file in current directory

SECURITY WARNING:
  Avoid using --token on the command line when possible. The token value
  is visible in process lists and may be logged in shell history. For
  production use, prefer environment variables or a config file with
  restricted permissions (chmod 600).

EXAMPLES:
  # Using CLI arguments
  teamcity-mcp --url https://tc.example.com --token tc_abc123

  # Using a config file
  teamcity-mcp --config /path/to/teamcity.env

  # Override config file with CLI arg
  teamcity-mcp --config prod.env --mode dev

CONFIG FILE FORMAT (.env):
  TEAMCITY_URL=https://tc.example.com
  TEAMCITY_TOKEN=tc_abc123
  MCP_MODE=dev

For more information, visit: https://github.com/Daghis/teamcity-mcp
`;
}
