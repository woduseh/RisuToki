---
name: prompt-preset-sync
description: 'Use when propagating an approved change through a non-Mythos canonical prompt Source and its model-specific Markdown or .risup variants. Primary skill for generic variant synchronization; hand Mythos work to mythos-prompt-development or mythos-prompt-maintenance and structure edits to writing-risup-presets. Do not use when handling one standalone prompt or unsettled design decisions.'
tags: ['prompt', 'preset', 'sync', 'variants']
related_tools: ['analyze_content', 'read_content', 'search_document', 'preview_edit', 'apply_edit', 'manage_items']
---

# Prompt Preset Sync

## Workflow

1. Identify the canonical Source, every target, file type, current version, and declared provider exceptions.
2. Map invariants and variant deltas: prompt blocks, toggles/UI labels, CBS references, regex, prefill, item names/order, and version strings.
3. Decide what belongs in Source and preserve only provider behavior justified by the interface or model contract. Treat unexplained drift as a defect.
4. Apply the Source change first, then propagate to variants in a stable order. Use `writing-risup-presets` and structured tools for `.risup` item/order changes.
5. Recompare and validate parsing, CBS balance, toggle names, prefill/regex pairs, prompt item identity, and version alignment.

Use `mythos-prompt-development` for unsettled Mythos principles and `mythos-prompt-maintenance` for existing Mythos suite drift. This Skill does not impose Mythos doctrine on other prompt families.

## Output

Report canonical Source, synchronized targets, Source-level change, intentional variant-only differences, validations performed, and any remaining divergence with rationale.
