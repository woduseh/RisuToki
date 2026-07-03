---
name: prompt-preset-sync
description: Synchronize RisuToki prompt and .risup preset variants across canonical Source files and model-specific GPT, Claude, Gemini, DeepSeek, or other versions. Use when updating a Source prompt and mirroring it to variants, comparing prompt families, validating CBS toggle references, regex or prefill blocks, variable names, UI labels, version strings, or intentional model-specific divergence.
tags: ['prompt', 'preset', 'sync', 'variants']
related_tools:
  [
    'analyze_content',
    'read_content',
    'search_document',
    'preview_edit',
    'apply_edit',
    'manage_items',
    'read_risup_prompt_item_batch',
    'diff_risup_prompt',
  ]
---

# Prompt Preset Sync

## Agent Operating Contract

- **Use when:** keeping a RisuToki prompt family consistent across Markdown sources, `.risup` presets, and model-specific variants — updating a canonical Source and mirroring it to GPT/Claude/Gemini/DeepSeek or other versions, comparing families, or validating toggle/CBS/regex/prefill/version consistency.
- **Do not use when:** the target is the Mythos suite specifically (`mythos-prompt-maintenance` for audits, `mythos-prompt-development` for principle judgment), only one prompt is being revised with no variants, or the task is `.risup` structure editing itself (`writing-risup-presets`).
- **Read first:** this `SKILL.md`.
- **Load deeper only if:** structured `.risup` promptTemplate or formatingOrder edits are needed (`writing-risup-presets`), or exact CBS syntax, balance, or toggle expansion rules are unclear (`writing-cbs-syntax`).
- **Output/validation contract:** summarize the canonical Source and targets, Source-level versus intentional variant-specific changes, validations performed, and any remaining divergence and why — see the Output Contract section.

## Workflow

1. Identify the canonical Source, every target variant, and whether each target is Markdown, `.risup`, or both.
2. Load `writing-risup-presets` before structured `.risup` promptTemplate or formatingOrder edits, and use the dedicated RisuToki prompt tools when available.
3. Read enough of Source and targets to map invariants, model-specific exceptions, toggle variables, UI labels, CBS references, regex blocks, prefill blocks, and version strings.
4. Decide what belongs in Source and what remains variant-specific. Preserve intentional model-only behavior, but treat stale divergence as a bug unless the user says otherwise.
5. Apply the Source change first when possible, then propagate to variants in a consistent order.
6. Validate after edits:
   - Source and variants share the intended version.
   - Toggle variables, UI labels, and CBS references match.
   - Regex, prefill, editInput, and editDisplay pairs still do one clear job.
   - Prompt item names do not carry stale model names unless they are genuinely model-specific.
   - Disabled CBS branches do not leak assumptions into always-active text.
   - `.risup` prompt structures parse and pass available import, diff, or toggle validation.

## Handoffs

- Use `mythos-prompt-development` when the main question is whether a Mythos instruction is philosophically right, should be default, should be a CBS toggle, or conflicts with the three Mythos principles.
- Use `writing-risup-presets` when the main task is `.risup` structure, promptTemplate item editing, formatingOrder, import/export, or MCP prompt tools.
- Use `writing-cbs-syntax` when exact CBS syntax, balance, or toggle expansion rules are unclear.
- Use `prompt-revision` or `prompt-evaluation` for prompt families that are not RisuToki-specific, but only when those skills exist in your environment — they are personal/global skills, not part of this repo. If they are unavailable, handle generic prompt revision inline.

## Output Contract

Summarize:

- Canonical Source and target variants.
- Source-level changes versus intentional variant-specific changes.
- CBS, toggle, regex, prefill, and version validation performed.
- Any divergence that remains and why.

## Smoke Tests

| Prompt                                                                  | Expected routing                                                             | Expected output                                                                    | Forbidden behavior                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| "I updated the Source prompt; mirror it to the GPT and Gemini presets." | Primary: `prompt-preset-sync`; `writing-risup-presets` for structured edits. | Source-first propagation with toggle/CBS/version validation on every target.       | Editing variants before Source; leaving version strings mismatched. |
| "Why does the DeepSeek variant behave differently — is that intended?"  | Primary: `prompt-preset-sync`.                                               | Delta map separating intentional provider-specific behavior from stale divergence. | Flattening intentional provider-specific blocks into Source.        |
| "Is this Mythos instruction still right as always-on default text?"     | Route to `mythos-prompt-development`.                                        | Handoff note naming `mythos-prompt-development`.                                   | Making principle judgments inside a sync pass.                      |
