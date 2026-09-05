# MCP Error Contract

For tool-family boundaries and routing rules, pair this document with `docs/MCP_TOOL_SURFACE.md`.

RisuToki MCP routes use three additive response helpers:

| Helper                      | HTTP status           | Meaning                                                         | Required additive fields                                                                                                                                  | Compatibility rule                                                                                      |
| --------------------------- | --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `mcpSuccess(payload, opts)` | `200`                 | The mutation or read succeeded.                                 | `status`, `summary`, `next_actions`, `artifacts`, `artifacts.byte_size`                                                                                   | Never wrap or remove the existing payload.                                                              |
| `mcpError(status, info)`    | `4xx` / `409` / `5xx` | The request failed and the caller must recover before retrying. | `action`, `target`, `error`, `status`, `code`, `suggestion`, `retryable`, `retry_mode`, `outcome`, `next_actions`                                         | Keep the top-level `error` field for MCP bridge compatibility.                                          |
| `mcpNoOp(info, extra)`      | `200`                 | The request was valid, but nothing was applied.                 | `success: false`, `message`, `action`, `target`, `error`, `status`, `code`, `retryable: false`, `retry_mode: never`, `outcome: unchanged`, `next_actions` | Preserve legacy route-local fields such as `matchCount`, `results`, `errors`, and `startAnchorFoundAt`. |

## 1. `mcpError()` — hard failure

Use `mcpError()` when the caller must change input, state, or authorization before retrying.

Typical cases:

1. malformed JSON or invalid request shape
2. out-of-range indices or unknown fields
3. unauthorized access
4. no active document
5. renderer-side rejection or conflict (`rejected`, `409`)
6. stale-index guard conflicts on guarded indexed writes using `expected_comment`, `expected_preview`, or `expected_type`
7. stale document hash conflicts on surface patch writes using `expected_hash`
8. malformed JSON-backed `.risup` fields submitted through field or surface mutations

Notes:

- `error` mirrors the human-readable message
- `suggestion` should tell the agent what to do next
- `details` should carry small machine-readable facts, not large payloads
- Stale-index conflicts return `409` with family-specific `details.expected_*` / `details.actual_*` fields (for example `expected_comment`, `expected_preview`, or `expected_type`), so the caller can refresh the relevant list route deterministically before retrying
- Surface patch hash conflicts return `409` with `details.expected_hash` / `details.actual_hash`; refresh with `list_surfaces`, `read_surface`, or `external_read_surface` before retrying
- Invalid JSON-backed `.risup` fields use the field-specific message format `Invalid <field>: <reason>` and reject the whole submitted mutation before data is changed
- Surface patch arrays follow RFC 6902 for supported operations: `add` inserts at an existing boundary or appends with `-`, while `replace` and `remove` require an existing index
- `mcpError()` broadcasts failure status to the renderer UI
- `No file open` applies only to routes that require the active main document; `session_status`, `probe_*`, `external_*`, and `reference*` routes remain available without one

### Recovery metadata

Both `mcpError()` and `mcpNoOp()` responses include machine-readable recovery hints:

- `code` — stable category such as `invalid_request`, `conflict`, `timeout`, or `partial_apply`.
- `retryable` — whether a retry is permitted after following `retry_mode`; an unknown mutation outcome is never automatically retryable.
- `retry_mode` — `never`, `backoff`, `refresh_then_retry`, or `inspect_outcome`.
- `outcome` — `complete`, `not_started`, `unchanged`, `partial`, or `unknown`.
- `next_actions` (string[]) — suggested follow-up MCP tool names. Success responses prefer explicit override → per-tool override → family default. HTTP error/no-op responses derive from the `target` prefix using the MCP tool taxonomy family map. At the MCP response boundary, hidden tools map to supported facades and unavailable alternatives are omitted; registered granular names stay intact. For example, HTTP `document:current` hints `open_file`, `list_references`, and `session_status` become `manage_file` and `inspect_document` in the default profile. Unknown prefixes return `[]`.

Stale/conflict `409` uses `refresh_then_retry/not_started`; transient read-only infrastructure failures use `backoff/not_started`; a mutation timeout, network interruption, cancellation after dispatch, or partial apply uses `inspect_outcome` with `unknown` or `partial`. Inspect the target and create a fresh preview instead of replaying the mutation.

`apply_edit` preserves the original error and recovery fields in `details.cause` and retains recovery metadata at the top level. Earlier applied operations or partial effects inside the failed operation produce `partial/inspect_outcome`; a first operation with an unknown result remains `unknown/inspect_outcome`. `details.applied_count` excludes no-ops. A missing preview token may have expired, been consumed, or belonged to another server process; check prior results and current state, then preview only remaining changes.

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

Facade edit responses preserve the original per-operation payloads. `preview_edit` adds `result.applicable_count` and `result.noop_count`; previews containing no-ops return `success: false` and recommend correcting selectors or text instead of applying unchanged work. `apply_edit` adds `result.applied_count` and `result.noop_count`, with `artifacts.count` counting applied operations only. All-no-op results use `unchanged/never`; a mix of applied edits and no-ops uses `partial/inspect_outcome` with `success: false`. These HTTP-200 responses remain readable through `result.previews[]` and `result.applied[]` for compatibility.

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

1. If `status >= 400`, treat the result as a hard failure. The MCP protocol-level `isError` flag and full structured envelope are preserved end-to-end. Follow `retry_mode`, not status alone. For indexed-write `409` conflicts, refresh the family list/read and carry the latest guard into a new preview.
2. Infrastructure errors use HTTP-style `502`, `503`, or `504`. Read-only requests may use bounded backoff. A mutation failure after dispatch uses `inspect_outcome/unknown`; inspect current state and never replay it automatically.
3. If `status === 200` and `success === false`, inspect `outcome`: `unchanged` is a no-op, while `partial` requires inspecting applied results before planning remaining edits. Neither is automatically retryable. Use the preserved route-local fields to recover:
   - `matchCount: 0` means the search string or regex needs adjustment
   - `startAnchorFoundAt` means the start anchor matched, but the end anchor did not
   - `results[]` shows which batch replacements were skipped
   - `errors[]` shows which batch insert items need repair
4. Treat `next_actions` as available options, not a required checklist or authorization for further changes. Select only follow-up work needed for the current request and remaining verification gaps. Check `artifacts.byte_size` before asking for more data: if the response is already large, switch to narrower reads (`list_*`, `search_in_field`, `read_field_range`, per-item reads, or probes) instead of dumping adjacent surfaces. Successful lorebook, regex, greeting, and risup batch mutations may include `results[]` for per-entry verification without an immediate re-read; sufficient existing evidence does not require another check.

## 6. MCP stdio structured compatibility

The 14 default `facade-first` tools are registered with a compact common `outputSchema`. Each call returns the existing JSON string in `content` and the semantically identical parsed object in `structuredContent`; text-only clients remain compatible. Legacy-profile tools retain their existing `server.tool` registration and text response.

This contract does not enable Programmatic Tool Calling or add an OpenAI-specific caller. Caller runtimes may opt into bounded read-only orchestration using the documented fields, while approval, preview/apply, and final validation remain direct.

## 7. Contributor rule

When adding or changing an MCP route:

1. use `mcpError()` for hard failures
2. use `mcpNoOp()` for valid-but-unapplied requests
3. use `mcpSuccess()` for successful results
4. keep every contract additive unless a breaking change is explicitly planned
