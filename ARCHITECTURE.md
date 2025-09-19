# TeamCity MCP Server — Architecture

## Overview

The server implements a straightforward MCP server that bridges MCP tools to the TeamCity REST API. The design favors direct, readable code over heavy abstractions.

## Code Map

```
src/
├── index.ts          # Entry point (env validation, transport wiring)
├── server.ts         # MCP server setup and request handlers
├── api-client.ts     # Thin TeamCity API wrapper (singleton access)
├── tools.ts          # Tool definitions and handlers
├── config/           # Config helpers (env parsing, mode)
├── utils/            # Logging and helpers
├── middleware/       # Error/formatting middleware used by tools
├── teamcity/         # Higher-level managers for some operations
└── teamcity-client/  # Generated REST client (OpenAPI)
```

## Design Principles

- Direct implementation: no DI container, minimal indirection
- Singleton API client via `TeamCityAPI.getInstance()` wrapped by the unified `TeamCityClientAdapter`
- Tools are registered via a simple list; handlers call the API client
- Explicit error shaping for MCP responses; logs redact sensitive values

## Request Flow

1. `index.ts` loads env and starts the server over stdio (MCP)
2. `server.ts` registers `tools/list` and `tools/call` handlers
3. `tools.ts` exposes tools according to `MCP_MODE` (`dev` or `full`)
4. Tool handlers use `api-client.ts` and/or `teamcity/` managers

## TeamCity Client Layering

- `api-client.ts` instantiates the singleton `TeamCityAPI`, wiring auth, retries, and every generated REST module.
- `teamcity/client-adapter.ts` converts the singleton into a `TeamCityClientAdapter` that exposes the unified `modules` surface plus helper methods (see [docs/teamcity-unified-client.md](./docs/teamcity-unified-client.md) for the detailed contract).
- Managers under `teamcity/` depend exclusively on the adapter—they never instantiate generated clients or import axios directly.

## Configuration

Set environment variables (see `.env.example`):

```
TEAMCITY_URL=https://teamcity.example.com
TEAMCITY_TOKEN=your-api-token
MCP_MODE=dev   # or full
```

## Extending Tools

Add a new entry in `tools.ts` with an input schema and handler:

```ts
{
  name: 'my_new_tool',
  description: 'What it does',
  inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  handler: async ({ id }) => {
    const api = TeamCityAPI.getInstance();
    const data = await api.someMethod(id);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  },
}
```

## Notes

- The `teamcity-client/` folder contains generated code and may include permissive typings (e.g., `any`) from the upstream spec. Core modules avoid `any`.
- Large Swagger/OpenAPI JSON files are not checked in; use generator configs in the root to regenerate as needed.
