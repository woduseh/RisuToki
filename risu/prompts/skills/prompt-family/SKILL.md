---
name: prompt-family
description: 'Design, review, and synchronize Phēmē through its common source, delivery block, and generated variants. Use for family modes, CBS controls, variant generation, and drift repair; use writing-risup-presets for standalone preset structure.'
tags: ['prompt', 'preset', 'family', 'cbs']
related_tools: ['read_content', 'search_document', 'analyze_content', 'preview_edit', 'apply_edit', 'validate_content']
---

# Prompt Family

Phēmē is the maintained prompt family. Its [profile](../../docs/families/PHEME.md) records the family-specific contract. Mythos is retired; existing Mythos artifacts are historical inputs, not synchronization targets unless explicitly requested.

## Common source and variant contract

- Edit Phēmē's common prompt source, shared toggle declarations, or thin Tool Call delivery block as defined in the profile. Rebuild the generated Tool Call Source; do not maintain a second copy of shared prompt text by hand.
- Standard and Tool Call variants share the same creative behavior. Add the delivery block only for a tool-delivery workflow; an API or provider name alone does not imply tool use. Preserve unrelated request and transport settings.
- A control's declaration, default, UI label, CBS references, and reachable branches must agree. Validate the affected modes and interactions; unreachable combinations are not additional supported modes.
- Follow the selected mode's authorship and viewpoint contract. Do not impose one RP authorship policy on every mode.
- Design and synchronization can happen in the same task. A requested behavior change can update the canonical artifact and its in-scope variants without a separate handoff or approval phase. Preserve unrelated variant behavior.
- Use the profile's generator and field-write plan workflow for both distribution presets. The generator does not write `.risup` binaries; apply planned fields through MCP preview, then apply, preserving fields outside the plan.

For exact preset fields and item/import contracts, see `writing-risup-presets`; for CBS evaluation semantics, see `writing-cbs-syntax`. Check changed variants for unintended drift, broken controls, item metadata loss, and inconsistent version labels.
