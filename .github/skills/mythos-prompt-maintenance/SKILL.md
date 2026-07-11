---
name: mythos-prompt-maintenance
description: 'Use when auditing or applying an approved change across the existing Mythos Source and model-specific variants, including drift, CBS, UI names, and version alignment. Primary skill for Mythos suite maintenance; hand unresolved principle decisions to mythos-prompt-development. Do not use when the family is non-Mythos or the task is generic .risup composition.'
tags: ['mythos', 'prompt', 'maintenance', 'sync']
related_tools: ['analyze_content', 'read_content', 'search_document', 'validate_content', 'preview_edit', 'apply_edit']
---

# Mythos Prompt Maintenance

## Workflow

1. Identify canonical Source plus every Mythos Markdown and `.risup` target.
2. Compare before editing. Classify each delta as intentional provider behavior, stale drift, duplication, toggle/UI mismatch, or CBS risk.
3. If the desired behavior is unsettled, stop and hand it to `mythos-prompt-development`.
4. Plan the smallest synchronized change. Apply Source first where possible, then named variants while preserving justified provider-specific prefill, identity, safety, or output-interface blocks.
5. Use structured preset tools and current guards for `.risup` items. Keep paired flat/source artifacts synchronized only when they are in scope.
6. Recompare, validate CBS/toggle references, and check version alignment after edits.

Preserve Mythos's abstract narration, systematic character handling, and concise non-duplicative prompt. Check user authorship, viewpoint/focus, status/assets, memory, and mutually exclusive modes for contradictions.

## Output and validation

Report Source and variants inspected, evidence-backed deltas, changed artifacts, intentional remaining divergence, CBS/toggle/version checks, and residual risk. Use `prompt-preset-sync` for non-Mythos families and `writing-risup-presets` for preset structure itself.
