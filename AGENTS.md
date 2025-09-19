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
- Node 20.x required. Use `.nvmrc` (20.x). Copy `.env` from `.env.example` and fill values.

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
- PR descriptions should use Markdown with proper newlines. When scripting, prefer `gh pr edit --body-file` (or `--body` with actual newlines) to ensure bullets and paragraphs render correctly.

### Commitlint Rules (CI-enforced)
- Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`, `deps`.
- Format: `type(scope?): subject` (scope optional). Examples:
  - `fix(tools): delete_parameter uses correct endpoint`
  - `feat(utils): add TeamCity service message escaping`
- Subject length: ≤ 100 characters. Keep details in the body, not the subject.
- Style: imperative mood, no trailing period, lowercase `type`.
- Breaking changes: `feat!: subject` or add footer `BREAKING CHANGE: ...`.
- Reverts: use conventional form, not Git’s default. Example: `revert: feat(utils): add service message escaping` and explain in body.

Notes and tips
- CI checks only the last commit on a PR (`commitDepth: 1`). Ensure your most recent commit message conforms.
- If needed, amend the last commit: `git commit --amend -m "fix(scope): concise subject"` (keep body bullets below).
- For multi-commit PRs, prefer squashing locally or set a good PR title and use “Squash and merge”. PR titles must also follow the same convention and ≤ 100 chars because they become the squash message.
- Put specifics in the body:
  - Bullets of what changed
  - Rationale/links (e.g., `Closes #NN`)
  - Any migration notes

Examples
- Good single-commit message:
  - `fix(teamcity): authorize_agent uses authorizedInfo JSON endpoint`
    
    Body:
    - Switch to `/app/rest/agents/{locator}/authorizedInfo` with JSON
    - Set `Content-Type: application/json`
    
    Closes #78

- Good PR title (squash merge):
  - `fix(tools): delete_parameter uses correct endpoint + arg order`

- Good revert:
  - `revert: feat(utils): add TeamCity service message escaping`
    
    Body: reverts commit `<sha>` due to CI failure; will reintroduce behind a flag.

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
- Client: `client-adapter.ts` — exposes the unified `TeamCityClientAdapter` built on top of the `TeamCityAPI` singleton.
- Config: `config.ts` — `loadTeamCityConfig`, `validateConfig`, `toApiClientConfig`, `TeamCityFullConfig`.
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

## GitHub CLI (gh) Usage

Use GitHub CLI to examine/update issues and manage PRs. Prefer body files over literal `\n` to ensure proper newlines in descriptions.

### Setup
- Verify install: `gh --version`
- Authenticate: `gh auth login` (HTTPS, GitHub.com, device or browser flow)
- Set repo context: `gh repo view` (should show `Daghis/teamcity-mcp`)

### Issues: Inspect and Update
- List open issues: `gh issue list --state open`
- View details (JSON): `gh issue view 18 --json number,title,state,labels,assignees,body,url`
- View formatted: `gh issue view 18`
- Edit title/body: `gh issue edit 18 --title "New title" --body-file ./notes/issue-18.md`
- Add/remove labels: `gh issue edit 18 --add-label enhancement --remove-label bug`
- Assign/unassign: `gh issue edit 18 --add-assignee user1 --remove-assignee user2`
- Comment: `gh issue comment 18 --body-file ./notes/comment.md`
- Close/reopen: `gh issue close 18` | `gh issue reopen 18`

### PRs: Create, Update, Review
- Create PR from current branch:
  - Minimal: `gh pr create --fill`
  - Explicit: `gh pr create --base main --head feat/my-change --title "feat: ..." --body-file ./pr.md`
  - Link issue: include `Closes #18` in the PR body.
- Edit PR after creation:
  - Update title/body: `gh pr edit 31 --title "..." --body-file ./pr.md`
  - Change base: `gh pr edit 31 --base main`
  - Add labels: `gh pr edit 31 --add-label dependencies`
  - Mark draft/ready: `gh pr ready 31` | `gh pr create --draft ...`
- Checkout PR branch: `gh pr checkout 31`
- List/open PRs: `gh pr list --state open` | `gh pr view 31 --web`
- Reviews: `gh pr review 31 --approve` | `--request-changes --body-file ./review.md`
- Merge (maintainers): `gh pr merge 31 --squash --delete-branch` (ensure checks are green)

### CI: Checks and Runs
- PR status: `gh pr status` (current repo) or `gh pr view 31 --json statusCheckRollup`
- List workflow runs (current branch): `gh run list --branch $(git branch --show-current)`
- View a run: `gh run view <run-id> --log`
- Rerun a run (maintainers): `gh run rerun <run-id>`

### Advanced: Direct API with gh
- Commit check-runs: `gh api repos/:owner/:repo/commits/<sha>/check-runs --paginate`
- Combined status: `gh api repos/:owner/:repo/commits/<sha>/status`
- PR payload: `gh pr view 31 --json headRefName,headRefOid,mergeable,mergeStateStatus`

### Good Practices and Examples
- Use body files to preserve newlines and bullets:
  - Create file: `cat > /tmp/pr.md <<'MD'
Title and summary paragraph.

Bullets
- Point A
- Point B

Closes #18.
MD`
  - Apply: `gh pr edit 31 --body-file /tmp/pr.md`
- Keep commit subjects under 100 chars (commitlint default via `@commitlint/config-conventional`).
- For Dependabot PRs: repository secrets aren’t available. Our CI skips Codecov uploads for `dependabot[bot]` but still runs tests and checks.
- For forked PRs: treat as untrusted (no secrets). Avoid running steps that require secrets or write permissions unless guarded.
