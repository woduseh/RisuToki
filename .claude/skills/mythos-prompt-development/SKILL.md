---
name: mythos-prompt-development
description: Develop and evaluate Mythos / 뮈토스 prompts using the three Mythos principles, CBS conditional logic, toggle design, Source-first architecture, and model-specific variant policy. Use when deciding whether Mythos instructions should be default text, CBS toggles, removed, renamed, or adapted for GPT, Claude, Gemini, DeepSeek, or other .risup prompt variants.
tags: ['mythos', 'prompt', 'preset', 'cbs']
related_tools: ['analyze_content', 'validate_content', 'read_content', 'list_cbs_toggles', 'diff_risup_prompt']
---

# Mythos Prompt Development

## Agent Operating Contract

- **Use when:** deciding what a Mythos prompt should say — whether an instruction is default text, a CBS toggle, a model-specific exception, or should be removed; toggle naming and UI design; variant policy judgment against the three Mythos principles.
- **Do not use when:** the change is already decided and only needs propagation (`prompt-preset-sync`), the task is auditing an existing Mythos suite for drift (`mythos-prompt-maintenance`), or the work is ordinary `.risup` structure editing (`writing-risup-presets`).
- **Read first:** this `SKILL.md`; the principles and decision rules below are the whole execution layer.
- **Load deeper only if:** exact CBS syntax or toggle expansion is unclear (`writing-cbs-syntax`), or structured `.risup` edits follow the decision (`writing-risup-presets`).
- **Output/validation contract:** report principle impact, the CBS decision, naming/UI changes, variant policy, and the required handoff — see the Output Contract section.

## Core Principles

Evaluate every change against the three Mythos principles:

1. Abstract narration: prefer flexible, high-level guidance over brittle examples, forced beats, or over-specified behavior.
2. Systematic character: preserve coherent character agency, perspective, relationships, memory use, and narrative causality.
3. Concise prompt: remove duplicate, stale, narrow, or redundant instructions unless they solve a concrete failure mode.

When the principles conflict, choose the smallest instruction that preserves character coherence without constraining the model's narrative freedom.

## CBS Decision Rules

Classify each candidate instruction as:

- Default text: use when the behavior is core to Mythos, broadly beneficial, and not a user-facing mode choice.
- CBS toggle: use when users need a meaningful mode, intensity, language, perspective, safety, prefill, asset, status, or model-specific switch.
- Remove: use when the instruction duplicates another rule, encodes a narrow symptom, fights model autonomy, or only exists to patch a stale artifact.

Avoid CBS branches that make inactive states visible through always-active text. For mutually exclusive modes, keep each branch self-contained and do not describe unselected alternatives unless the UI needs it.

## Toggle Design

For each toggle:

- Match the variable name, UI label, and actual behavior.
- Prefer short names that describe the role, not implementation history.
- Keep Korean UI labels clear and compact; keep variable names stable and searchable.
- Check every CBS reference after a rename.
- Treat stale variable names, mismatched UI labels, and hidden duplicate toggles as prompt bugs.

## Model Variant Policy

Use Source as the canonical prompt architecture. A model-specific variant may differ only when:

- the provider requires a distinct prefill or tool-call shape;
- the model has a known reasoning, safety, formatting, or output-control behavior that Source cannot express cleanly;
- the runtime exposes a model-only toggle or request channel.

Keep model-specific additions compact. Do not let a variant drift into a separate prompt philosophy.

## Workflow

1. Identify the requested Mythos change, the affected principle, and the active Source or variant context.
2. Decide whether the change is default text, CBS toggle, model-specific exception, wording cleanup, or removal.
3. Check for conflicts with perspective, user-authorship handling, status or asset behavior, summary/memory behavior, and other mutually exclusive modes.
4. Draft the smallest instruction or toggle design that solves the problem.
5. Hand off to `prompt-preset-sync` for Source and model-variant propagation, or to `writing-risup-presets` for structured `.risup` edits.

## Output Contract

Summarize:

- Principle impact: abstract narration, systematic character, concise prompt.
- CBS decision: default, toggle, model-specific, or remove.
- Toggle naming or UI changes if any.
- Variant policy: Source-only or Source plus named model exceptions.
- Handoff needed for `.md` / `.risup` synchronization.

## Smoke Tests

| Prompt                                                                          | Expected routing                                                                          | Expected output                                                                            | Forbidden behavior                                              |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| "Should the paragraph forcing a melancholy tone in every reply stay in Mythos?" | Primary: `mythos-prompt-development`.                                                     | Principle-based verdict (likely remove or rewrite as abstract guidance) with CBS decision. | Editing prompt files or variants before the principle judgment. |
| "Add a first-person/third-person perspective switch to the Mythos prompt."      | This skill for toggle design; hand off to `prompt-preset-sync` / `writing-risup-presets`. | Toggle name, UI label, and self-contained CBS branch design plus a named handoff.          | Describing unselected modes in always-active text.              |
| "Copy the approved new memory instruction into the GPT and Gemini variants."    | Route to `prompt-preset-sync`; the decision is already made.                              | Handoff note naming `prompt-preset-sync` as the sync executor.                             | Re-litigating the settled decision instead of propagating it.   |
