# Claude Code Instructions for teamcity-mcp

## Project Overview

TeamCity MCP Server - An MCP (Model Context Protocol) server that provides tools for interacting with TeamCity CI/CD.

## Development Commands

```bash
npm run build              # Build the project
npm run lint               # Run ESLint
npm run format             # Run Prettier
npm run check              # Run all checks (build, lint, format)
```

## Testing

### Unit tests
```bash
npm test                   # Run all unit tests
npm run test:coverage      # Run with coverage report
```

### Integration tests

Requires `TEAMCITY_URL` and `TEAMCITY_TOKEN` in `.env` or environment.

```bash
npm run test:integration                           # Run integration tests (some suites skipped)
SERIAL_BUILD_TESTS=true npm run test:integration   # Run ALL integration tests including serial suites
```

Serial suites are skipped by default because they need exclusive access to TeamCity resources (queue operations, streaming artifacts). The `SERIAL_BUILD_TESTS=true` flag enables them.

## Code Conventions

- TypeScript strict mode, no `any`
- Test code must be at the same quality as production code
- Use existing logger utilities, avoid `console.log`
- Follow Conventional Commits for commit messages

## Key Patterns

### Auto-generated API client

The TeamCity API client in `src/teamcity-client/api/` is auto-generated from OpenAPI specs. Method names with numeric suffixes (e.g., `createBuildParameterOfBuildType_1`) differentiate between endpoints with similar operations:
- Non-suffixed methods often target `/output-parameters`
- `_1`, `_7`, etc. suffixed methods target `/parameters`

Always verify the endpoint path in the generated code when using these methods.

### Parameter tools

Three parameter sets exist:
- **Project parameters**: `/projects/{id}/parameters` (supports types)
- **Build config input parameters**: `/buildTypes/{id}/parameters` (supports types)
- **Build config output parameters**: `/buildTypes/{id}/output-parameters` (no type support)

Type support includes: `password`, `text`, `checkbox`, `select` with spec format in `type.rawValue`.
