# Repository Guidelines

## Project Structure & Module Organization
- `src/` — TypeScript source. Key areas: `teamcity/` (API + managers), `tools.ts` (MCP tools), `utils/`, `types/`, `config/`, `server.ts`.
- `tests/` — Jest tests (unit/integration) plus mocks and setup.
- `docs/` — Additional docs; see `ARCHITECTURE.md` for design notes.
- `scripts/` — Build/tooling scripts. Build output goes to `dist/`.
- Path aliases: `@/utils`, `@/types`, `@/config`, `@/server`, `@/tools`.

## Build, Test, and Development Commands
- `npm run dev` — Watch + run `src/index.ts` via tsx.
- `npm run build` — Production build to `dist/`.
- `npm start` — Run built server from `dist/`.
- `npm test` | `npm run test:unit` | `npm run test:integration` — Run Jest suites.
- `npm run test:coverage` — Coverage report (thresholds enforced).
- `npm run lint` / `npm run lint:check` — ESLint with Prettier integration.
- `npm run format` — Format; `npm run typecheck` — TS type checking.
- Node 24.x required. Use `.nvmrc` (24.x). Copy `.env` from `.env.example` and fill values.

## Coding Style & Naming Conventions
- Prettier: 2 spaces, 100 cols, single quotes, trailing commas; import order via `@trivago/prettier-plugin-sort-imports`.
- ESLint: `no-console` — use `utils/logger.ts` (Winston). Prefer arrow functions, `const`, template strings.
- Naming: types/interfaces/enums — PascalCase; vars/functions/params — camelCase; constants may be UPPER_CASE.
- Types: no `any`; use generics/`unknown`/precise types. Public APIs have explicit return types. Default or named exports allowed.

## Testing Guidelines
- Framework: Jest + ts-jest. Tests in `src/**/*.test.ts` or `tests/**`. Setup: `jest.setup.js`, `tests/setup.ts`; mocks in `tests/__mocks__/`.
- Coverage: ≥ 80% (branches, functions, lines, statements) via `npm run test:coverage`.
- Behavior-first: assert outputs, events, and side effects. Avoid peeking into internals or mock call counts except for thin adapters or explicit logging/redaction utilities.

## Commit & Pull Request Guidelines
- Commits: imperative subject; include ticket when applicable, e.g., `[TMCP-123] Short summary` (≤72 chars). Add body for rationale/breaking changes.
- PRs: link issues/tickets, describe scope and testing, include relevant logs or CLI output. Require green CI and `npm run check` locally.

## Security & Configuration Tips
- Never commit secrets. Configure via `.env` (e.g., `TEAMCITY_URL`, `TEAMCITY_TOKEN`, `MCP_MODE`). Use provided TeamCity client/managers; respect rate limits and retries.

## Reference Documentation
- Primary: `docs/` and `ARCHITECTURE.md` for design, flows, and module boundaries.
- API surface: `src/teamcity/` managers and `src/teamcity/index.ts` re-exports. Contracts are defined in `src/teamcity/api-types.ts` and `src/types/`.
- MCP tools: `src/tools.ts` lists tool identifiers, argument shapes, and returned payloads. Search by tool `name` to find handlers.
- Configuration: see `src/config/` and `.env.example` for required keys and defaults.
- Quick discovery examples:
  - `rg -n "^export (type|interface|enum)" src/types src/teamcity`
  - `rg -n "name: '" src/tools.ts`

## Agent-Specific Instructions
- Keep changes minimal and focused; preserve module boundaries.
- Prefer existing utilities, path aliases, and the shared logger.
- Add tests alongside code; avoid new dependencies without discussion.

## TeamCity API Map
- Entry point: `src/teamcity/index.ts` — re-exports auth/config/utilities and exposes `initializeTeamCity`, `getTeamCityClient`, `createTeamCityClient`, plus convenience helpers (e.g., `triggerBuild`, `getBuildStatus`).
- Client: `client.ts` (`TeamCityClient`) and `client-adapter.ts` — typed HTTP access to TeamCity REST APIs.
- Config: `config.ts` — `loadTeamCityConfig`, `validateConfig`, `toClientConfig`, `TeamCityFullConfig`.
- Types: `api-types.ts` and `src/teamcity/types/**` — API contracts and normalized shapes.
- Managers (behavioral layers):
  - Build: `build-configuration-*.ts`, `build-config-manager.ts`, `build-step-manager.ts`, `build-trigger-manager.ts`, `build-parameters-manager.ts`, `build-queue-manager.ts`, `build-results-manager.ts`, `build-status-manager.ts`, `build-list-manager.ts`.
  - Projects: `project-manager.ts`, `project-list-manager.ts`, `project-navigator.ts`.
  - Branch/Artifacts: `branch-*.ts`, `artifact-manager.ts`.
- Utilities: `pagination.ts`, `circuit-breaker.ts`, `errors.ts`, `configuration-branch-matcher.ts`.
- Quick start example:
  ```ts
  import { initializeTeamCity, triggerBuild } from '@/teamcity';
  await initializeTeamCity();
  await triggerBuild('MyBuildTypeId', 'refs/heads/main');
  ```
