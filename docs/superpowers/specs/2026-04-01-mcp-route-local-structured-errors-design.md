# MCP Route-local Structured Error Envelope Completion Design

Date: 2026-04-01

Status: Draft for review

## Problem

`v0.34.0` and `v0.36.0` moved most MCP validation failures onto the structured `mcpError()` envelope. Those releases now cover regex, greetings, lua-section, css-section, field, and lorebook route families.

`src\lib\mcp-api-server.ts` still contains a final cluster of route-local handlers that return bare:

```ts
jsonRes(res, { error: '...' }, status)
```

instead of the structured MCP envelope.

As of `main` at `a771c39`, the remaining route-local bare error responses are:

- **23** call sites in the read-only **reference** route family
- **9** call sites across the remaining non-reference route-local families:
  - asset add and rename
  - risum-asset add
  - risup prompt reorder
  - risup formating-order
  - skills file read

That leaves MCP clients with two incompatible error shapes in the same route-local API surface:

- structured routes return additive `action`, `target`, `status`, and `suggestion`
- remaining route-local outliers return only `{ error }`

Two other inconsistent surfaces still exist, but they are materially different:

- the global `Unauthorized` / `No file open` guards
- HTTP-200 `success: false` no-op responses

This release should finish the route-local 4xx/409 cleanup without widening into those cross-cutting or semantic-response surfaces.

## Goals

- Convert every remaining **route-local** bare `jsonRes(res, { error: ... }, 4xx/409)` call in `src\lib\mcp-api-server.ts` to `mcpError()`.
- Keep the existing top-level `error` field for MCP bridge compatibility.
- Reuse the existing `jsonMcpError()` / `mcpError()` helper contract without changing helper signatures.
- Keep action and target naming aligned with nearby route handlers so the new envelopes read like the already-shipped MCP errors.
- Add focused regression coverage in `src\lib\mcp-api-server.test.ts` for each newly converted route family.
- Ship the change as a bounded `v0.37.0` slice that cleanly narrows the remaining MCP error inconsistency to global guards and HTTP-200 no-op responses.

## Non-Goals

- No changes to the global `Unauthorized` / `No file open` guards near the top of `mcp-api-server.ts`.
- No conversion of HTTP-200 `success: false` no-op responses such as anchor-not-found or no-matches-found.
- No helper-signature changes to `jsonRes()`, `jsonMcpError()`, `mcpError()`, or `readJsonBody()`.
- No redesign of MCP tool schemas or path formats.
- No risup prompt item ID-routing work in this release.

## Approaches Considered

### Option A: Small tail bundle only

Convert only the 9 non-reference route-local outliers:

- asset add and rename
- risum-asset add
- risup reorder
- risup formating-order
- skills file read

**Pros**

- Smallest diff
- Lowest regression risk
- Fastest release candidate

**Cons**

- Leaves the larger reference family on the old error shape
- Forces another release in the same mechanical cleanup line
- Does not fully close the route-local contract gap

### Option B: Reference routes only

Convert only the 23 remaining bare reference-route errors.

**Pros**

- Clears the largest named deferred family from `AGENTS.md`
- Keeps the release thematically simple

**Cons**

- Leaves smaller route-local bare errors behind in unrelated handlers
- Still stops short of a clean route-local completion point

### Option C: Full route-local completion

Convert all remaining **route-local** bare 4xx/409 responses in one release:

- 23 reference-route call sites
- 9 non-reference route-local call sites

Then explicitly defer only:

- global guards
- HTTP-200 `success: false` no-op responses

**Pros**

- Creates the cleanest remaining boundary
- Finishes the entire route-local bare-error cleanup in one release
- Leaves only two clearly different deferred categories
- Fits the mechanical, testable pattern already established by `v0.34.0` and `v0.36.0`

**Cons**

- Larger diff than the two narrower options
- Requires touching several unrelated route families in the same file

## Chosen Direction

Choose **Option C: full route-local completion** for `v0.37.0`.

This is the best balance of scope and payoff:

1. The work is still mechanical. Every in-scope site already expresses a route-local validation or conflict error and can move onto `mcpError()` without changing route semantics.
2. The scope remains bounded. It affects only route-local 4xx/409 call sites and leaves cross-cutting global guards and semantic HTTP-200 no-op responses untouched.
3. It creates a durable contract boundary. After `v0.37.0`, the remaining MCP inconsistency is no longer a scattered set of leftovers. It is reduced to two explicit deferred categories.

## In-Scope Route Inventory

### 1. Reference route family

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Routes with remaining bare errors:

- `GET /reference/:idx/lorebook`
- `POST /reference/:idx/lorebook/batch`
- `GET /reference/:idx/lorebook/:entryIdx`
- `GET /reference/:idx/regex`
- `GET /reference/:idx/regex/:entryIdx`
- `GET /reference/:idx/lua`
- `POST /reference/:idx/lua/batch`
- `GET /reference/:idx/lua/:sectionIdx`
- `GET /reference/:idx/css`
- `POST /reference/:idx/css/batch`
- `GET /reference/:idx/css/:sectionIdx`
- `GET /reference/:idx/:field`

Error classes to convert:

- reference index out of range
- batch `indices` shape invalid
- batch size over limit
- sub-entry or sub-section index out of range
- unknown field name

### 2. Asset route family

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Routes with remaining bare errors:

- `POST /asset/add`
- `POST /asset/:idx/rename`

Error classes to convert:

- missing `fileName` or `base64`
- invalid file name characters
- duplicate asset path conflict (`409`)
- invalid `newName`

### 3. Risum-asset route family

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Route with remaining bare errors:

- `POST /risum-asset/add`

Error class to convert:

- missing `name` or `base64`

### 4. Risup prompt and formating-order route family

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Routes with remaining bare errors:

- `POST /risup/prompt-item/reorder`
- `POST /risup/formating-order`

Error classes to convert:

- `order` length mismatch
- `order` is not a full permutation
- `items` is not an array

### 5. Skills route family

Files to modify:

- `src\lib\mcp-api-server.ts`
- `src\lib\mcp-api-server.test.ts`

Route with remaining bare errors:

- `GET /skills/:name/:file`

Error class to convert:

- invalid file name or traversal-shaped path segment

## Error Envelope Design

### Reference routes

Use route-specific action names and stable target formats:

- `read reference lorebook` → `reference:${idx}:lorebook`
- `batch read reference lorebook` → `reference:${idx}:lorebook:batch`
- `read reference regex` → `reference:${idx}:regex`
- `batch read reference lua` → `reference:${idx}:lua:batch`
- `read reference css` → `reference:${idx}:css`
- `read reference field` → `reference:${idx}:${fieldName}`

Each converted response must:

- preserve the original HTTP status
- preserve the top-level `error`
- add `action`, `target`, and `suggestion`

### Asset routes

Reuse the existing action naming already present in neighboring `mcpError()` calls:

- `add_asset`
- `rename_asset`

Target formats:

- `asset:add`
- `asset:${idx}`
- `asset:${assetPath}` for duplicate-path conflict if the concrete path is already known

The duplicate-path case must keep HTTP `409` and move onto `mcpError(res, 409, ...)`.

### Risum-asset routes

Action:

- `add_risum_asset`

Target:

- `risum-asset:add`

### Risup prompt and formating-order routes

Actions:

- `reorder risup prompt items`
- `write risup formating order`

Targets:

- `risup:promptTemplate`
- `risup:formatingOrder`

These routes already use `mcpError()` for neighboring validation and rejection paths. The new conversions should reuse the same action and target naming already present in those handlers.

### Skills routes

Action:

- `read_skill`

Target:

- `skills:${skillName}:${fileName}`

The traversal block should keep returning `400`, but it should now do so with the same structured envelope as the rest of the MCP surface.

## Testing Strategy

Add focused regression coverage in `src\lib\mcp-api-server.test.ts`.

### Reference routes

Add a dedicated structured-error block that covers at least:

- reference index out of range for lorebook, regex, lua, css, and field reads
- malformed `indices` payload for the batch routes
- oversized `indices` payload for the batch routes
- sub-entry out-of-range for lorebook/regex/lua/css single-entry reads
- unknown field in `GET /reference/:idx/:field`

### Asset and risum-asset routes

Add tests for:

- missing add payload fields
- invalid asset file name
- duplicate asset path returns structured `409`
- invalid rename `newName`
- missing risum-asset payload fields

### Risup and skills routes

Add tests for:

- reorder length mismatch
- reorder non-permutation payload
- formating-order non-array payload
- invalid skill file name

Each new regression should verify:

- the original HTTP status remains correct
- the payload still includes top-level `error`
- the structured additive fields exist and are route-appropriate

## Deferred Work After `v0.37.0`

After this release, the remaining MCP response-standardization work should be explicitly limited to:

1. **Global guards**
   - `Unauthorized`
   - `No file open`

2. **HTTP-200 `success: false` no-op responses**
   - anchor-not-found
   - no-matches-found
   - similar valid-but-no-op results

3. **Non-error MCP feature work**
   - risup prompt item ID-routing

That split matters. The first two are response-shape standardization decisions. The third is new MCP capability work.

## Documentation and Release Notes

Files to update when this release ships:

- `CHANGELOG.md`
- `README.md`
- `AGENTS.md`

`AGENTS.md` should update the MCP contract note so it no longer claims that route-local reference and tail handlers still use bare errors. It should instead say that global guards and HTTP-200 no-op responses remain deferred.

## Open Questions

None that block planning.

The route-local conversion pattern is already established. The only work left is to carry it across the remaining in-scope handlers and verify the exact action and target strings in tests.
