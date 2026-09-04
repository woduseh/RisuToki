---
name: prompt-family
description: 'Design, review, and synchronize Phēmē prompt behavior across its canonical text and Markdown or .risup variants. Use for family modes, CBS controls, provider differences, and drift repair; use writing-risup-presets for standalone preset structure.'
tags: ['prompt', 'preset', 'family', 'cbs']
related_tools: ['read_content', 'search_document', 'analyze_content', 'preview_edit', 'apply_edit', 'validate_content']
---

# Prompt Family

Phēmē is the maintained prompt family. Its [profile](../../docs/families/PHEME.md) records the family-specific contract. Mythos is retired; existing Mythos artifacts are historical inputs, not synchronization targets unless explicitly requested.

## Canonical and variant contract

- Identify the canonical artifact and the requested variants from the current project. A filename such as `Source` or `Unified` alone does not establish authority.
- Keep shared behavior aligned while preserving justified provider differences in caching, roles, prefill, request settings, and output interfaces.
- A control's declaration, default, UI label, CBS references, and reachable branches must agree. Validate the affected modes and interactions; unreachable combinations are not additional supported modes.
- Follow the selected mode's authorship and viewpoint contract. Do not impose one RP authorship policy on every mode.
- Design and synchronization can happen in the same task. A requested behavior change can update the canonical artifact and its in-scope variants without a separate handoff or approval phase. Preserve unrelated variant behavior.

For exact preset fields and item/import contracts, see `writing-risup-presets`; for CBS evaluation semantics, see `writing-cbs-syntax`. Check changed variants for unintended drift, broken controls, item metadata loss, and inconsistent version labels.
