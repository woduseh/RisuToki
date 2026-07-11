---
name: mythos-prompt-development
description: 'Use when deciding what Mythos should say, whether behavior is default text, a CBS toggle, a model exception, or removed. Primary skill for Mythos design judgment; hand approved changes to mythos-prompt-maintenance. Do not use when repairing existing drift, synchronizing generic presets, or mechanically editing .risup.'
tags: ['mythos', 'prompt', 'preset', 'cbs']
related_tools: ['analyze_content', 'validate_content', 'read_content']
---

# Mythos Prompt Development

## Decision framework

Evaluate every proposal against three principles:

1. **Abstract narration:** prefer flexible high-level guidance over brittle examples or forced beats.
2. **Systematic character:** preserve coherent agency, perspective, relationships, memory, and causality.
3. **Concise prompt:** remove duplicate, stale, narrow, or symptom-patching instructions.

Choose the smallest instruction that preserves coherence without constraining useful model judgment.

## Workflow

1. Identify the failure or desired behavior and which principle it affects.
2. Classify the solution:
   - default text for core, broadly useful behavior;
   - CBS toggle for a meaningful user-controlled mode or intensity;
   - model-specific exception only for a real provider/interface requirement;
   - removal for duplication, stale patches, or unnecessary autonomy constraints.
3. For toggles, align variable name, compact Korean UI label, and actual behavior. Keep mutually exclusive branches self-contained and avoid inactive-mode leakage.
4. Treat Source as canonical architecture. Keep provider variants philosophically aligned and differences minimal.
5. Return the decision, wording/toggle contract, affected variants, and validation intent to `mythos-prompt-maintenance` for synchronized implementation. Use `writing-risup-presets` only for exact structured editing.

## Validation

State principle impact, default/toggle/exception/remove classification, UI/name changes, Source versus model policy, and remaining ambiguity. Do not edit variants before settling the design decision.
