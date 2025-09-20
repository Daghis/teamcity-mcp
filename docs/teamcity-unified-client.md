# TeamCity Unified Client Contract

This document codifies the contract between TeamCity managers/tools and the unified REST
client that powers the MCP server. Use it as the single source of truth when adding new
TeamCity integrations, migrating legacy code, or extending our generated API surface.

- For a high-level architecture overview see [ARCHITECTURE.md](../ARCHITECTURE.md).
- For tool behaviour and workflows refer to
  [TEAMCITY_MCP_TOOLS_GUIDE.md](./TEAMCITY_MCP_TOOLS_GUIDE.md).

## Layered Architecture

```
TeamCityAPI (generated client) ──> TeamCityClientAdapter ──> Managers ──> MCP tools
                            │                              │
                            │                              └─ Unit tests via MockTeamCityClient
                            └─ Axios instance, retries, auth
```

1. `TeamCityAPI` (from `src/api-client.ts`) owns authentication, retries, and exposes every
   generated REST module.
2. `TeamCityClientAdapter` (`src/teamcity/client-adapter.ts`) wraps the singleton, normalises
   configuration, and exposes a stable contract to the rest of the codebase.
3. Managers under `src/teamcity/` consume the adapter. They must not import axios directly or
   instantiate generated API classes.
4. MCP tools, scripts, and server entrypoints call into managers or the adapter helpers.

## Adapter Surface Reference

The adapter extends `TeamCityUnifiedClient` (defined in `src/teamcity/types/client.ts`). Key
members are summarised below:

| Member | Type | Purpose |
| --- | --- | --- |
| `modules` | `Readonly<TeamCityApiSurface>` | Direct access to generated API modules (e.g. `client.modules.builds`). |
| `http` / `getAxios()` | `AxiosInstance` | Shared axios client with auth, interceptors, and retry policy. |
| `request(fn)` | `(ctx) => Promise<T>` | Executes a callback with `{ axios, baseUrl, requestId }`. Use only when an API method does not expose the required operation. |
| `getConfig()` | `TeamCityFullConfig` | Returns the effective configuration used to initialise the adapter. |
| `getApiConfig()` | `TeamCityAPIClientConfig` | Normalised connection details (base URL, token, timeout). |
| Convenience helpers | `listProjects`, `getBuild`, `triggerBuild`, etc. | Backwards-compatible wrappers preserved for legacy managers and tooling. |
| Legacy compatibility | `builds`, `listBuildArtifacts`, `downloadArtifactContent`, etc. | Thin adapters over historical helper methods; prefer `modules` when building new features. |
| `baseUrl` | `string` | Canonical TeamCity server URL resolved during initialisation. |

The adapter is created by `initializeTeamCity` / `createTeamCityClient` in `src/teamcity/index.ts`.
Both functions validate configuration, instantiate the singleton, and wrap it with
`createAdapterFromTeamCityAPI`.

### Module Access

All generated REST module instances are exposed through the read-only `modules` object. Calls
mirror the OpenAPI definitions and return Axios responses.

```ts
const client = await initializeTeamCity();
// Example: fetch builds
const response = await client.modules.builds.getAllBuilds('project:Example_Project', 'build(id)');
const builds = response.data.build ?? [];
```

> **Rule**: Managers and tools must go through `client.modules.<api>` (or the documented
> convenience helpers). Direct `axios` usage is only permitted via `client.request` for edge
> cases that the generated modules do not cover.

### Request Callback Helper

`client.request` provides structured access to the shared axios instance when raw HTTP calls are
unavoidable (e.g. downloading files with custom response types).

```ts
await client.request(async ({ axios, baseUrl }) => {
  const url = `${baseUrl}/app/rest/some/endpoint`;
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return response.data;
});
```

Include meaningful logging around custom requests and prefer adding missing endpoints to the
OpenAPI client over repeating ad-hoc HTTP calls.

## Manager Expectations

When adding or updating a manager:

1. Accept a `TeamCityClientAdapter` in the constructor and store it as `private readonly client`.
2. Use `client.modules` to invoke REST endpoints and keep locator strings or field selectors in
   private helpers for reuse.
3. Avoid `as unknown as ...` casts. When the OpenAPI typings are too generic, add dedicated
   interfaces or runtime validation before transforming data.
4. Prefer returning rich domain objects (e.g. normalized build summaries) instead of raw REST
   payloads.
5. Log recoverable failures with `warn`/`error` from `@/utils/logger`.

### Artifact downloads

- `ArtifactManager.downloadArtifact` now accepts `encoding: 'stream'` to return a Node
  `Readable` without buffering the full payload. This is opt-in; the default path still
  buffers responses as `Buffer`/`base64` to preserve existing behaviour.
- Streaming is limited to single-artifact downloads. `downloadMultipleArtifacts` will throw when
  `encoding: 'stream'` is requested so callers can fall back to sequential handling.
- Consumers should document whether they expect buffered or streaming content when exposing the
  option through new APIs or tools.

## Testing the Contract

The `tests/test-utils/mock-teamcity-client.ts` helper provides a typed
`createMockTeamCityClient()` factory that implements the full adapter surface. Key tips:

- Override only the modules or helpers you need for a test:
  ```ts
  const mockClient = createMockTeamCityClient();
  mockClient.mockModules.builds.getAllBuilds.mockResolvedValue(createMockAxiosResponse({
    build: [],
  }));
  ```
- The mock exposes both the `modules` object and legacy helpers (`mockClient.builds`).
- Use `mockClient.resetAllMocks()` between tests to avoid cross-test pollution.
- Unit tests should focus on behaviour (returned values, logging) rather than internal axios
  calls.

For integration tests, rely on the real adapter through `initializeTeamCity` and the MCP tooling
entrypoints. The e2e harness (`tests/e2e/index.ts`) now supports a `batch` command that reuses a
single MCP server instance for sequential tool calls (via `callToolsBatch` in
`tests/integration/lib/mcp-runner`). Prefer batching setup/teardown flows - such as the streaming
artifact scenario - to cut process spawn time while keeping existing single-call helpers available.

## Adding New API Surface

When a new TeamCity endpoint is required:

1. Update the OpenAPI specification / regenerate the client so the module appears under
   `TeamCityApiSurface`.
2. Extend `MockTeamCityClient` with matching mocks to keep unit tests type-safe.
3. Document the new capability (tool reference and, if necessary, this contract).
4. Prefer exposing the endpoint via a manager method rather than calling the module from MCP
   tools directly.

## Quick Checklist

- [ ] Manager accepts `TeamCityClientAdapter` only; no direct axios imports.
- [ ] REST calls flow through `client.modules` or documented convenience helpers.
- [ ] Responses are validated or narrowed before heavy transformation.
- [ ] Tests use `MockTeamCityClient` (unit) or `initializeTeamCity` (integration).
- [ ] New endpoints or helpers are reflected in this documentation.
