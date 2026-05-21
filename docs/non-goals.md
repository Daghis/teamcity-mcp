# teamcity-mcp Non-Goals

## Purpose

This is the "no" list. Every entry below is an operation or capability that teamcity-mcp will not expose, with a one-line rationale.

It is paired with [`strategy.md`](strategy.md), which defines the posture this list flows from. The short version: teamcity-mcp is the **AI power-user tool**. Operations on this list either undermine that posture (e.g. generic REST passthrough), or belong to workflows agents shouldn't be driving (admin, governance, server maintenance).

## How to read this list

Each entry has:

- **Bold name** — what we won't do.
- **Rationale** — one or two sentences explaining why.
- **Reconsider when…** — optional. Present only when there's a concrete trigger we can imagine that would justify revisiting.

## The list

1. **Generic REST passthrough tool.** No `rest_get` or `rest_post` style tool that lets an agent call any TeamCity endpoint with arbitrary path and body. Typing is our moat; this would dilute it on every call. JetBrains' built-in MCP already covers this use case for users who want it.

2. **User, group, role, and permission CRUD.** Creating users, assigning roles, managing groups, granting permissions. Admin workflows that humans do through the TeamCity UI and that have no business being agent-driven.
   _Reconsider when:_ a clear AI-driven onboarding/provisioning workflow emerges with explicit human-in-the-loop guardrails.

3. **License management.** Reading or modifying license keys, agent counts, build limits. Admin-only and single-tenant.

4. **Backup, cleanup, and maintenance operations.** Triggering backups, scheduling cleanup, managing data retention. Server-admin territory; high blast radius if an agent gets it wrong.

5. **Plugin and tool installation management.** Installing plugins, registering Maven/Gradle/Node versions on agents. Server-admin territory.

6. **Audit log writes.** Read access to audit logs may be exposed selectively (Tier 6 in the roadmap); writes never. Audit integrity is a foundational governance property.

7. **Global server settings writes.** Cross-cutting configuration that affects every project and user. Reads may be exposed if a workflow needs them; writes are a footgun.

8. **Versioned settings writes.** TeamCity's "config-as-code" feature commits project settings to Git. Allowing an agent to drive this directly creates a high-risk path where mistakes propagate through version control. The status (`get_versioned_settings_status`) is exposed; mutations are not.

9. **The full notifier endpoint surface.** We will expose at most 1-2 generic notifier types (likely webhook + Slack) when needed. The long tail of typed notifier endpoints (email, IRC, etc.) doesn't justify maintaining typed schemas.
   _Reconsider when:_ a specific notifier sees repeated demand in real workflows.

10. **Avatar and profile cosmetics.** Setting user avatars, profile descriptions, etc. Not a workflow.

11. **Deep build-chain rebuild orchestration.** Implementing our own dependency-graph traversal for cascading rebuilds. teamcity-mcp triggers builds correctly with the right options (`rebuildAllDependencies`, etc.); TeamCity's existing engine handles the cascade. We do not reimplement it.

## Adding to this list

A PR that adds an entry must:

- Name what's being excluded specifically (an endpoint family, a capability, not a vague theme).
- Justify the exclusion against the posture in [`strategy.md`](strategy.md).
- If a "reconsider when…" trigger is conceivable, include it.

## Removing from this list

A PR that removes an entry is usually paired with a PR that adds the corresponding tool. The justification must explicitly address what changed since the entry was added — ideally pointing to the "reconsider when…" trigger that fired, or arguing why the original rationale no longer holds.
