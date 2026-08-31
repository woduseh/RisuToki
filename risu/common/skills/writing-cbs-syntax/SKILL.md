---
name: writing-cbs-syntax
description: 'Use when writing or diagnosing RisuAI CBS variables, conditionals, loops, toggles, arrays, buttons, or nested template expressions. Primary skill for CBS syntax; hand surrounding HTML, lorebook, regex, or preset behavior to its owning skill. Do not use when the task is Lua logic or prompt prose without CBS.'
tags: ['cbs', 'syntax', 'prompting']
related_tools: ['validate_content', 'analyze_content', 'validate_cbs', 'simulate_cbs', 'diff_cbs']
---

# CBS — Custom Bracket Syntax

CBS uses `{{tag::arg1::arg2}}` and evaluates nested tags inside-out. Values are strings; comparisons commonly return `"1"` or `"0"`, and arrays/objects are JSON strings. Unknown tags remain literal.

## Minimal workflow

1. Identify the evaluation surface and whether it is model-visible, display-only, or `runVar` enabled.
2. Use the smallest expression and preserve literal braces, separators, and block nesting.
3. Prefer `#when` for conditional blocks and `#each` for JSON arrays. Deprecated `#if`/`#pure` forms are compatibility-only.
4. Validate syntax, then simulate with representative variables/toggles when behavior matters.
5. When renaming a variable or toggle, search every CBS-bearing field before applying the migration.

## Essential patterns

```text
{{getvar::hp}}
{{setdefaultvar::hp::100}}
{{addvar::hp::-10}}
{{calc::{{getvar::hp}}+10}}
{{#when::{{getvar::hp}}::<::20}}Wounded{{:else}}Stable{{/when}}
{{#each {{getvar::inventory}} as item}}{{slot::item}}{{/each}}
{{button::Heal::onHeal}}
```

`setvar`, `addvar`, and `setdefaultvar` mutate only in a caller that enables `runVar`; display or lorebook evaluation may not. Verify the surface before rewriting a correct expression. `pick` is stable/hash-based per message while `random` can change on re-render. Literal separators/braces require their CBS escape tags.

Display tags such as media, emotion, button, and markup helpers usually affect rendered UI, not model instructions. Keep model-visible instructions in plain text unless the exact tag contract states otherwise.

At the verified RisuAI `2026.8.250` baseline, saved chat messages receive a `runVar` pass at send start and again after an assistant response is stored. That pass executes mutation tags and replaces the stored message with the fully parsed result; greetings, lorebook text, and ordinary display rendering do not gain mutation permission merely because they evaluate CBS. Nested expressions resolve inside-out, and a block implementation may evaluate nested arguments before discarding an unselected branch, so do not hide mutations inside conditional display text.

## References and handoff

Load [`REFERENCE.md`](REFERENCE.md) only for the closed 170+ tag catalog, exact aliases, or an unlisted tag. For a genuinely mixed CBS/Lua/trigger/regex lifecycle problem, load [`RUNTIME_INTEROP.md`](../writing-trigger-scripts/RUNTIME_INTEROP.md). Hand HTML layout to `writing-html-css`, regex field behavior to `writing-regex-scripts`, lorebook activation to `writing-lorebooks`, and preset toggle ownership to `writing-risup-presets`.

## Validation

Check balanced blocks, inside-out argument resolution, evaluation context, string truthiness, JSON array shape, and visibility. Use CBS validation/simulation tools when available and preserve the original surface's whitespace constraints.
