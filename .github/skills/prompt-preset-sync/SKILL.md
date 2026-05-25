---
name: prompt-preset-sync
description: Synchronize RisuToki prompt and .risup preset variants across canonical Source files and model-specific GPT, Claude, Gemini, DeepSeek, or other versions. Use when updating a Source prompt and mirroring it to variants, comparing prompt families, validating CBS toggle references, regex or prefill blocks, variable names, UI labels, version strings, or intentional model-specific divergence.
---

# Prompt Preset Sync

Use this skill when the task is not just revising one prompt, but keeping a RisuToki prompt family consistent across Markdown sources, `.risup` presets, and model-specific variants.

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
- Use `prompt-revision` or `prompt-evaluation` when the prompt family is not RisuToki-specific.

## Output Contract

Summarize:

- Canonical Source and target variants.
- Source-level changes versus intentional variant-specific changes.
- CBS, toggle, regex, prefill, and version validation performed.
- Any divergence that remains and why.
