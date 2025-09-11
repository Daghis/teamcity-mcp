# OSS Launch TODO

High-level checklist to complete before publishing the repository to GitHub.

## Legal & Notices
- Create `THIRD_PARTY_NOTICES.md`:
  - Note use of JetBrains TeamCity name/trademark; clarify no affiliation or endorsement.
  - Mention TeamCity REST API usage and link to relevant terms.
  - Acknowledge project crafting via Anthropic’s Claude Code and OpenAI Codex CLI.
  - List notable third‑party deps/tools: `@modelcontextprotocol/sdk`, `axios`, `zod`, `jest`, `ts-jest`, `prettier`, `eslint`, OpenAPI generator.
- Verify LICENSE (MIT) is correct and reflected in README.

## TeamCity Self‑Integration
- Create a TeamCity project that builds this repo (self‑hosting example):
  - Steps: install deps, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Parameterize Node version via `.nvmrc` (24.7.0) and agent requirements.
  - Configure secure `TEAMCITY_URL`/`TEAMCITY_TOKEN` (dev‑mode, read‑only) as server/agent parameters.
  - Add triggers on `main` and PR branches; publish build artifacts (e.g., coverage report) for docs.
  - Optional: nightly job to run integration smoke tests against a sandbox TeamCity instance.

## GitHub Actions (CI/CD)
- Add workflows (defer until ready to enable CI):
  - `ci.yml`: Node 24, cache `~/.npm`, run `lint:check`, `format:check`, `typecheck`, and `test:coverage` (enforce thresholds); optionally upload coverage to a badge service.
  - `release.yml`: On tag, build and publish to npm (if publishing), generate changelog and GitHub Release.
  - `codeql.yml`: Code scanning (JavaScript/TypeScript).
  - Optional: `e2e.yml` gated by secrets for TeamCity sandbox.
- Configure required checks (branch protection) for `main` when CI is enabled.

## OSS Best Practices
- README badges: build status (GH Actions), coverage, npm version (if publishing), license, Node version, Prettier.
- Add Node 24 badge and update README references to Node 24.
- Governance docs:
  - `CODE_OF_CONDUCT.md` (Contributor Covenant)
  - `SECURITY.md` (reporting policy)
  - Ensure `CONTRIBUTING.md` aligns with workflows and labels
  - Issue/PR templates and labels (bug, feature, question, good‑first‑issue)
- Release hygiene:
  - `CHANGELOG.md` (keep a human‑readable log or use release‑please)
  - Semantic versioning policy documented in README
- Repository hygiene:
  - `CODEOWNERS` for review routing
  - Dependabot or Renovate for deps
  - Stale bot policy (optional)

## Packaging & Publishing
- `package.json` metadata: `repository`, `homepage`, `bugs`, `license`, `engines`, `exports`/`bin` (if CLI), `files` whitelist.
- Add `.npmignore` (or use `files` field) to exclude tests, local scripts, and docs not needed for package.
- Verify build output under `dist/` matches exports and type definitions.

## Codebase Quality (Housekeeping)
- ESLint hygiene: keep `no-await-in-loop` disables narrowly scoped around intentional sequential logic (done in current codebase; verify on new contributions).
- Remove remaining legacy `getTool(...)!` usages by migrating to `getRequiredTool` where applicable.
- Centralize env var validation (zod) in `src/config` and use consistently.
- Silence ESLint multi-project hint by using `tsconfig.lint.json` or enabling `noWarnOnMultipleProjects`.

## Test Stability
- Avoid forced Jest exits; rely on natural shutdown. Ensure timers are cleared in `tests/setup.ts` (added) and prefer fake timers in new tests.

## Documentation
- README refinements:
  - Add badges, succinct Quick Start, and a minimal “Dev vs Full mode” table.
  - Link to `docs/` and `THIRD_PARTY_NOTICES.md`.
  - Add a short “Security & Privacy” note about token redaction and not committing secrets.
- Docs site (optional): publish GitHub Pages or Docusaurus if scope grows.
- Provide minimal examples in `examples/` to demonstrate common tool calls and MCP client integration.

## Security & Compliance
- Enable GitHub secret scanning and push protection.
- Validate token redaction in logs; keep `.env.example` minimal and safe.
- Add threat‑model notes (read‑only defaults in `dev` mode; `full` mode cautions).

## Project Setup on GitHub
- Initialize repo, push baseline, add branch protections, enable Discussions (optional).
- Configure Actions permissions (workflows can create releases/tags if needed).
- Configure CI required checks and status badges.

## Nice‑to‑Haves (Post‑Launch)
- Benchmarks and performance notes for large TeamCity instances.
- Example TeamCity templates for self‑integration (YAML or screenshots).
- Automated docs generation (OpenAPI → client usage snippets) if we add an API facade.
