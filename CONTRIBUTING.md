# Contributing

Thanks for contributing! This document highlights conventions and expectations to keep the repository consistent and easy to maintain.

## Testing Philosophy

We follow a behavior‑first approach for tests:

- Prefer asserting observable outcomes over internal implementation details.
- Validate returned values, state transitions, emitted events, and documented side‑effects.
- Avoid checking private/underscored fields and exact wire formats (locators, field strings, headers, payload shapes) unless explicitly part of the public contract.

### When call‑count assertions are appropriate

Only add call‑count assertions when the count itself is the documented behavior:

- Caching: second identical call returns the same result and does not invoke the underlying client again. After TTL or with `forceRefresh`, calls increase accordingly.
- Concurrency/parallelization: where a component guarantees parallel execution, keep minimal assertions that reflect the contract (e.g., not N× sequential time).
- Circuit breaker: ensuring short‑circuiting behavior with no underlying call in OPEN state.

### Logging assertions

It’s acceptable to assert logger calls only when logging is part of the public contract (e.g., specific redaction guarantees, structured error logging). Otherwise prefer asserting returned errors/results.

### MCP tool responses

Tools must return standardized JSON payloads. Tests should assert:

- `success`, `action`, and echoed identifiers (e.g., `agentId`, `locator`, `buildId`).
- Documented optional flags (e.g., `includeQueueTotals`) affecting response shape.
- Avoid verifying how API clients are invoked.

### Examples (good)

- “Calling list with `all=true` returns all items and correct pagination metadata.”
- “Second call within TTL returns same results; client calls remain at 1.”
- “get_build_status returns `queued` with `queuePosition` and `waitReason` when flags are set.”

### Examples (avoid)

- Verifying exact TeamCity `locator` strings or `fields` parameter composition.
- Inspecting axios request headers/payload shapes for managers/tools.
- Counting calls without a documented behavior that warrants it.

## Code Style

- TypeScript, strict mode. No `any`. Prefer precise types and generics.
- Prettier for formatting; ESLint for lint rules. Run `npm run lint` and `npm run format`.
- Use existing logger utilities; avoid `console.log`.
- Keep changes minimal and focused; preserve module boundaries.

## Commit Messages

- Imperative mood: “Add X”, “Fix Y”.
- Include ticket IDs when applicable: `[TMCP-123] Short summary`.

## Pull Requests

- Describe scope, rationale, and testing.
- Link issues/tickets; include logs or CLI output if relevant.
- Ensure CI is green and `npm run check` passes locally.

