---
name: writing-risup-presets
description: 'Guides composing RisuAI .risup presets — promptTemplate, formatingOrder, toggle syntax, module integration, structured output, sampling, and when to choose a preset over a bot, module, or plugin. Use when creating, editing, or reviewing preset-level prompt/system/model settings.'
tags: ['preset', 'risup', 'prompt', 'template']
related_tools:
  [
    'list_risup_prompt_items',
    'read_risup_prompt_item',
    'read_risup_prompt_item_batch',
    'search_in_risup_prompt_items',
    'write_risup_prompt_item',
    'write_risup_prompt_item_batch',
    'read_risup_formating_order',
    'write_risup_formating_order',
    'diff_risup_prompt',
    'export_risup_prompt_to_text',
    'list_risup_prompt_snippets',
    'read_risup_prompt_snippet',
  ]
artifact_types: ['risup']
canonical_sources:
  [
    'Risuai/src/ts/process/prompt.ts',
    'Risuai/src/ts/storage/database.svelte.ts',
    'src/lib/risup-prompt-model.ts',
    'src/lib/risup-toggle-model.ts',
    'src/charx-io.ts',
  ]
---

# Writing .risup Presets

A **preset** is a reusable request-assembly pack. It controls model selection, sampling, prompt formatting, structured output, and optional module pairing **without** editing the character itself.

## When to use a preset

| If you need…                                         | Use                | Why                                                                 |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| Reusable prompt/model behavior across many cards     | **Preset**         | Applies non-destructively to any compatible character/chat          |
| A reusable lorebook/regex/Lua/CSS behavior pack      | **Module**         | Modules add runtime content; presets change request assembly        |
| A standalone roleplay identity with greeting/persona | **Bot** (`.charx`) | A preset has no character identity of its own                       |
| External integrations or sandboxed custom UI         | **Plugin**         | Plugins run code; presets only configure prompting/request behavior |

**Rule of thumb:** if the main question is "how should this chat be formatted and requested?" the answer is usually a preset.

> For the full field inventory and file format, see `risu/prompts/docs/PRESET_FIELDS.md`.

## Preset-specific surfaces

### `promptTemplate`

`promptTemplate` is the structured prompt pipeline. It is a JSON array of prompt items such as free-text system blocks, dynamic description/persona inserts, chat slices, author notes, and cache blocks.

Preferred MCP workflow:

1. `list_risup_prompt_items`
2. `search_in_risup_prompt_items` or `read_risup_prompt_item_batch`
3. `write_risup_prompt_item` / `write_risup_prompt_item_batch`

Use raw `write_field("promptTemplate")` only when you need to preserve or edit unsupported/legacy JSON structures that the structured editor cannot model directly.

Supported item families in RisuToki:

| Type                                                             | Use                                          |
| ---------------------------------------------------------------- | -------------------------------------------- |
| `plain`, `jailbreak`, `cot`                                      | Fixed prompt blocks with `role` + `type2`    |
| `chatML`                                                         | Raw ChatML fragment                          |
| `persona`, `description`, `lorebook`, `postEverything`, `memory` | Dynamic channels with optional `innerFormat` |
| `authornote`                                                     | Author-note insertion with optional defaults |
| `chat`                                                           | Chat-history slice                           |
| `cache`                                                          | Cached context slot                          |

### `formatingOrder`

`formatingOrder` is a JSON array of high-level placement tokens:

`main`, `description`, `personaPrompt`, `chats`, `lastChat`, `jailbreak`, `lorebook`, `globalNote`, `authorNote`, `postEverything`

It does **not** replace `promptTemplate`. Instead:

- `promptTemplate` defines **what blocks exist**
- `formatingOrder` defines **where key runtime channels land**

Changing one without checking the other is a common way to misplace lorebook, author note, or post-history content.

### `customPromptTemplateToggle`

Preset toggles are line-based UI declarations. They support:

- checkboxes
- text inputs
- textareas
- selects
- groups/dividers/captions

Preset toggles are concatenated with active module toggles at runtime, so preset/module UX should be designed together instead of independently.

### `templateDefaultVariables`

Template default variables are newline `key=value` pairs used when a chat/script variable has no runtime value. In the current upstream lookup flow, character-level defaults are checked first, so duplicated keys on the character still win.

### `moduleIntergration`

This is a comma-separated list of module IDs. It lets a preset automatically activate specific modules so a prompt style can ship with the behavior packs it expects.

### Structured output / response shaping

These fields usually travel together:

| Field family                                                         | Use                                               |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `jsonSchemaEnabled`, `jsonSchema`, `strictJsonSchema`, `extractJson` | schema-constrained / JSON-extraction workflows    |
| `systemContentReplacement`, `systemRoleReplacement`                  | provider adaptation when `system` needs remapping |
| `localStopStrings`, `fallbackWhenBlankResponse`                      | response control / blank-output recovery          |
| `outputImageModal`, `verbosity`                                      | provider/UI-specific output behavior              |

### Model and sampling layer

Presets also carry the model and sampling contract:

- `apiType`, `aiModel`, `subModel`
- `promptPreprocess`
- `temperature`, `maxContext`, `maxResponse`
- `frequencyPenalty`, `presencePenalty`
- `top_p`, `top_k`, `repetition_penalty`, `min_p`, `top_a`
- `reasonEffort`, `thinkingTokens`, `thinkingType`, `adaptiveThinkingEffort`

Treat these as part of the preset's identity, not an afterthought. A prompt architecture written for one provider or reasoning mode can degrade badly if the preset's model layer is changed carelessly.

## Recommended MCP workflow

### Small edits

1. `list_risup_prompt_items`
2. `read_risup_prompt_item` / `read_risup_prompt_item_batch`
3. write back with `expected_type` and, when possible, `expected_preview`

### Large restructures

1. `export_risup_prompt_to_text`
2. edit the exported text while preserving its block headers/metadata
3. import or write back through the prompt-text workflow

### Comparing / reusing blocks

1. `diff_risup_prompt` to compare against a reference preset
2. `list_risup_prompt_snippets` / `read_risup_prompt_snippet` for reusable blocks

## Composition patterns

### Minimal general-purpose preset

```json
[
  { "type": "plain", "type2": "main", "role": "system", "text": "You are {{char}}." },
  { "type": "description" },
  { "type": "persona" },
  { "type": "chat", "rangeStart": 0, "rangeEnd": "end" },
  { "type": "jailbreak", "type2": "normal", "role": "system", "text": "Stay in character." }
]
```

Typical paired order:

```json
["main", "description", "personaPrompt", "chats", "lastChat", "jailbreak", "lorebook", "globalNote", "authorNote"]
```

### Provider-adaptation preset

Use this when the prompt architecture is stable but the provider needs:

- remapped `system` handling
- schema extraction
- special stop strings
- different reasoning controls

Do **not** hide those changes inside a module or bot. Keep them inside the preset so the request contract stays explicit.

## Shared/reference skills

Load these on demand instead of duplicating their syntax here:

| Topic                                   | Skill                      |
| --------------------------------------- | -------------------------- |
| CBS inside prompt text                  | `writing-cbs-syntax`       |
| File structures / JSON shapes           | `file-structure-reference` |
| Module pairing for `moduleIntergration` | `writing-risum-modules`    |
