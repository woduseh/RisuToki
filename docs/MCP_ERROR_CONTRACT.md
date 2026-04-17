# MCP Error Contract

For tool-family boundaries and routing rules, pair this document with `docs/MCP_TOOL_SURFACE.md`.

RisuToki MCP routes use three additive response helpers:

| Helper                      | HTTP status           | Meaning                                                         | Required additive fields                                                                                             | Compatibility rule                                                                                      |
| --------------------------- | --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `mcpSuccess(payload, opts)` | `200`                 | The mutation or read succeeded.                                 | `status`, `summary`, `next_actions`, `artifacts`, `artifacts.byte_size`                                              | Never wrap or remove the existing payload.                                                              |
| `mcpError(status, info)`    | `4xx` / `409` / `5xx` | The request failed and the caller must recover before retrying. | `action`, `target`, `error`, `status`, `suggestion`, `retryable`, `next_actions`                                     | Keep the top-level `error` field for MCP bridge compatibility.                                          |
| `mcpNoOp(info, extra)`      | `200`                 | The request was valid, but nothing was applied.                 | `success: false`, `message`, `action`, `target`, `error`, `status`, `suggestion`, `retryable: false`, `next_actions` | Preserve legacy route-local fields such as `matchCount`, `results`, `errors`, and `startAnchorFoundAt`. |

## 1. `mcpError()` — hard failure

Use `mcpError()` when the caller must change input, state, or authorization before retrying.

Typical cases:

1. malformed JSON or invalid request shape
2. out-of-range indices or unknown fields
3. unauthorized access
4. no active document
5. renderer-side rejection or conflict (`rejected`, `409`)
6. stale-index guard conflicts on guarded indexed writes using `expected_comment`, `expected_preview`, or `expected_type`

Notes:

- `error` mirrors the human-readable message
- `suggestion` should tell the agent what to do next
- `details` should carry small machine-readable facts, not large payloads
- Stale-index conflicts return `409` with family-specific `details.expected_*` / `details.actual_*` fields (for example `expected_comment`, `expected_preview`, or `expected_type`), so the caller can refresh the relevant list route deterministically before retrying
- `mcpError()` broadcasts failure status to the renderer UI
- `No file open` applies only to routes that require the active main document; `session_status`, `probe_*`, `external_*`, and `reference*` routes remain available without one

### Recovery metadata (additive, v0.38.9+)

Both `mcpError()` and `mcpNoOp()` responses include machine-readable recovery hints:

- `retryable` (boolean) — `true` only for conflict (409) and server-error (5xx) statuses; `false` for validation errors (4xx) and no-op (200) responses.
- `next_actions` (string[]) — deterministic list of suggested follow-up MCP tool names. Success responses prefer explicit override → per-tool override → family default. Error/no-op responses derive from the `target` prefix using the MCP tool taxonomy family map. Special cases: `document:current` → `['open_file', 'list_references', 'session_status']`; unknown prefixes → `[]`.

These fields are additive and do not replace existing fields.

## 2. `mcpNoOp()` — recoverable HTTP-200 no-op

Use `mcpNoOp()` when the request is valid, but the target content does not permit a change.

Typical cases:

1. no replacement matches
2. anchor strings are missing
3. batch work contains only skipped items
4. batch inserts contain per-item anchor errors

Rules:

- keep HTTP status at `200`
- keep `success: false`
- add the same recovery metadata that `mcpError()` exposes
- preserve legacy route-local fields so older clients still work
- do **not** broadcast renderer failure status for no-op results

## 3. Current no-op catalog

`mcpNoOp()` currently covers 18 compatibility-preserving exits:

1. **Field**: replace no match, block-replace start-anchor miss, block-replace end-anchor miss, insert anchor miss, batch-replace zero matches
2. **Lorebook**: replace-all zero matches, batch-replace zero active items, batch-insert per-item errors, single replace no match, block-replace start-anchor miss, block-replace end-anchor miss, insert anchor miss
3. **Regex**: replace no match, insert anchor miss
4. **Lua**: replace no match, insert anchor miss
5. **CSS**: replace no match, insert anchor miss

## 4. `mcpSuccess()` — additive success envelope

Use `mcpSuccess()` for successful reads and mutations unless the existing payload shape would collide with the envelope.

Rules:

- keep the original payload at the top level
- add `status`, `summary`, `next_actions`, and `artifacts`
- `artifacts.byte_size` is added automatically as an approximate UTF-8 JSON size of the success response, excluding the `artifacts.byte_size` field itself
- derive `next_actions` from the MCP tool taxonomy

Intentional exception:

- `validate_cbs` keeps its existing `summary: { total, passed, failed }` object, so it stays outside `mcpSuccess()`

## 5. Agent recovery playbook

1. If `status >= 400`, treat the result as a hard failure. Check `retryable` to decide whether to retry after delay. Read `suggestion` first, then inspect `details` or `rejected`. Use `next_actions` to discover recovery tools. For indexed-write `409` stale-index conflicts, refresh the relevant family list route and carry the latest `comment`, `preview`, or `type` value forward as the matching `expected_*` guard.
2. If `status === 200` and `success === false`, treat the result as a no-op (`retryable` is always `false`). Use the preserved route-local fields to recover:
   - `matchCount: 0` means the search string or regex needs adjustment
   - `startAnchorFoundAt` means the start anchor matched, but the end anchor did not
   - `results[]` shows which batch replacements were skipped
   - `errors[]` shows which batch insert items need repair
3. If the result is a success envelope, prefer `next_actions` over free-form guessing. High-traffic tools may narrow the family defaults to a smaller per-tool set. Check `artifacts.byte_size` before asking for more data: if the response is already large, switch to narrower reads (`list_*`, `search_in_field`, `read_field_range`, per-item reads, or probes) instead of dumping adjacent surfaces. Successful lorebook, regex, greeting, and risup batch mutations may include `results[]` for per-entry verification without an immediate re-read.

## 6. Contributor rule

When adding or changing an MCP route:

1. use `mcpError()` for hard failures
2. use `mcpNoOp()` for valid-but-unapplied requests
3. use `mcpSuccess()` for successful results
4. keep every contract additive unless a breaking change is explicitly planned
