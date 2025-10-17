# TeamCity MCP Server

[![CI](https://github.com/Daghis/teamcity-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Daghis/teamcity-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Daghis/teamcity-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/Daghis/teamcity-mcp/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/Daghis/teamcity-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/Daghis/teamcity-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Model Control Protocol (MCP) server that bridges AI coding assistants with JetBrains TeamCity CI/CD server, exposing TeamCity operations as MCP tools.

## Overview

The TeamCity MCP Server allows developers using AI-powered coding assistants (Claude Code, Cursor, Windsurf) to interact with TeamCity directly from their development environment via MCP tools.

## Features

### 🚀 Two Operational Modes

- **Dev Mode**: Safe CI/CD operations
  - Trigger builds
  - Monitor build status and progress
  - Fetch build logs
  - Investigate test failures
  - List projects and configurations

- **Full Mode**: Complete infrastructure management
  - All Dev mode features, plus:
  - Create and clone build configurations
  - Manage build steps and triggers
  - Configure VCS roots and agents
  - Set up new projects
  - Modify infrastructure settings

### 🎯 Key Capabilities

- Trigger and monitor builds, fetch logs, and inspect test failures
- Token-based authentication to TeamCity; sensitive values redacted in logs
- Modern architecture: simple, direct implementation with a singleton client
- Performance-conscious: fast startup with minimal overhead
- Clean codebase with clear module boundaries

## Installation

### Prerequisites

- Node.js >= 20.10.0
- TeamCity Server 2020.1+ with REST API access
- TeamCity authentication token

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Daghis/teamcity-mcp.git
cd teamcity-mcp

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your TeamCity URL and token

# Run in development mode
npm run dev
```

### npm Package

Run the MCP server via npx (requires Node 20.x). Set your TeamCity environment variables inline or via a `.env` in the working directory.

```bash
# One-off run (inline envs)
TEAMCITY_URL="https://teamcity.example.com" \
TEAMCITY_TOKEN="<your_token>" \
MCP_MODE=dev \
npx -y @daghis/teamcity-mcp

# Or rely on .env in the current directory
npx -y @daghis/teamcity-mcp
```

### Docker image

```bash
# Clone the repository
git clone https://github.com/Daghis/teamcity-mcp.git
cd teamcity-mcp

#Build image
docker build -t teamcity-mcp .
```

## Claude Code

- Add the MCP:
  - `claude mcp add [-s user] teamcity -- npx -y @daghis/teamcity-mcp`
- With env vars (if not using .env):
  - `claude mcp add [-s user] teamcity -- env TEAMCITY_URL="https://teamcity.example.com" TEAMCITY_TOKEN="tc_<your_token>" MCP_MODE=dev npx -y @daghis/teamcity-mcp`
- Using docker image
  - `claude mcp add [-s user] teamcity -- docker run --rm -i --env-file <env_file_path> teamcity-mcp`
- Docker image with env vars (if not using .env)
  - `claude mcp add [-s user] teamcity -- docker run --rm -i -e TEAMCITY_URL="https://teamcity.example.com" -e TEAMCITY_TOKEN="tc_<your_token>" -e MCP_MODE=dev teamcity-mcp`
- Context usage (Opus 4.1, estimates):
  - Dev (default): ~14k tokens for MCP tools
  - Full (`MCP_MODE=full`): ~26k tokens for MCP tools

## Configuration

Environment is validated centrally with Zod. Supported variables and defaults:

```env
# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# TeamCity Configuration (aliases supported)
TEAMCITY_URL=https://teamcity.example.com
TEAMCITY_TOKEN=your-auth-token
# Optional aliases:
# TEAMCITY_SERVER_URL=...
# TEAMCITY_API_TOKEN=...

# MCP Mode (dev or full)
MCP_MODE=dev

# Optional advanced TeamCity options (defaults shown)
# Connection
# TEAMCITY_TIMEOUT=30000
# TEAMCITY_MAX_CONCURRENT=10
# TEAMCITY_KEEP_ALIVE=true
# TEAMCITY_COMPRESSION=true

# Retry
# TEAMCITY_RETRY_ENABLED=true
# TEAMCITY_MAX_RETRIES=3
# TEAMCITY_RETRY_DELAY=1000
# TEAMCITY_MAX_RETRY_DELAY=30000

# Pagination
# TEAMCITY_PAGE_SIZE=100
# TEAMCITY_MAX_PAGE_SIZE=1000
# TEAMCITY_AUTO_FETCH_ALL=false

# Circuit Breaker
# TEAMCITY_CIRCUIT_BREAKER=true
# TEAMCITY_CB_FAILURE_THRESHOLD=5
# TEAMCITY_CB_RESET_TIMEOUT=60000
# TEAMCITY_CB_SUCCESS_THRESHOLD=2
```

These values are normalized in `src/config/index.ts` and consumed by `src/teamcity/config.ts` via helper getters.

## Usage Examples

Once integrated with your AI coding assistant:

```
"Build the frontend on feature branch"
"Why did last night's tests fail?"
"Deploy staging with the latest build"
"Create a new build config for the mobile app"
```

### Tool Responses and Pagination

- Responses: Tools now return consistent MCP content. For list/get operations, the `content[0].text` contains a JSON string. Example shape:
  `{ "items": [...], "pagination": { "page": 1, "pageSize": 100 } }` or `{ "items": [...], "pagination": { "mode": "all", "pageSize": 100, "fetched": 250 } }`.
- Pagination: Most list\_\* tools accept `pageSize`, `maxPages`, and `all`:
  - `pageSize` controls items per page.
  - `all: true` fetches multiple pages up to `maxPages`.
  - Legacy `count` on `list_builds` is kept for compatibility but `pageSize` is preferred.

### Validation and Errors

- Input validation: Tool inputs are validated with Zod schemas; invalid input returns a structured error payload in the response content (JSON string) with `success: false` and `error.code = VALIDATION_ERROR`.
- Error shaping: Errors are formatted consistently via a global handler. In production, messages may be sanitized; sensitive values (e.g., tokens) are redacted in logs.

### API Usage

```typescript
import { TeamCityAPI } from '@/api-client';

// Get the API client instance
const api = TeamCityAPI.getInstance();

// List projects
const projects = await api.listProjects();

// Get build status
const build = await api.getBuild('BuildId123');

// Trigger a new build
const newBuild = await api.triggerBuild('BuildConfigId', {
  branchName: 'main',
});
```

> **Note:** The legacy helpers exported from `src/teamcity/index.ts` remain only for compatibility and include placeholder implementations. Prefer the MCP tools (see the reference linked above) or the `TeamCityAPI` shown here when automating workflows.

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run typecheck

# Build for production
npm run build

# Analyze bundle for Codecov
npm run build:bundle
```

### Bundle analysis in CI

The CI workflow runs `npm run build:bundle` and uploads the generated `coverage/bundles` JSON using `codecov/codecov-action` with the `javascript-bundle` plugin.

## Project Structure

```
teamcity-mcp/
├── src/               # Source code
│   ├── tools/        # MCP tool implementations
│   ├── utils/        # Utility functions
│   ├── types/        # TypeScript type definitions
│   └── config/       # Configuration management
├── tests/            # Test files
├── docs/             # Documentation
└── .agent-os/        # Agent OS specifications
```

## API Documentation

The MCP server exposes tools for TeamCity operations. Each tool corresponds to specific TeamCity REST API endpoints:

### Build Management

- `TriggerBuild` - Queue a new build
- `GetBuildStatus` - Check build progress
- `FetchBuildLog` - Retrieve build logs
- `ListBuilds` - Search builds by criteria

### Test Analysis

- `ListTestFailures` - Get failing tests
- `GetTestDetails` - Detailed test information
- `AnalyzeBuildProblems` - Identify failure reasons

### Configuration (Full Mode Only)

- `create_build_config` - Create new TeamCity build configurations with full support for:
  - VCS roots (Git, SVN, Perforce) with authentication
  - Build steps (script, Maven, Gradle, npm, Docker, PowerShell)
  - Triggers (VCS, schedule, finish-build, maven-snapshot)
  - Parameters and template-based configurations
  - See the [MCP Tool Reference](docs/mcp-tools-reference.md) for argument details and additional options.
- `clone_build_config` - Duplicate existing configurations into any project, preserving steps, triggers, and parameters.
- `update_build_config` - Adjust names, descriptions, artifact rules, and pause state for a configuration.
- `manage_build_steps` - Add, update, remove, or reorder build steps through a single tool surface.
- `manage_build_triggers` - Add or delete build triggers with full property support.
- `create_vcs_root` & `add_vcs_root_to_build` - Define VCS roots and attach them to build configurations.

See also: [`docs/TEAMCITY_MCP_TOOLS_GUIDE.md`](docs/TEAMCITY_MCP_TOOLS_GUIDE.md) for expanded workflows and examples that align with the current MCP implementation.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Security

- Configure `TEAMCITY_TOKEN` via environment (see `.env.example`); never commit real tokens
- Token-based authentication only
- Logs redact sensitive values

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/Daghis/teamcity-mcp/issues)
- Documentation: See the `docs/` folder in this repository

## Acknowledgments

- JetBrains TeamCity for the excellent CI/CD platform
- Anthropic for the Model Control Protocol specification
- The open-source community for continuous support

---

Built with ❤️ for developers who love efficient CI/CD workflows
