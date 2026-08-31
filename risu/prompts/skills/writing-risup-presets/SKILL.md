---
name: writing-risup-presets
description: 'Use when creating, editing, or reviewing .risup request assembly, promptTemplate items, formatingOrder, toggles, module integration, structured output, or model/sampling settings. Primary skill for preset composition; hand variant propagation to the matching sync skill. Do not use when the task is bot identity, reusable runtime modules, or plugin code.'
tags: ['preset', 'risup', 'prompt', 'template']
related_tools: ['read_content', 'search_document', 'analyze_content', 'preview_edit', 'apply_edit', 'manage_items']
artifact_types: ['risup']
canonical_sources:
  [
    'Risuai/src/ts/process/prompt.ts',
    'Risuai/src/ts/model/providers/*',
    'Risuai/src/ts/process/request/*',
    'src/lib/risup-prompt-model.ts',
    'src/lib/risup-toggle-model.ts',
  ]
---

# Writing .risup Presets

## Boundary

A preset owns reusable model/request behavior: prompt assembly, provider adaptation, sampling/reasoning, structured output, and optional module activation. It does not own character identity, reusable lore/regex/Lua/CSS packs, or sandboxed plugin code.

## Core surfaces

- `promptTemplate` defines structured prompt items and dynamic channels.
- `formatingOrder` places high-level runtime channels; it does not replace `promptTemplate`. Review both after structural changes.
- `customPromptTemplateToggle` defines line-based UI controls; every CBS variable and UI label must match.
- `templateDefaultVariables` supplies newline `key=value` defaults, subject to character/runtime precedence.
- `moduleIntergration` lists module IDs the preset activates.
- Model/provider, sampling/reasoning, stop/fallback, role replacement, schema/JSON extraction, and output controls form one explicit request contract.

## Minimal workflow

1. Inspect/list/search structured prompt items; do not bulk-read raw `promptTemplate` first.
2. Read only target items and carry current identity/type/preview guards for index-based operations.
3. Use preview/apply for focused writes and `manage_items` for add, reorder, copy-as-text, import, or snippet workflows.
4. For large restructuring, export/copy as text, preserve item header metadata, keep every CBS block self-contained within one item, then import and verify with `analyze_content` action `verify_risup_prompt_import` using the same source.
5. Compare related presets with structured analysis and preserve justified provider-specific prefill or request behavior.
6. Re-read changed items and validate the affected order, imports, toggles, CBS, ranges, and request settings.

Chat item ranges must be intentional, non-overlapping when split, and cover the desired history. Assistant prefill belongs in a separate `plain`/`assistant`/`normal` item at the intended turn boundary; do not bury it in a system block. Provider-native prefill shapes may differ and must remain explicit.

Preserve the parameter set advertised by the selected model instead of copying controls across providers. In current Gemini 3.x metadata, reasoning effort maps to provider thinking levels; `minimal` may be normalized to `low` for models that do not expose a minimal level. Do not rewrite it as a legacy thinking-token budget without checking the current provider adapter.

When renaming/removing toggles, discover all CBS references, update declarations and every use, search for the old name, and validate supported alternate branches. Use `writing-cbs-syntax` for exact expressions and `writing-risum-modules` only for module-pairing behavior.

Load `risu/prompts/docs/PRESET_FIELDS.md` only for the complete field inventory. Use `prompt-family-development` for unsettled family behavior and `prompt-family-maintenance` for canonical-to-variant audit or application, regardless of whether the family is Mythos, Phēmē, or another reusable prompt line.

## Validation

For affected supported surfaces, verify item count/type/order, `formatingOrder` coverage, CBS balance, toggle/UI names, chat ranges, prefill role, module IDs, structured-output compatibility, sampling/model intent, and import round-trip fidelity. State any granular fallback reason.
