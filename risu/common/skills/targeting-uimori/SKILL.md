---
name: targeting-uimori
description: 'Use when a .charx, .risum, or .risup will run in Uimori instead of RisuAI: lorebook selection without activation keys, unsupported RisuAI features, and Uimori-only card data such as translation guides and illustration profiles.'
tags: ['uimori', 'runtime', 'compatibility', 'translation', 'lorebook']
related_tools: ['inspect_document', 'read_content', 'preview_edit', 'apply_edit', 'read_surface', 'patch_surface']
artifact_types: ['charx', 'risum', 'risup']
---

# Targeting Uimori

Uimori is a single-user creative-writing app that imports `.charx`, `.risum`, and `.risup` files directly and runs their CBS, regex, Lua, triggers, and HTML/CSS from the original JSON. It also reads RisuToki module and preset project folders zipped together with their `.risutoki` folder; a card goes to Uimori as a saved `.charx`. The baseline here is Uimori v0.13.3 (November 2026); its `docs/RISU-IMPORT.md`, `docs/LORE-CONTEXT.md`, and `docs/TRANSLATION-GUIDES.md` are the sources. RisuToki's Uimori mode (Settings → 실행 대상) tells newly started assistants that this target applies.

Write artifacts that still work in RisuAI unless the user wants a Uimori-only artifact. The differences below change what is effective, not what is valid.

## Lorebooks

Uimori has no keyword activation engine. Keys, secondary keys, and regex keys are preserved for RisuAI but do not select entries.

- Always-active entries are sent every request as pinned context (default budget 64,000 tokens per chat).
- Other active entries are chosen by a judgment model (TypeSafe JEV by default) from the current request, recent scenes, and each entry's content, with a relevance threshold and a selected-content budget (defaults 0.65 and 8,000 tokens). Entries it does not choose stay available to the writing model, which sees a list of entry titles and short descriptions and can search, browse folders, and read entries.
- Therefore the `comment` must name what the entry is about, and the opening sentence of `content` should state its subject. Generic titles such as `Entry 12` or key lists in place of a title make the entry hard to select or find.
- CBS conditions in content are evaluated. Folders are kept and used for browsing.
- Supported placement decorators: `@@depth`, `@@end`, `@@reverse_depth`, `@@role`. Not supported: `@@position`, `@@inject_*`, negative or out-of-range depth. Unsupported directives are reported at import and not applied.
- Lua `getLoreBooks(id, search)` reads entries by exact `comment`. `loadLoreBooks` and runtime lore changes are not supported.

## Presets

- The prompt template, CBS, toggles, default variables, and preset regex run. Card `extensions.risuai.toggles` and module `customModuleToggle` are merged into the chat's options.
- The `memory` slot is not substituted; Uimori supplies its own summaries and notes. Host commands `@@inject`, `@@repeat_back`, and `@@emo` are not executed.
- Model, provider, API key, and sampling settings are not imported; Uimori owns them.
- Deprecated preset fields follow RisuToki's save policy, so `jailbreak`/`cot` blocks and legacy top-level prompts are dropped.

## Lua and triggers

Lua runs in an isolated worker per chat. Trigger permission follows `lowLevelAccess` on the card or standalone module. Not supported: character setters, image generation, external HTTP, embedding APIs, `loadLoreBooks`, `axLLM` `emotion`/`submodel` modes, and `LLM`/`axLLM` calls with `streaming=false`. Model calls are not allowed from display callbacks. State that must persist across worker restarts belongs in chat variables or `getState`, not Lua locals.

## Display and assets

Messages render in a per-message Shadow DOM. `risu-btn`, `risu-trigger`, and `<form risu-form>` work, as do `{{screenwidth}}` and `{{screenheight}}`. Arbitrary JavaScript, `<iframe>`, external CSS, and network requests do not run, and fixed-width layouts are not reflowed for mobile. Only stored image assets (PNG, JPEG, WebP, AVIF, GIF) are supported; audio and video assets stay in the file but do not play, and external image URLs are not downloaded. Asset names in `{{img::…}}` and similar tags resolve by exact name first, then by the nearest name within Levenshtein distance 4.

## Uimori-only card data

Uimori keeps two settings under `extensions.uimori`. RisuToki preserves them on save and validates them when an MCP surface write changes them; RisuAI ignores them. Keep other keys under `extensions.uimori` as they are.

| Artifact               | Surface path                            |
| ---------------------- | --------------------------------------- |
| `.charx`               | `/_card/data/extensions/uimori`         |
| `.risum` used as a bot | `/_moduleData/module/extensions/uimori` |

Read with `read_surface` (or the external variant for an unopened file) and write with a JSON Patch through `preview_edit`/`apply_edit` or `patch_surface`. Create `extensions` with an `add` operation when it is absent. Uimori reads the card's value whenever the card is not empty, so for a `.charx` the embedded module's value is not used.

**`translationGuide`** — bot-specific translation guidance used by Uimori's translation runs:

```json
{
  "instructions": "Free-form guidance: speech levels, address forms, voice, deliberate non-translations.",
  "terms": [{ "source": "Rose", "target": "로즈", "note": "Only as a name; the flower is 장미." }]
}
```

`instructions` is at most 20,000 characters; `terms` holds at most 500 entries with non-blank `source` and `target` of at most 300 characters and an optional `note` of at most 2,000. No other keys are allowed. Terms are guidance for the translation model, not string replacement. The content follows `writing-translation-guides`.

**`illustrationProfiles`** — default character appearance for Uimori's scene illustrations: an array of at most 32 `{ "id", "name", "appearance" }` objects with unique non-blank `id` (≤100), `name` (≤200), and `appearance` (≤2,000). Omit `referenceImageId`: it must match an image ID that Uimori assigns after import, so a value written in RisuToki is ignored.

Story UI themes (`.uimori-theme.json`) and illustration presets (`.uimori-illustration.json`) are separate Uimori files and are not part of cards.
