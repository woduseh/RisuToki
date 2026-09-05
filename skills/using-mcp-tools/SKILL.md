---
name: using-mcp-tools
description: 'RisuToki MCP artifact operations: facade selection, guarded previews and writes, bounded reads, file and asset handling, and recovery. Content composition and syntax use the relevant risu/ skills.'
tags: ['workflow', 'mcp', 'editing']
related_tools:
  [
    'inspect_document',
    'read_content',
    'search_document',
    'analyze_content',
    'evaluate_bot',
    'preview_edit',
    'apply_edit',
    'validate_content',
    'manage_items',
    'manage_assets',
    'manage_file',
    'read_skill',
  ]
---

# RisuToki MCP Contracts

## Tools and targets

Use the current `tools/list` metadata and response `next_actions`. Prefer the facade family for the target surface; granular tools are fallbacks when the facade cannot express the operation. A known unsupported operation does not need a deliberately failing facade call.

- `inspect_document`, `read_content`, and `search_document` provide structure and bounded content. Select by family, field, identity, or range; use truncation metadata and `artifacts.byte_size` to size follow-ups.
- `analyze_content` handles transformations, statistics, comparisons, simulations, and import verification. `validate_content` returns pass/fail diagnostics.
- `evaluate_bot` runs explicit field, regex, and lorebook regression cases on active or external documents. Use the same cases before and after a change; inspect per-case failures and simulation limits. It does not call an LLM or judge roleplay quality.
- Start a new artifact with `manage_file` preview action `create_document`, an absolute destination ending in `.charx`, `.risum`, or `.risup`, and `name`; apply the returned token, digest, and guards. The parent directory must exist. Creation does not overwrite or switch the active document; inspect/edit the external target or explicitly open it afterwards.
- To read a long field, use one `read_content` selector with `field`, `offset`, and `length`; continue with the same target/field plus the returned `cursor` instead of offset/length. Offsets count UTF-16 units after LF normalization, matching search results. Cursor expiry, a changed source, or a changed field requires a fresh read.
- `manage_assets` add action accepts exactly one of `source_path` (absolute local file, at most 8 MiB) or `base64`. Prefer the path for generated/local assets and carry every preview guard; changed source bytes invalidate apply.
- `manage_items` handles structured item operations; `manage_assets` handles assets; `manage_file` handles guarded open/save/extract/reassemble operations.
- Prefer stable `id` or `identity`; index-based edits need the current type/preview/hash guards. Batch sibling operations where supported.
- Unopened and reference targets have facade routes; opening another active document is not a prerequisite to inspect them. References are read-only.

## Mutation contract

Create and inspect a matching preview, then apply it. The editor confirmation dialog or standalone write gate is the approval boundary; a requested mutation does not need another chat approval. `preview_token`, `operation_digest`, and stale guards bind the preview to its target. Tokens are consumed once, before the first mutation; after a stale response, timeout, interruption, or partial failure, inspect current state and generate a fresh preview. Never blindly retry a mutation with an unknown outcome.

Prefer focused replace/insert/range operations when they describe the change well. For large exact rewrites, guarded export/import or project-folder workflows avoid oversized responses. Verify the changed artifact with the relevant read, diff, or validator.

Active previews bind the current document path and content hash. Confirmation also rejects document changes and renderer drafts not yet reflected in main state; already-synchronized dirty state is allowed. File and project saves reject externally changed baselines. Preserve unsaved drafts while resolving or merging state before creating a fresh preview; do not discard user changes through reload without authorization.

An unresolved save checkpoint blocks writes to the affected project. Inspect its current state and the separate backup path reported in the error instead of retrying writes to the partial project. Continue independent reads, analysis, and preparation of a reviewable recovery proposal. Do not overwrite uncertain state without authorization. After recovery, create a fresh preview, apply through the existing approval boundary, and verify the result. If recovery requires a user decision, identify the exact decision and remaining work; backup inspection alone does not complete the requested edit.

Protected/deprecated `.charx` compatibility fields, legacy `.risup` prompt fields, reserved `.risum` `cjs`, and unsafe virtual script content are hidden and save-stripped. `hiddenFieldWarnings` reports existence only; it is not an alternate read route. `.risum` `mcpUrl` is preserved but read-only through normal mutation routes.

JSON Patch array `add` inserts at `0..length` and `-` appends; `replace` and `remove` require an existing index. For imported `.risup` prompt text, use `analyze_content` action `verify_risup_prompt_import` with the same source. For `.charx` upload, run export-compatibility validation.

## Runtime and references

Profiles are registered at startup; changing profiles requires an MCP restart. `manage_assets` `read_asset` returns base64 into context; use metadata for identity and size unless the bytes themselves are needed.

If MCP is unavailable, read guidance from the filesystem and prepare the requested content or proposed changes. Direct editing of binary/container internals remains disallowed. Use a supported project-folder workflow only within its authorization and validation requirements; filesystem access must not bypass a readonly profile, write gate, or denied confirmation. If no authorized apply route is available, deliver the prepared changes and identify application and verification as pending.

- [TOOL_REFERENCE.md](TOOL_REFERENCE.md): legacy/granular catalog.
- [FILE_STRUCTURES.md](FILE_STRUCTURES.md): exact artifact shapes.
- `docs/MCP_WORKFLOW.md`: runtime modes and startup.
- `docs/MCP_TOOL_SURFACE.md` and `docs/MCP_ERROR_CONTRACT.md`: profile and response contracts.

MCP reads of a guide outside its skill directory use `inspect_document` with `{ kind: "guidance", guide: "prompts/families/PHEME.md" }`. Guide ids, repository paths, and unique filenames are accepted; `{ kind: "guidance" }` lists available guide names.
