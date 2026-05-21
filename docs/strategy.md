# teamcity-mcp Strategy

## Purpose

This document is the decision gate for "should we add tool X?" — and the answer to "why does teamcity-mcp exist when TeamCity 2026.1 ships a built-in MCP endpoint?"

It is paired with [`non-goals.md`](non-goals.md), which lists what teamcity-mcp explicitly will _not_ expose.

## The decision

**teamcity-mcp commits to the "AI power-user tool" posture.**

Every AI-workflow operation works end-to-end with typed, safe tools. teamcity-mcp is not a REST mirror, not a superset of the JetBrains built-in MCP, and not an admin tool.

## What this means concretely

teamcity-mcp **does**:

- Expose every operation an AI agent reasonably needs to fix a build, debug a test, manage a release, or wire up a new pipeline.
- Invest deeply in fewer, better tools — typed Zod schemas, accurate annotations, idempotency hints, structured error contracts, examples.
- Stratify by safety: a small `dev` mode for read and low-risk write operations; a larger `full` mode for the rest. Mode placement is a first-class design concern.
- Support TeamCity servers older than 2026.1, where the built-in MCP is unavailable.
- Run as both stdio and HTTP transports, with per-credential isolation suitable for multi-tenant deployment.

teamcity-mcp **does not**:

- Offer a generic "REST passthrough" tool that lets an agent call any TeamCity endpoint. Typing is our moat; offloading endpoint-shape learning to the LLM on every call would forfeit it.
- Cover admin and governance workflows that humans do through the TeamCity UI (see [`non-goals.md`](non-goals.md)).
- Match the JetBrains built-in MCP's surface point-for-point. Where their offering wins on adoption friction (it's server-resident, zero install), ours wins on coverage, typing, and write capability.

## Alternatives considered

Three postures were on the table before this commitment. Each is internally coherent; we picked the one that fits this project's strengths and the competitive landscape.

| Posture                   | Promise                                                              | Why we rejected it                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REST mirror**           | Every TeamCity REST endpoint has a corresponding MCP tool.           | Forces breadth-first growth at the cost of typing and safety quality. With ~200 REST operations, even sustained effort produces a thin, fragile surface. Defeats our differentiation. |
| **JetBrains-superset**    | Match the official MCP's surface exactly, then add.                  | Cedes strategic direction to a vendor that has already declared a deliberately narrow scope. We'd be permanently reactive.                                                            |
| **AI power-user tool** ⭐ | Every AI-workflow operation works end-to-end with typed, safe tools. | Plays to our existing strengths (96 tools, dev/full mode, npm distribution) and gives us a clear yes/no test for new tools.                                                           |

## Why this posture wins for us

Four reasons, in decreasing order of strategic weight:

1. **Typing is the moat.** Generic REST-passthrough tools force the LLM to learn TeamCity's REST shape every session — paths, locators, response schemas, error semantics. Typed tools collapse that into a function call with a schema. Agent reliability on chained operations is measurably better with typed tools. This advantage compounds with every new capability.

2. **Write coverage is the differentiator.** The JetBrains built-in MCP supports only one write operation: triggering a build (forced to `personal=true`). teamcity-mcp covers parameters, agents, queue, mutes, build configs, VCS roots, build steps, triggers, features, dependencies, and more. If an AI workflow needs to _change_ anything beyond starting a build, teamcity-mcp is the only option.

3. **Pre-2026.1 servers are an addressable market.** Every TeamCity instance not yet on 2026.1 has no built-in option. Adoption of major TeamCity versions is slow in regulated environments; this market will exist for years.

4. **Multi-tenant deployment is something the built-in can't easily replicate.** A server-resident MCP necessarily speaks the host server's auth. teamcity-mcp can run anywhere, with per-request credentials and connection isolation (PR #491). For organizations running multiple TeamCity instances or mixing dev/staging/prod servers, this is decisive.

## Competitive landscape

TeamCity 2026.1 ships with a built-in MCP endpoint at `<server-url>/app/mcp`, exposing three tools:

- `teamcity_build_log` — paginated build log retrieval
- `teamcity_rest_get` — generic GET against the REST API
- `teamcity_rest_post` — restricted to triggering builds (`personal=true` forced)

This is a well-chosen minimum. It covers the most common AI ask ("what failed and rerun it") with zero install friction. It is not, and is not trying to be, a power tool.

teamcity-mcp's positioning is therefore:

- **Use the built-in** when the workflow is read-heavy ("what failed?") and trigger-only.
- **Use teamcity-mcp** when the workflow needs writes beyond trigger, types for reliability, or multi-server / older-server support.

See [README.md](../README.md) for the user-facing version of this decision.

## How to use this document

When considering adding a new tool, walk this flow:

1. **Posture check.** Does the operation close an AI workflow that's currently broken or requires REST passthrough? If no, stop.
2. **Non-goals check.** Is the operation on [`non-goals.md`](non-goals.md)? If yes, stop (or open a PR to amend the non-goals list with explicit justification).
3. **Quality check.** Can the tool ship with a typed schema, accurate annotations, idempotency hints, structured errors, and tests? If no, fix the gap before merging.
4. **Mode check.** Should this tool live in `dev` (read or low-risk write) or `full` (writes, admin-adjacent)? Default to `full` when unsure; promoting to `dev` later is cheaper than restricting after release.

If steps 1-4 all pass, the tool is in-scope. Build it.

## When this posture should be revisited

This posture is committed for the 2026 product cycle. Concrete triggers for revisiting:

- The JetBrains built-in MCP expands to substantial write coverage, eliminating teamcity-mcp's most defensible differentiator. (At that point we'd need to re-examine whether typing alone is enough.)
- Agent ergonomics undergo a paradigm shift — for instance, if frontier models become so good at generic REST navigation that typed tools no longer measurably outperform `rest_get`-style passthroughs.
- TeamCity's REST API surface itself materially changes, requiring a recalculation of what "AI workflow coverage" means.

Absent these triggers, this posture is the steady state. Major scope decisions reference this doc; they don't relitigate it.
