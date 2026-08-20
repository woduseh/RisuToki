---
name: prompt-family-development
description: 'Use when designing or revising the behavior contract of a RisuAI prompt family, including default instructions, CBS controls, supported modes, and provider exceptions. Primary skill for unsettled prompt-family decisions; hand approved changes to prompt-family-maintenance. Do not use when repairing drift, mechanically editing .risup, or writing one-off prompt prose without a reusable family contract.'
tags: ['prompt', 'preset', 'development', 'family', 'cbs']
related_tools: ['analyze_content', 'validate_content', 'read_content']
---

# Prompt Family Development

## Outcome

Settle the smallest coherent behavior change and express it as a family contract that can govern canonical Source material and every derived variant.

## Decision framework

1. Identify the failure or desired behavior and the family promise it affects.
2. Separate family invariants from mode-specific behavior, optional user controls, provider/interface requirements, and obsolete patches.
3. Classify the solution:
   - default text for core behavior useful across the family;
   - CBS control for a meaningful user-selected mode or intensity;
   - provider exception only for a verified model or interface contract;
   - removal for duplication, stale patches, or unnecessary constraints.
4. Prefer the smallest instruction that preserves the intended behavior without constraining useful model judgment.
5. For controls, define reachable states, variable name, compact UI label, default, branch behavior, and interaction boundaries. Keep mutually exclusive branches self-contained and prevent inactive-mode leakage.
6. Declare the canonical artifact explicitly instead of inferring it from a filename such as `Source` or `Unified`.

## Family contract

Record only fields that affect implementation or validation:

- identity, audience, and creative/task promise;
- canonical artifact and derived artifact types;
- supported modes, providers, and reachable control states;
- behavioral, authorship, context, and output invariants;
- allowed provider or interface divergences;
- family-specific validation focus and version policy.

For a known family, read only its matching profile under `../../docs/families/`. Use [MYTHOS.md](../../docs/families/MYTHOS.md) for Mythos and [PHEME.md](../../docs/families/PHEME.md) for Phēmē. When no profile exists, derive a compact contract from the current canonical artifact and obtain agreement on any decision that would materially change the family's promise before implementation.

## Handoff and validation

Return the decision, contract delta, wording or control contract, affected artifacts, intended divergences, and validation intent to `prompt-family-maintenance`. Use `writing-risup-presets` only when exact preset structure becomes the main problem.

Do not edit derived variants before the family decision is settled. State remaining ambiguity and distinguish family policy from provider mechanics.
