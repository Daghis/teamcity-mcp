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

## Running Tests

### Unit tests

```bash
npm test                    # Run all unit tests
npm run test:coverage       # Run with coverage report
```

### Integration tests

Integration tests require a running TeamCity instance. Set `TEAMCITY_URL` and `TEAMCITY_TOKEN` in `.env` or environment.

```bash
npm run test:integration    # Run integration tests (some suites skipped)
```

Some integration test suites require exclusive access to TeamCity resources (queue operations, streaming artifacts). These are skipped by default and run with:

```bash
SERIAL_BUILD_TESTS=true npm run test:integration
```

## Coverage expectations

- `npm run test:coverage` now instruments the MCP tool registry (`src/tools.ts`) and the core TeamCity managers (build queue/results/status and configuration update). The suite must stay green with these files included.
- Global thresholds are enforced in `jest.config.js` (lines/functions/statements ≥ 80%, branches ≥ 69%). Branch coverage is temporarily lower while we add more scenarios; prefer improving tests rather than lowering thresholds.
- When adding new tools or manager logic, extend the closest unit test to keep coverage from regressing. For large gaps, add focused tests before relaxing thresholds.
- Document any intentional exclusions in code comments or follow-up issues so future contributors can restore coverage.

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
- Follow [Conventional Commits](https://www.conventionalcommits.org/):
  - Use lower‑case `type` prefixes like `feat`, `fix`, or `chore`.
  - Keep the summary within 72 characters.
  - PR titles must also follow this format and will become the squash merge commit message.
- Commit message linting runs in CI to enforce the convention.

## Pull Requests

- Describe scope, rationale, and testing.
- Link issues/tickets; include logs or CLI output if relevant.
- Ensure CI is green and `npm run check` passes locally.
- Use **Squash and merge** so the merge commit inherits the PR’s conventional title.
