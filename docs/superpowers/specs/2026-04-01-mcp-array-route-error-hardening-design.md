# MCP Array-Route Error Hardening Design

Date: 2026-04-01

Status: Draft for review

## Problem

RisuToki's MCP surface has grown into a large, capable route set, but its error contract is still inconsistent across clusters.

The current HTTP MCP API uses two different error shapes:

- legacy bare errors via `jsonRes(res, { error: '...' }, status)`
- structured contextual errors via `mcpError(...)` / `jsonMcpError(...)`

That inconsistency matters because the external MCP bridge in `toki-mcp-server.ts` treats all `>= 400` HTTP responses as tool failures but only forwards the parsed JSON body. When a route uses the bare shape, MCP clients lose context that already exists elsewhere in the codebase, such as:

- action
- target
- suggestion
- rejected
- status

The API server is also a large monolith, so a broad all-routes migration would create unnecessary release risk for the first pass.

The next slice should therefore ship a **bounded MCP error-contract hardening pass**: standardize error envelopes only for the simplest low-coupling array-CRUD route cluster, without changing status-code semantics or introducing SDK-level behavior changes.

## Goals

- Replace bare `{ error: ... }` validation/guard responses with structured `mcpError(...)` responses inside a bounded route cluster.
- Keep the top-level `error` field present so existing MCP clients continue to work.
- Preserve existing HTTP status codes in this first pass.
- Add focused regression tests that pin the standardized error envelope in the chosen cluster.
- Keep the release small enough that it does not require broad router refactors or cross-cluster migration.

## Non-Goals

- No all-routes MCP error migration in `v0.34.0`.
- No `toki-mcp-server.ts` behavior change to MCP SDK-level `isError: true`.
- No status-code reinterpretation for current HTTP 200 `{ success: false }` responses in this release.
- No monolithic router extraction or framework/router refactor.
- No lorebook/field-gateway hardening in the first pass.
- No response-shape changes for successful read/write payloads beyond the bounded cluster if not required.

## Chosen Direction

Use a **mechanical structured-error migration** in the low-coupling array-CRUD route cluster:

1. **Regex routes**
2. **Greetings routes**
3. **Lua section routes**
4. **CSS section routes**

Within only these clusters:

- migrate bare `jsonRes(..., { error }, status)` calls to `mcpError(...)`
- keep the existing status codes unchanged
- keep the existing success payloads unchanged
- add focused tests for representative error paths in each cluster

This gives the codebase a proven migration pattern without touching the more entangled lorebook/reference/field monolith first.

## Why this slice is first

This route family is the safest first MCP hardening pass because it combines:

- low coupling to other MCP clusters
- repeated structural patterns that make migration mechanical
- narrow user-visible behavior change
- low blast radius if a regression appears

It is safer than the alternatives:

- **safer than all-routes migration** because it avoids touching dozens of untested error paths at once
- **safer than lorebook/field hardening** because those surfaces are larger and much more entangled
- **safer than status-code hardening** because it does not change how `toki-mcp-server.ts` decides whether to reject a tool call

## Design

### 1. Scope only the array-CRUD cluster

File to modify: `src\lib\mcp-api-server.ts`

In-scope route families:

- regex routes
- greetings routes
- lua section routes
- css section routes

Out of scope for `v0.34.0`:

- generic field routes
- lorebook routes
- references routes
- assets routes
- CBS routes
- risup prompt routes
- skills routes
- MCP SDK wrapper behavior in `toki-mcp-server.ts`

This must remain a bounded cluster migration, not a sweeping consistency pass.

### 2. Standardize error envelopes by reusing `mcpError(...)`

File to modify: `src\lib\mcp-api-server.ts`

The server already has the right structured helper:

```ts
mcpError(res, status, {
  action,
  target,
  message,
  suggestion?,
  rejected?,
  details?,
});
```

Use that helper instead of introducing a new error abstraction.

Required behavior:

- all migrated error paths in the chosen cluster must continue returning an `error` field in the final JSON body
- migrated routes may now additionally include:
  - `action`
  - `target`
  - `status`
  - `suggestion`
  - `rejected`
  - `details`
- existing HTTP status codes must not change in this pass
- existing success payload shapes must not change in this pass

This is an additive contract change for error responses, not a semantic rewrite.

### 3. Preserve MCP bridge behavior in `toki-mcp-server.ts`

File reviewed: `toki-mcp-server.ts`

Current MCP bridge behavior:

- parses JSON from the internal HTTP API
- rejects when `statusCode >= 400`
- uses `parsed.error || \`HTTP ${statusCode}\`` for the thrown tool error

Decision for `v0.34.0`:

- do not change this bridge behavior yet
- do not introduce MCP SDK-level `isError: true`
- rely on the fact that `mcpError(...)` still yields an `error` field, so current MCP clients remain compatible

This keeps the first release slice additive and low-risk.

### 4. Recommended migration pattern by route family

#### Regex routes

Convert bare validation errors such as:

- invalid index
- missing/invalid required fields
- malformed batch payloads

from:

```ts
return jsonRes(res, { error: '...' }, 400);
```

to:

```ts
return mcpError(res, 400, {
  action: 'write regex',
  target: `regex:${idx}`,
  message: '...',
  suggestion: '...',
});
```

#### Greetings routes

Apply the same conversion pattern for:

- unknown greeting type
- invalid index
- invalid reorder payloads
- malformed batch delete payloads

#### Lua and CSS section routes

Apply the same conversion pattern for:

- invalid section index
- malformed batch payloads
- duplicate/add conflicts that currently use ad-hoc bare error payloads

When current responses expose additional data such as `existingIndex`, move that information into `details`.

### 5. Add targeted regression tests in the same cluster

File to modify: `src\lib\mcp-api-server.test.ts`

Current test gap:

- there is effectively no direct coverage for regex/greetings/lua/css route error payload shape

Required test coverage for `v0.34.0`:

- at least one representative structured 400 error assertion per migrated route family
- assert the body still contains `error`
- assert that the body now also contains stable contextual fields such as:
  - `action`
  - `target`
  - `status`
- add `suggestion` assertions where the route provides clear operator guidance

Recommended representative cases:

- regex: invalid index or malformed write payload
- greetings: invalid greeting type or invalid index
- lua: invalid section index
- css: duplicate add conflict or invalid section index

Do not try to exhaustively test every route in the first pass. Focus on pinning the new contract shape.

### 6. Documentation scope for the first pass

Files to update later during release:

- `AGENTS.md`
- `skills\using-mcp-tools\TOOL_REFERENCE.md`
- `CHANGELOG.md`
- `README.md` only if the MCP error-contract wording becomes user-relevant enough

Required doc behavior:

- describe that this release standardizes structured MCP error responses in a bounded route cluster
- explicitly note that the top-level `error` field remains present for compatibility
- avoid claiming that all MCP routes are standardized yet
- do not mention MCP SDK-level `isError: true`, because that is not part of this release

### 7. Explicit defer list for later MCP hardening phases

These items should remain out of scope for `v0.34.0`:

- converting all remaining bare error responses across the full API
- reworking HTTP 200 `{ success: false }` routes into 4xx responses
- changing `toki-mcp-server.ts` to emit MCP-native structured tool errors
- refactoring the giant `mcp-api-server.ts` handler into multiple files
- first-pass hardening of lorebook, references, assets, or field gateway routes

## File Map

### Production

- `src\lib\mcp-api-server.ts`

### Tests

- `src\lib\mcp-api-server.test.ts`

### Docs / release

- `AGENTS.md`
- `skills\using-mcp-tools\TOOL_REFERENCE.md`
- `CHANGELOG.md`
- `README.md` (only if needed)
- `package.json`

## Validation Checklist

- migrated regex/greetings/lua/css error paths return structured `mcpError(...)` envelopes
- the top-level `error` field is still present in those responses
- existing status codes for the migrated routes remain unchanged
- representative route-cluster tests assert the structured error envelope
- existing MCP bridge behavior still works without changes to `toki-mcp-server.ts`
- full verification still passes:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm run build`

## Risks and Mitigations

### Risk: additive error fields still surprise MCP clients

Mitigation:

- preserve the top-level `error` field
- avoid status-code changes in the first pass
- document the change as additive, not breaking

### Risk: the route cluster is larger than expected once tests are added

Mitigation:

- keep the slice bounded to representative array-CRUD routes only
- if implementation reveals one family is disproportionately messy, split it out and ship the remaining three families first

### Risk: temptation to expand into lorebook/field routes

Mitigation:

- treat lorebook, references, and field gateway routes as explicit defer items
- keep the release centered on proving the migration pattern, not finishing the whole MCP cleanup story

## Notes

- The best first release is not necessarily the cluster with the most tests; it is the cluster where a bounded additive migration can ship safely.
- This slice intentionally optimizes for a repeatable pattern that later MCP releases can reuse.
