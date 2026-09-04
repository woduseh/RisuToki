---
name: writing-risup-presets
description: 'RisuAI .risup request assembly, prompt items, ordering, toggles, module integration, model settings, and import contracts. Phēmē behavior and variant synchronization use prompt-family.'
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

# .risup Contracts

- `promptTemplate` defines structured prompt items and dynamic channels. `formatingOrder` places high-level runtime channels; neither replaces the other.
- `customPromptTemplateToggle` defines line-based UI controls. Keep declarations, labels, defaults, and CBS uses aligned when changing a control.
- `templateDefaultVariables` supplies newline `key=value` defaults, subject to character/runtime precedence.
- `moduleIntergration` lists module IDs the preset activates.
- Model/provider, sampling/reasoning, stop/fallback, role replacement, schema/JSON extraction, and output controls contribute to the assembled request.

## Item and import semantics

Use the risup-prompt facade for item reads and edits. Index-based operations carry current identity/type/preview guards. Export/import preserves item header metadata; keep CBS blocks self-contained within each item, and verify imported text with `analyze_content` action `verify_risup_prompt_import` using the same source.

Chat item ranges determine which history is sent; split ranges need the intended coverage without accidental overlap. Assistant prefill belongs in a separate `plain`/`assistant`/`normal` item at the intended turn boundary. Provider-native prefill shapes can differ.

Use the parameter set exposed by the current provider adapter. Reasoning effort and thinking-token budgets are different controls; do not translate one into the other from a model name alone.

Exact fields live in `risu/prompts/docs/PRESET_FIELDS.md`. Use `prompt-family` for Phēmē behavior and variant alignment, `writing-cbs-syntax` for expression semantics, and `writing-risum-modules` for module activation.
