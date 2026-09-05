# Phēmē Prompt Family Profile

Read this profile only for Phēmē family design or maintenance.

## Promise and invariants

- Preserve trusted collaboration, grounded model judgment, coherent authority, and explicit instruction/context priority.
- Keep the universal core free of inactive-mode behavior; OOC and fiction constitutions own their distinct task contracts.
- Preserve authorship and knowledge boundaries while allowing fiction to commit to one authorized course without unnecessary permission-seeking.
- Treat character autonomy, agency, morality, ontology, competence, and relationship logic as local story facts rather than external defaults.
- Preserve causal state, continuity, response-boundary semantics, and the selected mode's creative promise without turning diagnostic architecture into prose templates.

## Canonical and generated artifacts

Phēmē lives in the independent Git repository at `risu/prompts/phēmē/`. The following paths are relative to that repository:

- `src/pheme-source.md` is the only common prompt source. Its prompt-item comments define the item metadata and `.risup` synchronization contract.
- `src/tool-call-delivery.md` contains only the Provider Delivery Contract for tool-delivery workflows.
- `src/pheme-toggles.txt` owns the common `customPromptTemplateToggle` declarations.
- `src/pheme-tool-call-source.md` is generated from the common source and delivery block. Keep its existing path for downstream use; change its inputs and regenerate instead of editing it directly.
- `dist/pheme-preset.risup` and `dist/pheme-tool-call-preset.risup` are the two distribution presets.

Both variants share the same creative behavior, prompt-item text, metadata, and relative order; the Tool Call variant adds only the Provider Delivery Contract. An API or provider name alone does not select tool delivery. Preserve each preset's existing request, transport, and other fields outside the requested change.

## Generation and preset synchronization

Run these commands from the nested Phēmē repository:

- `node scripts/build-variants.mjs` regenerates the Tool Call Source and its generated-file notice.
- Read each preset's `name`, `promptTemplate`, and `customPromptTemplateToggle` fields through MCP. Save those field-value objects as `.build/preset-input/pheme-preset.json` and `.build/preset-input/pheme-tool-call-preset.json`.
- Use a plain object keyed by field name with each read item's `data.content` as its value, not the MCP response envelope. Keep `promptTemplate` as the returned JSON string. Read fresh baselines for each edit; prior release snapshots can carry stale names or metadata.
- `node scripts/build-variants.mjs --preset-input-dir .build/preset-input --plan-dir .build/preset-plans` prepares changed-field plans for both presets. Existing unknown item metadata is preserved; the generator does not write `.risup` binaries. Each plan contains `target`, `operations`, and an item-change summary; pass only `target` and `operations` to `preview_edit`.
- Apply the planned field changes through MCP preview, then apply, using `using-mcp-tools`. Preserve existing preset fields outside the plan and verify the updated presets against their corresponding sources and shared toggle declarations.
- `node scripts/build-variants.mjs --check` verifies that the generated Tool Call Source is current; it does not replace preset or behavior validation.

Keep source versions, generated versions, preset names, and the nested repository's changelog aligned for a family release. Do not change the enclosing RisuToki product version for prompt-only work.

## Validation focus

Check supported OOC, Roleplay, and Novel Writing state boundaries; Bot Type and persona assumptions; user-character-specific POV reachability; prompt-item metadata; CBS controls; context and cache placement; chat ranges; request-time cache settings; language and delivery seals; and version alignment.

Keep ordinary creative controls after the stable cached prefix. Moving those controls across that boundary requires explicit user approval covering that architectural change. An explicit request or prior approval for the same change satisfies this requirement; a general request to improve the preset does not. Prepare the proposed change and its impact before seeking missing approval, do not request the same approval again, and continue independent in-scope work.
