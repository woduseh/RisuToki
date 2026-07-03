---
name: mythos-prompt-maintenance
description: Maintain the Mythos prompt suite across source and model-specific variants. Use when revising Mythos prompt files, comparing Source/GPT/Claude/Gemini/DeepSeek versions, changing CBS toggles or UI names, syncing `.md` and `.risup` prompt artifacts, validating CBS syntax, or checking the Mythos principles of abstract narration, systematic character handling, and concise non-duplicative prompts.
tags: ['mythos', 'prompt', 'maintenance', 'sync']
related_tools:
  [
    'analyze_content',
    'read_content',
    'search_document',
    'validate_content',
    'preview_edit',
    'apply_edit',
    'read_risup_prompt_item_batch',
    'diff_risup_prompt',
  ]
---

# Mythos Prompt Maintenance

## Agent Operating Contract

- **Use when:** auditing or updating an existing Mythos prompt suite — drift checks between Source and GPT/Claude/Gemini/DeepSeek variants, stale or duplicated text, toggle variable/UI name drift, coordinated multi-variant updates, or release-style version bumps.
- **Do not use when:** the prompt family is not the Mythos suite (`prompt-preset-sync`), the question is whether an instruction is right at all (`mythos-prompt-development`), or the task is plain `.risup` structure editing (`writing-risup-presets`).
- **Read first:** this `SKILL.md`; then `project-workflow` for version/docs rules when working in the RisuToki workspace.
- **Load deeper only if:** structured `.risup` reads or edits are needed (`using-mcp-tools`, `writing-risup-presets`) or exact CBS syntax is unclear (`writing-cbs-syntax`).
- **Output/validation contract:** findings by variant with evidence for analysis; changed artifacts, sync status, validations run, and residual risks for implementation — see the Output Contract section.

## Core Principles

- Preserve the Mythos design goals: abstract narration, systematic character handling, and concise prompts without duplicated instructions.
- Treat Source as the baseline unless the user explicitly names another authority.
- Keep model-specific variants minimal. Add provider-specific behavior only when it reflects a real model/interface need.
- Keep CBS conditions mutually clear. Avoid inactive branch leakage, mismatched variable names, and UI names that obscure the toggle's real effect.
- Prefer small, auditable edits over broad rewrites.

## Workflow

1. Locate the relevant Source `.md`, flat `.risup`, and model-specific GPT/Claude/Gemini/DeepSeek artifacts. If paths are not given, search the RisuToki prompt folders by version and variant name.
2. Read project guidance first when in the RisuToki workspace. Use `project-workflow` for version/docs rules and `using-mcp-tools` before structured `.risup` reads or edits.
3. Compare before editing: identify source-versus-variant deltas, intentional provider-specific additions, stale text, duplicated clauses, toggle variable/UI name drift, and CBS branch risks.
4. Plan the smallest synchronized change. State which variants must change, which must remain provider-specific, and what validation will prove the edit worked.
5. Apply edits in stable batches. For `.risup` prompt items, prefer structured item ids and preview/dry-run flows; keep `.md` source and flat prompt artifacts in sync when both are part of the requested surface.
6. Validate: run CBS validation when CBS syntax changed, re-read changed prompt items or files, compare Source and variants again, and check version strings or changelog expectations when the user requested a release-style update.

## Review Checklist

- No repeated instruction says the same thing in nearby blocks.
- Toggle names, UI labels, and variable names match the actual behavior.
- Model-specific variants do not silently diverge from Source except for intentional provider-specific prefill, identity, safety, or output-interface needs.
- User-authorship, viewpoint/focus, status/asset output, memory, and mode controls do not contradict each other.
- Regex or post-processing instructions are separated from prose-generation rules unless they must interact.

## Output Contract

For analysis, report findings by variant with evidence and a recommended action. For implementation, finish with changed artifacts, variants synchronized or intentionally left different, validations run, and residual risks.

## Smoke Tests

| Prompt                                                                       | Expected routing                                                     | Expected output                                                                            | Forbidden behavior                                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| "Audit the Mythos suite: has the Claude variant drifted from Source?"        | Primary: `mythos-prompt-maintenance`.                                | Variant-by-variant delta report with evidence and recommended actions.                     | Broad rewrites without comparing Source first.            |
| "Rename `toggle_StatusWindow` across the Mythos suite and bump the version." | This skill; `writing-cbs-syntax` if CBS expansion rules are unclear. | Coordinated rename across variants with CBS reference checks and version/changelog update. | Renaming in one variant only; skipping CBS validation.    |
| "Mirror this approved change across my (non-Mythos) preset family."          | Route to `prompt-preset-sync`.                                       | Handoff note naming `prompt-preset-sync`.                                                  | Applying Mythos-specific doctrine to a non-Mythos family. |
