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

Use the risup-prompt facade for individual item reads and edits. Index-based operations carry current identity/type/preview guards. Export/import preserves item header metadata; keep CBS blocks self-contained within each item, and verify imported text with `analyze_content` action `verify_risup_prompt_import` using the same source.

For Phēmē's generated variants, follow `prompt-family` and the release workflow in Phēmē's own repository. Preserve preset fields outside the generator's plans.

Chat item ranges determine which history is sent; split ranges need the intended coverage without accidental overlap. Assistant prefill belongs in a separate `plain`/`assistant`/`normal` item at the intended turn boundary. Provider-native prefill shapes can differ, and the current Claude models below reject a trailing prefill.

Use the parameter set exposed by the current provider adapter. Reasoning effort and thinking-token budgets are different controls; do not translate one into the other from a model name alone.

Provider API documentation checked on 2026-11-19 records these model constraints:

- Claude Opus 5.5 and Claude Fable 5.2 always think, and effort is the only depth control. Both return a 400 error for disabled thinking, a manual thinking-token budget, a request whose messages end with a prefilled assistant turn, and a forced tool choice. Omit `temperature`, `top_p`, and `top_k` for both. Prompt text asking Fable 5.2 to think less does not stop its thinking at `medium` effort or above.
- On both Claude models, prompt text that asks the model to reproduce its internal reasoning in the response, such as a `cot` item or a visible thought-tag section, can be declined with the `reasoning_extraction` refusal category. Ask for a short explanation or summary instead.
- GPT-6.2 Astra and Sol take no `temperature`, `top_p`, or log-probability parameters. Reasoning effort is their main control; `none` and `minimal` should become `low`.

Whether a preset's sampling, thinking, or prefill settings reach the API in these forms depends on the RisuAI provider adapter, so check the adapter before treating a preset value as the cause of an error.

Exact fields live in `risu/prompts/docs/PRESET_FIELDS.md`. Use `prompt-family` for Phēmē behavior and variant alignment, `writing-cbs-syntax` for expression semantics, and `writing-risum-modules` for module activation.
