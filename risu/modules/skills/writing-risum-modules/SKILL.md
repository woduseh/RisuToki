---
name: writing-risum-modules
description: 'Use when creating, editing, or reviewing RisuAI .risum module design decisions — namespace, lowLevelAccess, backgroundEmbedding, customModuleToggle, and when to choose a module over a bot, preset, or plugin.'
tags: ['module', 'risum', 'composition', 'architecture']
related_tools:
  [
    'list_fields',
    'read_field',
    'write_field',
    'list_lorebook',
    'read_lorebook',
    'list_regex',
    'read_regex',
    'list_triggers',
    'read_trigger',
    'list_lua',
    'read_lua',
  ]
artifact_types: ['risum']
canonical_sources: ['Risuai/src/ts/process/modules.ts', 'Risuai/src/ts/process/processzip.ts', 'src/charx-io.ts']
---

# Writing .risum Modules

A **module** is a reusable behavior pack that attaches lorebooks, regex scripts, trigger scripts, CSS, and optional Lua to any character or chat without modifying the character itself.

This skill covers **module-specific composition**. For shared syntax (lorebooks, regex, Lua, CBS, HTML/CSS), load the common skills listed at the end instead of duplicating their rules here.

## When to use a module

| If you need…                                      | Use                   | Why                                                          |
| ------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| Reusable world rules across many characters       | **Module**            | Attaches non-destructively; one update propagates everywhere |
| Chat-scoped UI styling or overlays                | **Module**            | `backgroundEmbedding` injects HTML/CSS into any active chat  |
| A standalone conversational identity              | **Bot** (`.charx`)    | Modules have no greeting/persona/icon identity of their own  |
| Model/sampling/prompt-template settings           | **Preset** (`.risup`) | Modules do not own the request-format/model layer            |
| External integration or sandboxed executable code | **Plugin**            | Plugins are code surfaces outside the prompt pipeline        |

**Rule of thumb:** if the content still makes sense with no character identity attached, it probably belongs in a module.

> For the exact field inventory and binary format, see `risu/modules/docs/MODULE_FIELDS.md`.

## Module-specific fields

### `namespace`

`namespace` is an alias ID. If a module is enabled whose real `id` matches another module's `namespace`, both activate together.

Use this to ship optional satellite modules such as:

- translation layer + base module
- UI skin + mechanics pack
- lore pack + separate CSS pack

### `lowLevelAccess`

When `true`, module triggers inherit access to restricted Lua capabilities such as network or LLM-calling helpers.

Only enable this when the module genuinely needs it:

- it triggers an import warning
- it widens the trust boundary
- it makes the module feel more like executable automation than pure content

### `cjs`

Reserved CommonJS slot. Upstream keeps it on the interface, but the active module pipeline no longer uses it for runtime behavior. Do not design new module logic around it.

### `backgroundEmbedding`

HTML/CSS injected into `.chattext` whenever the module is active.

Key constraints:

- selectors are scoped to the chat container
- CBS is evaluated inside the embedding
- multiple modules concatenate their embeddings
- collisions are easy, so use `x-risu-` prefixes consistently

### `customModuleToggle`

Line-based UI declarations that render settings for the module.

Common use cases:

- gameplay toggles
- mode switches
- user-supplied names or labels
- select menus for scenario variants

### `hideIcon`

OR-style behavior across active modules: if any active module sets it, the character icon hides.

### `assets`

Named module-local assets referenced in CBS (for example through `{{asseturl::name}}`). The exported `.risum` format strips data URLs from JSON and packs binary data separately.

### `mcp`

Optional `{ url }` object for external MCP integration. Modules that declare `mcp` are managed through the MCP subsystem rather than the normal module-list workflow.

## Merge order

### Lorebooks

```text
Character globalLore → Chat localLore → Module lorebooks
```

Modules are a good fit for reusable lore layers because they append cleanly after character/chat lore sources.

### Regex

```text
Preset regex → Character customscript → Module regex
```

This makes modules especially good for display/output transforms, language post-processing, or reusable chat cleanup.

### Triggers

```text
Character triggerscript → Module triggers
```

Keep that order in mind when a module depends on variables or state created by the character's trigger layer.

## Enable scopes

Modules can become active from four places:

1. globally enabled module IDs
2. chat-scoped module IDs
3. character-scoped module IDs
4. preset/global `moduleIntergration`

That makes presets and modules complementary: a preset can turn on the modules it expects.

## Hard-apply vs soft-apply

| Mode                        | What happens                              | Reversible?                         |
| --------------------------- | ----------------------------------------- | ----------------------------------- |
| **Soft** (enable module ID) | Lorebooks/regex/triggers merge at runtime | Yes                                 |
| **Hard** (`applyModule`)    | Content is copied into the character      | No, it becomes character-owned data |

Prefer soft-apply for distribution and reusable authoring.

## Critical Gotchas

| Issue                                               | Detail                                                                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`lowLevelAccess` widens trust for ALL consumers** | Setting `lowLevelAccess: true` grants Lua network/LLM capabilities to every character that enables the module, not just the author's own bots. This triggers an import warning for users.                  |
| **CSS class collisions with bot styles**            | Multiple modules and the character's own `backgroundEmbedding` all concatenate into one CSS scope. Use unique `x-risu-` prefixed class names (e.g., `x-risu-mymod-panel`) to avoid silent style overrides. |
| **`cjs` field is effectively deprecated**           | The `cjs` slot exists on the interface but the module pipeline no longer uses it. Do not build new logic around it — use Lua triggers instead.                                                             |
| **Merge order means modules run last**              | Module lorebooks, regex, and triggers are appended after character-level content. A module regex cannot intercept text before the character's own scripts process it.                                      |
| **`upsertLocalLoreBook` delay**                     | Lorebook entries created in module Lua via `upsertLocalLoreBook` only appear in the prompt on the next turn, not the current one.                                                                          |
| **`namespace` aliasing is one-way**                 | If module A's `id` matches module B's `namespace`, both activate when B is enabled. But enabling A directly does not activate B.                                                                           |

## Shared syntax — common skills

| Topic            | Skill                      |
| ---------------- | -------------------------- |
| Lorebook entries | `writing-lorebooks`        |
| Regex scripts    | `writing-regex-scripts`    |
| Lua scripting    | `writing-lua-scripts`      |
| CBS templates    | `writing-cbs-syntax`       |
| HTML/CSS styling | `writing-html-css`         |
| Trigger scripts  | `writing-trigger-scripts`  |
| File structures  | `file-structure-reference` |

## Module Authoring Checklist

- [ ] `namespace` is unique — collisions silently merge unrelated modules
- [ ] `lowLevelAccess` decision is intentional — grants Lua network/LLM to ALL consumers
- [ ] CSS classes use unique `x-risu-` prefixed names (e.g., `x-risu-mymod-panel`) to avoid collisions
- [ ] `customModuleToggle` lines are registered for any user-facing settings
- [ ] Lorebook entries use high `insertorder` values since modules merge last
- [ ] `cjs` field is not used (deprecated — use Lua triggers instead)
- [ ] Tested with soft-apply (enable module ID), not hard-apply

## Smoke Tests

Prompts targeting RisuAI-specific gotchas:

1. "Design a module with CSS styling for a character status panel — make sure it won't collide with other modules."
