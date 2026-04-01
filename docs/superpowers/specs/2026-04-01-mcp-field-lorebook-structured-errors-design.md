# MCP Field and Lorebook Structured Error Envelope Design

Date: 2026-04-01

Status: Draft for review

## Problem

`v0.34.0` standardized structured MCP validation errors for the regex, greeting, lua-section, and css-section route families.

`src\lib\mcp-api-server.ts` still has a large remaining cluster of field and lorebook validation guards that return bare:

```ts
jsonRes(res, { error: '...' }, 400)
```

instead of the existing structured `mcpError()` envelope.

That leaves MCP clients with two incompatible 400-shapes in the same API surface:

- structured routes return `action`, `error`, `status`, `target`, and optional `suggestion`
- field and lorebook validation guards often return only `{ error }`

The inconsistency is mechanical, but it is still user-visible in MCP tooling. `v0.36.0` should finish that next coherent slice without reopening the broader deferred surfaces.

## Goals

- Convert every remaining bare `jsonRes(res, { error: ... }, 400)` validation guard in the **field** route family to `mcpError()`.
- Convert every remaining bare `jsonRes(res, { error: ... }, 400)` validation guard in the **lorebook** route family to `mcpError()`.
- Reuse the existing `jsonMcpError()` / `mcpError()` helper stack without changing helper signatures.
- Keep `action`, `target`, and `suggestion` naming aligned with the verbs already used by nearby route handlers.
- Add focused regression tests in `src\lib\mcp-api-server.test.ts` that fail on the old bare-error payloads and pass only once the structured envelope is present.
- Ship the rollout as `v0.36.0` with docs that explicitly describe the bounded scope.

## Non-Goals

- No helper-signature changes to `jsonRes()`, `jsonMcpError()`, `mcpError()`, or `readJsonBody()`.
- No extraction of new broad helpers such as `mcpRejected()` in this release.
- No conversion of the **reference** route family.
- No conversion of the remaining **asset** or other miscellaneous MCP routes outside field+lorebook.
- No change to the global `Unauthorized` / `No file open` guards.
- No redesign of `success: false` HTTP-200 no-op responses such as:
  - anchor-not-found responses
  - no-matches-found responses

Those no-op payloads represent valid requests that found nothing to change, not malformed input, and need a separate design if they are ever standardized.

## Chosen Direction

Ship `v0.36.0` as a bounded MCP envelope-completion release for **field + lorebook validation guards only**.

Specifically:

1. Convert the remaining **9** field-family bare 400 responses to `mcpError()`.
2. Convert the remaining **26** lorebook-family bare 400 responses to `mcpError()`.
3. Add focused structured-error regression coverage for those route families in `src\lib\mcp-api-server.test.ts`.
4. Leave reference routes, miscellaneous routes, and `success: false` no-op responses unchanged for later slices.

## Why this direction

This is the largest coherent remaining MCP error family that can be finished without spreading the diff across unrelated subsystems.

- The shared helper contract already exists and works.
- The remaining field+lorebook sites are mostly mechanical conversions.
- The current test file already holds the MCP structured-error regression pattern from `v0.34.0`.
- Pulling reference routes into the same release would enlarge the diff without giving field/lorebook clients additional immediate value.

This makes `v0.36.0` a meaningful release without turning it into a giant “standardize everything” patch.

## Design

### 1. Keep the shared error helper contract unchanged

Files involved:

- `src\lib\mcp-api-server.ts`

Existing shared pieces already provide the correct envelope:

- `jsonRes(res, data, status?)`
- `jsonMcpError(res, status, info, broadcastStatus, error?)`
- `mcpError(res, status, info, error?)`
- `McpErrorInfo`

`v0.36.0` should **reuse** them exactly as-is.

Do not:

- add new required fields to `McpErrorInfo`
- change helper signatures
- refactor unrelated route families while touching these sites

The implementation work should stay local to converting call sites.

### 2. Convert the remaining field validation guards

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Remaining bare 400 responses in the field family currently cover:

- unknown field guard in `/field/:name`
- malformed or oversized `fields` input in `/field/batch`
- malformed or oversized `entries` input in `/field/batch-write`
- missing anchor for before/after insertion in `/field/:name/insert`
- malformed or oversized `replacements` input in `/field/:name/batch-replace`
- replacement items missing `find` in `/field/:name/batch-replace`

Required behavior:

- keep the HTTP status `400`
- replace bare `{ error }` with the structured MCP envelope
- use route-specific action names that match nearby handlers:
  - `read field`
  - `update field`
  - `read field batch`
  - `batch write field`
  - `insert in field`
  - `batch replace in field`
- keep `target` specific to the route:
  - `field:${fieldName}`
  - `field:batch`
  - `field:batch-write`
  - `field:${fieldName}` for `/field/:name/insert`
  - `field:${fieldName}` for `/field/:name/batch-replace`

The unsupported-field guard should use **method-aware action naming**:

- `GET /field/:name` → `read field`
- `POST /field/:name` → `update field`

### 3. Convert the remaining lorebook validation guards

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Remaining bare 400 responses in the lorebook family currently cover:

- invalid single-entry reads in `GET /lorebook/:idx`
- malformed or oversized batch reads in `POST /lorebook/batch`
- malformed, oversized, or invalid-index batch writes in `POST /lorebook/batch-write`
- missing or out-of-range diff inputs in `POST /lorebook/diff`
- invalid source index in `POST /lorebook/clone`
- malformed or oversized batch adds in `POST /lorebook/batch-add`
- malformed, oversized, or invalid-index batch deletes in `POST /lorebook/batch-delete`
- malformed, oversized, invalid-index, or missing-find batch replaces in `POST /lorebook/batch-replace`
- malformed, oversized, invalid-index, or missing-content batch inserts in `POST /lorebook/batch-insert`
- missing anchor for before/after insertion in `POST /lorebook/:idx/insert`

Required behavior:

- keep the HTTP status `400`
- replace bare `{ error }` with the structured MCP envelope
- use route-specific action names that match nearby handlers:
  - `read lorebook entry`
  - `batch read lorebook`
  - `batch write lorebook`
  - `diff lorebook entry`
  - `clone lorebook entry`
  - `batch add lorebook entries`
  - `batch delete lorebook entries`
  - `batch replace lorebook`
  - `batch insert lorebook`
  - `insert lorebook content`
- keep `target` aligned with the route family:
  - `lorebook:${idx}`
  - `lorebook:batch`
  - `lorebook:batch-write`
  - `lorebook:diff`
  - `lorebook:clone:${sourceIdx}`
  - `lorebook:batch-add`
  - `lorebook:batch-delete`
  - `lorebook:batch-replace`
  - `lorebook:batch-insert`
  - `lorebook:${idx}` for `/lorebook/:idx/insert`

### 4. Keep success-shaped no-op responses unchanged

Files to leave behaviorally unchanged:

- `src\lib\mcp-api-server.ts`

Several field and lorebook routes already return HTTP 200 with `success: false` when the request is valid but does not produce a mutation, for example:

- anchor not found
- no matches found
- all batch operations skipped

`v0.36.0` should **not** convert those payloads to `mcpError()`.

Reason:

- these are not malformed requests
- the existing route semantics treat them as non-mutating results rather than input errors
- changing them would require a broader product decision about how MCP should distinguish “valid but no-op” from “invalid”

### 5. Extend the existing MCP structured-error regression pattern

Files to modify:

- `src\lib\mcp-api-server.test.ts`

The current test file already contains structured-error regression sections for:

- regex routes
- greeting routes
- lua-section routes
- css-section routes

`v0.36.0` should add sibling sections for:

- field routes
- lorebook read/diff routes
- lorebook batch/mutation routes

Each new regression should verify:

- response status is `400`
- response payload includes `action`
- response payload includes `status: 400`
- response payload includes `target`
- `error` contains the expected route-specific message fragment

The test focus should stay on the converted validation guards only. Do not add tests for deferred reference routes in this release.

### 6. Release framing

Files to modify:

- `CHANGELOG.md`
- `README.md`
- `AGENTS.md`
- `package.json`
- `package-lock.json`

Release framing for `v0.36.0`:

- version bump: `0.35.1` → `0.36.0`
- changelog note: field + lorebook validation routes now emit structured MCP error envelopes
- README / AGENTS note: this release expands the structured MCP error contract, but reference and other smaller tails remain deferred

The docs must be careful not to imply that **all** MCP routes are standardized yet.

## Verification

Fresh-worktree prerequisite:

```powershell
npm run build:node-libs
```

This repository still has lorebook test paths that depend on generated node-lib artifacts because `mcp-api-server.ts` dynamically requires `lorebook-io`.

Focused TDD loop:

```powershell
npm run test:unit -- src\lib\mcp-api-server.test.ts
```

Repository verification before release:

```powershell
npm run lint
npm run typecheck
npm run build
```

Expected result:

- new field and lorebook regression tests fail before production changes
- the same tests pass after the envelope conversions
- existing MCP regression sections stay green
- the repository remains lint-clean, type-safe, and buildable
