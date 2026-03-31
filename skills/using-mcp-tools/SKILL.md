---
name: using-mcp-tools
description: 'Workflow guide for choosing RisuToki MCP tools safely. Use when deciding which read or write surface fits a task, especially for large fields, lorebooks, regex, references, or batch edits.'
tags: ['workflow', 'mcp', 'editing']
related_tools: ['search_all_fields', 'write_field_batch', 'read_lorebook_batch', 'read_skill']
---

# Using MCP Tools Safely

This skill is about **tool choice**, not syntax. Read it before making broad edits.

## Quick Read Rules

- Do **not** use `read_field("lua")`; use `list_lua` → `read_lua(index)`.
- Do **not** use `read_field("css")`; use `list_css` → `read_css(index)`.
- Do **not** dump `alternateGreetings`; use `list_greetings("alternate")`.
- Do **not** dump `triggerScripts`; use `list_triggers` → `read_trigger(index)`.
- For risup prompt editing, prefer `list_risup_prompt_items` and `read_risup_formating_order`.

## Large-Field Workflow

1. Use `search_in_field` to locate the exact area first.
2. Use `read_field_range` only for the span you need.
3. Use `replace_in_field`, `replace_in_field_batch`, or `replace_block_in_field` for targeted edits.
4. Use `snapshot_field` before risky edits.

## Lorebook Workflow

1. Start with `list_lorebook(folder?)`.
2. Use `read_lorebook(index)` or `read_lorebook_batch(indices)`.
3. Prefer batch tools for multi-entry updates:
   - `write_lorebook_batch`
   - `replace_in_lorebook_batch`
   - `insert_in_lorebook_batch`
   - `batch_delete_lorebook`

## Regex / Reference Workflow

- Regex: `list_regex` → `read_regex(index)` → targeted writes.
- Reference lorebooks/Lua/CSS/regex: use the dedicated `list_reference_*` and `read_reference_*` routes instead of `read_reference_field`.

## Batch-First Rule

If the task touches multiple sibling items, prefer:

- `write_field_batch`
- `replace_in_field_batch`
- `write_lorebook_batch`
- `batch_write_greeting`

This reduces repeated confirmation prompts and keeps edits coherent.

## Full Reference Files

- `read_skill("using-mcp-tools", "TOOL_REFERENCE.md")` — complete MCP tool catalog
- `read_skill("using-mcp-tools", "FILE_STRUCTURES.md")` — exact schemas and shapes
