# TeamCity MCP Server

[![CI](https://github.com/Daghis/teamcity-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Daghis/teamcity-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Daghis/teamcity-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/Daghis/teamcity-mcp/actions/workflows/codeql.yml)
[![codecov](https://codecov.io/gh/Daghis/teamcity-mcp/branch/main/graph/badge.svg)](https://codecov.io/gh/Daghis/teamcity-mcp)

A Model Control Protocol (MCP) server that bridges AI coding assistants with JetBrains TeamCity CI/CD server, enabling natural language control of builds, tests, and deployments.

## Overview

The TeamCity MCP Server allows developers using AI-powered coding assistants (Claude Code, Cursor, Windsurf) to interact with TeamCity directly from their development environment using natural language commands.

## Features

### 🚀 Two Operational Modes

- **Dev Mode**: Safe CI/CD operations
  - Trigger builds
  - Monitor build status and progress
  - Fetch and analyze build logs
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

- **Natural Language Control**: Execute CI/CD tasks using conversational commands
- **Intelligent Analysis**: Automatic test failure summarization and build problem identification
- **Real-time Monitoring**: Live build status updates via WebSocket/SSE
- **Enterprise Security**: Token-based authentication with audit logging
- **Modern Architecture**: Simple, direct implementation with singleton pattern
- **Performance Optimized**: Fast startup time with minimal overhead
- **Clean Codebase**: Well-organized modules with clear separation of concerns

## Installation

### Prerequisites

- Node.js >= 20.10.0
- TeamCity Server 2020.1+ with REST API access
- TeamCity authentication token

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/teamcity-mcp.git
cd teamcity-mcp

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your TeamCity URL and token

# Run in development mode
npm run dev
```

### npm Package (Coming Soon)

```bash
npx @teamcity/mcp-server --mode=dev
```

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
```

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
  - See the Tool Reference for details: docs/mcp-tools-reference.md
- `CloneBuildConfig` - Duplicate configurations (coming soon)
- `ManageBuildSteps` - Add/edit/remove steps (coming soon)
- `ManageVCS` - Configure version control (coming soon)

See also: `docs/TEAMCITY_MCP_TOOLS_GUIDE.md` for an overview. Some advanced sections in that guide describe future enhancements; the behavior above reflects the current implementation.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Security

- Configure `TEAMCITY_TOKEN` via environment (see `.env.example`); never commit real tokens
- Token-based authentication only
- Logs redact sensitive values

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/yourusername/teamcity-mcp/issues)
- Documentation: See the `docs/` folder in this repository

## Acknowledgments

- JetBrains TeamCity for the excellent CI/CD platform
- Anthropic for the Model Control Protocol specification
- The open-source community for continuous support

---

Built with ❤️ for developers who love efficient CI/CD workflows
