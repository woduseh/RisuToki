---
name: writing-risup-presets
description: 'Use when creating, editing, or reviewing RisuAI .risup preset prompt/system/model settings — promptTemplate, formatingOrder, toggle syntax, module integration, structured output, and sampling.'
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
    'validate_risup_prompt_import',
    'batch_delete_risup_prompt_items',
    'import_risup_prompt_from_text',
    'copy_risup_prompt_items_as_text',
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

## MD-to-risup Migration Workflow

When migrating a prompt from a Markdown source document into a `.risup` promptTemplate:

### Source MD format convention

Each prompt item is represented by a heading of the form:

```
## N · type · role · type2
```

where **N** is the 1-based item index, **type** is the prompt item type (e.g. `plain`, `jailbreak`, `chat`), **role** is the ChatML role (`system`, `user`, `assistant`), and **type2** is the subtype (`main`, `normal`, `globalNote`, etc.). The body under the heading becomes the item's `text` field.

### CBS cross-section pitfalls

If CBS `{{#when}}…{{/when}}` blocks span across item boundaries in the source document, they **break** when split into separate prompt items because each item is resolved independently at runtime.

**Rebalancing strategy:** every prompt item must be CBS-self-contained — each `{{#when}}` must have its matching `{{/when}}` within the same item. When splitting, duplicate or restructure the conditional wrappers so no block crosses an item boundary.

### Code fence prefill extraction

Code fences in the source MD that represent assistant prefill (e.g. `{"type": "prefill", …}` or raw JSON/XML intended as the start of the assistant turn) must be extracted into **separate** prompt items with `type: "plain"`, `role: "assistant"`, and `type2: "normal"`.

Do not leave prefill content merged into a system-role item.

## Prefill Pattern Guide

Different providers use different conventions for assistant-turn prefill:

| Provider   | Pattern                                              | Notes                                                          |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| **Claude** | `<invoke>…</invoke>` XML tag, or direct JSON prefill | Used for tool-use steering and structured first-token guidance |
| **Gemini** | `function_call` object                               | Mirrors Gemini's native function-calling prefill format        |
| **GPT**    | `tool_calls` array                                   | Matches OpenAI tool-call prefill convention                    |

Prefill items should always use:

```json
{ "type": "plain", "role": "assistant", "type2": "normal", "text": "…" }
```

Place them at the position where the assistant turn should begin (typically after the last user/system block).

## Multi-Preset Verification Checklist

When maintaining multiple related presets (e.g. provider variants of the same prompt architecture):

1. **Item count and type sequence** — all variants should have the same number of items in the same type order unless a provider legitimately requires a different structure.
2. **Toggle name/value consistency** — toggles referenced in CBS blocks must exist in every variant's `customPromptTemplateToggle`. A toggle present in one preset but missing in another causes silent CBS evaluation failures.
3. **`formatingOrder` cross-verification** — token lists should match across variants. A missing `lorebook` or `authorNote` token in one variant silently drops that content.
4. **Automated comparison** — use `diff_risup_prompt` with one preset open and the other loaded as a reference to surface structural differences.
5. **Post-import validation** — after `import_risup_prompt_from_text`, use `validate_risup_prompt_import` to confirm content integrity (round-trip fidelity, item count, CBS balance).

## Chat Item Range Rules

Chat-type prompt items use `rangeStart` and `rangeEnd` to slice the conversation history:

| Field        | Allowed values       | Meaning                                                         |
| ------------ | -------------------- | --------------------------------------------------------------- |
| `rangeStart` | Non-negative integer | Index of the first message to include (0 = first message)       |
| `rangeEnd`   | `"end"`              | Include all remaining messages from `rangeStart` onward         |
|              | Non-negative integer | Stop at message index N (exclusive)                             |
|              | Negative integer     | Exclude the last \|N\| messages (e.g. `-2` = all except last 2) |

Examples:

```jsonc
// All messages
{ "type": "chat", "rangeStart": 0, "rangeEnd": "end" }

// First 10 messages only
{ "type": "chat", "rangeStart": 0, "rangeEnd": 10 }

// Everything except the last 3 messages
{ "type": "chat", "rangeStart": 0, "rangeEnd": -3 }

// Only the last 3 messages (pair with the above)
{ "type": "chat", "rangeStart": -3, "rangeEnd": "end" }
```

When using multiple chat items to split the history (e.g. cache boundary), ensure ranges are non-overlapping and jointly cover the full history.

## Toggle Migration Guide

When adding, deleting, or renaming toggles in a preset:

### Update all CBS references

Every CBS `{{#when toggle_NAME …}}` block that references the old toggle name must be updated. A renamed toggle with stale CBS references silently evaluates as unset (value `""`), which usually means the conditional body is skipped.

### `customPromptTemplateToggle` field structure

Toggle declarations are **newline-separated** lines in a single string field. Each line follows a specific syntax depending on the control type (checkbox, select, text, etc.). Edit via:

```
replace_in_field("customPromptTemplateToggle", find, replace)
```

### Cross-check workflow

1. **Discover all toggle references:** `list_cbs_toggles` scans every CBS-bearing field and returns which toggles are used and where.
2. **Find stale references after rename/delete:** `search_all_fields` with the old toggle name to locate CBS blocks that still reference a renamed or deleted toggle.
3. **Batch-update CBS blocks:** use `replace_in_field` or `replace_in_lorebook_batch` to rewrite `toggle_OldName` → `toggle_NewName` across all affected fields.

## Shared/reference skills

Load these on demand instead of duplicating their syntax here:

| Topic                                   | Skill                      |
| --------------------------------------- | -------------------------- |
| CBS inside prompt text                  | `writing-cbs-syntax`       |
| File structures / JSON shapes           | `file-structure-reference` |
| Module pairing for `moduleIntergration` | `writing-risum-modules`    |

## Smoke Tests

Use these prompts to verify the skill produces correct guidance:

1. "Create a preset with a custom prompt template that includes a character card block, 3 example dialogues, and a jailbreak section."
2. "Set up structured output for JSON responses with `max_tokens: 2000` and `temperature: 0.7`."
3. "What's the difference between `formatingOrder` and `promptTemplate`?"
