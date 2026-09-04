---
name: writing-risum-modules
description: 'Use for .risum module composition, activation, merge behavior, namespaces, trust, and toggles.'
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

## Runtime contracts

- Module IDs and namespaces identify reusable behavior; namespace alias activation is directional.
- `lowLevelAccess` grants restricted Lua network/LLM capabilities independently of character trust.
- Character and module `backgroundEmbedding` values concatenate before RisuAI prefixes CSS classes; unique source classes prevent collisions.
- `customModuleToggle` declares user controls. Assets use supported module/CBS references.
- Soft activation enables the module ID. Hard `applyModule` copies data into the character and loses reversible module ownership.
- Activation can come from global, chat, character, and preset `moduleIntergration` scope.

`cjs` is reserved and unused for new runtime logic. `mcp` declares external MCP integration and changes the management path. `hideIcon` combines across active modules. Runtime merge order places module lorebooks and triggers after their character/chat predecessors, while regex ordering also includes the active preset; design dependencies accordingly. Lua-created local lorebooks may affect the next turn rather than the current one.

Current character↔module conversion preserves the module icon, namespace, hide-icon setting, background embedding, assets, and custom toggles. Global-note replacement is carried through a constant lore entry marked `@@indicator replace_global_note`; accept legacy `@@indicator phi` only as an import compatibility marker.

Load `risu/modules/docs/MODULE_FIELDS.md` only for the full field inventory. Hand exact embedded syntax to the matching common Skill.
