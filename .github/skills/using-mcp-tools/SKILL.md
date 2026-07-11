---
name: using-mcp-tools
description: 'Use when selecting or sequencing RisuToki MCP reads, searches, previews, edits, validation, assets, or file operations. Primary skill for MCP artifact operations; hand content semantics to the relevant authoring skill. Do not use when drafting content without reading or mutating an artifact.'
tags: ['workflow', 'mcp', 'editing']
related_tools:
  [
    'inspect_document',
    'read_content',
    'search_document',
    'analyze_content',
    'preview_edit',
    'apply_edit',
    'validate_content',
    'manage_items',
    'manage_assets',
    'manage_file',
    'read_skill',
  ]
---

# Using MCP Tools Safely

## Outcome

Use the narrowest facade-first route that can complete the artifact task, preserve stale guards and approval boundaries, and return focused validation evidence. This Skill selects tools; the relevant authoring Skill owns content quality and syntax.

## Minimal workflow

1. Discover only what is needed with `inspect_document` or the relevant list/search selector.
2. Read bounded content with `read_content`; narrow by family, field, item identity, range, or query before increasing the byte limit.
3. Use `analyze_content` for transformation, statistics, comparison, simulation, regex/CBS/Danbooru analysis, or import verification. Use `validate_content` for pass/fail diagnostics.
4. For changes, create a focused `preview_edit`, review target/digest/guard metadata, then call `apply_edit` once. A token is one-shot; after interruption, stale response, timeout, or partial failure, inspect current state and create a new preview.
5. Re-read or validate the changed surface and report the artifact evidence.

Use `manage_items` for supported structured item operations, `manage_assets` for asset workflows, and `manage_file` for guarded open/save/extract/reassemble operations. Batch sibling items instead of looping. Prefer stable `id` or `identity` selectors; when only indexes exist, carry the latest expected type/preview/hash from the list or read response.

## Boundaries and fallback

- Do not broad-read or generic-write Lua, CSS, greetings, triggers, lorebooks, regex, or `.risup` prompt structures. Use their facade family first and dedicated granular tools only when a facade cannot express the operation or an exact legacy payload is required.
- Prefer facade operations for unopened and reference files. Probe or external granular routes are fallbacks for unsupported shapes and diagnostics; do not switch the active document unnecessarily.
- Use surface patch/replace only after dedicated families fail. Preserve JSON Patch semantics: array `add` inserts at `0..length`, `-` appends, while `replace` and `remove` require an existing index.
- The protected/deprecated `.charx` compatibility fields, legacy `.risup` prompt fields, reserved `.risum` `cjs`, and unsafe virtual script content remain hidden and save-stripped. `hiddenFieldWarnings` proves existence only; never route around the policy. `.risum` `mcpUrl` is preserved but read-only through normal mutation routes.
- For `.charx` upload, run export-compatibility validation. For imported `.risup` prompt text, verify with `analyze_content` action `verify_risup_prompt_import` using the same source.
- If a needed operation is absent from the active profile, identify the smallest profile that covers it and state the fallback reason. Profile changes require an MCP restart.

## Context and safety

Honor response `next_actions`, byte sizes, truncation metadata, confirmation requirements, and dry-run support. For large fields, search then range-read; for large exact rewrites, use guarded export/import or project-folder workflows. Do not automatically retry a mutation whose outcome is unknown.

## References

Load only when needed:

- [`TOOL_REFERENCE.md`](TOOL_REFERENCE.md) for the complete legacy/granular catalog.
- [`FILE_STRUCTURES.md`](FILE_STRUCTURES.md) for exact artifact shapes.
- `docs/MCP_TOOL_SURFACE.md` and `docs/MCP_ERROR_CONTRACT.md` for profile and response contracts.
