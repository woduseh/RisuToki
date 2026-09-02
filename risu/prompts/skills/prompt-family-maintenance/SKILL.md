---
name: prompt-family-maintenance
description: 'Use when auditing or applying an approved change across a canonical RisuAI prompt family and its Markdown or .risup variants. Primary skill for Source-to-variant synchronization, drift repair, controls, and version alignment; hand unsettled behavior to prompt-family-development and preset structure to writing-risup-presets. Do not use when handling one standalone prompt with no family relationship.'
tags: ['prompt', 'preset', 'maintenance', 'sync', 'variants']
related_tools:
  [
    'analyze_content',
    'read_content',
    'search_document',
    'validate_content',
    'preview_edit',
    'apply_edit',
    'manage_items',
  ]
---

# Prompt Family Maintenance

## Outcome

Bring every derived variant of a prompt family into agreement with its canonical artifact and family contract, changing only what the approved decision requires and keeping justified divergences explicit.

## Workflow

1. Read the relevant family profile under `../../docs/families/` when one exists, then identify the declared canonical artifact, every in-scope target, artifact type, current version, and allowed provider exceptions. Do not assume that a filename containing `Source` is canonical.
2. Compare before editing. Map prompt blocks, controls and UI labels, CBS references, regex or prefill pairs, item identity and order, request settings, version strings, and family-specific invariants.
3. Classify each delta as intentional provider/interface behavior, stale drift, duplication, control/UI mismatch, structural risk, or unresolved design.
4. If the intended behavior or family contract is unsettled, stop that decision and hand it to `prompt-family-development`.
5. Plan the smallest synchronized change. Apply the canonical change first where possible, then named variants in a stable order while preserving only justified divergences.
6. Use `writing-risup-presets` and structured tools for `.risup` item, order, range, or request-contract changes. Carry current identity, type, and preview guards for index-based edits.
7. Recompare and run the validation below.

For Mythos, read [MYTHOS.md](../../docs/families/MYTHOS.md). For Phēmē, read [PHEME.md](../../docs/families/PHEME.md). Load no unrelated family profile.

## Validation

Verify parsing, CBS balance, reachable branches, control names and UI labels, prefill/regex pairs, prompt item identity and order, family invariants, and version alignment across the canonical artifact and every changed variant. Name each remaining divergence and its reason.

## Output

Report the family contract used, canonical artifact and targets inspected, evidence-backed deltas, changed artifacts, intentional remaining divergence, validations performed, and residual risk.
