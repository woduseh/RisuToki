---
name: writing-risum-modules
description: 'Use when creating, editing, or reviewing .risum module composition, enable scope, merge behavior, namespace, trust, toggles, or reusable runtime content. Primary skill for modules; hand embedded lorebook, regex, Lua, CBS, HTML/CSS, and trigger syntax to common skills. Do not use when the task is bot identity, request presets, or plugins.'
tags: ['module', 'risum', 'composition', 'architecture']
related_tools: ['inspect_document', 'read_content', 'search_document', 'preview_edit', 'apply_edit', 'manage_items']
artifact_types: ['risum']
canonical_sources:
  [
    'Risuai/src/ts/process/modules.ts',
    'Risuai/src/ts/process/processzip.ts',
    'Risuai/src/ts/interchangeability.ts',
    'Risuai/src/ts/characterCards.ts',
    'src/charx-io.ts',
  ]
---

# Writing .risum Modules

## Outcome and boundary

A module is a reusable behavior/content pack that can attach lorebooks, regex, triggers, CSS, assets, and optional Lua without owning a character identity. Use a preset for model/request formatting, a bot for persona/greeting identity, and a plugin for sandboxed executable integration.

## Minimal workflow

1. Define the reusable behavior and why it remains useful without a particular character.
2. Choose a unique module ID/namespace. Namespace alias activation is directional; verify intended companion-module behavior.
3. Keep `lowLevelAccess=false` unless restricted Lua network/LLM capabilities are essential. Enabling it widens trust for every consumer and must be explicit.
4. Put persistent scoped styling in `backgroundEmbedding` using unique source class names; character and module embeddings concatenate before RisuAI adds runtime prefixes.
5. Define `customModuleToggle` only for meaningful user controls. Keep assets named and referenced through supported module/CBS paths.
6. Prefer soft activation by module ID. Hard `applyModule` copies data into the character and is not reversibly module-owned.
7. Test merge and enable scope across global, chat, character, and preset `moduleIntergration` activation.

`cjs` is reserved and unused for new runtime logic. `mcp` declares external MCP integration and changes the management path. `hideIcon` combines across active modules. Module `lowLevelAccess` is independent from character trust. Runtime merge order places module lorebooks and triggers after their character/chat predecessors, while regex ordering also includes the active preset; design dependencies accordingly. Lua-created local lorebooks may affect the next turn rather than the current one.

Current character↔module conversion preserves the module icon, namespace, hide-icon setting, background embedding, assets, and custom toggles. Global-note replacement is carried through a constant lore entry marked `@@indicator replace_global_note`; accept legacy `@@indicator phi` only as an import compatibility marker.

Load `risu/modules/docs/MODULE_FIELDS.md` only for the full field inventory. Hand exact embedded syntax to the matching common Skill.

## Validation

Check namespace collisions, trust scope, unique CSS classes, toggle references, merge order, module dependencies, soft-apply behavior, assets, and absence of new `cjs` logic. Verify the module does not silently assume one character or preset unless that dependency is declared.
