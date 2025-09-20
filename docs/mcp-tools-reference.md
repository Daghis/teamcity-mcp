# TeamCity MCP Server — Tool Reference

This document lists all Model Context Protocol (MCP) tools exposed by the TeamCity MCP server in this repository, including arguments, required fields, defaults, and mode availability.

- Server name: `teamcity-mcp`
- Modes: `dev` (default) and `full` via env `MCP_MODE`
  - `dev` mode: read‑only and safe operations
  - `full` mode: includes write/modify operations in addition to all `dev` tools
- Capabilities: tools only (no prompts/resources)

## Conventions

- Many list APIs support pagination: `pageSize`, `maxPages`, and `all` (fetches pages until `maxPages`). Defaults: `pageSize` ≈ 100 when not specified.
- Where supported by TeamCity, list APIs accept `locator` (server-side filtering) and `fields` (server-side projection) to minimize payloads.
- Unless stated, tools are available in both `dev` and `full` modes.
- Types: strings unless noted; booleans are explicitly typed; integers are bounded in validations.

## Tools

### Basic

- `ping` — Test MCP server connectivity
  - Args: `message?: string`
  - Mode: dev, full

### Projects

- `list_projects` — List TeamCity projects (paginated)
  - Args: `locator?: string`, `parentProjectId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `get_project` — Get project details
  - Args: `projectId: string`
- `create_project` — Create a new project
  - Args: `name: string`, `id: string`, `parentProjectId?: string` (defaults `_Root`), `description?: string`
  - Mode: full
- `delete_project` — Delete a project
  - Args: `projectId: string`
  - Mode: full
- `update_project_settings` — Update project fields
  - Args: `projectId: string`, `name?: string`, `description?: string`, `archived?: boolean`
  - Mode: full
- `list_project_hierarchy` — Parent/child tree (limited depth)
  - Args: `rootProjectId?: string` (defaults `_Root`)

### Builds

- `list_builds` — List builds (paginated)
  - Args: `locator?: string`, `projectId?: string`, `buildTypeId?: string`, `status?: 'SUCCESS'|'FAILURE'|'ERROR'`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`, `count?: number` (deprecated)
- `get_build` — Get build details
  - Args: `buildId: string`
- `trigger_build` — Trigger a build
  - Args: `buildTypeId: string`, `branchName?: string`, `comment?: string`
- `cancel_queued_build` — Cancel a queued build
  - Args: `buildId: string`
  - Mode: full
- `get_build_status` — Build status with optional queue context
  - Args: `buildId: string`, `includeTests?: boolean`, `includeProblems?: boolean`, `includeQueueTotals?: boolean` (adds totalQueued; extra call when queued), `includeQueueReason?: boolean` (adds waitReason; extra call when queued)
- `fetch_build_log` — Build log by lines (pagination/tail or stream-to-file)
  - Args: `buildId?: string`, `buildNumber?: string|number` (with optional `buildTypeId` to disambiguate), `buildTypeId?: string`, `page?: number`, `pageSize?: number`, `startLine?: number`, `lineCount?: number`, `tail?: boolean`, `encoding?: 'text'|'stream'` (default `'text'`), `outputPath?: string` (required when `encoding === 'stream'` if you need a specific destination)
- `get_build_results` — Rich results (tests, artifacts, stats, changes, deps)
  - Args: `buildId: string`, `includeArtifacts?: boolean`, `includeStatistics?: boolean`, `includeChanges?: boolean`, `includeDependencies?: boolean`, `artifactFilter?: string`, `maxArtifactSize?: number`, `artifactEncoding?: 'base64'|'stream'`
- `download_build_artifact` — Download a single artifact (base64/text or stream-to-file)
  - Args: `buildId: string`, `artifactPath: string`, `encoding?: 'base64'|'text'|'stream'`, `maxSize?: number`, `outputPath?: string`
- `download_build_artifacts` — Download multiple artifacts in one call
  - Args: `buildId: string`, `artifactPaths: string[]`, `encoding?: 'base64'|'text'|'stream'`, `maxSize?: number`, `outputDir?: string` (streaming only)
- `analyze_build_problems` — Problems + failing tests summary
  - Args: `buildId: string`

### Changes & Diagnostics

- `list_changes` — List version control changes (paginated)
  - Args: `locator?: string`, `projectId?: string`, `buildId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `list_problems` — List build problems (paginated)
  - Args: `locator?: string`, `projectId?: string`, `buildId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `list_problem_occurrences` — List problem occurrences (paginated)
  - Args: `locator?: string`, `buildId?: string`, `problemId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `list_investigations` — List investigations (paginated)
  - Args: `locator?: string`, `projectId?: string`, `buildTypeId?: string`, `assigneeUsername?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `list_muted_tests` — List muted tests (paginated)
  - Args: `locator?: string`, `projectId?: string`, `buildTypeId?: string`, `testNameId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `get_versioned_settings_status` — Versioned Settings status for a locator
  - Args: `locator: string`, `fields?: string`

### Build Configurations

- `list_build_configs` — List build configurations (paginated)
  - Args: `locator?: string`, `projectId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `get_build_config` — Get build configuration details
  - Args: `buildTypeId: string`
- `create_build_config` — Create a build configuration
  - Args: `projectId: string`, `name: string`, `id: string`, `description?: string`
  - Mode: full
- `clone_build_config` — Clone a build configuration
  - Args: `sourceBuildTypeId: string`, `name: string`, `id: string`, `projectId?: string`
  - Mode: full
- `update_build_config` — Update build configuration fields
  - Args: `buildTypeId: string`, `name?: string`, `description?: string`, `paused?: boolean`, `artifactRules?: string`
  - Mode: full
- `set_build_configs_paused` — Batch pause/unpause build configurations; optionally cancel queued
  - Args: `buildTypeIds: string[]`, `paused: boolean`, `cancelQueued?: boolean`
  - Mode: full

### Build Steps & Triggers

- `manage_build_steps` — Add/update/delete build steps
  - Args: `buildTypeId: string`, `action: 'add'|'update'|'delete'`, `stepId?: string` (update/delete), `name?: string` (add), `type?: string` (add), `properties?: Record<string, unknown>`
  - Mode: full
- `manage_build_triggers` — Add/delete triggers
  - Args: `buildTypeId: string`, `action: 'add'|'delete'`, `triggerId?: string` (delete), `type?: string` (add), `properties?: Record<string, unknown>`
  - Mode: full

### Parameters

- `list_parameters` — List build configuration parameters
  - Args: `buildTypeId: string`
- `add_parameter` — Add a parameter
  - Args: `buildTypeId: string`, `name: string`, `value: string`
  - Mode: full
- `update_parameter` — Update a parameter
  - Args: `buildTypeId: string`, `name: string`, `value: string`
  - Mode: full
- `delete_parameter` — Delete a parameter
  - Args: `buildTypeId: string`, `name: string`
  - Mode: full

### Version Control (VCS)

- `list_vcs_roots` — List VCS roots (paginated)
  - Args: `projectId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `get_vcs_root` — Get VCS root details + properties
  - Args: `id: string`
- `create_vcs_root` — Create a VCS root
  - Args: `projectId: string`, `name: string`, `id: string`, `vcsName: string`, `url: string`, `branch?: string` (default `refs/heads/master`)
  - Mode: full
- `add_vcs_root_to_build` — Attach VCS root to a build config
  - Args: `buildTypeId: string`, `vcsRootId: string`, `checkoutRules?: string`
  - Mode: full

### Agents

- `list_agents` — List build agents (paginated)
  - Args: `locator?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `list_agent_pools` — List agent pools (paginated)
  - Args: `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `authorize_agent` — Authorize/unauthorize an agent
  - Args: `agentId: string`, `authorize: boolean`
  - Mode: full
- `assign_agent_to_pool` — Assign an agent to a pool
  - Args: `agentId: string`, `poolId: string` (parsed as integer)
  - Mode: full
- `get_incompatible_build_types_for_agent` — Build types incompatible with an agent
  - Args: `agentId: string`
  - Mode: dev, full
- `get_compatible_agents_for_build_type` — Agents compatible with a build type
  - Args: `buildTypeId: string`, `includeDisabled?: boolean`
  - Mode: dev, full
- `count_compatible_agents_for_build_type` — Count of compatible agents (optionally only enabled)
  - Args: `buildTypeId: string`, `includeDisabled?: boolean`
  - Mode: dev, full
- `get_compatible_agents_for_queued_build` — Agents compatible with a queued/running build
  - Args: `buildId: string`, `includeDisabled?: boolean`
  - Mode: dev, full

### Users & Roles

- `list_users` — List users (paginated)
  - Args: `locator?: string`, `groupId?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `list_roles` — List defined roles and permissions
  - Args: `fields?: string`

### Tests

- `list_test_failures` — List failing tests for a build (paginated)
  - Args: `buildId: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`
- `get_test_details` — Detailed test occurrence data
  - Args: `buildId: string`, `testNameId?: string`

### Branches

- `list_branches` — Unique branches across recent builds
  - Args: `projectId?: string`, `buildTypeId?: string`
  - Notes: one of `projectId` or `buildTypeId` is required

## Environment & Setup

- Configure via `.env` (copy from `.env.example`): `TEAMCITY_URL`, `TEAMCITY_TOKEN`, `MCP_MODE`
- Switch tool surface by setting `MCP_MODE=dev|full`
- Server reports tools via MCP `tools/list` and executes via `tools/call`

### Queue

- `list_queued_builds` — List queued builds (paginated)
  - Args: `locator?: string`, `pageSize?: number`, `maxPages?: number`, `all?: boolean`, `fields?: string`

### Queue Maintenance (full)

- `move_queued_build_to_top` — Move a queued build to the top
  - Args: `buildId: string`
- `reorder_queued_builds` — Reorder queued builds by explicit sequence
  - Args: `buildIds: string[]`
- `cancel_queued_builds_for_build_type` — Cancel all queued builds for a build type
  - Args: `buildTypeId: string`
- `cancel_queued_builds_by_locator` — Cancel queued builds by queue locator
  - Args: `locator: string`
- `pause_queue_for_pool` — Disable all agents in a pool; optionally cancel queued for a build type
  - Args: `poolId: string`, `cancelQueuedForBuildTypeId?: string`, `comment?: string`, `until?: string`
- `resume_queue_for_pool` — Re-enable all agents in a pool
  - Args: `poolId: string`

### Test Administration (full)

- `mute_tests` — Mute tests within a project or build configuration scope
  - Args: `testNameIds: string[]`, `buildTypeId?: string`, `projectId?: string`, `comment?: string`, `until?: string`, `fields?: string`
  - Mode: full

### Server Health & Metrics

- `get_server_info` — Returns `/app/rest/server`
- `get_server_metrics` — Returns `/app/rest/server/metrics`
- `list_server_health_items` — Returns `/app/rest/health`
- `get_server_health_item` — Returns `/app/rest/health/{locator}`
- `check_availability_guard` — Returns `{ ok, criticalCount, warningCount, items }`
- `check_teamcity_connection` — Returns `{ ok }`

### Availability & Compatibility

- `set_agent_enabled` (full)
  - Args: `agentId: string`, `enabled: boolean`, `comment?: string`, `until?: string`
  - Returns: `{ success, action, agentId, enabled }`
- `bulk_set_agents_enabled` (full)
  - Args: `enabled: boolean`, `poolId?: string`, `locator?: string`, `comment?: string`, `until?: string`, `includeDisabled?: boolean`
  - Returns: `{ success, action, total, succeeded, failed, results, locator?, poolId? }`
- `get_agent_enabled_info` — Agent enabled status with comment/switch time
  - Args: `agentId: string`
- `get_compatible_build_types_for_agent` — Build types compatible with an agent
  - Args: `agentId: string`
- `get_incompatible_build_types_for_agent` — Build types incompatible with an agent
  - Args: `agentId: string`
- `get_compatible_agents_for_build_type` — Agents compatible with a build type
  - Args: `buildTypeId: string`, `includeDisabled?: boolean`
- `count_compatible_agents_for_build_type` — Count only
  - Args: `buildTypeId: string`, `includeDisabled?: boolean`
- `get_compatible_agents_for_queued_build` — Agents compatible with a queued/running build
  - Args: `buildId: string`, `includeDisabled?: boolean`

## Mode Summary

- Dev mode tools: all tools not explicitly marked with Mode: full
- Full mode adds write operations: `cancel_queued_build`, `create_*`, `clone_*`, `update_*`, `add_*`, `delete_*`, `authorize_agent`, `assign_agent_to_pool`, `manage_build_steps`, `manage_build_triggers`, `set_build_configs_paused`, `move_queued_build_to_top`, `reorder_queued_builds`, `cancel_queued_builds_for_build_type`, `cancel_queued_builds_by_locator`, `pause_queue_for_pool`, `resume_queue_for_pool`

### Write API response shape (standardized)

- All write tools return JSON with at least: `{ success: boolean, action: string, ...identifiers }`.
- Identifiers echo the target of the action: e.g., `{ id }`, `{ buildId }`, `{ agentId }`, `{ buildTypeId, name }`, `{ locator }`.
- When applicable, counts are included: `{ canceled, updated, succeeded, failed }`.
