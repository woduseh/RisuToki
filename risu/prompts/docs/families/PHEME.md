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

- `src/pheme-source.md` owns shared principles, authored mode branches, and the version. Its prompt-item comments define the item metadata and `.risup` synchronization contract.
- `src/tool-call-delivery.md` contains only the Provider Delivery Contract for tool-delivery workflows.
- `src/pheme-toggles.txt` owns the common `customPromptTemplateToggle` declarations.
- Generated sources are `src/pheme-roleplay-source.md`, `src/pheme-novel-source.md`, `src/pheme-ooc-source.md`, `src/pheme-tool-call-source.md` (RP), and `src/pheme-novel-tool-call-source.md`. Change their inputs and regenerate; do not edit them independently.
- `dist/pheme-preset.risup` and `dist/pheme-tool-call-preset.risup` retain the existing filenames for RP. `dist/pheme-novel-preset.risup`, `dist/pheme-novel-tool-call-preset.risup`, and `dist/pheme-ooc-preset.risup` complete the five-file distribution.

Session Mode is fixed during generation; it is not a runtime toggle. Ordinary CBS stays dynamic, and empty inactive prose items are omitted while typed slots and cache anchors remain. Each fiction mode's standard/Tool Call pair shares its creative behavior, prompt-item text, metadata, and relative order; the Tool Call variant adds only Provider Delivery Contract. OOC has no Tool Call variant. An API or provider name alone does not select tool delivery. Preserve request, transport, and fields outside the planned change.

## Generation and preset synchronization

Run these commands from the nested Phēmē repository:

- `node scripts/build-variants.mjs` regenerates all five sources from common principles and their fixed-mode contracts.
- Read each preset's `name`, `promptTemplate`, `customPromptTemplateToggle`, and `templateDefaultVariables` through MCP. Save field-value objects under `.build/preset-input/<preset filename without .risup>.json`.
- Use a plain object keyed by field name with each read item's `data.content` as its value, not the MCP response envelope. Keep `promptTemplate` as the returned JSON string. Read fresh baselines for each edit; prior release snapshots can carry stale names or metadata.
- For a new distribution file, use the MCP project extraction/reassembly workflow with the appropriate existing standard or Tool Call preset as its seed, then read the created target's fresh fields. Reassembly addresses the extracted folder as an `external` target with explicit `project_path` and `output_path`. This preserves request settings without decoding a binary container directly.
- `node scripts/build-variants.mjs --preset-input-dir .build/preset-input --plan-dir .build/preset-plans` prepares plans for all five presets. Existing unknown item metadata is preserved; the generator does not write `.risup` binaries. Plans include the retired mode default and new initiative default as well as name, prompt items, and applicable controls. Each plan contains `target`, `operations`, and an item-change summary; pass only `target` and `operations` to `preview_edit`.
- Apply the planned field changes through MCP preview, then apply, using `using-mcp-tools`. Preserve existing preset fields outside the plan and verify the updated presets against their corresponding sources and shared toggle declarations.
- `node scripts/build-variants.mjs --check` verifies all generated sources; it does not replace preset or behavior validation.

Keep source versions, generated versions, preset names, and the nested repository's changelog aligned for a family release. Do not change the enclosing RisuToki product version for prompt-only work.

## Validation focus

Check fixed OOC, Roleplay, and Novel Writing state boundaries; Bot Type and persona assumptions; user-character-specific POV reachability; prompt-item metadata; ordinary CBS controls; context and cache placement; chat ranges; request-time cache settings; language and delivery seals; and version alignment. Narrative Initiative must remain distinct from Pacing, Density, Length, character capacity, and authorship. OOC exposes language, custom language, persona reference, and recent feedback only. Missing existing ordinary selector values and malformed custom text/length input remain explicitly deferred known limitations in V5.

Keep ordinary creative controls after the stable cached prefix. Moving those controls across that boundary requires explicit user approval covering that architectural change. An explicit request or prior approval for the same change satisfies this requirement; a general request to improve the preset does not. Prepare the proposed change and its impact before seeking missing approval, do not request the same approval again, and continue independent in-scope work.
